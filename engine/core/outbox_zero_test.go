package core

import (
	"testing"
	"time"
)

// Production wires every shard state worker with a zero-value Outbox (nil channels).
// Submit must never park the caller: a parked state worker kills its whole shard.
func TestZeroValueOutboxSubmitDoesNotBlock(t *testing.T) {
	done := make(chan error, 1)
	go func() { done <- (&Outbox{}).Submit("m1", EffectPersistTransition{ExpectedEpoch: 1}) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Outbox.Submit on a zero-value Outbox blocked: the shard state worker would be parked forever")
	}
}

func TestNilOutboxSubmitDoesNotBlock(t *testing.T) {
	var o *Outbox
	done := make(chan struct{})
	go func() { _ = o.Submit("m1", EffectPersistTransition{ExpectedEpoch: 1}); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Submit on a nil *Outbox blocked")
	}
}

func TestFullOutboxSubmitDoesNotBlock(t *testing.T) {
	o := &Outbox{ch: make(chan walEntry, 1), done: make(chan struct{})}
	_ = o.Submit("a", EffectPersistTransition{ExpectedEpoch: 1}) // fills the buffer
	done := make(chan struct{})
	go func() { _ = o.Submit("b", EffectPersistTransition{ExpectedEpoch: 2}); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Submit on a full outbox blocked the caller")
	}
}
