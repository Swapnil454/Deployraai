package core

import (
	"hash/fnv"
	"time"
)

const (
	ColdCadence = 5 * time.Minute
	ColdGrace   = 1 * time.Minute
)

func HashID(id string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(id))
	return h.Sum64()
}

func NextTick(now time.Time, interval time.Duration, id string) time.Time {
	if interval <= 0 {
		interval = time.Second
	}
	phase := time.Duration(HashID(id) % uint64(interval.Nanoseconds()))
	shiftedNow := now.UnixNano() - int64(phase)
	intervalsPassed := shiftedNow / int64(interval.Nanoseconds())
	nextUnixNano := (intervalsPassed + 1) * int64(interval.Nanoseconds()) + int64(phase)
	return time.Unix(0, nextUnixNano)
}

// IsColdCheck evaluates whether the tick is a cold check, preventing thundering herds.
// It also checks if we've missed our cold check slot due to overload.
// Note: lastColdAt lives in memory only. On worker restart, it will be zero, resulting
// in an immediate forced cold check (thundering herd is mitigated by staggered deployments).
func IsColdCheck(id string, tick time.Time, interval time.Duration, lastColdAt time.Time) bool {
	if interval <= 0 {
		interval = time.Second
	}
	if interval >= ColdCadence {
		return true
	}

	// If it's our first check or we missed our cadence window + grace, force a cold check
	if lastColdAt.IsZero() || tick.Sub(lastColdAt) > (ColdCadence+ColdGrace) {
		return true
	}

	slotsPerWindow := uint64(ColdCadence.Nanoseconds() / interval.Nanoseconds())
	ownedSlot := HashID(id+"|cold") % slotsPerWindow
	
	phase := time.Duration(HashID(id) % uint64(interval.Nanoseconds()))
	shiftedTick := tick.UnixNano() - int64(phase)
	absoluteTickCount := uint64(shiftedTick / int64(interval.Nanoseconds()))
	
	currentSlot := absoluteTickCount % slotsPerWindow
	return currentSlot == ownedSlot
}
