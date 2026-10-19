package core

import (
	"bytes"
	"fmt"
	"runtime"
	"testing"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
)

// Measure memory allocations in bytes per call for Brotli and Zstd
func TestDecoderBytesPerCall(t *testing.T) {
	// Generate 5 MB compressible text data so encoder cannot shrink window below declared
	var srcBuf bytes.Buffer
	for i := 0; i < 100000; i++ {
		srcBuf.WriteString(fmt.Sprintf("<div class='item-%d'><span>Product status operational %d</span></div>\n", i, i%100))
	}
	raw := srcBuf.Bytes()

	// 1. Brotli with lgwin=22 (4 MB window)
	var br22Buf bytes.Buffer
	w22 := brotli.NewWriterOptions(&br22Buf, brotli.WriterOptions{Quality: 6, LGWin: 22})
	_, _ = w22.Write(raw)
	_ = w22.Close()
	br22Wire := br22Buf.Bytes()
	wb22 := brWindowBits(br22Wire[0])
	t.Logf("br22Wire header declared window bits: %d (expected 22)", wb22)

	// 2. Brotli with lgwin=24 (16 MB window)
	var br24Buf bytes.Buffer
	w24 := brotli.NewWriterOptions(&br24Buf, brotli.WriterOptions{Quality: 6, LGWin: 24})
	_, _ = w24.Write(raw)
	_ = w24.Close()
	br24Wire := br24Buf.Bytes()
	wb24 := brWindowBits(br24Wire[0])
	t.Logf("br24Wire header declared window bits: %d (expected 24)", wb24)

	// 3. Zstd with 2 MB window
	var zstd2MBBuf bytes.Buffer
	enc2MB, _ := zstd.NewWriter(&zstd2MBBuf, zstd.WithWindowSize(2<<20))
	_, _ = enc2MB.Write(raw)
	_ = enc2MB.Close()
	zstd2MBWire := zstd2MBBuf.Bytes()

	// 4. Zstd with 8 MB window
	var zstd8MBBuf bytes.Buffer
	enc8MB, _ := zstd.NewWriter(&zstd8MBBuf, zstd.WithWindowSize(8<<20))
	_, _ = enc8MB.Write(raw)
	_ = enc8MB.Close()
	zstd8MBWire := zstd8MBBuf.Bytes()

	measureDecoder := func(name string, wire []byte, enc string) {
		runtime.GC()
		var m1, m2 runtime.MemStats
		runtime.ReadMemStats(&m1)

		const iters = 50
		for i := 0; i < iters; i++ {
			r := bytes.NewReader(wire)
			res, err := readBody(r, enc, 64<<10, time.Now().Add(5*time.Second))
			if name == "Zstd (Window 8MB)" {
				if err == nil {
					t.Fatalf("%s unexpectedly succeeded; should be rejected at 2MB cap", name)
				}
				res.Release()
				continue
			}
			if err != nil {
				t.Fatalf("%s failed: %v", name, err)
			}
			res.Release()
		}

		runtime.ReadMemStats(&m2)
		bytesAlloc := (m2.TotalAlloc - m1.TotalAlloc) / uint64(iters)
		t.Logf("Codec: %-25s | Wire: %6d B | Heap Alloc per Call: %8d B (%6.2f KB)",
			name, len(wire), bytesAlloc, float64(bytesAlloc)/1024.0)
	}

	measureDecoder("Brotli (LGWin 22)", br22Wire, "br")
	measureDecoder("Brotli (LGWin 24)", br24Wire, "br")
	measureDecoder("Zstd (Window 2MB)", zstd2MBWire, "zstd")
	measureDecoder("Zstd (Window 8MB)", zstd8MBWire, "zstd")
}
