package core

import (
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

var (
	guardMu         sync.Mutex
	guardSuppressed = map[ErrClass]uint64{}
	guardPassed     = map[ErrClass]uint64{}
	guardLastLog    atomic.Int64
)

func noteGuardDecision(ev EventCheckResult, suppressed bool) {
	if ev.Ok {
		return
	}
	guardMu.Lock()
	if suppressed {
		guardSuppressed[ev.ErrClass]++
	} else {
		guardPassed[ev.ErrClass]++
	}
	guardMu.Unlock()
	now := time.Now().UnixNano()
	last := guardLastLog.Load()
	if now-last < int64(10*time.Second) || !guardLastLog.CompareAndSwap(last, now) {
		return
	}
	guardMu.Lock()
	s := fmt.Sprintf("suppressed=%v passed_failures=%v", guardSuppressed, guardPassed)
	guardMu.Unlock()
	log.Printf("[GUARD] %s", s)
}

func guardDecision(ev EventCheckResult, localUnhealthy bool, canaryOK func() bool) bool {
	s := shouldSuppressFailure(ev, localUnhealthy, canaryOK)
	noteGuardDecision(ev, s)
	return s
}
