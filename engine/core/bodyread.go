package core

// Phase 1 "safe core": bounded, classified, multi-codec body reading for
// keyword monitors on top of fasthttp's BodyStream().
//
// Semantics (deliberate, keep in sync with docs):
//   - The keyword window (limit) is measured in DECODED bytes. Reading stops
//     once the window is full, so a decompression bomb can never produce more
//     than `limit` bytes of output. A full window is NOT an error.
//   - A body that ends early or breaks mid-stream is NEVER reported as a clean
//     EOF. Callers get errBodyTruncated / errBodyDecode / a raw network error,
//     plus whatever valid prefix was decoded (BodyResult.Body).
//   - Wire bytes are capped separately, to stop streams that burn bandwidth
//     without producing output (e.g. endless empty gzip blocks / zstd
//     skippable frames).

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

// AcceptEncoding matches what current Chrome sends without zstd for initial canary.
// zstd decoder remains active for unsolicited Content-Encoding: zstd responses.
const AcceptEncoding = "gzip, deflate, br"

const (
	wireFactor   = 4         // wire cap = limit*wireFactor + wireSlack
	wireSlack    = 256 << 10 // headroom for small/incompressible bodies
	maxPooledBuf = 1 << 20   // don't pin huge buffers in the pool
	zstdMaxWin   = 2 << 20   // Capped at 2 MB to prevent memory bloat from hostile 8 MB zstd windows
	zstdPoolSize = 16        // Reduced idle retention cap to ~40 MB
)

var (
	errBodyTruncated       = errors.New("body truncated")
	errBodyTooLarge        = errors.New("body exceeds wire cap")
	errBodyDecode          = errors.New("body decode error")
	errUnsupportedEncoding = errors.New("unsupported content-encoding")
	errWireCap             = errors.New("wire cap exceeded")
)

// BodyResult holds the decoded prefix plus per-check metrics (Phase 0).
// Body is backed by a pooled buffer: use it before calling Release().
type BodyResult struct {
	Body       []byte
	Encoding   string // normalized: identity|gzip|deflate|br|zstd (or raw header if unsupported)
	WireBytes  int64  // body bytes pulled off the connection (compressed size, incl. decoder read-ahead)
	WindowFull bool   // true if the window filled before EOF (more data may exist)
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
)

// ReadKeywordBody reads up to `limit` decoded bytes from a fasthttp response.
// It always returns a usable BodyResult (call Release); on error, Body holds
// the valid decoded prefix, if any.
func ReadKeywordBody(res *fasthttp.Response, limit int) (BodyResult, error) {
	enc := string(res.Header.Peek(fasthttp.HeaderContentEncoding))
	var src io.Reader
	if stream := res.BodyStream(); stream != nil {
		src = stream
	} else {
		src = bytes.NewReader(res.Body())
	}
	br, err := readBody(src, enc, limit)
	if err == nil && !br.WindowFull && br.Encoding == "identity" {
		if cl := res.Header.ContentLength(); cl > 0 && br.WireBytes < int64(cl) {
			err = fmt.Errorf("%w: got %d of %d bytes", errBodyTruncated, br.WireBytes, cl)
		}
	}
	return br, err
}

func readBody(src io.Reader, header string, limit int) (BodyResult, error) {
	res := BodyResult{pb: bufPool.Get().(*pooledBuf)}

	enc, err := normalizeEncoding(header)
	res.Encoding = enc
	if err != nil {
		return res, err
	}

	wr := &wireReader{r: src, max: int64(limit)*wireFactor + wireSlack}
	// Drop our reference to the stream so a pooled decoder can't pin it.
	defer func() { wr.r = nil }()

	var dec io.Reader = wr
	if enc != "identity" {
		d, release, derr := newDecoder(enc, wr)
		if derr != nil {
			res.WireBytes = wr.n
			return res, finishErr(derr, wr)
		}
		defer release()
		dec = d
	}

	full, rerr := readUpTo(dec, res.pb, limit)
	res.Body, res.WindowFull, res.WireBytes = res.pb.b, full, wr.n
	if rerr != nil {
		return res, finishErr(rerr, wr)
	}
	return res, nil
}

// readUpTo fills pb.b with up to limit bytes. It returns full=true if the
// window filled, nil error on clean EOF, and the raw error otherwise.
func readUpTo(r io.Reader, pb *pooledBuf, limit int) (full bool, err error) {
	if cap(pb.b) < limit {
		pb.b = make([]byte, 0, limit)
	}
	buf := pb.b[:0]
	empties := 0
	start := time.Now()
	timeout := 10 * time.Second

	for len(buf) < limit {
		if time.Since(start) > timeout {
			pb.b = buf
			return false, fmt.Errorf("read took longer than %v", timeout)
		}
		
		n, rerr := r.Read(buf[len(buf):limit])
		buf = buf[:len(buf)+n]
		if rerr != nil {
			pb.b = buf
			if errors.Is(rerr, io.EOF) {
				return false, nil
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
	// Includes chained encodings ("gzip, br"): reject explicitly rather than guess.
	return e, fmt.Errorf("%w: %q", errUnsupportedEncoding, h)
}

// finishErr classifies a failure. Order matters: wire-level evidence first.
func finishErr(err error, wr *wireReader) error {
	if wr.n == 0 && errors.Is(wr.err, io.EOF) {
		return nil // genuinely empty body (decoders fail on empty input)
	}
	if wr.err != nil && !errors.Is(wr.err, io.EOF) {
		switch {
		case errors.Is(wr.err, errWireCap):
			return fmt.Errorf("%w: %d wire bytes", errBodyTooLarge, wr.n)
		case errors.Is(wr.err, io.ErrUnexpectedEOF):
			return fmt.Errorf("%w: %v", errBodyTruncated, wr.err)
		default:
			return wr.err // network error: let classifyNetError handle it
		}
	}
	if errors.Is(err, io.ErrUnexpectedEOF) {
		return fmt.Errorf("%w: %v", errBodyTruncated, err)
	}


	return fmt.Errorf("%w: %v", errBodyDecode, err)
}

// wireReader counts and caps compressed bytes and remembers the first error
// the connection produced, so we can tell network failure from corrupt data.
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
		zr, _ := gzipPool.Get().(*gzip.Reader)
		if zr == nil {
			if zr, err = gzip.NewReader(src); err != nil { // reads the header
				return nil, nil, err
			}
		} else if err = zr.Reset(src); err != nil {
			gzipPool.Put(zr)
			return nil, nil, err
		}
		return zr, func() { gzipPool.Put(zr) }, nil

	case "br":
		bufr := bufio.NewReaderSize(src, 4096)
		if h, _ := bufr.Peek(1); len(h) == 1 {
			if wb := brWindowBits(h[0]); wb < 0 || wb > maxBrWindowBits {
				return nil, nil, fmt.Errorf("%w: brotli window %d bits exceeds cap", errUnsupportedEncoding, wb)
			}
		}
		br, _ := brPool.Get().(*brotli.Reader)
		if br == nil {
			br = brotli.NewReader(bufr)
		} else if err = br.Reset(bufr); err != nil {
			return nil, nil, err
		}
		return br, func() { brPool.Put(br) }, nil

	case "zstd":
		var zd *zstd.Decoder
		select {
		case zd = <-zstdPool:
		default:
			// Concurrency 1 => synchronous stream decoding, no helper goroutines
			// to leak if a decoder is ever dropped.
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
			return nil, nil, err
		}
		return zd, func() {
			_ = zd.Reset(nil) // drop reference to the connection stream
			select {
			case zstdPool <- zd:
			default:
				zd.Close()
			}
		}, nil

	case "deflate":
		// HTTP "deflate" is zlib-wrapped per spec, but some servers send raw
		// DEFLATE. Sniff the 2-byte zlib header (RFC 1950).
		bufr := bufio.NewReaderSize(src, 512)
		h, _ := bufr.Peek(2)
		if len(h) == 2 && h[0]&0x0f == 8 && (uint(h[0])<<8|uint(h[1]))%31 == 0 {
			zr, zerr := zlib.NewReader(bufr)
			if zerr != nil {
				return nil, nil, zerr
			}
			return zr, func() { _ = zr.Close() }, nil
		}
		return flate.NewReader(bufr), func() {}, nil
	}
	return nil, nil, fmt.Errorf("%w: %q", errUnsupportedEncoding, enc)
}

func classifyBodyErr(err error) ErrClass {
	switch {
	case errors.Is(err, errBodyTruncated):
		return ErrBodyTruncated
	case errors.Is(err, errBodyTooLarge):
		return ErrBodyTooLarge
	case errors.Is(err, errBodyDecode),
		errors.Is(err, errUnsupportedEncoding):
		return ErrBodyDecode
	default:
		return classifyNetError(err, false)
	}
}
