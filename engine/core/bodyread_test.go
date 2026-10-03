package core

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"errors"
	"io"
	"math/rand"
	"strings"
	"testing"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
)

const btLimit = 64 << 10

var btKinds = []string{"gzip", "deflate", "rawdeflate", "br", "zstd"}

func btHdr(kind string) string {
	if kind == "rawdeflate" {
		return "deflate" // raw DEFLATE is still advertised as "deflate"
	}
	return kind
}

func btPage() []byte {
	return []byte(strings.Repeat("<p>filler</p>", 3000) + "HEALTHY" + strings.Repeat("x", 1000))
}

func btRandom(n int) []byte {
	b := make([]byte, n)
	rand.New(rand.NewSource(1)).Read(b)
	return b
}

func btCompress(t *testing.T, kind string, data []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	var w io.WriteCloser
	var err error
	switch kind {
	case "gzip":
		w = gzip.NewWriter(&buf)
	case "deflate":
		w = zlib.NewWriter(&buf)
	case "rawdeflate":
		w, err = flate.NewWriter(&buf, flate.DefaultCompression)
	case "br":
		w = brotli.NewWriter(&buf)
	case "zstd":
		w, err = zstd.NewWriter(&buf, zstd.WithWindowSize(zstdMaxWin), zstd.WithEncoderConcurrency(1))
	default:
		t.Fatalf("unknown kind %q", kind)
	}
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func btWire(t *testing.T, kind string, data []byte) []byte {
	if kind == "identity" {
		return data
	}
	return btCompress(t, kind, data)
}

func TestRoundTrip(t *testing.T) {
	for _, k := range append([]string{"identity"}, btKinds...) {
		t.Run(k, func(t *testing.T) {
			res, err := readBody(bytes.NewReader(btWire(t, k, btPage())), btHdr(k), btLimit)
			defer res.Release()
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Contains(res.Body, []byte("HEALTHY")) {
				t.Fatalf("keyword missing; decoded %d bytes", len(res.Body))
			}
		})
	}
}

// The core regression: a cut-off stream must never look like a clean short body.
func TestTruncatedIsNeverComplete(t *testing.T) {
	data := btRandom(200 << 10)
	for _, k := range btKinds {
		t.Run(k, func(t *testing.T) {
			wire := btCompress(t, k, data)
			res, err := readBody(bytes.NewReader(wire[:len(wire)/2]), btHdr(k), 1<<20)
			res.Release()
			if !errors.Is(err, errBodyTruncated) {
				t.Fatalf("want errBodyTruncated, got %v", err)
			}
		})
	}
}

type btFailReader struct {
	data []byte
	err  error
}

func (f *btFailReader) Read(p []byte) (int, error) {
	if len(f.data) == 0 {
		return 0, f.err
	}
	n := copy(p, f.data)
	f.data = f.data[n:]
	return n, nil
}

func TestWireErrorPassesThrough(t *testing.T) {
	boom := errors.New("connection reset")
	for _, k := range append([]string{"identity"}, btKinds...) {
		t.Run(k, func(t *testing.T) {
			wire := btWire(t, k, btPage())
			src := &btFailReader{data: wire[:len(wire)/2], err: boom}
			res, err := readBody(src, btHdr(k), 1<<20)
			res.Release()
			if !errors.Is(err, boom) {
				t.Fatalf("want the network error, got %v", err)
			}
		})
	}
}

// Keyword sits in a valid prefix; stream breaks later. Prefix must be returned.
func TestPrefixSurvivesLaterTruncation(t *testing.T) {
	data := append([]byte("HEALTHY"), btRandom(400<<10)...)
	for _, k := range []string{"gzip", "zstd"} {
		t.Run(k, func(t *testing.T) {
			wire := btCompress(t, k, data)
			res, err := readBody(bytes.NewReader(wire[:len(wire)*3/4]), k, 1<<20)
			defer res.Release()
			if err == nil {
				t.Fatal("expected an error for a truncated stream")
			}
			if !bytes.Contains(res.Body, []byte("HEALTHY")) {
				t.Fatalf("valid prefix lost (%d bytes returned)", len(res.Body))
			}
		})
	}
}

func TestBombStopsAtWindow(t *testing.T) {
	zeros := make([]byte, 50<<20)
	for _, k := range []string{"gzip", "br", "zstd"} {
		t.Run(k, func(t *testing.T) {
			res, err := readBody(bytes.NewReader(btCompress(t, k, zeros)), k, btLimit)
			defer res.Release()
			if err != nil {
				t.Fatal(err)
			}
			if len(res.Body) != btLimit || !res.WindowFull {
				t.Fatalf("got %d bytes, WindowFull=%v", len(res.Body), res.WindowFull)
			}
			if res.WireBytes > 1<<20 {
				t.Fatalf("read %d wire bytes for a %d byte window", res.WireBytes, btLimit)
			}
		})
	}
}

func TestUnsupportedEncodings(t *testing.T) {
	for _, h := range []string{"gzip, br", "br, gzip", "compress", "dcb"} {
		res, err := readBody(strings.NewReader("x"), h, btLimit)
		res.Release()
		if !errors.Is(err, errUnsupportedEncoding) {
			t.Errorf("%q: want errUnsupportedEncoding, got %v", h, err)
		}
	}
}

func TestServerLiesAboutEncoding(t *testing.T) {
	res, err := readBody(strings.NewReader("<html>plain</html>"), "gzip", btLimit)
	res.Release()
	if !errors.Is(err, errBodyDecode) {
		t.Fatalf("want errBodyDecode, got %v", err)
	}
}

func TestEmptyBodyIsNotAnError(t *testing.T) {
	for _, k := range append([]string{"identity"}, btKinds...) {
		t.Run(k, func(t *testing.T) {
			res, err := readBody(bytes.NewReader(nil), btHdr(k), btLimit)
			defer res.Release()
			if err != nil || len(res.Body) != 0 {
				t.Fatalf("err=%v len=%d", err, len(res.Body))
			}
		})
	}
}

// Endless zstd skippable frames produce zero output forever; wire cap must trip.
type btSkipFrames struct{ pos int }

func (s *btSkipFrames) Read(p []byte) (int, error) {
	frame := [8]byte{0x50, 0x2A, 0x4D, 0x18} // magic 0x184D2A50 LE, size 0
	for i := range p {
		p[i] = frame[s.pos%8]
		s.pos++
	}
	return len(p), nil
}

func TestWireCapStopsOutputlessStreams(t *testing.T) {
	res, err := readBody(&btSkipFrames{}, "zstd", btLimit)
	res.Release()
	if !errors.Is(err, errBodyTooLarge) {
		t.Fatalf("want errBodyTooLarge, got %v", err)
	}
}
