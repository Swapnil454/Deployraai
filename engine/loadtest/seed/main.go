package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dsn := os.Getenv("UPTIMER_DB")
	if dsn == "" {
		log.Fatal("UPTIMER_DB not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	count := 35000
	if len(os.Args) > 1 {
		fmt.Sscanf(os.Args[1], "%d", &count)
	}

	log.Printf("Truncating existing monitors and incidents...")
	_, err = pool.Exec(ctx, "TRUNCATE uptime_monitors CASCADE")
	if err != nil {
		log.Fatalf("Truncate failed: %v", err)
	}

	log.Printf("Seeding %d mock monitors...\n", count)

	var rows [][]interface{}
	for i := 0; i < count; i++ {
		path := "/mock/up"
		val := i % 100
		if val == 98 {
			path = "/mock/down"
		} else if val == 99 {
			path = "/mock/timeout"
		} else if val == 97 {
			path = "/mock/405"
		}

		host := fmt.Sprintf("mock-%d.mock.local", i)
		url := fmt.Sprintf("https://%s:8443%s", host, path)
		
		// Map path to tag
		tag := "up"
		if path == "/mock/down" {
			tag = "down"
		} else if path == "/mock/timeout" {
			tag = "timeout"
		} else if path == "/mock/405" {
			tag = "405"
		}

		timeoutSec := 30
		if tag == "timeout" {
			timeoutSec = 5
		}

		rows = append(rows, []interface{}{uuid.New().String(), "mock", "port", url, []string{tag}, 30, timeoutSec, "up", false, "engine"})
	}

	_, err = pool.CopyFrom(ctx, 
		[]string{"uptime_monitors"}, 
		[]string{"id", "user_id", "monitor_type", "url", "tags", "interval_seconds", "timeout_seconds", "status", "is_paused", "managed_by"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		log.Fatalf("CopyFrom failed: %v", err)
	}

	log.Println("Seeding complete.")
}
