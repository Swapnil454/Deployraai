package core

import (
	"bytes"
	"testing"
	"time"
)

func TestAllocsPerRunCodecs(t *testing.T) {
	data := btPage()

	for _, k := range append([]string{"identity"}, btKinds...) {
		wire := btWire(t, k, data)
		hdr := btHdr(k)

		// Warm up pools
		for i := 0; i < 5; i++ {
			r := bytes.NewReader(wire)
			res, err := readBody(r, hdr, btLimit, time.Now().Add(5*time.Second))
			if err != nil {
				t.Fatalf("warmup error on %s: %v", k, err)
			}
			res.Release()
		}

		// Measure allocations
		allocs := testing.AllocsPerRun(100, func() {
			r := bytes.NewReader(wire)
			res, err := readBody(r, hdr, btLimit, time.Now().Add(5*time.Second))
			if err != nil {
				t.Fatalf("run error on %s: %v", k, err)
			}
			res.Release()
		})

		t.Logf("Codec: %-10s | AllocsPerRun: %.2f", k, allocs)
	}
}
