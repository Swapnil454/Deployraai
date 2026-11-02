package core

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func staleTestJob(jobGen, curGen uint64, awaiting bool) DispatchJob {
	m := &Monitor{ID: "stale-test", Type: "http", URL: "http://127.0.0.1:1/x", TimeoutMs: 200, CheckGeneration: curGen, AwaitingResult: awaiting}
	p := &atomic.Pointer[Monitor]{}
	p.Store(m)
	return DispatchJob{ptr: p, m: m, generation: jobGen}
}

func TestJobIsStale(t *testing.T) {
	if jobIsStale(staleTestJob(5, 5, true)) {
		t.Error("fresh job marked stale")
	}
	if !jobIsStale(staleTestJob(4, 5, true)) {
		t.Error("advanced generation not stale")
	}
	if !jobIsStale(staleTestJob(5, 5, false)) {
		t.Error("cleared slot not stale")
	}
	if jobIsStale(staleTestJob(0, 5, true)) {
		t.Error("generation 0 must not be stale")
	}
	if jobIsStale(DispatchJob{generation: 5}) {
		t.Error("nil ptr must not be stale")
	}
}

func TestWorkerSkipsStaleJob(t *testing.T) {
	before := ChecksStaleSkipped.Load()
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	jobs := make(chan DispatchJob, 1)
	StartWorkers(ctx, &wg, 1, jobs)
	jobs <- staleTestJob(4, 5, true)
	deadline := time.Now().Add(2 * time.Second)
	for ChecksStaleSkipped.Load() == before && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	wg.Wait()
	if got := ChecksStaleSkipped.Load() - before; got != 1 {
		t.Fatalf("stale job probed instead of skipped, skipped delta=%d", got)
	}
}
