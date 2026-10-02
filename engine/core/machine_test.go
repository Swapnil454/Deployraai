package core

import (
	"reflect"
	"testing"
	"time"
)

var t0 = time.Unix(1700000000, 0).UTC()

func fail(pop, asn string) EventCheckResult {
	return EventCheckResult{Role: RolePrimary, PoP: pop, ASN: asn, Ok: false, ErrClass: ErrNet}
}

func cfg() MachineConfig {
	return MachineConfig{
		RecoveryN:      3,
		VoteDeadline:   10 * time.Second,
		RoundGrace:     5 * time.Second,
		BlockedNoticeN: 3,
	}
}

func TestQuorumC1(t *testing.T) {
	state := MonitorState{ID: "mon-1", Status: StatusUp, Epoch: 1, Votes: make(map[string]Vote)}

	state, _ = Step(state, fail("pop1", "AS100"), t0, cfg())
	if state.Status != StatusUp {
		t.Errorf("Should not transition on 1 vote")
	}

	state, _ = Step(state, EventVoteResult{PoP: "pop2", ASN: "AS100", Epoch: 1, Round: state.Round, Ok: false}, t0, cfg())
	if state.Status != StatusUp {
		t.Errorf("Should not transition because ASNs are not independent")
	}

	state, effects := Step(state, EventVoteResult{PoP: "pop3", ASN: "AS200", Epoch: 1, Round: state.Round, Ok: false}, t0, cfg())
	if state.Status != StatusDown {
		t.Errorf("Should transition DOWN with 2 independent failing ASNs")
	}

	hasAlert := false
	for _, ef := range effects {
		if _, ok := ef.(EffectPersistTransition); ok {
			hasAlert = true
		}
	}
	if !hasAlert {
		t.Errorf("Transition must emit Persist (with Alert inside)")
	}
}

func TestStaleEvidenceWithinEpoch(t *testing.T) {
	s := MonitorState{ID: "mon-1", Status: StatusUp, Epoch: 1}
	
	s, _ = Step(s, fail("pop1", "AS100"), t0, cfg())
	s, _ = Step(s, EventVoteDeadline{Epoch: 1, Round: s.Round}, t0.Add(10*time.Second), cfg())
	s, _ = Step(s, EventCheckResult{Role: RolePrimary, PoP: "pop1", ASN: "AS100", Ok: true}, t0.Add(30*time.Second), cfg())
	
	s, _ = Step(s, EventVoteResult{PoP: "pop2", ASN: "AS200", Epoch: 1, Round: 1, Ok: false}, t0.Add(time.Hour), cfg())
	
	if s.Status != StatusUp {
		t.Fatalf("went %s on an hour-old failing vote", s.Status)
	}
}

func TestDownCancelsHedgeC6(t *testing.T) {
	s := MonitorState{ID: "mon-1", Status: StatusUp, Epoch: 1}
	// Hedge timer opens the round
	s, _ = Step(s, EventHedgeTimerFired{Epoch: 1, Round: 1}, t0, cfg())
	
	s, _ = Step(s, fail("pop1", "AS100"), t0, cfg())
	s, fx := Step(s, EventVoteResult{PoP: "pop2", ASN: "AS200", Epoch: 1, Round: s.Round, Ok: false}, t0, cfg())
	
	if s.Status != StatusDown {
		t.Fatal("want DOWN")
	}
	
	var cancelled bool
	for _, e := range fx {
		if _, ok := e.(EffectCancelHedge); ok {
			cancelled = true
		}
	}
	if !cancelled {
		t.Error("hedge flag cleared but shell never told to cancel")
	}
}

func TestBlockedDoesNotShieldOutageC7(t *testing.T) {
	s := MonitorState{ID: "mon-1", Status: StatusBlocked, Epoch: 3}
	r := fail("pop1", "AS100")
	r.ErrClass = ErrTimeout
	
	_, fx := Step(s, r, t0, cfg())
	
	var asked bool
	for _, e := range fx {
		if _, ok := e.(EffectRequestVotes); ok {
			asked = true
		}
	}
	if !asked {
		t.Error("real timeout in BLOCKED state never starts confirmation")
	}
}

func TestIdempotencyKeysDiffer(t *testing.T) {
	s1 := MonitorState{ID: "mon-A", Status: StatusUp, Epoch: 1}
	s2 := MonitorState{ID: "mon-B", Status: StatusUp, Epoch: 1}
	
	s1, _ = Step(s1, fail("pop1", "AS100"), t0, cfg())
	_, fx1 := Step(s1, EventVoteResult{PoP: "pop2", ASN: "AS200", Epoch: 1, Round: s1.Round, Ok: false}, t0, cfg())
	
	s2, _ = Step(s2, fail("pop1", "AS100"), t0, cfg())
	_, fx2 := Step(s2, EventVoteResult{PoP: "pop2", ASN: "AS200", Epoch: 1, Round: s2.Round, Ok: false}, t0, cfg())
	
	var key1, key2 string
	for _, e := range fx1 {
		if p, ok := e.(EffectPersistTransition); ok && p.Alert != nil {
			key1 = p.Alert.IdempotencyKey
		}
	}
	for _, e := range fx2 {
		if p, ok := e.(EffectPersistTransition); ok && p.Alert != nil {
			key2 = p.Alert.IdempotencyKey
		}
	}
	if key1 == key2 || key1 == "" {
		t.Errorf("Idempotency keys identical or empty: %s %s", key1, key2)
	}
}

func TestFencingC3(t *testing.T) {
	state := MonitorState{ID: "m1", Status: StatusUp, Epoch: 2, Votes: make(map[string]Vote)}
	originalState := state // Copied by value
	
	newState, effects := Step(state, EventVoteResult{PoP: "p2", ASN: "A2", Epoch: 1, Ok: false}, t0, cfg())
	if len(effects) > 0 {
		t.Errorf("Stale epoch produced effects")
	}
	
	if !reflect.DeepEqual(originalState, newState) {
		t.Errorf("Stale epoch mutated state")
	}
}

func TestRecoveryC4(t *testing.T) {
	state := MonitorState{ID: "m1", Status: StatusDown, Epoch: 5, IncidentStart: t0, Votes: make(map[string]Vote)}
	
	for i := 0; i < 2; i++ {
		state, _ = Step(state, EventCheckResult{Role: RolePrimary, PoP: "p1", ASN: "A1", Ok: true}, t0.Add(time.Duration(i)*30*time.Second), cfg())
		if state.Status == StatusUp {
			t.Errorf("Recovered too early, want N=3 passes")
		}
	}
	
	// Corroborated failure resets counter
	state, _ = Step(state, fail("p1", "A1"), t0.Add(time.Minute), cfg())
	state, _ = Step(state, EventVoteResult{PoP: "p2", ASN: "A2", Epoch: 5, Round: state.Round, Ok: false}, t0.Add(time.Minute), cfg())
	
	if state.ConsecutivePass != 0 {
		t.Errorf("Corroborated failure failed to reset ConsecutivePass")
	}
	
	// Uncorroborated failure does not reset counter
	state.ConsecutivePass = 2
	state, _ = Step(state, fail("p1", "A1"), t0.Add(time.Minute*2), cfg())
	state, _ = Step(state, EventVoteDeadline{Epoch: 5, Round: state.Round}, t0.Add(time.Minute*2+10*time.Second), cfg())
	
	if state.ConsecutivePass != 2 {
		t.Errorf("Uncorroborated failure erroneously reset ConsecutivePass")
	}

	state, fx := Step(state, EventCheckResult{Role: RolePrimary, PoP: "p1", ASN: "A1", Ok: true}, t0.Add(time.Minute*3), cfg())
	
	if state.Status != StatusUp {
		t.Errorf("Failed to recover")
	}
	
	var alert *AlertPayload
	var incEnd time.Time
	for _, e := range fx {
		if p, ok := e.(EffectPersistTransition); ok {
			alert = p.Alert
			incEnd = p.IncidentEnd
		}
	}
	
	if incEnd.IsZero() {
		t.Errorf("IncidentEnd not captured")
	}
	if alert == nil {
		t.Errorf("Missing Alert")
	}
}

func TestHedgeCancelPrimarySuccessC6(t *testing.T) {
	s := MonitorState{ID: "m1", Status: StatusUp, Epoch: 1}
	
	// Hedge timer opens the round
	s, _ = Step(s, EventHedgeTimerFired{Epoch: 1, Round: 1}, t0, cfg())
	
	if !s.HedgeInFlight {
		t.Fatal("Hedge should be in flight after timer opens round")
	}
	
	s, fx := Step(s, EventCheckResult{Role: RolePrimary, Ok: true}, t0.Add(time.Second), cfg())
	
	var cancelled bool
	for _, e := range fx {
		if _, ok := e.(EffectCancelHedge); ok {
			cancelled = true
		}
	}
	if !cancelled {
		t.Errorf("Missing EffectCancelHedge on primary success")
	}
}

func TestMissingVoteAbstain(t *testing.T) {
	s := MonitorState{ID: "m1", Status: StatusUp, Epoch: 1}
	s, _ = Step(s, fail("p1", "A1"), t0, cfg())
	
	s, fx := Step(s, EventVoteDeadline{Epoch: 1, Round: s.Round}, t0, cfg())
	
	if s.Status != StatusUp {
		t.Errorf("Should remain UP on abstain")
	}
	
	var logged bool
	for _, e := range fx {
		if l, ok := e.(EffectLog); ok && l.Message == "quorum unavailable" {
			logged = true
		}
	}
	if !logged {
		t.Errorf("Should log quorum unavailable")
	}
	if s.RoundOpen {
		t.Errorf("Round should be closed after deadline")
	}
}

func TestStuckRoundForceClose(t *testing.T) {
	s := MonitorState{ID: "m1", Status: StatusUp, Epoch: 1}
	s, _ = Step(s, fail("p1", "A1"), t0, cfg())
	
	if !s.RoundOpen {
		t.Fatal("Round should be open")
	}
	
	// Send any event WAY after the deadline + grace
	s, fx := Step(s, EventCheckResult{Role: RolePrimary, Ok: true}, t0.Add(time.Minute), cfg())
	
	var forceClosed bool
	for _, e := range fx {
		if l, ok := e.(EffectLog); ok && l.Message == "round force-closed due to age" {
			forceClosed = true
		}
	}
	if !forceClosed {
		t.Errorf("Should force close stale round")
	}
}

func TestNoFanOutWhileDownC2(t *testing.T) {
	s := MonitorState{ID: "m1", Status: StatusDown, Epoch: 2} // ConsecutivePass is 0
	s, fx := Step(s, fail("p1", "A1"), t0, cfg())
	
	reqs := 0
	for _, e := range fx {
		if r, ok := e.(EffectRequestVotes); ok {
			reqs += r.Count
		}
	}
	
	if reqs != 0 {
		t.Errorf("Should NOT request votes when ConsecutivePass is 0 while DOWN")
	}
	
	s, fx2 := Step(s, fail("p1", "A1"), t0.Add(30*time.Second), cfg())
	reqs2 := 0
	for _, e := range fx2 {
		if r, ok := e.(EffectRequestVotes); ok {
			reqs2 += r.Count
		}
	}
	
	if reqs2 != 0 {
		t.Errorf("Should NOT request votes repeatedly while DOWN (no re-fan-out amplification)")
	}
}

func TestBlockedWhileDownStaysDown(t *testing.T) {
	s := MonitorState{ID: "m1", Status: StatusDown, Epoch: 2}
	s, _ = Step(s, EventCheckResult{Role: RolePrimary, ErrClass: ErrBlocked}, t0, cfg())
	
	if s.Status != StatusDown {
		t.Errorf("BLOCKED result while DOWN must not change status")
	}
}

func TestSameASNDisagreement(t *testing.T) {
	s := MonitorState{ID: "m1", Status: StatusUp, Epoch: 1}
	s, _ = Step(s, fail("p1", "A1"), t0, cfg())
	s, _ = Step(s, EventVoteResult{PoP: "p2", ASN: "A2", Epoch: 1, Round: s.Round, Ok: true}, t0, cfg())
	s, _ = Step(s, EventVoteResult{PoP: "p3", ASN: "A2", Epoch: 1, Round: s.Round, Ok: false}, t0, cfg())
	
	// EvaluateQuorum: p2 passed (A2), p3 failed (A2).
	s, fx := Step(s, EventVoteDeadline{Epoch: 1, Round: s.Round}, t0, cfg())
	
	if s.Status != StatusUp {
		t.Errorf("Should not transition DOWN if there are passing ASNs")
	}
	
	if s.RoundOpen {
		t.Errorf("Round should be closed")
	}
	
	if len(s.Votes) != 0 {
		t.Errorf("Votes should be cleared")
	}
	
	logged := false
	for _, e := range fx {
		if l, ok := e.(EffectLog); ok && l.Message == "quorum unavailable" {
			logged = true
		}
	}
	if !logged {
		t.Errorf("Should log quorum unavailable")
	}
}

func TestCASRollback(t *testing.T) {
	s := MonitorState{ID: "m1", Status: StatusUp, Epoch: 1}
	s, _ = Step(s, fail("p1", "A1"), t0, cfg())
	
	// Fast-forward to quorum to transition DOWN and emit PersistTransition
	s, _ = Step(s, EventVoteResult{PoP: "p2", ASN: "A2", Epoch: 1, Round: s.Round, Ok: false}, t0, cfg())
	if s.Status != StatusDown {
		t.Fatalf("Expected transition to DOWN")
	}
	
	// Simulate CAS failure
	s, fxRollback := Step(s, EventPersistResult{Ok: false}, t0, cfg())
	
	reloaded := false
	for _, e := range fxRollback {
		if _, ok := e.(EffectReloadState); ok {
			reloaded = true
		}
	}
	if !reloaded {
		t.Errorf("Expected EffectReloadState on CAS failure")
	}
	
	// Ensure alert is not re-emitted by the rollback step
	for _, e := range fxRollback {
		if _, ok := e.(EffectPersistTransition); ok {
			t.Errorf("Should not emit PersistTransition during rollback")
		}
	}
}
