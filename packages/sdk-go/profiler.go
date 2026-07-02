package tracepilot

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"runtime/pprof"
	"strings"
	"time"
)

type ProfilerConfig struct {
	// Enable enables CPU profiling
	Enable bool
	// FlushInterval specifies how often to send profiles (default 10s)
	FlushInterval time.Duration
	// CPUProfileRate specifies the sample rate for runtime.SetCPUProfileRate (default 100 Hz)
	CPUProfileRate int
}

func startProfiler(ctx context.Context, cfg ProfilerConfig, projectID, ingestorURL, serviceName string) {
	if !cfg.Enable || projectID == "" {
		return
	}

	flushInterval := cfg.FlushInterval
	if flushInterval <= 0 {
		flushInterval = 10 * time.Second
	}

	if cfg.CPUProfileRate > 0 {
		// Default in Go is 100Hz, but allow override
		// Note: This must be called before StartCPUProfile
		// However, Go only allows this to be set once and before profiling starts.
		// There's a known limitation in Go where SetCPUProfileRate can't be called concurrently.
		// We'll set it here once.
		// Note: The math/rand is not needed, runtime.SetCPUProfileRate is sufficient.
		// Oh, it's actually runtime.SetCPUProfileRate(hz)
		// Wait, I need to import "runtime". I will just add the import and call it.
	}

	// Wait, runtime.SetCPUProfileRate defaults to 100Hz.
	// If the user configures it, we can set it, but we can't do it concurrently if another profiler is active.
	// The standard way to profile CPU in go is pprof.StartCPUProfile(w).

	if cfg.CPUProfileRate > 0 {
		runtime.SetCPUProfileRate(cfg.CPUProfileRate)
	}

	go func() {
		ticker := time.NewTicker(flushInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				var buf bytes.Buffer

				// Start capturing CPU profile
				if err := pprof.StartCPUProfile(&buf); err != nil {
					fmt.Fprintf(os.Stderr, "[TracePilot] failed to start cpu profile: %v\n", err)
					continue
				}

				// Wait for the duration of the flush interval
				// We actually want to capture for some duration and then upload.
				// A continuous profiler typically captures for the entire flush interval,
				// then stops, uploads, and immediately restarts.
				time.Sleep(flushInterval)

				pprof.StopCPUProfile()

				uploadProfile(buf.Bytes(), projectID, ingestorURL, serviceName)
			}
		}
	}()
}

func uploadProfile(profileData []byte, projectID, ingestorURL, serviceName string) {
	if len(profileData) == 0 {
		return
	}

	// The user might pass ingest.tracepilot.ai without a protocol
	endpoint := ingestorURL
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		// Default to https if no protocol
		endpoint = "https://" + endpoint
	}
	// We want to hit /v1/profiles, so we strip /v1/traces if they set the exact URL
	endpoint = strings.TrimSuffix(endpoint, "/v1/traces")
	endpoint = strings.TrimSuffix(endpoint, "/")

	url := fmt.Sprintf("%s/v1/profiles", endpoint)

	req, err := http.NewRequest("POST", url, bytes.NewReader(profileData))
	if err != nil {
		fmt.Fprintf(os.Stderr, "[TracePilot] failed to create profile request: %v\n", err)
		return
	}

	req.Header.Set("Content-Type", "application/x-protobuf")
	req.Header.Set("x-project-id", projectID)
	req.Header.Set("x-service-name", serviceName)
	req.Header.Set("x-profile-type", "cpu")

	fmt.Printf("[TracePilot] uploading profile to %s\n", url)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[TracePilot] failed to upload profile: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		fmt.Fprintf(os.Stderr, "[TracePilot] profile upload failed with status: %d\n", resp.StatusCode)
	}
}
