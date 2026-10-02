package core

// timer.go — Manages per-monitor deadline timers for the quorum state machine.
//
// The pure machine (machine.go) emits EffectScheduleDeadline and EffectCancelHedge
// as data — it never touches time itself. This file is the Shell component that
// converts those effects into real Go timers.
//
// Design constraints:
//   - One sync.Map entry per monitor, keyed by monitorID.
//   - Each entry holds a single *time.Timer; we use Stop()+Reset() to avoid
//     creating a new goroutine on every deadline reschedule (important at 35K monitors).
//   - The fired function is called on the timer's goroutine — it MUST be non-blocking
//     (just send to a channel); the heavy work (Apply → machine Step) stays on the
//     Shell's serialized per-monitor goroutine.

import (
	"sync"
	"time"
)

// deadlineEntry is the per-monitor timer state.
type deadlineEntry struct {
	mu    sync.Mutex
	timer *time.Timer
	epoch uint64
	round uint64
}

// DeadlineTimers manages all per-monitor vote-deadline timers.
type DeadlineTimers struct {
	entries sync.Map // monitorID → *deadlineEntry
}

var Timers = &DeadlineTimers{}

// Schedule arms (or re-arms) the deadline timer for a monitor.
// If a timer already exists for this monitor, it is stopped and reset.
// When it fires, it calls the provided callback function with the EventVoteDeadline.
func (dt *DeadlineTimers) Schedule(monitorID string, epoch, round uint64, after time.Duration, callback func(EventVoteDeadline)) {
	val, _ := dt.entries.LoadOrStore(monitorID, &deadlineEntry{})
	e := val.(*deadlineEntry)

	e.mu.Lock()
	defer e.mu.Unlock()

	// Discard any in-flight timer for a stale epoch/round
	if e.timer != nil {
		e.timer.Stop()
	}
	e.epoch = epoch
	e.round = round

	e.timer = time.AfterFunc(after, func() {
		callback(EventVoteDeadline{Epoch: epoch, Round: round})
	})
}

// Cancel stops any pending deadline timer for the monitor.
// Called when EffectCancelHedge is emitted.
func (dt *DeadlineTimers) Cancel(monitorID string) {
	if val, ok := dt.entries.Load(monitorID); ok {
		e := val.(*deadlineEntry)
		e.mu.Lock()
		if e.timer != nil {
			e.timer.Stop()
		}
		e.mu.Unlock()
	}
}

// Delete removes the timer entry entirely (called when a monitor is deleted).
func (dt *DeadlineTimers) Delete(monitorID string) {
	if val, ok := dt.entries.LoadAndDelete(monitorID); ok {
		e := val.(*deadlineEntry)
		e.mu.Lock()
		if e.timer != nil {
			e.timer.Stop()
		}
		e.mu.Unlock()
	}
}
