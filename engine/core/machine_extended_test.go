package core

import (
	"fmt"
	"math/rand"
	"testing"
	"time"
)

// TestSingleNodeDownSemantics verifies that in SingleNodeMode, 2 consecutive failures
// bring the monitor DOWN without needing secondary votes.
func TestSingleNodeDownSemantics(t *testing.T) {
	config := MachineConfig{
		RecoveryN:      2,
		VoteDeadline:   100 * time.Millisecond,
		RoundGrace:     100 * time.Millisecond,
		BlockedNoticeN: 3,
		SingleNodeMode: true, // Enable the new explicit fallback semantics
	}
	
	now := time.Now()
	state := MonitorState{
		ID:     "mon-1",
		Status: StatusUp,
		Epoch:  1,
	}
	
	// First Failure
	ev1 := EventCheckResult{
		Role:     RolePrimary,
		PoP:      "pop-local",
		ASN:      "asn-local",
		Ok:       false,
		ErrClass: ErrTimeout,
	}
	
	state, _ = Step(state, ev1, now, config)
	
	// Should be UP, with ConsecutiveFails = 1
	if state.Status != StatusUp {
		t.Errorf("Expected UP after 1 failure, got %v", state.Status)
	}
	if state.RoundOpen {
		t.Errorf("Expected round NOT to be open in SingleNodeMode")
	}
	if state.ConsecutiveFails != 1 {
		t.Errorf("Expected ConsecutiveFails=1, got %d", state.ConsecutiveFails)
	}
	
	// Second Failure
	ev2 := EventCheckResult{
		Role:     RolePrimary,
		PoP:      "pop-local",
		ASN:      "asn-local",
		Ok:       false,
		ErrClass: ErrTimeout,
	}
	state, _ = Step(state, ev2, now, config)
	
	// Should now be DOWN
	if state.Status != StatusDown {
		t.Errorf("Expected DOWN after 2 consecutive failures in single-node mode, got %v", state.Status)
	}
	if state.ConsecutiveFails != 0 {
		t.Errorf("Expected ConsecutiveFails=0 after transition to DOWN, got %d", state.ConsecutiveFails)
	}
	
	// Recovery Check
	evPass := EventCheckResult{
		Role:     RolePrimary,
		PoP:      "pop-local",
		ASN:      "asn-local",
		Ok:       true,
		ErrClass: ErrNone,
	}
	state, _ = Step(state, evPass, now, config)
	if state.ConsecutiveFails != 0 {
		t.Errorf("Expected ConsecutiveFails to reset on pass, got %d", state.ConsecutiveFails)
	}
	if state.ConsecutivePass != 1 {
		t.Errorf("Expected ConsecutivePass=1, got %d", state.ConsecutivePass)
	}
}

// TestStaleEvidence verifies that target recovery isn't overridden by stale cache.
func TestStaleEvidence(t *testing.T) {
	cache := &EvidenceCache{}
	ip, port := "192.168.1.1", "443"
	
	// Record an old failure
	cache.Record(ip, port, "pop-other", "asn-other", ErrTimeout)
	
	// Wait a bit, simulate round opening much later (outside the 1s grace period)
	roundOpenAt := time.Now().Add(2 * time.Second)
	
	// Ensure lookup FAILS because the evidence is older than the round open
	_, ok := cache.Lookup(ip, port, "pop-local", "asn-local", roundOpenAt)
	if ok {
		t.Errorf("Expected stale evidence to be rejected")
	}
}

// TestShardDistribution verifies that FNV-1a provides a uniform spread.
func TestShardDistribution(t *testing.T) {
	counts := make(map[int]int)
	rng := rand.New(rand.NewSource(42))
	
	// Generate realistic IDs
	for i := 0; i < 35000; i++ {
		var id string
		if i%2 == 0 {
			id = fmt.Sprintf("mon-%d", i) // Sequential
		} else {
			id = fmt.Sprintf("%x-%x", rng.Int63(), rng.Int63()) // UUID-like
		}
		shard := getShard(id)
		counts[shard]++
	}
	
	expected := 35000 / numShards
	for shard := 0; shard < numShards; shard++ {
		count := counts[shard]
		diff := float64(count - expected)
		if diff < 0 {
			diff = -diff
		}
		// Variance should be within 35%
		if diff > float64(expected)*0.35 {
			t.Errorf("Shard %d count %d deviates too much from expected %d", shard, count, expected)
		}
	}
}

func TestPermutationsSingleNode(t *testing.T) {
	config := MachineConfig{RecoveryN: 2, SingleNodeMode: true}
	now := time.Now()
	
	// Test: UP -> fail, pass, fail must not go DOWN
	state := MonitorState{ID: "mon", Status: StatusUp}
	evFail := EventCheckResult{Role: RolePrimary, Ok: false, ErrClass: ErrTimeout}
	evPass := EventCheckResult{Role: RolePrimary, Ok: true, ErrClass: ErrNone}
	
	state, _ = Step(state, evFail, now, config)
	state, _ = Step(state, evPass, now, config)
	state, _ = Step(state, evFail, now, config)
	if state.Status != StatusUp {
		t.Errorf("Expected UP, got %v", state.Status)
	}
	
	// Test: DOWN -> fail, pass must not recover
	stateDown := MonitorState{ID: "mon2", Status: StatusDown, Epoch: 2}
	stateDown, _ = Step(stateDown, evFail, now, config)
	stateDown, _ = Step(stateDown, evPass, now, config)
	if stateDown.Status != StatusDown {
		t.Errorf("Expected DOWN to not recover on single pass, got %v", stateDown.Status)
	}
	
	// Test: Hedge in single node mode does not open round
	stateHedge := MonitorState{ID: "mon3", Status: StatusUp, Epoch: 1}
	evHedge := EventHedgeTimerFired{Epoch: 1, Round: 1}
	stateHedge, _ = Step(stateHedge, evHedge, now, config)
	if stateHedge.RoundOpen {
		t.Errorf("Expected RoundOpen false for hedge in SingleNodeMode")
	}
}

func TestHealthTracker(t *testing.T) {
	h := &LocalHealthTracker{}
	
	// Record some passes
	for i := 0; i < 200; i++ {
		h.RecordResult(true)
	}
	if !h.IsHealthy() {
		t.Errorf("Expected to be healthy")
	}
	
	// Record massive failures
	for i := 0; i < 350; i++ {
		h.RecordResult(false)
	}
	if h.IsHealthy() {
		t.Errorf("Expected to be unhealthy after >60%% failure rate")
	}
}
