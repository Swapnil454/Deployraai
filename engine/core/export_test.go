package core

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// Test exports for integration tests and load tests
func NewColsForTest(cap int) *Cols { return newCols(cap) }
func (c *Cols) AddForTest(s Sample) { c.add(s) }
func FlushForTest(ctx context.Context, conn driver.Conn, c *Cols, batchID string) bool {
	return flush(ctx, conn, c, batchID)
}

func SetFleetBreakerForTest(total, fails int64) {
	nowSec := time.Now().Unix()
	idx := nowSec % 10
	globalFleetBreaker.mu.Lock()
	globalFleetBreaker.buckets[idx] = fleetBucket{
		sec:   nowSec,
		total: total,
		fails: fails,
	}
	globalFleetBreaker.mu.Unlock()
}

func ResetFleetBreakerForTest() {
	globalFleetBreaker.mu.Lock()
	globalFleetBreaker.buckets = [10]fleetBucket{}
	globalFleetBreaker.mu.Unlock()
}
