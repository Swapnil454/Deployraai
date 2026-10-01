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
				// Simulate the eBPF ringbuffer reading SYN-ACKs instantly
				core.Store.Mu.RLock()
				for id, ptr := range core.Store.Monitors {
					m := ptr.Load()
					if m.AwaitingResult && m.Type != "http" {
						// Simulate ~20ms latency
						core.HandleSuccess(id, 20)
					}
				}
				core.Store.Mu.RUnlock()
			}
		}
	}()
	return nil
}
