package core

import (
	"testing"
	"time"
)

func TestSubmitCheckResultSuppressionRules(t *testing.T) {
	old := Health
	Health = &LocalHealthTracker{}
	oldEP := healthCanaryEndpoints
	t.Cleanup(func() { Health = old; healthCanaryEndpoints = oldEP })
	ResetConfirmationDispatcherForTest()
	for i := 0; i < 2000; i++ {
		Health.RecordResult(false)
	}
	if Health.IsHealthy() {
		t.Fatal("expected unhealthy")
	}
	sh := getShard("m1")
	drain := func() int {
		n := len(shardBuses[sh])
		for len(shardBuses[sh]) > 0 {
			<-shardBuses[sh]
		}
		return n
	}
	healthCanaryEndpoints = []string{"x"}
	healthCanaryLast.Store(time.Now().UnixNano())
	healthCanaryOK.Store(false)
	SubmitCheckResult("m1", EventCheckResult{Role: RolePrimary, ErrClass: ErrTimeout})
	if drain() != 0 {
		t.Fatal("timeout must be suppressed while unhealthy and the canary fails")
	}
	SubmitCheckResult("m1", EventCheckResult{Role: RolePrimary, ErrClass: ErrRefused})
	if drain() != 1 {
		t.Fatal("refused must never be suppressed")
	}
	healthCanaryOK.Store(true)
	SubmitCheckResult("m1", EventCheckResult{Role: RolePrimary, ErrClass: ErrTimeout})
	if drain() != 1 {
		t.Fatal("timeout must pass when the canary reaches the internet")
	}
}
