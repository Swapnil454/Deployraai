package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
	"runtime/pprof"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/your-org/uptime-engine/core"
)

func generateAndHydrate(n int) {
	// Initialize subsystems if not already done
	core.InitTLSConfig(n)

	core.Store.Mu.Lock()
	defer core.Store.Mu.Unlock()

	// Clear existing monitors
	core.Store.Monitors = make(map[string]*atomic.Pointer[core.Monitor], n)

	types := []string{"http", "keyword", "port", "ping"}

	for i := 0; i < n; i++ {
		id := uuid.New().String()
		u, _ := uuid.Parse(id)
		mType := types[i%len(types)]
		urlStr := fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", i)
		if mType == "port" {
			urlStr = fmt.Sprintf("192.0.2.%d:9999", (i%250)+1)
		} else if mType == "ping" {
			urlStr = fmt.Sprintf("192.0.2.%d", (i%250)+1)
		}

		m := &core.Monitor{
			ID:                 id,
			ParsedUUID:         u,
			URL:                urlStr,
			Interval:           30,
			Timeout:            10,
			Type:               mType,
			IsPaused:           false,
			LastStatus:         "UP",
			ConfidenceScore:    1.0,
			CurrentInterval:    30,
			NextCheckAt:        time.Now().Add(time.Duration(i%30) * time.Second),
			ConfigSyncedAt:     time.Now(),
			FullPhaseInterval:  15 * time.Minute,
			FullPhaseThreshold: 10,
		}

		if mType == "keyword" {
			m.InitKeyword("operational_status_ok", false)
			m.KeywordMaxBytes = 65536
		}

		var p atomic.Pointer[core.Monitor]
		p.Store(m)
		core.Store.Monitors[id] = &p
	}
}

func captureProfile(scaleName string, n int) {
	generateAndHydrate(n)

	// Force two GCs to ensure accurate in-use heap snapshot
	runtime.GC()
	runtime.GC()

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	profPath := fmt.Sprintf("heap_%s.pprof", scaleName)
	f, err := os.Create(profPath)
	if err != nil {
		log.Fatalf("failed to create %s: %v", profPath, err)
	}
	defer f.Close()

	if err := pprof.WriteHeapProfile(f); err != nil {
		log.Fatalf("failed to write heap profile: %v", err)
	}

	fmt.Printf("\n============================================================\n")
	fmt.Printf(" SCALE: %s (%d monitors)\n", scaleName, n)
	fmt.Printf("   HeapAlloc: %d MB (%d bytes)\n", m.HeapAlloc/(1024*1024), m.HeapAlloc)
	fmt.Printf("   HeapInuse: %d MB (%d bytes)\n", m.HeapInuse/(1024*1024), m.HeapInuse)
	fmt.Printf("   HeapSys:   %d MB (%d bytes)\n", m.HeapSys/(1024*1024), m.HeapSys)
	fmt.Printf("   Bytes per monitor (Alloc/N): %.2f bytes\n", float64(m.HeapAlloc)/float64(n))
	fmt.Printf("============================================================\n")

	// Run go tool pprof -top -sample_index=inuse_space
	cmd := exec.Command("go", "tool", "pprof", "-top", "-sample_index=inuse_space", profPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("Error running pprof: %v\n", err)
	} else {
		// print top 15 lines
		lines := []string{}
		cur := ""
		for _, b := range out {
			if b == '\n' {
				lines = append(lines, cur)
				cur = ""
			} else {
				cur += string(b)
			}
		}
		if len(lines) > 20 {
			lines = lines[:20]
		}
		for _, l := range lines {
			fmt.Println(l)
		}
	}
}

func main() {
	scales := []struct {
		name string
		n    int
	}{
		{"2k", 2000},
		{"20k", 20000},
		{"100k", 100000},
	}

	for _, s := range scales {
		captureProfile(s.name, s.n)
	}
}
