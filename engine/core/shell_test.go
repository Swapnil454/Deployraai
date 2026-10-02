package core

import (
	"testing"
	"time"
)

type mockDB struct {
	state MonitorState
}

func (m *mockDB) FetchGroundTruth(monitorID string) MonitorState {
	return m.state
}

func TestShellStateStore(t *testing.T) {
	store := NewStateStore()
	outbox, _ := NewOutbox(t.TempDir())
defer outbox.Close()
	cfg := MachineConfig{
		RecoveryN:      2,
		VoteDeadline:   10 * time.Second,
		RoundGrace:     5 * time.Second,
		BlockedNoticeN: 3,
	}

	db := &mockDB{
		state: MonitorState{
			ID:     "mon-1",
			Status: StatusUp,
			Epoch:  10, // ground truth epoch
			Round:  0,
		},
	}

	// First event: send a failure, should open a round.
	// Since state isn't populated, it defaults to Epoch 0, Status Up.
	// The machine will accept the vote, increment round, request hedge.
	ev1 := EventCheckResult{
		Role:     RolePrimary,
		PoP:      "pop1",
		ASN:      "asn1",
		Ok:       false,
		ErrClass: ErrTimeout,
	}

	_ = store.Apply("mon-1", ev1, cfg, outbox, db)

	state1 := store.GetState("mon-1")
	if state1.Status != StatusUp || !state1.RoundOpen {
		t.Fatalf("Expected RoundOpen = true, got %+v", state1)
	}

	// Verify we didn't reload yet
	if state1.Epoch == 10 {
		t.Fatalf("Should not have reloaded from ground truth yet")
	}

	// Now simulate a CAS failure (EventPersistResult Ok = false)
	ev2 := EventPersistResult{
		Ok: false,
	}

	effects2 := store.Apply("mon-1", ev2, cfg, outbox, db)
	reloaded := false
	for _, eff := range effects2 {
		if _, ok := eff.(EffectReloadState); ok {
			reloaded = true
		}
	}

	if !reloaded {
		t.Fatalf("Expected EffectReloadState in effects list")
	}

	state2 := store.GetState("mon-1")
	if state2.Epoch != 10 {
		t.Fatalf("Expected state to be reloaded to Epoch 10, got %d", state2.Epoch)
	}
}
