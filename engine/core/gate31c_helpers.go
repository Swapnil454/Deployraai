//go:build killhook

package core

import (
	"context"
	"encoding/binary"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// Helpers exposed strictly under -tags killhook for crash testing harness

func NewColsForHarness(cap int) *Cols { return newCols(cap) }

func (c *Cols) AddForHarness(s Sample) { c.add(s) }

func (c *Cols) LenForHarness() int { return c.len() }

func FlushBatchForHarness(ctx context.Context, conn driver.Conn, c *Cols, batchID string) bool {
	return flush(ctx, conn, c, batchID)
}

func SetTelemetrySpoolDirForHarness(dir string) {
	telemetrySpoolDir = dir
}

func SpoolAndGetToken(c *Cols, runID [16]byte, workerID uint32, batchSeq uint64) string {
	preimage := DedupTokenPreimage{
		WorkerID:    workerID,
		Nonce:       binary.BigEndian.Uint64(runID[0:8]),
		BatchID:     batchSeq,
		BlockOffset: 0,
	}
	SpoolBatchWithPreimage(c, preimage)
	return preimage.TokenString()
}

func ReadSpoolFileMinMax(filePath string) (minSeq uint64, maxSeq uint64, count int, err error) {
	cols, _, err := readSpoolFileWithPreimage(filePath)
	if err != nil {
		return 0, 0, 0, err
	}
	if cols.len() == 0 {
		return 0, 0, 0, nil
	}
	minSeq = cols.Gen[0]
	maxSeq = cols.Gen[0]
	for _, g := range cols.Gen {
		if g < minSeq {
			minSeq = g
		}
		if g > maxSeq {
			maxSeq = g
		}
	}
	return minSeq, maxSeq, cols.len(), nil
}

func ReadSpoolFileWithPreimageForHarness(filePath string) (*Cols, DedupTokenPreimage, error) {
	return readSpoolFileWithPreimage(filePath)
}

// ReplaySpoolFilesWithFreshNonce drains and replays all pending spool segments in telemetrySpoolDir,
// but deliberately generates a fresh nonce for each batch (simulating the unhardened E10 bug).
func ReplaySpoolFilesWithFreshNonce(conn driver.Conn, timeout time.Duration) int {
	files, err := os.ReadDir(telemetrySpoolDir)
	if err != nil {
		return 0
	}
	replayed := 0
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".bin") {
			continue
		}
		filePath := fmt.Sprintf("%s/%s", telemetrySpoolDir, file.Name())
		replayCols, preimage, err := readSpoolFileWithPreimage(filePath)
		if err == nil {
			// Deliberately corrupt/regenerate the Nonce on restart (E10 defect mode)
			preimage.Nonce = rand.Uint64() | 0x8000000000000000
			freshToken := preimage.TokenString()

			fctx, cancel := context.WithTimeout(context.Background(), timeout)
			success := flush(fctx, conn, replayCols, freshToken)
			cancel()
			if success {
				_ = os.Remove(filePath)
				replayed += replayCols.len()
			}
		}
	}
	return replayed
}

// EmitWithWaitDuration records how long a prober waits to enqueue a sample into TelemetryQueue.
func EmitWithWaitDuration(s Sample) time.Duration {
	t0 := time.Now()
	Emit(s)
	return time.Since(t0)
}
