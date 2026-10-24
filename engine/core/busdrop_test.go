package core

import "testing"

func TestNoteBusDropCountsEveryDrop(t *testing.T) {
	before := BusDropCount()
	for i := 0; i < 1000; i++ {
		noteBusDrop("EventCheckResult", 1, "m")
	}
	if got := BusDropCount() - before; got != 1000 {
		t.Fatalf("BusDropCount delta = %d, want 1000", got)
	}
}
