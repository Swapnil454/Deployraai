package core

import (
	"log"
	"sync"
	"sync/atomic"
)

type portAllocator struct {
	slots [65536]atomic.Pointer[string]
}

var PortAllocator = &portAllocator{}

func (pa *portAllocator) Allocate(id string) (port int, ok bool) {
	for port := 10000; port <= 65000; port++ {
		if pa.slots[port].CompareAndSwap(nil, &id) {
			return port, true
		}
	}
	return 0, false
}

func (pa *portAllocator) Deallocate(port int) {
	if port >= 10000 && port <= 65000 {
		pa.slots[port].Store(nil)
	}
}

func (pa *portAllocator) Lookup(port uint16) (string, bool) {
	if port >= 10000 && port <= 65000 {
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
