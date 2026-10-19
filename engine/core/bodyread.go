package core

import (
	"bufio"
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
	"github.com/valyala/fasthttp"
)

// AcceptEncoding advertises modern compression codecs supported by the engine.
const AcceptEncoding = "gzip, deflate, br, zstd"

const (
	wireFactor      = 4         // wire cap = limit*wireFactor + wireSlack
	wireSlack       = 256 << 10 // headroom for small/incompressible bodies
	maxPooledBuf    = 1 << 20   // don't pin huge buffers in the pool
	zstdMaxWin      = 2 << 20   // Capped at 2 MB to bound decoder memory footprint
	zstdPoolSize    = 16        // Capped idle retention pool
	bodyReadTimeout = 10 * time.Second
)

var (
	errBodyTruncated       = errors.New("body truncated")
	errBodyTooLarge        = errors.New("body exceeds wire cap")
	errBodyDecode          = errors.New("body decode error")
	errUnsupportedEncoding = errors.New("unsupported content-encoding")
	errWireCap             = errors.New("wire cap exceeded")
)

// BodyResult holds the decoded prefix plus per-check metrics.
type BodyResult struct {
	Body       []byte
	Encoding   string
	WireBytes  int64
	WindowFull bool
	pb         *pooledBuf
}

// Release returns the buffer to the pool. Safe to call more than once.
func (r *BodyResult) Release() {
	if r.pb == nil {
		return
	}
	if cap(r.pb.b) <= maxPooledBuf {
		r.pb.b = r.pb.b[:0]
		bufPool.Put(r.pb)
	}
	r.pb, r.Body = nil, nil
}

type pooledBuf struct{ b []byte }

var (
	bufPool  = sync.Pool{New: func() any { return &pooledBuf{b: make([]byte, 0, 64<<10)} }}
	gzipPool sync.Pool
	brPool   sync.Pool
	zstdPool = make(chan *zstd.Decoder, zstdPoolSize)
	brdPool  = sync.Pool{New: func() any { return bufio.NewReaderSize(nil, 4096) }}
	zlibPool sync.Pool
	flPool   sync.Pool
)

// ReadKeywordBody reads up to `limit` decoded bytes from a fasthttp response.
// It always returns a usable BodyResult (call Release); on error, Body holds
// the valid decoded prefix, if any.
func ReadKeywordBody(res *fasthttp.Response, limit int, deadline time.Time) (BodyResult, error) {
	enc := string(res.Header.Peek(fasthttp.HeaderContentEncoding))
	var src io.Reader
	if stream := res.BodyStream(); stream != nil {
		src = stream
	} else {
		src = bytes.NewReader(res.Body())
	}
	br, err := readBody(src, enc, limit, deadline)
	if err == nil && !br.WindowFull && br.Encoding == "identity" {
		if cl := res.Header.ContentLength(); cl > 0 && br.WireBytes < int64(cl) {
			err = fmt.Errorf("%w: got %d of %d bytes", errBodyTruncated, br.WireBytes, cl)
		}
	}
	return br, err
}

func readBody(src io.Reader, header string, limit int, deadline time.Time) (BodyResult, error) {
	res := BodyResult{pb: bufPool.Get().(*pooledBuf)}

	enc, err := normalizeEncoding(header)
	res.Encoding = enc
	if err != nil {
		return res, err
	}

	wr := &wireReader{r: src, max: int64(limit)*wireFactor + wireSlack}
	defer func() { wr.r = nil }()

	// Defect fix: arm the deadline reader BEFORE newDecoder reads compression headers.
	// This prevents a server from hanging the worker during header sniffing/initialization.
	dl, stopDL := newDeadlineReader(wr, deadline, src)
	defer stopDL()

	var dec io.Reader = dl
	if enc != "identity" {
		d, release, derr := newDecoder(enc, dl)
		if derr != nil {
			res.WireBytes = wr.n
			return res, finishErr(derr, wr)
		}
		defer release()
		dec = d
	}

	full, rerr := readUpTo(dec, res.pb, limit, deadline, src)
	res.Body, res.WindowFull, res.WireBytes = res.pb.b, full, wr.n
	if rerr != nil {
		return res, finishErr(rerr, wr)
	}
	return res, nil
}

type deadlineReader struct {
	r        io.Reader
	deadline time.Time
}

type deadliner interface {
	SetReadDeadline(time.Time) error
}

func newDeadlineReader(r io.Reader, deadline time.Time, closer io.Reader) (*deadlineReader, func()) {
	dr := &deadlineReader{r: r, deadline: deadline}
	stop := func() {}

	if !deadline.IsZero() {
		if dl, ok := closer.(deadliner); ok {
			_ = dl.SetReadDeadline(deadline)
		} else if rc, ok := closer.(io.ReadCloser); ok {
			timer := time.AfterFunc(time.Until(deadline), func() { rc.Close() })
			stop = func() { timer.Stop() }
		}
	}
	return dr, stop
}

func (d *deadlineReader) Read(p []byte) (int, error) {
	if !d.deadline.IsZero() {
		rem := time.Until(d.deadline)
		if rem <= 0 {
			return 0, fmt.Errorf("read exceeded absolute deadline")
		}
		if dl, ok := d.r.(deadliner); ok {
			_ = dl.SetReadDeadline(d.deadline)
		}
	}
	return d.r.Read(p)
}

func readUpTo(r io.Reader, pb *pooledBuf, limit int, deadline time.Time, closer io.Reader) (full bool, err error) {
	if cap(pb.b) < limit {
		pb.b = make([]byte, 0, limit)
	}
	buf := pb.b[:0]
	empties := 0

	for len(buf) < limit {
		if !deadline.IsZero() && time.Now().After(deadline) {
			pb.b = buf
			return false, fmt.Errorf("read exceeded absolute deadline")
		}

		n, rerr := r.Read(buf[len(buf):limit])
		buf = buf[:len(buf)+n]
		if rerr != nil {
			pb.b = buf
			if errors.Is(rerr, io.EOF) {
				return false, nil
			}
			if !deadline.IsZero() && time.Now().After(deadline) {
				return false, fmt.Errorf("read exceeded absolute deadline")
			}
			return false, rerr
		}
		if n == 0 {
			if empties++; empties > 100 {
				pb.b = buf
				return false, io.ErrNoProgress
			}
		} else {
			empties = 0
		}
	}
	pb.b = buf
	return true, nil
}

func normalizeEncoding(h string) (string, error) {
	e := strings.ToLower(strings.TrimSpace(h))
	switch e {
	case "", "identity":
		return "identity", nil
	case "gzip", "x-gzip":
		return "gzip", nil
	case "deflate", "br", "zstd":
		return e, nil
	}
	return e, fmt.Errorf("%w: %q", errUnsupportedEncoding, h)
}

func finishErr(err error, wr *wireReader) error {
	if wr.n == 0 && errors.Is(wr.err, io.EOF) {
		return nil
	}
	if wr.err != nil && !errors.Is(wr.err, io.EOF) {
		switch {
		case errors.Is(wr.err, errWireCap):
			return fmt.Errorf("%w: %d wire bytes", errBodyTooLarge, wr.n)
		case errors.Is(wr.err, io.ErrUnexpectedEOF):
			return fmt.Errorf("%w: %v", errBodyTruncated, wr.err)
		default:
			return wr.err
		}
	}
	if errors.Is(err, io.ErrUnexpectedEOF) {
		return fmt.Errorf("%w: %v", errBodyTruncated, err)
	}
	return fmt.Errorf("%w: %v", errBodyDecode, err)
}

type wireReader struct {
	r   io.Reader
	n   int64
	max int64
	err error
}

func (w *wireReader) Read(p []byte) (int, error) {
	if w.r == nil {
		return 0, io.ErrClosedPipe
	}
	if w.n >= w.max {
		w.err = errWireCap
		return 0, errWireCap
	}
	if rem := w.max - w.n; int64(len(p)) > rem {
		p = p[:rem]
	}
	n, err := w.r.Read(p)
	w.n += int64(n)
	if err != nil {
		w.err = err
	}
	return n, err
}

func newDecoder(enc string, src io.Reader) (io.Reader, func(), error) {
	var err error
	switch enc {
	case "gzip":
		bufr := brdPool.Get().(*bufio.Reader)
		bufr.Reset(src)
		putB := func() { bufr.Reset(nil); brdPool.Put(bufr) }

		zr, _ := gzipPool.Get().(*gzip.Reader)
		if zr == nil {
			if zr, err = gzip.NewReader(bufr); err != nil {
				putB()
				return nil, nil, err
			}
		} else if err = zr.Reset(bufr); err != nil {
			gzipPool.Put(zr)
			putB()
			return nil, nil, err
		}
		return zr, func() { gzipPool.Put(zr); putB() }, nil

	case "br":
		bufr := brdPool.Get().(*bufio.Reader)
		bufr.Reset(src)
		putB := func() { bufr.Reset(nil); brdPool.Put(bufr) }

		if h, _ := bufr.Peek(1); len(h) == 1 {
			if wb := brWindowBits(h[0]); wb < 0 || wb > maxBrWindowBits {
				putB()
				return nil, nil, fmt.Errorf("%w: brotli window %d bits exceeds cap", errUnsupportedEncoding, wb)
			}
		}
		br, _ := brPool.Get().(*brotli.Reader)
		if br == nil {
			br = brotli.NewReader(bufr)
		} else if err = br.Reset(bufr); err != nil {
			putB()
			return nil, nil, err
		}
		return br, func() { brPool.Put(br); putB() }, nil

	case "zstd":
		var zd *zstd.Decoder
		select {
		case zd = <-zstdPool:
		default:
			zd, err = zstd.NewReader(nil,
				zstd.WithDecoderConcurrency(1),
				zstd.WithDecoderMaxWindow(zstdMaxWin),
			)
			if err != nil {
				return nil, nil, err
			}
		}
		if err = zd.Reset(src); err != nil {
			zd.Close()
			if strings.Contains(err.Error(), "window size exceeded") {
				return nil, nil, fmt.Errorf("%w: %v", errUnsupportedEncoding, err)
			}
			return nil, nil, err
		}
		return zd, func() {
			_ = zd.Reset(nil)
			select {
			case zstdPool <- zd:
			default:
				zd.Close()
			}
		}, nil

	case "deflate":
		bufr := brdPool.Get().(*bufio.Reader)
		bufr.Reset(src)
		putB := func() { bufr.Reset(nil); brdPool.Put(bufr) }

		h, _ := bufr.Peek(2)
		if len(h) == 2 && h[0]&0x0f == 8 && (uint(h[0])<<8|uint(h[1]))%31 == 0 {
			if zr, _ := zlibPool.Get().(io.ReadCloser); zr != nil {
				if err = zr.(zlib.Resetter).Reset(bufr, nil); err != nil {
					putB()
					return nil, nil, err
				}
				return zr, func() { zlibPool.Put(zr); putB() }, nil
			}
			zr, zerr := zlib.NewReader(bufr)
			if zerr != nil {
				putB()
				return nil, nil, zerr
			}
			return zr, func() { zlibPool.Put(zr); putB() }, nil
		}
		if fr, _ := flPool.Get().(io.ReadCloser); fr != nil {
			if err = fr.(flate.Resetter).Reset(bufr, nil); err != nil {
				putB()
				return nil, nil, err
			}
			return fr, func() { flPool.Put(fr); putB() }, nil
		}
		fr := flate.NewReader(bufr)
		return fr, func() { flPool.Put(fr); putB() }, nil
	}
	return nil, nil, fmt.Errorf("%w: %q", errUnsupportedEncoding, enc)
}

func classifyBodyErr(err error) ErrClass {
	switch {
	case errors.Is(err, errBodyTruncated):
		return ErrBodyTruncated
	case errors.Is(err, errBodyTooLarge):
		return ErrBodyTooLarge
	case errors.Is(err, errUnsupportedEncoding):
		return ErrUnsupported
	case errors.Is(err, errBodyDecode):
		return ErrBodyDecode
	default:
		return classifyNetError(err, false)
	}
}
