package core

import (
	"sync"
	"time"
)

// StateStore implements the monitor-state CAS store keyed by MonitorID.
// It uses sync.Map to remain lock-free globally and avoid RWMutex contention at scale.
type StateStore struct {
	monitors sync.Map
}

type monitorEntry struct {
	mu         sync.Mutex
	state      MonitorState
	lastAccess time.Time
}

// NewStateStore creates a new StateStore.
func NewStateStore() *StateStore {
	return &StateStore{}
}

// GetState returns a clone of the current state for a monitor.
func (s *StateStore) GetState(monitorID string) MonitorState {
	val, ok := s.monitors.Load(monitorID)
	if !ok {
		return MonitorState{ID: monitorID, Status: StatusUp} // Default baseline
	}

	entry := val.(*monitorEntry)
	entry.mu.Lock()
	defer entry.mu.Unlock()
	entry.lastAccess = time.Now()
	return cloneState(entry.state)
}

// Apply serializes an event against the current state of a monitor.
func (s *StateStore) Apply(monitorID string, event Event, cfg MachineConfig, outbox *Outbox, db DatabaseStub) []Effect {
	val, ok := s.monitors.Load(monitorID)
	var entry *monitorEntry

	if !ok {
		newEntry := &monitorEntry{
			state: MonitorState{ID: monitorID, Status: StatusUp},
		}
		actual, _ := s.monitors.LoadOrStore(monitorID, newEntry)
		entry = actual.(*monitorEntry)
	} else {
		entry = val.(*monitorEntry)
	}

	entry.mu.Lock()
	defer entry.mu.Unlock()
	entry.lastAccess = time.Now()

	// 1. Run the pure machine step
	newState, effects := Step(cloneState(entry.state), event, time.Now(), cfg)

	reload := false
	var persist EffectPersistTransition

	for _, eff := range effects {
		switch e := eff.(type) {
		case EffectReloadState:
			reload = true
		case EffectPersistTransition:
			persist = e
		}
	}

	// 2. Handle Reload Contract
	if reload {
		// Fetch ground truth from the datastore
		entry.state = db.FetchGroundTruth(monitorID)
		return effects
	}

	// 3. Normal State Update (Optimistic assumption that the engine is right)
	entry.state = newState

	// 4. Submit to Outbox if transitioning
	if persist.ExpectedEpoch > 0 { // Just an indication that persist exists
		outbox.Submit(monitorID, persist)
	}

	return effects
}

func cloneState(st MonitorState) MonitorState {
	ns := st
	if st.Votes != nil {
		ns.Votes = make(map[string]Vote, len(st.Votes))
		for k, v := range st.Votes {
			ns.Votes[k] = v
		}
	}
	return ns
}

// DatabaseStub represents the interface to Postgres/ClickHouse for ground-truth reloads.
type DatabaseStub interface {
	FetchGroundTruth(monitorID string) MonitorState
}

// GarbageCollectAndSweep removes stale monitors and invokes a callback for active ones,
// allowing the caller to inject EventSweep for stuck rounds.
func (s *StateStore) GarbageCollectAndSweep(ttl time.Duration, onActive func(monitorID string)) int {
	cutoff := time.Now().Add(-ttl)
	removed := 0

	s.monitors.Range(func(key, value interface{}) bool {
		entry := value.(*monitorEntry)
		entry.mu.Lock()
		isStale := entry.lastAccess.Before(cutoff)
		entry.mu.Unlock()

		if isStale {
			s.monitors.Delete(key)
			removed++
		} else if onActive != nil {
			onActive(key.(string))
		}
		return true
	})
	return removed
}
