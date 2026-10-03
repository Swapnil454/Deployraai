package core

import (
	"bytes"
	"io"
	"runtime"
	"testing"

	"github.com/klauspost/compress/zstd"
)

// Log-only. We measured brotli (~0.3 MB/decoder) but never zstd, whose window
// cap is 8 MB. Run with -v and read the number: a hostile target declaring an
// 8 MB window must not cost ~8 MB per in-flight check.
//
//   go test ./core -run TestZstdHostileWindowMemory -v -count=1
func TestZstdHostileWindowMemory(t *testing.T) {
	var buf bytes.Buffer
	w, err := zstd.NewWriter(&buf, zstd.WithWindowSize(8<<20), zstd.WithEncoderConcurrency(1))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write(btRandom(400 << 10)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	stream := buf.Bytes()

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

	per := (int64(after.HeapAlloc) - int64(before.HeapAlloc)) / n
	t.Logf("zstd declared window 8 MB: ~%.2f MB per in-flight decoder; x10,000 concurrent = ~%.1f GB",
		float64(per)/(1<<20), float64(per)*10000/(1<<30))

	for _, d := range decs {
		d.Close()
	}
}
