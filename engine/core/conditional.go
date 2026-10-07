package core

import (
	"sync"
	"sync/atomic"

	"github.com/valyala/fasthttp"
)

type condState struct {
	mu       sync.Mutex
	etag, lm []byte // reused byte slices to eliminate heap allocations per check
	lastFull int64  // unix seconds of last unconditional GET
	eligible bool
}

type condShard struct {
	mu sync.RWMutex
	m  map[uint64]*condState
	_  [64]byte
}

var condShards = func() (s [64]condShard) {
	for i := range s {
		s[i].m = make(map[uint64]*condState)
	}
	return
}()

var (
	conditionalHits        atomic.Int64
	conditionalBypasses    atomic.Int64
	conditionalDisagreements atomic.Int64
)

func ResetConditionalState() {
	conditionalHits.Store(0)
	conditionalBypasses.Store(0)
	conditionalDisagreements.Store(0)
	for i := range condShards {
		sh := &condShards[i]
		sh.mu.Lock()
		sh.m = make(map[uint64]*condState)
		sh.mu.Unlock()
	}
}

func GetConditionalStats() (hits, bypasses, disagreements int64) {
	return conditionalHits.Load(), conditionalBypasses.Load(), conditionalDisagreements.Load()
}

func condFor(id uint64) *condState {
	sh := &condShards[id%64]
	sh.mu.RLock()
	st := sh.m[id]
	sh.mu.RUnlock()
	if st != nil {
		return st
	}
	sh.mu.Lock()
	if st = sh.m[id]; st == nil {
		st = &condState{}
		sh.m[id] = st
	}
	sh.mu.Unlock()
	return st
}

// Inject returns true if validator headers (If-None-Match / If-Modified-Since) were added to req.
func InjectValidators(id uint64, req *fasthttp.Request, nowS int64, floorS int64) bool {
	st := condFor(id)
	st.mu.Lock()
	defer st.mu.Unlock()

	if !st.eligible || (nowS-st.lastFull >= floorS) {
		conditionalBypasses.Add(1)
		return false
	}

	injected := false
	if len(st.etag) > 0 {
		req.Header.SetBytesV(fasthttp.HeaderIfNoneMatch, st.etag)
		injected = true
	}
	if len(st.lm) > 0 {
		req.Header.SetBytesV(fasthttp.HeaderIfModifiedSince, st.lm)
		injected = true
	}
	return injected
}

// StoreValidatorState is called ONLY on a passing check (status 200 and keyword present).
func StoreValidatorState(id uint64, etag, lm []byte, nowS int64, isFullGET bool) {
	st := condFor(id)
	st.mu.Lock()
	defer st.mu.Unlock()

	st.eligible = true
	if isFullGET {
		st.lastFull = nowS
	}

	if len(etag) > 0 {
		st.etag = append(st.etag[:0], etag...)
	} else {
		st.etag = st.etag[:0]
	}

	if len(lm) > 0 {
		st.lm = append(st.lm[:0], lm...)
	} else {
		st.lm = st.lm[:0]
	}
}

// DropValidatorState is called on any failing check or when validator changes repeatedly.
func DropValidatorState(id uint64) {
	st := condFor(id)
	st.mu.Lock()
	defer st.mu.Unlock()

	st.eligible = false
	st.etag = st.etag[:0]
	st.lm = st.lm[:0]
}
