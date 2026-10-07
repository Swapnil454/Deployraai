package core

import (
	"bufio"
	"bytes"
	"fmt"
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/valyala/fasthttp"
)

func TestObserveValidators(t *testing.T) {
	ResetValidatorStats()
	now := time.Unix(1700000000, 0)

	// Test 1: Strong ETag, stable consecutive check
	res1 := &fasthttp.Response{}
	res1.SetStatusCode(200)
	res1.Header.Set("ETag", `"v1.0.0"`)

	ObserveValidators(1001, res1, 1024, now)
	ObserveValidators(1001, res1, 1024, now.Add(30*time.Second))

	snap := SnapshotValidators(now.Add(30 * time.Second))
	if snap.Checked < 2 {
		t.Errorf("expected at least 2 checked, got %d", snap.Checked)
	}
	if snap.ETag < 2 {
		t.Errorf("expected 2 etag, got %d", snap.ETag)
	}
	if snap.StablePairs < 1 {
		t.Errorf("expected at least 1 stable pair, got %d", snap.StablePairs)
	}
	if snap.BytesSaveable != 1024 {
		t.Errorf("expected 1024 bytes saveable inside 5-min floor, got %d", snap.BytesSaveable)
	}

	// Test 2: Floor expiry after 300s forces full GET simulation
	ObserveValidators(1001, res1, 1024, now.Add(350*time.Second))
	snap2 := SnapshotValidators(now.Add(350 * time.Second))
	if snap2.BytesSaveable != 1024 {
		t.Errorf("expected BytesSaveable to stay 1024 after floor reset, got %d", snap2.BytesSaveable)
	}
}

func TestObserveValidatorsRace(t *testing.T) {
	ResetValidatorStats()
	var wg sync.WaitGroup
	workers := 64
	checksPerWorker := 1000

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(int64(workerID)))
			now := time.Now()

			res := &fasthttp.Response{}
			res.SetStatusCode(200)
			res.Header.Set("ETag", `"abc12345"`)
			res.Header.Set("Last-Modified", "Sun, 04 Oct 2026 10:00:00 GMT")
			res.Header.Set("Date", "Sun, 04 Oct 2026 10:05:00 GMT")

			for j := 0; j < checksPerWorker; j++ {
				monID := uint64(rng.Intn(100))
				ObserveValidators(monID, res, 2048, now.Add(time.Duration(j)*time.Second))
			}
		}(i)
	}

	wg.Wait()
}

func BenchmarkObserveValidators(b *testing.B) {
	ResetValidatorStats()
	res := &fasthttp.Response{}
	res.SetStatusCode(200)
	res.Header.Set("ETag", `"benchmark-etag-value"`)
	res.Header.Set("Last-Modified", "Sun, 04 Oct 2026 10:00:00 GMT")
	res.Header.Set("Date", "Sun, 04 Oct 2026 10:05:00 GMT")

	now := time.Now()
	// Pre-warm state map for 1,000 monitors to measure steady state without map insertions
	for i := uint64(1); i <= 1000; i++ {
		ObserveValidators(i, res, 4096, now)
	}

	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		var id uint64 = 1
		for pb.Next() {
			ObserveValidators((id%1000)+1, res, 4096, now)
			id++
		}
	})
}

func TestObserveValidatorsZeroAlloc(t *testing.T) {
	ResetValidatorStats()
	resETag := &fasthttp.Response{}
	resETag.SetStatusCode(200)
	resETag.Header.Set("ETag", `"zero-alloc-etag"`)

	var resLM fasthttp.Response
	rawResponse := []byte("HTTP/1.1 200 OK\r\nLast-Modified: Sun, 04 Oct 2026 10:00:00 GMT\r\nDate: Sun, 04 Oct 2026 10:05:00 GMT\r\n\r\n")
	resLM.Read(bufio.NewReader(bytes.NewReader(rawResponse)))

	resNone := &fasthttp.Response{}
	resNone.SetStatusCode(200)

	now := time.Now()
	// Warm up monitor state map
	ObserveValidators(5001, resETag, 2048, now)
	ObserveValidators(5002, &resLM, 2048, now)
	ObserveValidators(5003, resNone, 2048, now)

	// ETag path
	if n := testing.AllocsPerRun(1000, func() { ObserveValidators(5001, resETag, 2048, now) }); n != 0 {
		t.Fatalf("ObserveValidators ETag allocs/op = %v, want 0", n)
	}

	// Last-Modified + Date path
	snapBefore := SnapshotValidators(now)
	if n := testing.AllocsPerRun(1000, func() { ObserveValidators(5002, &resLM, 2048, now) }); n != 0 {
		t.Fatalf("ObserveValidators LM+Date allocs/op = %v, want 0", n)
	}
	snapAfter := SnapshotValidators(now)
	if deltaLM := snapAfter.LMUsable - snapBefore.LMUsable; deltaLM == 0 {
		t.Fatalf("expected LMUsable delta > 0, got 0 (date parse failure path was taken)")
	}

	// No validator path
	if n := testing.AllocsPerRun(1000, func() { ObserveValidators(5003, resNone, 2048, now) }); n != 0 {
		t.Fatalf("ObserveValidators NoValidator allocs/op = %v, want 0", n)
	}
}

func TestMockFarmValidators(t *testing.T) {
	ResetValidatorStats()
	now := time.Unix(1700000000, 0)

	// Origin A: Stable ETag
	resA := &fasthttp.Response{}
	resA.SetStatusCode(200)
	resA.Header.Set("ETag", `"stable-v1"`)

	// Origin B: Per-request ETag (dynamic)
	resB := &fasthttp.Response{}
	resB.SetStatusCode(200)

	// Origin C: Flapping ETag (multi-edge CDN)
	resC1 := &fasthttp.Response{}
	resC1.SetStatusCode(200)
	resC1.Header.Set("ETag", `"edge-east"`)

	resC2 := &fasthttp.Response{}
	resC2.SetStatusCode(200)
	resC2.Header.Set("ETag", `"edge-west"`)

	// Origin D: No validators
	resD := &fasthttp.Response{}
	resD.SetStatusCode(200)

	// Simulate 10 checks per origin
	for i := 0; i < 10; i++ {
		tStep := now.Add(time.Duration(i*30) * time.Second)

		// Origin A: same ETag
		ObserveValidators(2001, resA, 2048, tStep)

		// Origin B: unique ETag
		resB.Header.Set("ETag", fmt.Sprintf(`"nonce-%d"`, i))
		ObserveValidators(2002, resB, 2048, tStep)

		// Origin C: alternating ETags
		if i%2 == 0 {
			ObserveValidators(2003, resC1, 2048, tStep)
		} else {
			ObserveValidators(2003, resC2, 2048, tStep)
		}

		// Origin D: no ETag
		ObserveValidators(2004, resD, 2048, tStep)
	}

	snap := SnapshotValidators(now.Add(300 * time.Second))

	// Only Origin A produces saveable bytes (9 checks after initial full GET = 9 * 2048 = 18432)
	expectedSaveable := int64(9 * 2048)
	if snap.BytesSaveable != expectedSaveable {
		t.Fatalf("expected BytesSaveable == %d (Origin A only), got %d", expectedSaveable, snap.BytesSaveable)
	}

	// Origin A produced 9 stable pairs out of 9 consecutive checks
	// Origin B produced 9 changed pairs (0 stable)
	// Origin C produced 9 changed pairs (0 stable)
	if snap.ChangedPairs < 18 {
		t.Fatalf("expected at least 18 changed pairs from B and C, got %d", snap.ChangedPairs)
	}
}
