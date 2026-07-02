package main

import (
	"context"
	"fmt"
	"time"

	"github.com/swapnil454/tracepilot-go"
)

func slowFib(n int) int {
	if n <= 1 {
		return n
	}
	return slowFib(n-1) + slowFib(n-2)
}

func main() {
	// Initialize TracePilot with Continuous Profiling enabled
	shutdown, err := tracepilot.InitWithOptions(context.Background(),
		tracepilot.WithProfiling(true),
		tracepilot.WithProfilerFlushInterval(5*time.Second),
	)
	if err != nil {
		panic(err)
	}
	defer shutdown(context.Background())

	fmt.Println("Starting heavy workload...")
	// Run an infinite loop doing expensive CPU work
	// It should capture multiple profiles since flush interval is 5s
	start := time.Now()
	for time.Since(start) < 30*time.Second {
		// Calculate fibonacci to burn CPU
		slowFib(35)
	}
	fmt.Println("Workload complete.")
}
