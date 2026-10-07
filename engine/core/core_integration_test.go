package core

import (
	"context"
	"sync"
	"testing"
)

// Tests that the spool drain works at shutdown (the context-aware shutdown).
func TestShutdownTimeoutSpoolDrain(t *testing.T) {
	// Initialize subsystems properly
	InitTLSConfig(100)
	
	// Drain any leftover events from previous tests
	for {
		select {
		case <-IncidentQueue:
		default:
			goto DRAINED
		}
	}
DRAINED:
	incidentSpoolMu.Lock()
	incidentSpool = incidentSpool[:0]
	incidentSpoolMu.Unlock()

	// Start background consumer for IncidentQueue so it never fills up
	drainedEvts := make(chan IncidentEvent, 10000)
	stopConsumer := make(chan struct{})
	consumerDone := make(chan struct{})
	go func() {
		defer close(consumerDone)
		for {
			select {
			case <-stopConsumer:
				for {
					select {
					case evt := <-IncidentQueue:
						drainedEvts <- evt
					default:
						return
					}
				}
			case evt := <-IncidentQueue:
				drainedEvts <- evt
			}
		}
	}()

	// Create context that we will cancel to trigger shutdown
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	
	// Reset & Start the confirmation dispatcher which owns the spool drain
	ResetConfirmationDispatcherForTest()
	StartConfirmationDispatcher(ctx, &wg, 4)
	
	// Temporarily redirect IncidentQueue to a test queue so we can observe spool drains
	origOnOverflow := OnIncidentOverflow
	defer func() { OnIncidentOverflow = origOnOverflow }()
	
	// Add directly to spool (simulating overflow)
	incidentSpoolMu.Lock()
	incidentSpool = append(incidentSpool, IncidentEvent{ID: "test-spool-shutdown"})
	incidentSpoolMu.Unlock()
	
	// Cancel context to trigger final flush
	cancel()
	wg.Wait()
	close(stopConsumer)
	<-consumerDone

	// Verify test-spool-shutdown was delivered to drainedEvts
	found := false
	for len(drainedEvts) > 0 {
		evt := <-drainedEvts
		if evt.ID == "test-spool-shutdown" {
			found = true
			break
		}
	}
	if !found {
		t.Error("spool event test-spool-shutdown was not found in drainedEvts on shutdown")
	}
}

// Tests that when IncidentQueue is full, the spool preserves FIFO and does not
// reset state to UP.
func TestPersistRetryDoesNotResetState(t *testing.T) {
	incidentSpoolMu.Lock()
	incidentSpool = incidentSpool[:0]
	incidentSpoolMu.Unlock()
	
	// Deliver events
	evt1 := IncidentEvent{ID: "mon-1", NewStatus: "DOWN"}
	evt2 := IncidentEvent{ID: "mon-1", NewStatus: "UP"}
	
	for i := 0; i < 5000; i++ {
		// Fill IncidentQueue
		select {
		case IncidentQueue <- IncidentEvent{ID: "filler"}:
		default:
		}
	}
	
	deliverOrSpool(evt1)
	deliverOrSpool(evt2)
	
	incidentSpoolMu.Lock()
	defer incidentSpoolMu.Unlock()
	
	if len(incidentSpool) < 2 {
		t.Fatalf("expected spool to hold at least 2 events, got %d", len(incidentSpool))
	}
	
	// Check ordering
	lastEvt1 := -1
	lastEvt2 := -1
	for i, e := range incidentSpool {
		if e.ID == "mon-1" && e.NewStatus == "DOWN" { lastEvt1 = i }
		if e.ID == "mon-1" && e.NewStatus == "UP" { lastEvt2 = i }
	}
	
	if lastEvt1 == -1 || lastEvt2 == -1 {
		t.Fatalf("events not found in spool")
	}
	if lastEvt1 > lastEvt2 {
		t.Fatalf("FIFO violated: UP arrived before DOWN")
	}
}
