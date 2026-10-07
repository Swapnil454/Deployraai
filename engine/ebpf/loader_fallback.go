//go:build !linux

package ebpf

import (
	"context"
	"sync"
	"time"

	"github.com/your-org/uptime-engine/core"
)

func StartEBPFReader(ctx context.Context, wg *sync.WaitGroup) error {
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				// Collect eligible IDs first under RLock, then release before calling HandleSuccess.
				// HandleSuccess calls UpdateRuntime which also acquires RLock — sync.RWMutex is NOT
				// reentrant, so calling it while already holding RLock causes an instant deadlock.
				var due []string
				core.Store.Mu.RLock()
				for id, ptr := range core.Store.Monitors {
					m := ptr.Load()
					if m.AwaitingResult && m.Type != "http" {
						due = append(due, id)
					}
				}
				core.Store.Mu.RUnlock()

				for _, id := range due {
					core.HandleSuccess(id, nil, 20) // Simulate ~20ms latency
				}
			}
		}
	}()
	return nil
}
