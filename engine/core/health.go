package core

import (
	"sync"
	"time"
)

// LocalHealthTracker tracks the failure rate of the local PoP over a 30s rolling window.
type LocalHealthTracker struct {
	mu        sync.Mutex
	sec       [30]int64
	tot       [30]uint32
	fail      [30]uint32
	unhealthy bool
}

var Health = &LocalHealthTracker{}

func (h *LocalHealthTracker) RecordResult(ok bool) {
	now := time.Now()
	s := now.Unix()
	i := s % 30
	h.mu.Lock()
	if h.sec[i] != s {
		h.sec[i], h.tot[i], h.fail[i] = s, 0, 0
	}
	h.tot[i]++
	if !ok {
		h.fail[i]++
	}
	h.mu.Unlock()
}

func (h *LocalHealthTracker) IsHealthy() bool {
	now := time.Now()
	h.mu.Lock()
	defer h.mu.Unlock()
	var t, f uint32
	s := now.Unix()
	for i := range h.sec {
		if s-h.sec[i] < 30 {
			t += h.tot[i]
			f += h.fail[i]
		}
	}
	if t < 500 {
		return true // not enough data, assume healthy
	}
	r := float64(f) / float64(t)
	if h.unhealthy {
		if r < 0.30 {
			h.unhealthy = false
		}
	} else if r > 0.60 {
		h.unhealthy = true
	}
	return !h.unhealthy
}

func (h *LocalHealthTracker) Reset() {
	// No longer needed, window is self-pruning
}
