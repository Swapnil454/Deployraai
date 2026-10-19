package core

import (
	"sync/atomic"
	"testing"
)

func TestAllocator_All8Types(t *testing.T) {
	all8 := []string{
		"http", "keyword", "api", "ping", "port", "udp", "dns", "heartbeat",
	}

	for _, typ := range all8 {
		if !IsValidMonitorType(typ) {
			t.Errorf("type %q should be valid", typ)
		}
	}

	invalidTypes := []string{"", "bogus", "ftp", "smtp", "websocket"}
	for _, typ := range invalidTypes {
		if IsValidMonitorType(typ) {
			t.Errorf("type %q should NOT be valid", typ)
		}
	}

	// Verify that in production Phase 2+, RequiresAssignedPort returns false for all types,
	// ensuring the 55k port pool cannot exhaust and block users.
	for _, typ := range all8 {
		if RequiresAssignedPort(typ) {
			t.Errorf("type %q should NOT require assigned port in production", typ)
		}
	}
}

func TestAllocator_TypeTransitions(t *testing.T) {
	mon := &Monitor{
		ID:   "mon-test-transition-1",
		Type: "http",
	}
	ptr := &atomic.Pointer[Monitor]{}
	ptr.Store(mon)

	// Transition 1: http -> port (in production, port does not consume 55k pool)
	ReconcileTypeChange(ptr, "port")
	m := ptr.Load()
	if m.Type != "port" {
		t.Fatalf("expected type port, got %s", m.Type)
	}
	if m.AssignedPort != 0 {
		t.Fatalf("expected AssignedPort=0 in production, got %d", m.AssignedPort)
	}

	// Transition 2: port -> ping
	ReconcileTypeChange(ptr, "ping")
	m = ptr.Load()
	if m.Type != "ping" {
		t.Fatalf("expected type ping, got %s", m.Type)
	}

	// Legacy / Engine B simulation: if a monitor had an AssignedPort assigned
	legacyPort, ok := PortAllocator.Allocate(mon.ID)
	if !ok {
		t.Fatalf("failed to allocate test port")
	}
	updated := *m
	updated.AssignedPort = legacyPort
	ptr.Store(&updated)

	// Transition 3: ping -> keyword (keyword drops port; verify legacy port is cleaned up)
	ReconcileTypeChange(ptr, "keyword")
	m = ptr.Load()
	if m.Type != "keyword" {
		t.Fatalf("expected type keyword, got %s", m.Type)
	}
	if m.AssignedPort != 0 {
		t.Fatalf("expected AssignedPort = 0 for keyword monitor, got %d", m.AssignedPort)
	}

	// If it had a legacy port and wasn't cleaned by ReconcileTypeChange (since RequiresAssignedPort=false),
	// verify DeallocateMonitor frees it
	PortAllocator.DeallocateWithID(legacyPort, mon.ID)
	_, occupied := PortAllocator.Lookup(uint16(legacyPort))
	if occupied {
		t.Fatalf("expected port %d to be freed", legacyPort)
	}

	// Transition 4: keyword -> dns (neither needs port)
	ReconcileTypeChange(ptr, "dns")
	m = ptr.Load()
	if m.Type != "dns" || m.AssignedPort != 0 {
		t.Fatalf("expected type dns with 0 port, got type=%s port=%d", m.Type, m.AssignedPort)
	}

	// Transition 5: dns -> heartbeat (neither needs port)
	ReconcileTypeChange(ptr, "heartbeat")
	m = ptr.Load()
	if m.Type != "heartbeat" || m.AssignedPort != 0 {
		t.Fatalf("expected type heartbeat with 0 port, got type=%s port=%d", m.Type, m.AssignedPort)
	}

	// Transition 6: heartbeat -> udp (neither needs port)
	ReconcileTypeChange(ptr, "udp")
	m = ptr.Load()
	if m.Type != "udp" || m.AssignedPort != 0 {
		t.Fatalf("expected type udp with 0 port, got type=%s port=%d", m.Type, m.AssignedPort)
	}

	// Transition 7: udp -> api (neither needs port)
	ReconcileTypeChange(ptr, "api")
	m = ptr.Load()
	if m.Type != "api" || m.AssignedPort != 0 {
		t.Fatalf("expected type api with 0 port, got type=%s port=%d", m.Type, m.AssignedPort)
	}

	// Transition 8: api -> port (in production Phase 2, AssignedPort remains 0)
	ReconcileTypeChange(ptr, "port")
	m = ptr.Load()
	if m.Type != "port" || m.AssignedPort != 0 {
		t.Fatalf("expected type port with 0 port, got type=%s port=%d", m.Type, m.AssignedPort)
	}
}

func TestAllocator_NilSafety(t *testing.T) {
	// 1. Pass nil atomic.Pointer
	ReconcileTypeChange(nil, "http")

	// 2. Pass atomic.Pointer containing nil
	nilPtr := &atomic.Pointer[Monitor]{}
	ReconcileTypeChange(nilPtr, "http")

	// 3. Pass invalid type
	validMon := &Monitor{ID: "mon-nil-test", Type: "http"}
	validPtr := &atomic.Pointer[Monitor]{}
	validPtr.Store(validMon)
	ReconcileTypeChange(validPtr, "invalid-type")
	if validPtr.Load().Type != "http" {
		t.Fatalf("type should not change on invalid type")
	}

	// 4. Test CASUpdate nil safety directly
	CASUpdate(nil, func(m *Monitor) {})
	CASUpdate(nilPtr, func(m *Monitor) {})

	// 5. Test PortAllocator bounds
	PortAllocator.Deallocate(-1)
	PortAllocator.Deallocate(0)
	PortAllocator.Deallocate(70000)

	_, ok := PortAllocator.Lookup(0)
	if ok {
		t.Fatalf("expected lookup of port 0 to fail")
	}
	_, ok = PortAllocator.Lookup(65535)
	if ok {
		t.Fatalf("expected lookup of port 65535 to fail")
	}
}

func TestAllocator_DeletePathFreesPort(t *testing.T) {
	mon := &Monitor{
		ID:   "mon-delete-test",
		Type: "port",
	}
	port, ok := PortAllocator.Allocate(mon.ID)
	if !ok {
		t.Fatalf("failed to allocate port")
	}
	mon.AssignedPort = port

	// Verify port is occupied
	id, occupied := PortAllocator.Lookup(uint16(port))
	if !occupied || id != mon.ID {
		t.Fatalf("expected port %d to be occupied by %s", port, mon.ID)
	}

	// Execute delete path
	PortAllocator.DeallocateMonitor(mon)

	// Verify port is freed
	_, occupied = PortAllocator.Lookup(uint16(port))
	if occupied {
		t.Fatalf("expected port %d to be freed on monitor delete", port)
	}
}

func TestAllocator_ConcurrentTransitions(t *testing.T) {
	ptr := &atomic.Pointer[Monitor]{}
	ptr.Store(&Monitor{ID: "mon-concurrent-type", Type: "http"})

	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func(idx int) {
			targetType := "port"
			if idx%2 == 0 {
				targetType = "ping"
			} else if idx%3 == 0 {
				targetType = "keyword"
			}
			ReconcileTypeChange(ptr, targetType)
			done <- true
		}(i)
	}

	for i := 0; i < 10; i++ {
		<-done
	}

	final := ptr.Load()
	if RequiresAssignedPort(final.Type) {
		if final.AssignedPort == 0 {
			t.Fatalf("expected assigned port for %s", final.Type)
		}
		PortAllocator.Deallocate(final.AssignedPort)
	} else {
		if final.AssignedPort != 0 {
			t.Fatalf("expected zero assigned port for %s, got %d", final.Type, final.AssignedPort)
		}
	}
}

func TestAllocator_DeallocateOwnershipCheck(t *testing.T) {
	monA := "mon-owner-A"
	monB := "mon-owner-B"

	port, ok := PortAllocator.Allocate(monA)
	if !ok {
		t.Fatalf("failed to allocate port")
	}

	// monB tries to deallocate monA's port (should fail/no-op)
	PortAllocator.DeallocateWithID(port, monB)

	// Verify monA still owns the port
	owner, occupied := PortAllocator.Lookup(uint16(port))
	if !occupied || owner != monA {
		t.Fatalf("expected port %d to remain occupied by %s, got owner=%s occupied=%v", port, monA, owner, occupied)
	}

	// Deallocate with correct owner
	PortAllocator.DeallocateWithID(port, monA)
	_, occupied = PortAllocator.Lookup(uint16(port))
	if occupied {
		t.Fatalf("expected port %d to be freed", port)
	}
}
