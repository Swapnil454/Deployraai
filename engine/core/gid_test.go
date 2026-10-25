package core

import "testing"

func gidDeep(n int) uint64 {
	if n == 0 {
		return getGID()
	}
	return gidDeep(n - 1)
}

// TestGetGIDMatchesReference checks the fast goroutine-ID lookup against the
// runtime.Stack parser on many goroutines and at several stack depths.
func TestGetGIDMatchesReference(t *testing.T) {
	if getGID() != getGIDSlow() {
		t.Fatalf("main goroutine: fast=%d slow=%d", getGID(), getGIDSlow())
	}
	type pair struct{ fast, slow uint64 }
	ch := make(chan pair)
	for i := 0; i < 200; i++ {
		depth := i % 50
		go func() {
			fast := gidDeep(depth)
			ch <- pair{fast, getGIDSlow()}
		}()
	}
	seen := map[uint64]bool{}
	for i := 0; i < 200; i++ {
		p := <-ch
		if p.fast != p.slow {
			t.Fatalf("mismatch fast=%d slow=%d", p.fast, p.slow)
		}
		seen[p.fast] = true
	}
	if len(seen) < 200 {
		t.Fatalf("expected 200 distinct goroutine IDs, got %d", len(seen))
	}
}
