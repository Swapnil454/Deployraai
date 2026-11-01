package core

import "testing"

func TestGuardDecisionCountsByClass(t *testing.T) {
	down := func() bool { return false }
	guardMu.Lock()
	s0, p0 := guardSuppressed[ErrSlow], guardPassed[ErrSlow]
	guardMu.Unlock()
	if !guardDecision(EventCheckResult{ErrClass: ErrSlow}, true, down) {
		t.Fatal("expected suppression")
	}
	if guardDecision(EventCheckResult{ErrClass: ErrSlow}, false, down) {
		t.Fatal("healthy tracker must not suppress")
	}
	guardMu.Lock()
	defer guardMu.Unlock()
	if guardSuppressed[ErrSlow] != s0+1 || guardPassed[ErrSlow] != p0+1 {
		t.Fatalf("counters wrong: suppressed=%v passed=%v", guardSuppressed, guardPassed)
	}
}
