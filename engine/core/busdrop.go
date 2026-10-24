package core

import (
	"log"
	"sync/atomic"
	"time"
)

var (
	busDropCount   atomic.Uint64
	busDropLastLog atomic.Int64 // unix nanos of the last emitted warning
)

// BusDropCount returns how many events were dropped because a shard bus stayed full.
func BusDropCount() uint64 { return busDropCount.Load() }

// noteBusDrop counts every drop but logs at most once per second, so a stalled shard
// cannot flood the log (it produced 1.27M lines in 30 min at 50k monitors).
func noteBusDrop(kind string, shard int, monitorID string) {
	n := busDropCount.Add(1)
	now := time.Now().UnixNano()
	last := busDropLastLog.Load()
	if now-last >= int64(time.Second) && busDropLastLog.CompareAndSwap(last, now) {
		log.Printf("[WARN] shard %d bus full, dropping %s for %s (total dropped: %d)", shard, kind, monitorID, n)
	}
}
