package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/your-org/uptime-engine/core"
)

func main() {
	hangDone := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		<-hangDone
	}))
	defer func() {
		close(hangDone)
		ts.Close()
	}()

	core.InitHTTPClients(100)

	// Baseline goroutines before starting workers
	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	baselineGoroutines := runtime.NumGoroutine()

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	jobs := make(chan core.DispatchJob, 10)
	core.StartWorkers(ctx, &wg, 1, jobs)

	const checkTimeout = 2 * time.Second
	mon := &core.Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "keyword",
		Keyword:         "EXPECTED_TEXT",
		Interval:        30,
		Timeout:         int(checkTimeout.Seconds()),
		CurrentInterval: 30,
	}
	ptr := new(atomic.Pointer[core.Monitor])
	ptr.Store(mon)

	core.CASUpdate(ptr, func(m *core.Monitor) {
		m.AwaitingResult = true
		m.LastProbeSentAt = time.Now()
		m.CheckGeneration = 1
	})

	start := time.Now()
	jobs <- core.DispatchJob{Ptr: ptr, M: ptr.Load(), Generation: 1} // Check field names

	// Wait for monitor to be marked DOWN or timeout
	for time.Since(start) < 4*time.Second {
		if ptr.Load().LastStatus == "DOWN" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	elapsed := time.Since(start)

	cancel()
	wg.Wait()

	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	afterGoroutines := runtime.NumGoroutine()

	fmt.Printf("Status: %s, Elapsed: %v, Baseline: %d, After: %d\n",
		ptr.Load().LastStatus, elapsed, baselineGoroutines, afterGoroutines)
}
