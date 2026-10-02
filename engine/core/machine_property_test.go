package core

import (
	"fmt"
	"math/rand"
	"reflect"
	"testing"
	"time"
)

var popASN = map[string]string{"p0": "A0", "p1": "A1", "p2": "A2", "p3": "A0"}

func genEvent(rng *rand.Rand, s MonitorState) Event {
	pops := []string{"p0", "p1", "p2", "p3"}
	pop := pops[rng.Intn(4)]
	epoch, round := s.Epoch, s.Round
	if rng.Float32() < 0.15 && epoch > 0 {
		epoch--
	}
	if rng.Float32() < 0.15 && round > 0 {
		round--
	}
	if rng.Float32() < 0.10 {
		round = s.Round + 1
	}
	switch p := rng.Float32(); {
	case p < 0.35:
		ec := []ErrClass{ErrNet, ErrTimeout, ErrBlocked}[rng.Intn(3)]
		ok := rng.Float32() < 0.5
		if ok {
			ec = ErrNone
		}
		return EventCheckResult{Role: RolePrimary, PoP: pop, ASN: popASN[pop], Ok: ok, ErrClass: ec}
	case p < 0.65:
		return EventVoteResult{PoP: pop, ASN: popASN[pop], Epoch: epoch, Round: round, Ok: rng.Float32() < 0.4}
	case p < 0.75:
		return EventHedgeTimerFired{Epoch: epoch, Round: round}
	case p < 0.90:
		return EventVoteDeadline{Epoch: epoch, Round: round}
	default:
		return EventPersistResult{Ok: rng.Float32() < 0.9}
	}
}

func TestPropertyHarness(t *testing.T) {
	seeds := []int64{42, 1337, 9999}
	for _, seed := range seeds {
		t.Run(fmt.Sprintf("Seed-%d", seed), func(t *testing.T) {
			rng := rand.New(rand.NewSource(seed))

			var countDOWN, countUP, countBLOCKED, countHedgeOpen, countForceClose, countCASFail, countStale int
			
			for i := 0; i < 5000; i++ {
				metrics := runSequence(t, rng, i)
				countDOWN += metrics.DOWN
				countUP += metrics.UP
				countBLOCKED += metrics.BLOCKED
				countHedgeOpen += metrics.HedgeOpen
				countForceClose += metrics.ForceClose
				countCASFail += metrics.CASFail
				countStale += metrics.Stale
			}
			
			// 1. Coverage counters
			floor := 200
			if countDOWN < floor { t.Errorf("Coverage: DOWN transitions %d < %d", countDOWN, floor) }
			if countUP < floor { t.Errorf("Coverage: UP transitions %d < %d", countUP, floor) }
			if countBLOCKED < floor { t.Errorf("Coverage: BLOCKED transitions %d < %d", countBLOCKED, floor) }
			if countHedgeOpen < floor { t.Errorf("Coverage: Hedge-opened rounds %d < %d", countHedgeOpen, floor) }
			if countForceClose < floor { t.Errorf("Coverage: Force-closes %d < %d", countForceClose, floor) }
			if countCASFail < floor { t.Errorf("Coverage: CAS failures %d < %d", countCASFail, floor) }
			if countStale < floor { t.Errorf("Coverage: Stale drops %d < %d", countStale, floor) }
		})
	}
}

type Metrics struct {
	DOWN, UP, BLOCKED, HedgeOpen, ForceClose, CASFail, Stale int
}

func runSequence(t *testing.T, rng *rand.Rand, seqID int) Metrics {
	s1 := MonitorState{ID: fmt.Sprintf("mon-%d", seqID), Status: StatusUp, Epoch: 1, Votes: make(map[string]Vote)}
	s2 := MonitorState{ID: s1.ID, Status: s1.Status, Epoch: s1.Epoch, Votes: make(map[string]Vote)} // For determinism check
	
	now := t0
	var metrics Metrics
	
	// 2. Fan-out cap
	fanOutReqs := make(map[string]int)

	for j := 0; j < 40; j++ {
		ev := genEvent(rng, s1)
		sOriginal := deepCopy(s1)
		
		// Mix in occasional gaps of 15s or more so force-close happens
		stepTime := time.Duration(rng.Intn(10)) * time.Second
		if rng.Float32() < 0.10 {
			stepTime = time.Duration(15 + rng.Intn(30)) * time.Second
		}
		now = now.Add(stepTime)
		
		s1New, fx1 := Step(s1, ev, now, cfg())
		s2New, fx2 := Step(s2, ev, now, cfg()) // Second run for determinism
		
		// 1. Determinism
		if !reflect.DeepEqual(s1New, s2New) {
			t.Fatalf("Non-deterministic state output")
		}
		if !reflect.DeepEqual(fx1, fx2) {
			t.Fatalf("Non-deterministic effects output")
		}
		
		// 2. No input mutation
		if !reflect.DeepEqual(s1, sOriginal) {
			t.Fatalf("Step mutated input state")
		}
		
		checkTransitionInvariants(t, s1, s1New, fx1, ev, &metrics)
		
		// Track Fan-out
		for _, f := range fx1 {
			if req, ok := f.(EffectRequestVotes); ok {
				key := fmt.Sprintf("%d-%d", req.Epoch, req.Round)
				fanOutReqs[key] += req.Count
				if fanOutReqs[key] > 2 {
					t.Fatalf("Fan-out exceeded 2 for epoch %d round %d", req.Epoch, req.Round)
				}
			}
		}

		// 3. Duplicate idempotence
		// Apply the same event twice. 
		// The second call must return an identical state and no effects (excluding age force close).
		if _, isVote := ev.(EventVoteResult); isVote {
			// Apply again on s1New
			sDup, fxDup := Step(s1New, ev, now, cfg()) // Use same 'now' to avoid age close
			if !reflect.DeepEqual(s1New, sDup) || len(fxDup) > 0 {
				t.Fatalf("Duplicate VoteResult was not idempotent")
			}
		} else if e, isCheck := ev.(EventCheckResult); isCheck && e.Role == RolePrimary && !e.Ok && s1New.RoundOpen {
			sDup, fxDup := Step(s1New, ev, now, cfg()) // Use same 'now'
			if !reflect.DeepEqual(s1New, sDup) || len(fxDup) > 0 {
				t.Fatalf("Duplicate CheckResult (primary fail) was not idempotent")
			}
		}

		s1 = s1New
		s2 = s2New
	}
	
	return metrics
}

func checkTransitionInvariants(t *testing.T, old, new MonitorState, fx []Effect, ev Event, metrics *Metrics) {
	// Track metrics
	if new.Status == StatusDown && old.Status != StatusDown { metrics.DOWN++ }
	if new.Status == StatusUp && old.Status != StatusUp { metrics.UP++ }
	if new.Status == StatusBlocked && old.Status != StatusBlocked { metrics.BLOCKED++ }
	
	for _, f := range fx {
		if _, ok := f.(EffectReloadState); ok { metrics.CASFail++ }
		if log, ok := f.(EffectLog); ok && log.Message == "round force-closed due to age" { metrics.ForceClose++ }
	}
	if !old.HedgeInFlight && new.HedgeInFlight { metrics.HedgeOpen++ }

	// 5. Complete stale-event invariant
	isStale := false
	switch e := ev.(type) {
	case EventVoteResult:
		if e.Epoch != old.Epoch || e.Round != old.Round { isStale = true }
	case EventVoteDeadline:
		if e.Epoch != old.Epoch || e.Round != old.Round { isStale = true }
	case EventHedgeTimerFired:
		if e.Epoch != old.Epoch { isStale = true }
		// A timer for Round+1 is NOT stale if it opens the round.
		// If it's for an older round, it's stale.
		if e.Round <= old.Round { isStale = true }
	}

	if isStale {
		metrics.Stale++
		if old.RoundOpen && !new.RoundOpen {
			// force-closed due to age (this is allowed to mutate state)
		} else if !reflect.DeepEqual(old, new) || len(fx) > 0 {
			t.Fatalf("Stale event %T mutated state or produced effects", ev)
		}
	}

	// 6. At most one alert per transition, with stable key, and ExpectedEpoch check
	alertCount := 0
	var alertKey string
	for _, f := range fx {
		if p, ok := f.(EffectPersistTransition); ok {
			if p.ExpectedEpoch != new.Epoch-1 {
				t.Fatalf("EffectPersistTransition has ExpectedEpoch %d but new.Epoch is %d", p.ExpectedEpoch, new.Epoch)
			}
			if p.Alert != nil {
				alertCount++
				alertKey = p.Alert.IdempotencyKey
				expectedKey := fmt.Sprintf("%s-%d-%s", new.ID, new.Epoch, new.Status)
				if alertKey != expectedKey {
					t.Fatalf("Alert key mismatch. Want %s got %s", expectedKey, alertKey)
				}
			}
		} else if a, ok := f.(EffectEmitAlert); ok {
			alertCount++
			alertKey = a.Alert.IdempotencyKey
			expectedKey := fmt.Sprintf("%s-%d-%s", new.ID, new.Epoch, StatusBlocked)
			if alertKey != expectedKey {
				t.Fatalf("EmitAlert key mismatch. Want %s got %s", expectedKey, alertKey)
			}
		}
	}
	if alertCount > 1 {
		t.Fatalf("More than one alert emitted in a single transition")
	}

	// 7. Closed incident never reopens
	// A DOWN transition must carry only votes from a round opened after the last UP.
	// Since IncidentStart is FirstFailAt, and FirstFailAt is reset on UP, 
	// IncidentStart must be >= the last UP time (which is not stored, but FirstFailAt cannot be before FirstPassAt if FirstPassAt is cleared).
	// Let's assert IncidentStart is not zero while UP.
	if old.Status == StatusUp && !old.IncidentStart.IsZero() {
		t.Fatalf("IncidentStart is not zero while UP")
	}

	// 8. Incident start is the first fail
	if new.Status == StatusDown && old.Status != StatusDown {
		if new.IncidentStart.IsZero() {
			t.Fatalf("DOWN transition missing IncidentStart")
		}
		// If it was hedge-opened and two votes came in, FirstFailAt could be zero.
		if !old.FirstFailAt.IsZero() && !new.IncidentStart.Equal(old.FirstFailAt) {
			t.Fatalf("IncidentStart %v is not FirstFailAt %v", new.IncidentStart, old.FirstFailAt)
		}
	}
	
	// 8. Incident end is the first pass
	if new.Status == StatusUp && old.Status == StatusDown {
		for _, f := range fx {
			if p, ok := f.(EffectPersistTransition); ok {
				if p.IncidentEnd.IsZero() {
					t.Fatalf("Recovery missing IncidentEnd")
				}
				if !p.IncidentEnd.Equal(old.FirstPassAt) && !p.IncidentEnd.Equal(new.FirstPassAt) {
					t.Fatalf("IncidentEnd %v does not match FirstPassAt %v / %v", p.IncidentEnd, old.FirstPassAt, new.FirstPassAt)
				}
			}
		}
	}

	// 9. No hedge left open after terminal event
	if (new.Status != old.Status) && new.HedgeInFlight {
		t.Fatalf("Hedge left in flight after transition")
	}

	// 3. DOWN needs >= 2 distinct current-round failing ASNs
	if new.Status == StatusDown && old.Status != StatusDown {
		failingASNs := make(map[string]bool)
		passingASNs := make(map[string]bool)
		for _, v := range old.Votes {
			if v.Ok {
				passingASNs[v.ASN] = true
			} else {
				failingASNs[v.ASN] = true
			}
		}
		
		switch e := ev.(type) {
		case EventVoteResult:
			if e.Epoch == old.Epoch && e.Round == old.Round {
				if _, exists := old.Votes[e.PoP]; !exists {
					if e.Ok {
						passingASNs[e.ASN] = true
					} else {
						failingASNs[e.ASN] = true
					}
				}
			}
		case EventCheckResult:
			if e.Role == RolePrimary {
				if _, exists := old.Votes[e.PoP]; !exists {
					if e.Ok {
						passingASNs[e.ASN] = true
					} else {
						failingASNs[e.ASN] = true
					}
				}
			}
		}
		
		for asn := range passingASNs {
			delete(failingASNs, asn)
		}
		if len(failingASNs) < 2 {
			t.Fatalf("Transitioned DOWN with < 2 failing ASNs (found %d)\nold.Votes: %+v\nevent: %+v", len(failingASNs), old.Votes, ev)
		}
	}
}

func deepCopy(s MonitorState) MonitorState {
	c := s
	if s.Votes != nil {
		c.Votes = make(map[string]Vote)
		for k, v := range s.Votes {
			c.Votes[k] = v
		}
	}
	return c
}
