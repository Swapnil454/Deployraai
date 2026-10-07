package core

import (
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCoreRace(t *testing.T) {
	// Initialize store
	Store.Mu.Lock()
	Store.Monitors = make(map[string]*atomic.Pointer[Monitor])
	Store.Mu.Unlock()

	var wg sync.WaitGroup
	const numMonitors = 100
	const numWorkers = 10

	// 1. Initial hydration
	for i := 0; i < numMonitors; i++ {
		id := strconv.Itoa(i)
		m := &Monitor{
			ID:          id,
			Interval:    30,
			TimeoutMs:     5,
			Type:        "http",
			LastStatus:  "UP",
			NextCheckAt: time.Now(),
		}
		ptr := new(atomic.Pointer[Monitor])
		ptr.Store(m)
		
		Store.Mu.Lock()
		Store.Monitors[id] = ptr
		Store.Mu.Unlock()
	}

	// 2. Hammer CASUpdate / Hydrate
	wg.Add(numWorkers)
	for i := 0; i < numWorkers; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				id := strconv.Itoa(j % numMonitors)
				
				Store.Mu.RLock()
				p, exists := Store.Monitors[id]
				Store.Mu.RUnlock()

				if exists {
					CASUpdate(p, func(m *Monitor) {
						m.Interval = (j % 30) + 10
					})
				}
			}
		}()
	}

	// 3. Hammer HandleSuccess / HandleFailure
	wg.Add(numWorkers)
	for i := 0; i < numWorkers; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				id := strconv.Itoa(j % numMonitors)
				// Simulate MasterDispatcher setting AwaitingResult
				Store.UpdateRuntime(id, func(m *Monitor) {
					m.AwaitingResult = true
				})
				
				if j%2 == 0 {
					HandleSuccess(id, nil, uint32(j%100))
				} else {
					HandleFailure(id, nil, ErrTimeout, "Test cause", "Test msg")
				}
			}
		}()
	}

	wg.Wait()
}
