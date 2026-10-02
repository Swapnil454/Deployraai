package core

import (
	"log"
	"sync"
	"sync/atomic"
)

const portRangeMin = 10000
const portRangeMax = 65000
const portRangeSize = portRangeMax - portRangeMin + 1

type portAllocator struct {
	slots    [65536]atomic.Pointer[string]
	freeList chan int
}

var PortAllocator = func() *portAllocator {
	pa := &portAllocator{
		freeList: make(chan int, portRangeSize),
	}
	for p := portRangeMin; p <= portRangeMax; p++ {
		pa.freeList <- p
	}
	return pa
}()

// Allocate is O(1) — pops a pre-computed free port from the channel.
func (pa *portAllocator) Allocate(id string) (port int, ok bool) {
	select {
	case port = <-pa.freeList:
		if pa.slots[port].CompareAndSwap(nil, &id) {
			return port, true
		}
		// Slot was re-used by a concurrent caller after we popped it — shouldn't
		// happen with a channel free-list, but be safe: put it back.
		pa.freeList <- port
		return 0, false
	default:
		return 0, false // pool exhausted
	}
}

// Deallocate is O(1) — clears the slot and returns the port to the free list.
func (pa *portAllocator) Deallocate(port int) {
	if port < portRangeMin || port > portRangeMax {
		return
	}
	if pa.slots[port].Swap(nil) != nil {
		// Only return to free list if it was actually occupied
		pa.freeList <- port
	}
}

func (pa *portAllocator) Lookup(port uint16) (string, bool) {
	if port >= portRangeMin && port <= portRangeMax {
		ptr := pa.slots[port].Load()
		if ptr != nil {
			return *ptr, true
		}
	}
	return "", false
}

var typeTransitionMu sync.Mutex

func ReconcileTypeChange(ptr *atomic.Pointer[Monitor], newType string) {
	if newType != "http" && newType != "port" && newType != "ping" {
		return // Whitelist only valid types
	}

	typeTransitionMu.Lock()
	defer typeTransitionMu.Unlock()

	// Re-check current state under the lock — the other racing goroutine
	// may have already completed this exact transition while we waited.
	current := ptr.Load()
	if current.Type == newType {
		return // already handled by the other writer; nothing left to do
	}

	if current.Type != "http" && newType == "http" {
		PortAllocator.Deallocate(current.AssignedPort)
		CASUpdate(ptr, func(m *Monitor) { m.Type = newType; m.AssignedPort = 0 })
	} else if current.Type == "http" && newType != "http" {
		port, ok := PortAllocator.Allocate(current.ID)
		if !ok {
			log.Printf("Port pool exhausted converting monitor %s", current.ID)
			return
		}
		CASUpdate(ptr, func(m *Monitor) { m.Type = newType; m.AssignedPort = port })
		go ResolveTargetIP(ptr)
	}
}
