package core

// Replaces the log-only TestZstdHostileWindowMemory (delete that file: once the
// cap is lowered it would measure a rejected stream and report a meaningless ~0).
//
//   go test ./core -run 'TestZstdHugeWindowRejected|TestZstdMemoryAtCap' -v -count=1

import (
	"bytes"
	"io"
	"runtime"
	"testing"

	"github.com/klauspost/compress/zstd"
)

func btZstdStream(t *testing.T, window int) []byte {
	t.Helper()
	var buf bytes.Buffer
	w, err := zstd.NewWriter(&buf, zstd.WithWindowSize(window), zstd.WithEncoderConcurrency(1))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write(btRandom(400 << 10)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// A stream declaring a window above zstdMaxWin must be refused, not allocated.
// Fails while zstdMaxWin is still 8 MB.
func TestZstdHugeWindowRejected(t *testing.T) {
	res, err := readBody(bytes.NewReader(btZstdStream(t, 8<<20)), "zstd", btLimit)
	res.Release()
	if err == nil {
		t.Fatalf("8 MB declared zstd window accepted (zstdMaxWin=%d); lower it to 2<<20", zstdMaxWin)
	}
}

// Measures real per-decoder heap at the largest window we still accept and
// fails if it is far above that window.
func TestZstdMemoryAtCap(t *testing.T) {
	stream := btZstdStream(t, zstdMaxWin)
	const n = 32
	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)

	decs := make([]*zstd.Decoder, n)
	for i := range decs {
		d, err := zstd.NewReader(bytes.NewReader(stream),
			zstd.WithDecoderConcurrency(1),
			zstd.WithDecoderMaxWindow(zstdMaxWin),
		)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.ReadFull(d, make([]byte, 64<<10))
		decs[i] = d
	}
	runtime.GC()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	runtime.KeepAlive(decs)
	for _, d := range decs {
		d.Close()
	}

	per := (int64(after.HeapAlloc) - int64(before.HeapAlloc)) / n
	t.Logf("window cap %.1f MB: ~%.2f MB per in-flight decoder; pool of %d idle decoders retains ~%.0f MB",
		float64(zstdMaxWin)/(1<<20), float64(per)/(1<<20), zstdPoolSize, float64(per)*zstdPoolSize/(1<<20))
	if per > 2*int64(zstdMaxWin)+(1<<20) {
		t.Fatalf("per-decoder heap %d bytes is far above the window cap %d", per, zstdMaxWin)
	}
}
