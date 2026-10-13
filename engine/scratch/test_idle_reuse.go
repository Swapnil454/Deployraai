package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/your-org/uptime-engine/core"
)

func main() {
	var reqCount atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqCount.Add(1)
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
		// Keep connection open!
	}))
	defer ts.Close()

	core.InitHTTPClients(100)

	mon := &core.Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "http",
		Interval:        30,
		Timeout:         5,
		CurrentInterval: 30,
		LastFullPhaseAt: time.Now(),
	}
	ptr := new(atomic.Pointer[core.Monitor])
	ptr.Store(mon)

	// Probe 1: warmup
	r1 := core.ExecuteHTTPProbeDetailed(ptr, false)
	fmt.Printf("Probe 1: err=%v, reused=%v, status=%s\n", r1.Err, r1.Reused, ptr.Load().LastStatus)
	if r1.Err != nil {
		return
	}

	// Sleep 31s while server keeps connection open
	fmt.Println("Sleeping 31s to test idle connection reuse...")
	time.Sleep(31 * time.Second)

	// Probe 2: reuse warm connection
	r2 := core.ExecuteHTTPProbeDetailed(ptr, false)
	fmt.Printf("Probe 2: err=%v, reused=%v, status=%s\n", r2.Err, r2.Reused, ptr.Load().LastStatus)
}
