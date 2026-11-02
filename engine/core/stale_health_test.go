package core

import (
	"sync/atomic"
	"testing"
)

func withFreshHealth(t *testing.T) {
	old := Health
	Health = &LocalHealthTracker{}
	t.Cleanup(func() { Health = old })
}

func staleMonitorPtr() *atomic.Pointer[Monitor] {
	m := &Monitor{ID: "s1", CheckGeneration: 5, AwaitingResult: true}
	p := &atomic.Pointer[Monitor]{}
	p.Store(m)
	return p
}

func TestStaleTimeoutsReachHealthTracker(t *testing.T) {
	withFreshHealth(t)
	p := staleMonitorPtr()
	for i := 0; i < 600; i++ {
		HandleFailureDetailed("s1", p, ErrTimeout, "", "", ProbeMeta{ExpectedGeneration: 4})
	}
	if Health.IsHealthy() {
		t.Fatal("600 stale timeouts should mark the tracker unhealthy")
	}
	if got := p.Load(); got.ChecksTotal != 0 || !got.AwaitingResult {
		t.Fatal("stale results must not change monitor state")
	}
}

func TestStaleAppFailuresDoNotReachHealthTracker(t *testing.T) {
	withFreshHealth(t)
	p := staleMonitorPtr()
	for i := 0; i < 600; i++ {
		HandleFailureDetailed("s1", p, ErrStatus, "", "", ProbeMeta{ExpectedGeneration: 4})
	}
	if !Health.IsHealthy() {
		t.Fatal("stale application errors must not affect local health")
	}
}

func TestStaleSuccessesReachHealthTracker(t *testing.T) {
	withFreshHealth(t)
	p := staleMonitorPtr()
	for i := 0; i < 600; i++ {
		HandleFailureDetailed("s1", p, ErrTimeout, "", "", ProbeMeta{ExpectedGeneration: 4})
	}
	if Health.IsHealthy() {
		t.Fatal("expected unhealthy after stale timeouts")
	}
	for i := 0; i < 1500; i++ {
		HandleSuccessDetailed("s1", p, 1000, ProbeMeta{ExpectedGeneration: 4})
	}
	if !Health.IsHealthy() {
		t.Fatal("stale successes should let the tracker recover")
	}
}
