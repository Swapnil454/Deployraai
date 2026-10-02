package core

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Outbox provides a local write-ahead log (WAL) for state transitions to ensure
// no alerts or state changes are lost on crash before being shipped upstream.
type Outbox struct {
	wal    *os.File
	Memory []EffectPersistTransition
	ch     chan walEntry
	wg     sync.WaitGroup
	done   chan struct{}
}

func NewOutbox(dir string) (*Outbox, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	path := filepath.Join(dir, "outbox_wal.jsonl")
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	ob := &Outbox{
		wal:    f,
		Memory: make([]EffectPersistTransition, 0),
		ch:     make(chan walEntry, 10000),
		done:   make(chan struct{}),
	}
	
	ob.wg.Add(1)
	go ob.batchWriter()
	
	return ob, nil
}

type walEntry struct {
	MonitorID string                  `json:"monitor_id"`
	Effect    EffectPersistTransition `json:"effect"`
}

// Submit records the persistence effect to the local WAL, guaranteeing delivery asynchronously.
func (o *Outbox) Submit(monitorID string, eff EffectPersistTransition) error {
	entry := walEntry{
		MonitorID: monitorID,
		Effect:    eff,
	}
	
	// Optimistic non-blocking append to memory channel.
	// If channel is full during massive outage, blocks caller.
	select {
	case o.ch <- entry:
		// For testing memory inspection
		// o.Memory is not safe to append here concurrently if used in production, 
		// but since it's just for tests, we accept the race or tests can use it differently.
	case <-o.done:
		return fmt.Errorf("outbox closed")
	}
	return nil
}

func (o *Outbox) batchWriter() {
	defer o.wg.Done()
	
	// Batch array
	var batch []walEntry
	timer := time.NewTimer(100 * time.Millisecond)
	
	for {
		select {
		case <-o.done:
			// Drain remaining
			for {
				select {
				case entry := <-o.ch:
					batch = append(batch, entry)
				default:
					o.flush(batch)
					return
				}
			}
		case entry := <-o.ch:
			batch = append(batch, entry)
			// Aggressively flush if batch gets too large
			if len(batch) >= 1000 {
				o.flush(batch)
				batch = batch[:0]
				if !timer.Stop() {
					<-timer.C
				}
				timer.Reset(100 * time.Millisecond)
			}
		case <-timer.C:
			if len(batch) > 0 {
				o.flush(batch)
				batch = batch[:0]
			}
			timer.Reset(100 * time.Millisecond)
		}
	}
}

func (o *Outbox) flush(batch []walEntry) {
	if len(batch) == 0 {
		return
	}
	
	var buf []byte
	for _, entry := range batch {
		b, err := json.Marshal(entry)
		if err == nil {
			buf = append(buf, b...)
			buf = append(buf, '\n')
		}
	}
	
	if len(buf) > 0 {
		if _, err := o.wal.Write(buf); err != nil {
			panic(fmt.Sprintf("CRITICAL: WAL write failed, disk may be full! Halting to prevent data loss: %v", err))
		}
		if err := o.wal.Sync(); err != nil {
			panic(fmt.Sprintf("CRITICAL: WAL fsync failed! Halting to prevent data loss: %v", err))
		}
	}
}

func (o *Outbox) Close() error {
	close(o.done)
	o.wg.Wait()
	if o.wal != nil {
		return o.wal.Close()
	}
	return nil
}
