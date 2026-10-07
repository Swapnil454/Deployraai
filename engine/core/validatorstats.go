package core

import (
	"hash/maphash"
	"sync"
	"sync/atomic"
	"time"

	"github.com/valyala/fasthttp"
)

const (
	validatorShards = 64
	floorSeconds    = 300 // must equal Stage 4's unconditional-GET floor
)

var (
	validatorSeed  = maphash.MakeSeed()
	monitorKeySeed = maphash.MakeSeed()
)

func MonitorKey(id string) uint64 {
	return maphash.String(monitorKeySeed, id)
}

func ResetValidatorBaseline(monitorID uint64) {
	st := stateFor(monitorID)
	st.mu.Lock()
	st.hasID = false
	st.mu.Unlock()
}

func ResetValidatorStats() {
	for i := range validatorStats {
		c := &validatorStats[i]
		c.checked.Store(0)
		c.etagPresent.Store(0)
		c.etagWeak.Store(0)
		c.lmPresent.Store(0)
		c.lmUsable.Store(0)
		c.stablePairs.Store(0)
		c.changedPairs.Store(0)
		c.bytesTotal.Store(0)
		c.bytesSaveable.Store(0)
		c.firstSeenUnix.Store(0)
	}
	for i := range validatorTable {
		sh := &validatorTable[i]
		sh.mu.Lock()
		sh.m = make(map[uint64]*monitorValidatorState)
		sh.mu.Unlock()
	}
}

// 10 x 8 = 80 bytes + 48 pad = 128 bytes: prevents false sharing between CPU cores.
type validatorCounters struct {
	checked       atomic.Int64
	etagPresent   atomic.Int64
	etagWeak      atomic.Int64
	lmPresent     atomic.Int64
	lmUsable      atomic.Int64
	stablePairs   atomic.Int64
	changedPairs  atomic.Int64
	bytesTotal    atomic.Int64
	bytesSaveable atomic.Int64
	firstSeenUnix atomic.Int64
	_             [48]byte
}

var validatorStats [validatorShards]validatorCounters

type monitorValidatorState struct {
	mu          sync.Mutex // uncontended: one monitor's checks are serial
	id          uint64
	hasID       bool
	simLastFull int64 // unix secs of last simulated unconditional GET
	pairs       uint32
	stable      uint32
}

type validatorTableShard struct {
	mu sync.RWMutex
	m  map[uint64]*monitorValidatorState
	_  [64]byte
}

var validatorTable [validatorShards]validatorTableShard

func init() {
	for i := range validatorTable {
		validatorTable[i].m = make(map[uint64]*monitorValidatorState)
	}
}

func stateFor(monitorID uint64) *monitorValidatorState {
	sh := &validatorTable[monitorID%validatorShards]
	sh.mu.RLock()
	st := sh.m[monitorID]
	sh.mu.RUnlock()
	if st != nil {
		return st
	}
	sh.mu.Lock()
	if st = sh.m[monitorID]; st == nil {
		st = &monitorValidatorState{}
		sh.m[monitorID] = st
	}
	sh.mu.Unlock()
	return st
}

// ObserveValidators is called from RecordBody BEFORE the response is released.
func ObserveValidators(monitorID uint64, res *fasthttp.Response, bodyBytes int, now time.Time) {
	nowS := now.Unix()
	st := stateFor(monitorID)

	// Non-2xx: a Stage 4 gate would force an unconditional GET next time.
	if sc := res.StatusCode(); sc < 200 || sc > 299 {
		st.mu.Lock()
		st.hasID, st.simLastFull = false, nowS
		st.mu.Unlock()
		return
	}

	c := &validatorStats[monitorID%validatorShards]
	c.firstSeenUnix.CompareAndSwap(0, nowS)
	c.checked.Add(1)
	c.bytesTotal.Add(int64(bodyBytes))

	etag := res.Header.Peek(fasthttp.HeaderETag)
	lm := res.Header.Peek(fasthttp.HeaderLastModified)

	var (
		id    uint64
		hasID bool
	)
	if len(etag) > 0 {
		c.etagPresent.Add(1)
		if len(etag) >= 2 && etag[0] == 'W' && etag[1] == '/' {
			c.etagWeak.Add(1)
		}
		id, hasID = maphash.Bytes(validatorSeed, etag), true
	}
	if len(lm) > 0 {
		c.lmPresent.Add(1)
		if lmT, ok := parseIMFFixdate(lm); ok {
			if dT, ok := parseIMFFixdate(res.Header.Peek(fasthttp.HeaderDate)); ok &&
				dT.Sub(lmT) >= 5*time.Second {
				c.lmUsable.Add(1)
				if !hasID { // ETag wins; fall back to LM
					id, hasID = maphash.Bytes(validatorSeed, lm)^0x9e3779b97f4a7c15, true
				}
			}
		}
	}

	st.mu.Lock()
	defer st.mu.Unlock()
	if !hasID {
		st.hasID, st.simLastFull = false, nowS
		return
	}
	if st.hasID { // we have a previous validator to compare with
		st.pairs++
		if st.id == id {
			st.stable++
			c.stablePairs.Add(1)
			if nowS-st.simLastFull < floorSeconds {
				c.bytesSaveable.Add(int64(bodyBytes)) // would have been a 304
			} else {
				st.simLastFull = nowS // floor forces a full GET
			}
		} else {
			c.changedPairs.Add(1)
			st.simLastFull = nowS
		}
	} else {
		st.simLastFull = nowS
	}
	st.id, st.hasID = id, true
}

type ValidatorSnapshot struct {
	Checked, ETag, ETagWeak, LM, LMUsable           int64
	StablePairs, ChangedPairs, Bytes, BytesSaveable int64
	Monitors, EligibleMonitors                      int
	Window                                          time.Duration
}

func SnapshotValidators(now time.Time) ValidatorSnapshot {
	var s ValidatorSnapshot
	var first int64
	for i := range validatorStats {
		c := &validatorStats[i]
		s.Checked += c.checked.Load()
		s.ETag += c.etagPresent.Load()
		s.ETagWeak += c.etagWeak.Load()
		s.LM += c.lmPresent.Load()
		s.LMUsable += c.lmUsable.Load()
		s.StablePairs += c.stablePairs.Load()
		s.ChangedPairs += c.changedPairs.Load()
		s.Bytes += c.bytesTotal.Load()
		s.BytesSaveable += c.bytesSaveable.Load()
		if f := c.firstSeenUnix.Load(); f != 0 && (first == 0 || f < first) {
			first = f
		}
	}
	if first != 0 {
		s.Window = now.Sub(time.Unix(first, 0))
	}
	for i := range validatorTable {
		sh := &validatorTable[i]
		sh.mu.RLock()
		for _, st := range sh.m {
			s.Monitors++
			st.mu.Lock()
			if st.pairs >= 10 && float64(st.stable)/float64(st.pairs) >= 0.8 {
				s.EligibleMonitors++
			}
			st.mu.Unlock()
		}
		sh.mu.RUnlock()
	}
	return s
}

const (
	gateMinChecks   = 20_000
	gateMinMonitors = 50
	gateMinWindow   = 24 * time.Hour
	gateTarget      = 0.20 // projected body-byte savings
)

// Verdict: "COLLECTING", "PASS" or "FAIL".
func (s ValidatorSnapshot) Verdict() string {
	if s.Checked < gateMinChecks || s.Monitors < gateMinMonitors || s.Window < gateMinWindow {
		return "COLLECTING"
	}
	if s.Bytes > 0 && float64(s.BytesSaveable)/float64(s.Bytes) >= gateTarget {
		return "PASS"
	}
	return "FAIL"
}

func pct(a, b int64) float64 {
	if b == 0 {
		return 0
	}
	return 100 * float64(a) / float64(b)
}
