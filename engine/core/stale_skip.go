package core

import "sync/atomic"

// ChecksStaleSkipped counts queued jobs dropped before probing because the
// reaper or a newer dispatch already advanced the monitor's generation.
var ChecksStaleSkipped atomic.Int64

// jobIsStale reports whether the monitor slot this job was queued for has
// already been reaped or re-dispatched. Probing it would be wasted work: the
// result guard would discard the outcome anyway.
func jobIsStale(job DispatchJob) bool {
	if job.ptr == nil || job.generation == 0 {
		return false
	}
	cur := job.ptr.Load()
	if cur == nil {
		return false
	}
	return cur.CheckGeneration != job.generation || !cur.AwaitingResult
}

// noteStaleFailureHealth records a failure whose result was dropped as stale
// (the reaper or a newer dispatch already took the monitor's slot). The probe
// really ran, so it is still evidence about the local network, using the same
// rule as the live path.
func noteStaleFailureHealth(c ErrClass) {
	if countsTowardLocalHealth(EventCheckResult{Ok: false, ErrClass: c}) {
		Health.RecordResult(c == ErrRefused)
	}
}

// noteStaleSuccessHealth records a success whose result was dropped as stale.
func noteStaleSuccessHealth() {
	Health.RecordResult(true)
}
