package core

import "testing"
import "time"

func TestSeedDownRecoversAfterTwoPasses(t *testing.T) {
	s := NewStateStore()
	s.SeedDown("m1", time.Now().Add(-time.Minute))
	cfg := MachineConfig{RecoveryN: 2, SingleNodeMode: true}
	pass := EventCheckResult{Role: RolePrimary, Ok: true}
	for i := 0; i < 2; i++ {
		up := false
		for _, e := range s.Apply("m1", pass, cfg, nil, noopDB{}) {
			if p, ok := e.(EffectPersistTransition); ok && p.OldState == StatusDown && p.NewState == StatusUp {
				up = true
			}
		}
		if up != (i == 1) {
			t.Fatalf("pass %d: up transition=%v", i+1, up)
		}
	}
	if st := s.GetState("m1"); st.Status != StatusUp {
		t.Fatalf("final status %s", st.Status)
	}
}
