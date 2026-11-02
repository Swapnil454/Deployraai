package core

import "testing"

func TestSuppressNetAndUnreachable(t *testing.T) {
	for _, c := range []ErrClass{ErrNet, ErrUnreachable} {
		ev := EventCheckResult{Ok: false, ErrClass: c}
		if !shouldSuppressFailure(ev, true, func() bool { return false }) {
			t.Errorf("%s: should be suppressed", c)
		}
		if shouldSuppressFailure(ev, true, func() bool { return true }) {
			t.Errorf("%s: canary reachable must not suppress", c)
		}
		if shouldSuppressFailure(ev, false, func() bool { return false }) {
			t.Errorf("%s: healthy tracker must not suppress", c)
		}
	}
}

func TestNetCountsTowardLocalHealth(t *testing.T) {
	for _, c := range []ErrClass{ErrNet, ErrUnreachable} {
		if !countsTowardLocalHealth(EventCheckResult{ErrClass: c}) {
			t.Errorf("%s should count", c)
		}
	}
}

func TestAppErrorsDoNotCountTowardLocalHealth(t *testing.T) {
	for _, c := range []ErrClass{ErrStatus, ErrKeyword, ErrTLS} {
		if countsTowardLocalHealth(EventCheckResult{ErrClass: c}) {
			t.Errorf("%s must not count", c)
		}
	}
}
