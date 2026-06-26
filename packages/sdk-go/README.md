# TracePilot Go SDK

[![Go Reference](https://pkg.go.dev/badge/github.com/swapnil454/tracepilot-go.svg)](https://pkg.go.dev/github.com/swapnil454/tracepilot-go)
[![Go Report Card](https://goreportcard.com/badge/github.com/swapnil454/tracepilot-go)](https://goreportcard.com/report/github.com/swapnil454/tracepilot-go)
![License](https://img.shields.io/github/license/swapnil454/tracepilot-go)

The official TracePilot SDK for Go. TracePilot provides zero-configuration distributed tracing, performance metrics, and global panic recovery for your Golang applications.

This SDK is built natively on top of `go.opentelemetry.io`, abstracting away the complex boilerplate of setting up trace providers, batch processors, and OTLP exporters.

---

##  Quick Start

### 1. Installation

```bash
go get github.com/swapnil454/tracepilot-go
```

### 2. Initialization & Middleware

To use TracePilot, initialize the SDK early in your `main()` function and use the `tracepilot.Middleware` to wrap your HTTP handlers.

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/swapnil454/tracepilot-go"
)

func main() {
    // 1. Configure your project token (usually set via Docker/Kubernetes env vars)
    os.Setenv("TRACEPILOT_TOKEN", "YOUR_PROJECT_TOKEN")

	// 2. Initialize the SDK
	shutdown, err := tracepilot.Init(context.Background())
	if err != nil {
		log.Fatalf("Failed to initialize TracePilot: %v", err)
	}
    // Ensures all pending telemetry is flushed before the process exits
	defer shutdown(context.Background())

	// 3. Setup your HTTP routes
	mux := http.NewServeMux()
	mux.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
        // Example logic
        w.Write([]byte("Success"))
	})
    
    mux.HandleFunc("/api/crash", func(w http.ResponseWriter, r *http.Request) {
        // This panic will be caught and sent to TracePilot!
		panic("Database disconnected unexpectedly!")
	})

	// 4. Wrap your multiplexer/router with TracePilot Middleware
	handler := tracepilot.Middleware(mux)

	log.Println("Server running on :8080")
	http.ListenAndServe(":8080", handler)
}
```

---

## Features

- **Automatic Panic Recovery:** The `tracepilot.Middleware` includes a highly robust panic recovery mechanism. If a `panic()` occurs in any HTTP handler:
  1. The SDK catches it.
  2. Captures the full runtime stack trace using `debug.Stack()`.
  3. Creates an OpenTelemetry error span.
  4. Forces a synchronous flush to the TracePilot ingestor to guarantee data delivery.
  5. Gracefully re-panics or recovers so your server stays alive.
- **Distributed Tracing:** Automatically extracts W3C Trace Context from incoming HTTP request headers and propagates them.
- **Standard Library Native:** Designed to wrap `net/http.Handler` making it compatible with `Gin`, `Echo`, `Chi`, and standard `ServeMux`.

---

## Advanced Configuration

You can configure the SDK using environment variables:

| Environment Variable | Description | Default |
|----------------------|-------------|---------|
| `TRACEPILOT_TOKEN` | **Required.** Your project's API token. | `""` |
| `TRACEPILOT_COLLECTOR_URL`| Custom OTLP ingestor endpoint. | `http://localhost:4318/v1/traces` |

---

## Manual Tracing

To add custom spans to an existing HTTP request trace, grab the tracer from the global OpenTelemetry provider:

```go
import "go.opentelemetry.io/otel"

func processOrder(ctx context.Context, orderID string) {
    tracer := otel.Tracer("my-custom-service")
    ctx, span := tracer.Start(ctx, "processOrder")
    defer span.End()

    span.SetAttributes(attribute.String("order.id", orderID))
    // Business logic...
}
```

## License
MIT License. See [LICENSE](LICENSE) for more details.
