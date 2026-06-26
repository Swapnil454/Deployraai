package tracepilot_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/swapnil454/tracepilot-go"
)

func TestRecoveryMiddleware(t *testing.T) {
	// 1. Setup mock ingestor server
	var receivedPayload bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-tracepilot-project-id") == "test-prj" {
			receivedPayload = true
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// 2. Setup environment variables for SDK
	os.Setenv("TRACEPILOT_TOKEN", "test-prj")
	os.Setenv("TRACEPILOT_COLLECTOR_URL", server.URL)
	defer os.Unsetenv("TRACEPILOT_TOKEN")
	defer os.Unsetenv("TRACEPILOT_COLLECTOR_URL")

	// 3. Initialize SDK
	shutdown, err := tracepilot.Init(context.Background())
	if err != nil {
		t.Fatalf("Failed to init SDK: %v", err)
	}
	defer shutdown(context.Background())

	// 4. Create a panicking handler
	panickingHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("database disconnected")
	})

	// Wrap with our middleware
	wrappedHandler := tracepilot.Middleware(panickingHandler)

	// 5. Execute request
	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()

	// We expect the handler to panic, but the RecoveryMiddleware should catch it,
	// record the span, and then RE-PANIC so the outer server can return 500.
	defer func() {
		if r := recover(); r == nil {
			t.Errorf("Expected panic to be propagated, but it wasn't")
		}

		// Force flush to ensure the span is sent to the mock server before test ends
		shutdown(context.Background())

		// Verify that the ingestor received the OTLP payload
		if !receivedPayload {
			t.Errorf("Ingestor never received the error span payload")
		}
	}()

	wrappedHandler.ServeHTTP(w, req)
}
