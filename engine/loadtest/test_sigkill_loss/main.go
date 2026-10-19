package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/google/uuid"
	"github.com/your-org/uptime-engine/core"
)

var totalEmitted atomic.Uint64

func main() {
	log.Printf("[SIGKILL_TEST] Starting Engine (PID: %d)...", os.Getpid())

	// Connect to ClickHouse on localhost:9000
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{"localhost:9000"},
		Auth: clickhouse.Auth{
			Database: "default",
			Username: "engine",
			Password: "password",
		},
	})
	if err != nil {
		log.Fatalf("ClickHouse open failed: %v", err)
	}
	defer conn.Close()

	if err := conn.Ping(context.Background()); err != nil {
		log.Fatalf("ClickHouse ping failed: %v", err)
	}

	// Truncate table before test
	_ = conn.Exec(context.Background(), "TRUNCATE TABLE uptime_checks_telemetry")
	time.Sleep(1 * time.Second)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup
	cfg := core.Config{
		MaxRows:    10000,
		FlushEvery: 1 * time.Second,
	}

	core.StartTelemetryFlusher(ctx, &wg, conn, cfg)

	log.Printf("[SIGKILL_TEST] Ingesting at 33,333 checks/s...")
	ticker := time.NewTicker(30 * time.Microsecond) // ~33,333/s
	defer ticker.Stop()

	// Record start time and run
	start := time.Now()
	for {
		<-ticker.C
		core.Emit(core.Sample{
			MonitorID:      uuid.New(),
			TsMs:           time.Now().UnixMilli(),
			LatencyUs:      25000,
			IntervalS:      30,
			Status:         1,
			Err:            0,
			Kind:           1,
			ProbeKind:      0,
			PhaseKind:      0,
			Attempts:       1,
			TotalLatencyUs: 25000,
			Reused:         1,
			DidResume:      1,
			ReqMethod:      0,
			ReqScheme:      1,
			Generation:     1,
		})
		cnt := totalEmitted.Add(1)
		if cnt%1000 == 0 {
			_ = os.WriteFile("sigkill_status.txt", []byte(fmt.Sprintf("%d", cnt)), 0644)
		}
		if cnt%10000 == 0 {
			elapsed := time.Since(start).Seconds()
			rate := float64(cnt) / elapsed
			log.Printf("[SIGKILL_TEST] Emitted: %d checks (rate: %.0f checks/s, in-flight Q: %d)",
				cnt, rate, len(core.TelemetryQueue))
		}
	}
}
