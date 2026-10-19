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
	slots    *[65536]atomic.Pointer[string]
	freeList chan int
	once     sync.Once
}

var PortAllocator = &portAllocator{}

func (pa *portAllocator) lazyInit() {
	pa.once.Do(func() {
		pa.slots = new([65536]atomic.Pointer[string])
		pa.freeList = make(chan int, portRangeSize)
		for p := portRangeMin; p <= portRangeMax; p++ {
			pa.freeList <- p
		}
	})
}

// Allocate is O(1) — pops a pre-computed free port from the channel.
func (pa *portAllocator) Allocate(id string) (port int, ok bool) {
	pa.lazyInit()
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
	pa.lazyInit()
	if pa.slots[port].Swap(nil) != nil {
		// Only return to free list if it was actually occupied
		pa.freeList <- port
	}
}

// DeallocateWithID verifies slot ownership by matching monitor ID before clearing and returning port.
func (pa *portAllocator) DeallocateWithID(port int, id string) {
	if port < portRangeMin || port > portRangeMax {
		return
	}
	pa.lazyInit()
	cur := pa.slots[port].Load()
	if cur != nil && *cur == id {
		if pa.slots[port].CompareAndSwap(cur, nil) {
			pa.freeList <- port
		}
	}
}

func (pa *portAllocator) Lookup(port uint16) (string, bool) {
	if int(port) >= portRangeMin && int(port) <= portRangeMax {
		pa.lazyInit()
		ptr := pa.slots[port].Load()
		if ptr != nil {
			return *ptr, true
		}
	}
	return "", false
}

// IsValidMonitorType verifies membership in the 8 supported protocol engines:
// http, keyword, api, ping, port, udp, dns, heartbeat.
func IsValidMonitorType(t string) bool {
	switch t {
	case "http", "keyword", "api", "ping", "port", "udp", "dns", "heartbeat":
		return true
	default:
		return false
	}
}

// RequiresAssignedPort indicates if a monitor type requires an allocated eBPF / raw socket port.
// In standard production Phase 2+, socket-based probers (TCP port and unprivileged ICMP ping)
// do not consume AssignedPort, so this returns false.
func RequiresAssignedPort(t string) bool {
	return false
}

// DeallocateMonitor frees any assigned port owned by the monitor on the delete path with ownership verification.
func (pa *portAllocator) DeallocateMonitor(m *Monitor) {
	if m != nil && m.AssignedPort != 0 {
		pa.DeallocateWithID(m.AssignedPort, m.ID)
	}
}

var typeTransitionMu sync.Mutex

// ReconcileTypeChange safely transitions a monitor between any of the 8 supported monitor types.
// Enforces:
// 1. Full 8-type whitelist validation.
// 2. Strict nil safety on atomic pointer and dereferenced monitor struct.
// 3. Atomicity: Decisions on current type and port ownership are made INSIDE the CAS loop.
//    If a concurrent transition lands in between, the CAS re-reads fresh state and re-evaluates.
// 4. Deallocate-AFTER-CAS ordering to eliminate port hijacking race windows.
// 5. Automatic rollback if monitor is deleted or CAS aborts.
func ReconcileTypeChange(ptr *atomic.Pointer[Monitor], newType string) {
	if !IsValidMonitorType(newType) || ptr == nil {
		return
	}

	typeTransitionMu.Lock()
	defer typeTransitionMu.Unlock()

	newNeedsPort := RequiresAssignedPort(newType)

	var allocatedPort int
	var portToFree int
	var cleanupOwnerID string
	defer func() {
		if portToFree > 0 {
			PortAllocator.DeallocateWithID(portToFree, cleanupOwnerID)
		}
	}()

	for {
		old := ptr.Load()
		if old == nil || old.Type == newType {
			// Monitor deleted or already in target type.
			if allocatedPort > 0 {
				portToFree = allocatedPort
				if old != nil {
					cleanupOwnerID = old.ID
				}
			}
			return
		}

		curNeedsPort := RequiresAssignedPort(old.Type)
		updated := *old
		updated.Type = newType

		var cleanupOnSuccess int

		switch {
		case curNeedsPort && !newNeedsPort:
			// Dropping port requirement: clear AssignedPort in struct and mark old port for cleanup AFTER CAS commits
			updated.AssignedPort = 0
			cleanupOnSuccess = old.AssignedPort

		case !curNeedsPort && newNeedsPort:
			// Adding port requirement: allocate if not already allocated in a previous iteration
			if allocatedPort == 0 {
				p, ok := PortAllocator.Allocate(old.ID)
				if !ok {
					log.Printf("Port pool exhausted converting monitor %s to %s", old.ID, newType)
					return
				}
				allocatedPort = p
			}
			updated.AssignedPort = allocatedPort

		case curNeedsPort && newNeedsPort:
			// Both need port: preserve existing AssignedPort
			updated.AssignedPort = old.AssignedPort

		default:
			// Neither needs port
			updated.AssignedPort = 0
		}

		if ptr.CompareAndSwap(old, &updated) {
			// Successfully committed transition!
			if cleanupOnSuccess > 0 {
				PortAllocator.DeallocateWithID(cleanupOnSuccess, old.ID)
			}
			// Defensive leak fix: if we allocated a port that was not used in updated, free it
			if allocatedPort > 0 && updated.AssignedPort != allocatedPort {
				PortAllocator.DeallocateWithID(allocatedPort, old.ID)
			}
			if newNeedsPort {
				go ResolveTargetIP(ptr)
			}
			return
		}
		// CAS failed due to concurrent modification: loop and re-read inside the CAS loop!
	}
}
