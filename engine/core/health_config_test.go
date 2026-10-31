package core

import "testing"

func TestParseHealthConfigDefaultsAndBounds(t *testing.T) {
	env := func(m map[string]string) func(string) string {
		return func(k string) string { return m[k] }
	}
	d := parseHealthConfig(env(nil))
	if d.window != 30 || d.unhealthy != 0.60 || d.recoverBelow != 0.30 || d.minSample != 500 {
		t.Fatalf("defaults changed: %+v", d)
	}
	c := parseHealthConfig(env(map[string]string{"HEALTH_WINDOW_SECS": "10", "HEALTH_UNHEALTHY_RATIO": "0.35", "HEALTH_RECOVER_RATIO": "0.15", "HEALTH_MIN_SAMPLES": "200"}))
	if c.window != 10 || c.unhealthy != 0.35 || c.recoverBelow != 0.15 || c.minSample != 200 {
		t.Fatalf("overrides not applied: %+v", c)
	}
	bad := parseHealthConfig(env(map[string]string{"HEALTH_WINDOW_SECS": "99", "HEALTH_UNHEALTHY_RATIO": "7", "HEALTH_RECOVER_RATIO": "x"}))
	if bad != d {
		t.Fatalf("invalid values must fall back to defaults: %+v", bad)
	}
	inv := parseHealthConfig(env(map[string]string{"HEALTH_UNHEALTHY_RATIO": "0.2", "HEALTH_RECOVER_RATIO": "0.5"}))
	if inv.recoverBelow >= inv.unhealthy {
		t.Fatalf("recover threshold must stay below unhealthy: %+v", inv)
	}
}

func TestLocalHealthTrackerFlipsOnFailureRatio(t *testing.T) {
	h := &LocalHealthTracker{}
	for i := 0; i < 600; i++ {
		h.RecordResult(false)
	}
	if h.IsHealthy() {
		t.Fatal("600 failures in the window must mark the tracker unhealthy")
	}
	h2 := &LocalHealthTracker{}
	for i := 0; i < 600; i++ {
		h2.RecordResult(true)
	}
	if !h2.IsHealthy() {
		t.Fatal("600 successes must stay healthy")
	}
}
