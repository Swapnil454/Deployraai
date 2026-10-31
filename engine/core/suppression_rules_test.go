package core

import "testing"

func TestShouldSuppressFailureRules(t *testing.T) {
	cases := []struct {
		name      string
		ev        EventCheckResult
		unhealthy bool
		canaryOK  bool
		want      bool
	}{
		{"timeout", EventCheckResult{ErrClass: ErrTimeout}, true, false, true},
		{"dns", EventCheckResult{ErrClass: ErrDNS}, true, false, true},
		{"slow", EventCheckResult{ErrClass: ErrSlow}, true, false, true},
		{"slow healthy tracker", EventCheckResult{ErrClass: ErrSlow}, false, false, false},
		{"slow canary ok", EventCheckResult{ErrClass: ErrSlow}, true, true, false},
		{"refused never", EventCheckResult{ErrClass: ErrRefused}, true, false, false},
		{"success never", EventCheckResult{Ok: true, ErrClass: ErrNone}, true, false, false},
	}
	for _, tc := range cases {
		calls := 0
		canary := func() bool { calls++; return tc.canaryOK }
		if got := shouldSuppressFailure(tc.ev, tc.unhealthy, canary); got != tc.want {
			t.Errorf("%s: got %v want %v", tc.name, got, tc.want)
		}
		if !tc.unhealthy && calls != 0 {
			t.Errorf("%s: canary consulted while tracker healthy", tc.name)
		}
	}
}

func TestCountsTowardLocalHealth(t *testing.T) {
	if !countsTowardLocalHealth(EventCheckResult{ErrClass: ErrSlow}) {
		t.Error("ErrSlow failure must feed the tracker")
	}
	if countsTowardLocalHealth(EventCheckResult{ErrClass: ErrCanceled}) {
		t.Error("canceled must not feed the tracker")
	}
	if !countsTowardLocalHealth(EventCheckResult{Ok: true}) {
		t.Error("success must feed the tracker")
	}
}
