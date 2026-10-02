package core

import (
	"fmt"
	"testing"
	"time"
)

var (
	t1 = time.Unix(1700000000, 0).UTC()
	interval = 30 * time.Second
)

func TestSchedulerRestartEquivalence(t *testing.T) {
	for idNum := 0; idNum < 10; idNum++ {
		id1 := fmt.Sprintf("mon-test-restart-%d", idNum)
		
		var continuousTicks []time.Time
		var continuousColds []bool
		
		var restartTicks []time.Time
		var restartColds []bool

		// Continuous process
		var lastColdAt1 time.Time
		tick1 := NextTick(t1, interval, id1)
		for i := 0; i < 20; i++ {
			continuousTicks = append(continuousTicks, tick1)
			cold := IsColdCheck(id1, tick1, interval, lastColdAt1)
			continuousColds = append(continuousColds, cold)
			if cold {
				lastColdAt1 = tick1
			}
			tick1 = NextTick(tick1, interval, id1)
		}
		
		// Restart simulation: at t+17s, the runner wakes up and calls NextTick
		var lastColdAt2 time.Time // Restart resets memory
		
		restartStartTime := t1.Add(17 * time.Second)
		tick2 := NextTick(restartStartTime, interval, id1)
		for i := 0; i < 20; i++ {
			restartTicks = append(restartTicks, tick2)
			cold := IsColdCheck(id1, tick2, interval, lastColdAt2)
			restartColds = append(restartColds, cold)
			if cold {
				lastColdAt2 = tick2
			}
			tick2 = NextTick(tick2, interval, id1)
		}
		
		// Advance continuousTicks to start from the same point (tick >= restartStartTime)
		var alignedContinuousTicks []time.Time
		var alignedContinuousColds []bool
		for i, tick := range continuousTicks {
			if !tick.Before(restartStartTime) {
				alignedContinuousTicks = append(alignedContinuousTicks, tick)
				alignedContinuousColds = append(alignedContinuousColds, continuousColds[i])
			}
		}
		
		if len(alignedContinuousTicks) < 5 {
			t.Fatalf("Not enough aligned ticks to compare")
		}
		
		// Assert tick sequences exactly match!
		for i := 0; i < len(alignedContinuousTicks); i++ {
			if !alignedContinuousTicks[i].Equal(restartTicks[i]) {
				t.Errorf("ID %s Tick mismatch at %d: %v vs %v", id1, i, alignedContinuousTicks[i], restartTicks[i])
			}
		}
		
		// Cold sequence diff: they might differ because lastColdAt resets on restart.
		// However, it's possible they match if the first tick happens to be the owned slot.
		// The key assertion is that the first tick of the restarted sequence is ALWAYS cold,
		// because lastColdAt was zero.
		if len(restartColds) > 0 {
			if !restartColds[0] {
				t.Errorf("ID %s First tick after restart must be cold due to empty lastColdAt memory", id1)
			}
			limit := len(restartColds)
			if len(alignedContinuousColds) < limit {
				limit = len(alignedContinuousColds)
			}
			for i := 1; i < limit; i++ {
				if restartColds[i] != alignedContinuousColds[i] {
					t.Errorf("ID %s Cold sequences must match after the first tick: mismatch at %d", id1, i)
				}
			}
		}
	}
}

func TestFleetDistributionL1(t *testing.T) {
	interval := 30 * time.Second
	buckets := make(map[int64]int)
	coldBuckets := make(map[uint64]int)
	total := 10000
	
	slotsPerWindow := uint64(ColdCadence.Nanoseconds() / interval.Nanoseconds())
	
	for i := 0; i < total; i++ {
		id := fmt.Sprintf("test-id-%d", i)
		tick := NextTick(t1, interval, id)
		
		bucket := (tick.UnixNano() % int64(interval.Nanoseconds())) / int64(100*time.Millisecond)
		buckets[bucket]++
		
		coldSlot := HashID(id+"|cold") % slotsPerWindow
		coldBuckets[coldSlot]++
	}
	
	// 30s / 100ms = 300 buckets
	expectedMean := float64(total) / 300.0
	maxAllowed := expectedMean * 2.0
	minAllowed := expectedMean * 0.5
	
	for b, count := range buckets {
		if float64(count) > maxAllowed {
			t.Errorf("Bucket %d has %d monitors, max allowed is %f", b, count, maxAllowed)
		}
		if float64(count) < minAllowed {
			t.Errorf("Bucket %d has %d monitors, min allowed is %f", b, count, minAllowed)
		}
	}
	
	// Cold slots: 10 per window
	expectedColdMean := float64(total) / float64(slotsPerWindow)
	maxColdAllowed := expectedColdMean * 2.0
	minColdAllowed := expectedColdMean * 0.5
	for s, count := range coldBuckets {
		if float64(count) > maxColdAllowed {
			t.Errorf("Cold slot %d has %d monitors, max allowed is %f", s, count, maxColdAllowed)
		}
		if float64(count) < minColdAllowed {
			t.Errorf("Cold slot %d has %d monitors, min allowed is %f", s, count, minColdAllowed)
		}
	}
}

func TestExactColdCount(t *testing.T) {
	interval := 30 * time.Second
	slotsPerWindow := uint64(ColdCadence.Nanoseconds() / interval.Nanoseconds())
	
	for i := 0; i < 100; i++ {
		id := fmt.Sprintf("mon-cold-count-%d", i)
		
		var lastColdAt time.Time
		coldCount := 0
		
		tick := NextTick(t1, interval, id)
		endTime := t1.Add(35 * time.Minute)
		
		ownedSlot := HashID(id+"|cold") % slotsPerWindow
		
		firstPhase := time.Duration(HashID(id) % uint64(interval.Nanoseconds()))
		shiftedTick := tick.UnixNano() - int64(firstPhase)
		absoluteTickCount := uint64(shiftedTick / int64(interval.Nanoseconds()))
		firstSlot := absoluteTickCount % slotsPerWindow
		
		isFirstOwned := firstSlot == ownedSlot
		
		for tick.Before(endTime) {
			if IsColdCheck(id, tick, interval, lastColdAt) {
				coldCount++
				lastColdAt = tick // Caller must update lastColdAt
			}
			tick = NextTick(tick, interval, id)
		}
		
		// 35 minutes = 70 ticks. 70 / 10 = 7 owned slots exactly.
		expected := 7
		if !isFirstOwned {
			expected = 8 // 1 forced + 7 owned
		}
		
		if coldCount != expected {
			t.Errorf("Expected %d cold checks, got %d for id %s", expected, coldCount, id)
		}
	}
}

func TestForcedColdIfCallerForgets(t *testing.T) {
	id := "mon-forget-cold"
	tick := NextTick(t1, interval, id)
	
	var lastColdAt time.Time
	
	if !IsColdCheck(id, tick, interval, lastColdAt) {
		t.Fatal("First check must be cold")
	}
	// Caller forgets to update lastColdAt!
	
	tick2 := NextTick(tick, interval, id)
	if !IsColdCheck(id, tick2, interval, lastColdAt) {
		t.Fatal("Second check must be cold because lastColdAt was never updated")
	}
}
