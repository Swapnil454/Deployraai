package core

import (
	"strings"
	"testing"
)

func TestSearchKeyword(t *testing.T) {
	haystack := []byte("<html><body><h1>Welcome to Uptime Engine Status</h1><p>All Systems Operational</p></body></html>")

	// Case sensitive
	if idx := SearchKeyword(haystack, []byte("Welcome"), true); idx != 16 {
		t.Errorf("expected 16, got %d", idx)
	}
	if idx := SearchKeyword(haystack, []byte("welcome"), true); idx != -1 {
		t.Errorf("expected -1, got %d", idx)
	}

	// Case insensitive
	if idx := SearchKeyword(haystack, []byte("welcome"), false); idx != 16 {
		t.Errorf("expected 16, got %d", idx)
	}
	if idx := SearchKeyword(haystack, []byte("OPERATIONAL"), false); idx != 67 {
		t.Errorf("expected 67, got %d", idx)
	}
	if idx := SearchKeyword(haystack, []byte("NonExistent"), false); idx != -1 {
		t.Errorf("expected -1, got %d", idx)
	}
}

func TestSearchKeywordUnicode(t *testing.T) {
	haystack1 := []byte("Bienvenue au CAFÉ DE PARIS!")
	if idx := SearchKeyword(haystack1, []byte("café"), false); idx != 13 {
		t.Errorf("expected 13 for café, got %d", idx)
	}

	haystack2 := []byte("Здравствуй, ПРИВЕТ МИР!")
	if idx := SearchKeyword(haystack2, []byte("привет"), false); idx != 22 {
		t.Errorf("expected 22 for привет, got %d", idx)
	}
}

func TestSearchKeywordMonitorZeroAlloc(t *testing.T) {
	haystack := []byte(strings.Repeat("abcdefghijklmnopqrstuvwxyz", 2000) + "TARGET_KEYWORD" + strings.Repeat("1234567890", 1000))
	mon := &Monitor{}
	mon.InitKeyword("target_keyword", false)

	// Warmup
	for i := 0; i < 5; i++ {
		_ = SearchKeywordMonitor(haystack, mon)
	}

	allocs := testing.AllocsPerRun(100, func() {
		idx := SearchKeywordMonitor(haystack, mon)
		if idx == -1 {
			t.Fatal("needle not found")
		}
	})

	if allocs != 0 {
		t.Errorf("SearchKeywordMonitor allocated %.2f objects per run, want 0", allocs)
	}
}

func BenchmarkSearchKeywordRareZeroCopy50KB(b *testing.B) {
	haystack := []byte(strings.Repeat("<p>Lorem ipsum dolor sit amet</p>", 1500) + "STATUS_OK_HEALTHY")
	mon := &Monitor{}
	mon.InitKeyword("status_ok_healthy", false)

	b.SetBytes(int64(len(haystack)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = SearchKeywordMonitor(haystack, mon)
	}
}

func BenchmarkSearchKeywordCommonLetters50KB(b *testing.B) {
	haystack := []byte(strings.Repeat("<p>Lorem ipsum dolor sit amet</p>", 1500) + "ONLINE")
	mon := &Monitor{}
	mon.InitKeyword("online", false)

	b.SetBytes(int64(len(haystack)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = SearchKeywordMonitor(haystack, mon)
	}
}
