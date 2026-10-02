package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestOutboxCrashInjectionD2(t *testing.T) {
	tmpDir := t.TempDir()

	ob, err := NewOutbox(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create outbox: %v", err)
	}

	// 1. Submit some events
	eff1 := EffectPersistTransition{
		ExpectedEpoch: 1,
		NewState:      StatusDown,
		IncidentStart: time.Now().Truncate(time.Second), // Truncate for JSON equality
	}
	if err := ob.Submit("mon-1", eff1); err != nil {
		t.Fatalf("Submit failed: %v", err)
	}

	eff2 := EffectPersistTransition{
		ExpectedEpoch: 2,
		NewState:      StatusUp,
		IncidentEnd:   time.Now().Truncate(time.Second),
	}
	if err := ob.Submit("mon-2", eff2); err != nil {
		t.Fatalf("Submit failed: %v", err)
	}

	// 2. Simulate Crash (close WAL abruptly)
	ob.Close()

	// 3. Verify WAL contents recovered from disk are intact
	walPath := filepath.Join(tmpDir, "outbox_wal.jsonl")
	data, err := os.ReadFile(walPath)
	if err != nil {
		t.Fatalf("Failed to read WAL: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 {
		t.Fatalf("Expected 2 lines in WAL, got %d", len(lines))
	}

	// Verify Line 1
	var entry1 walEntry
	if err := json.Unmarshal([]byte(lines[0]), &entry1); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	if entry1.MonitorID != "mon-1" || entry1.Effect.NewState != StatusDown {
		t.Errorf("Mismatch in entry 1: %+v", entry1)
	}
	if !entry1.Effect.IncidentStart.Equal(eff1.IncidentStart) {
		t.Errorf("Time mismatch in entry 1: got %v, want %v", entry1.Effect.IncidentStart, eff1.IncidentStart)
	}

	// Verify Line 2
	var entry2 walEntry
	if err := json.Unmarshal([]byte(lines[1]), &entry2); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	if entry2.MonitorID != "mon-2" || entry2.Effect.NewState != StatusUp {
		t.Errorf("Mismatch in entry 2: %+v", entry2)
	}
}
