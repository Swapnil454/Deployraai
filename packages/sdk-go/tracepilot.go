package tracepilot

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

func normalizeEndpoint(endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	endpoint = strings.TrimPrefix(endpoint, "https://")
	endpoint = strings.TrimPrefix(endpoint, "http://")
	return endpoint
}

// Config holds TracePilot configuration.
type Config struct {
	Profiler ProfilerConfig
}

// Option applies a configuration to Config.
type Option func(*Config)

// WithProfiling enables continuous CPU profiling.
func WithProfiling(enabled bool) Option {
	return func(c *Config) {
		c.Profiler.Enable = enabled
	}
}

// WithProfilerRate sets the CPU sampling rate (default 100 Hz).
func WithProfilerRate(rateHz int) Option {
	return func(c *Config) {
		c.Profiler.CPUProfileRate = rateHz
	}
}

// WithProfilerFlushInterval sets how often profiles are flushed to the ingestor.
func WithProfilerFlushInterval(d time.Duration) Option {
	return func(c *Config) {
		c.Profiler.FlushInterval = d
	}
}

// Init initializes the TracePilot OpenTelemetry exporter with default options.
func Init(ctx context.Context) (func(context.Context) error, error) {
	return InitWithOptions(ctx)
}

// InitWithOptions initializes the TracePilot OpenTelemetry exporter and optional modules.
// Returns a Shutdown function that should be deferred to ensure spans are flushed.
func InitWithOptions(ctx context.Context, opts ...Option) (func(context.Context) error, error) {
	config := &Config{}
	for _, opt := range opts {
		opt(config)
	}
	projectID := os.Getenv("TRACEPILOT_TOKEN")

	// Silent disable pattern
	if projectID == "" {
		tp := noop.NewTracerProvider()
		otel.SetTracerProvider(tp)
		return func(context.Context) error { return nil }, nil
	}

	ingestorURL := os.Getenv("TRACEPILOT_COLLECTOR_URL")
	if ingestorURL == "" {
		ingestorURL = "ingest.tracepilot.ai"
	}

	serviceName := os.Getenv("SERVICE_NAME")
	if serviceName == "" {
		serviceName = "go-service"
	}

	otelOpts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(normalizeEndpoint(ingestorURL)),
		otlptracehttp.WithHeaders(map[string]string{
			"x-tracepilot-project-id": projectID,
		}),
	}

	// Use insecure connection if the original URL is HTTP
	if strings.HasPrefix(strings.TrimSpace(ingestorURL), "http://") {
		otelOpts = append(otelOpts, otlptracehttp.WithInsecure())
	}

	// Create OTLP HTTP Exporter
	exporter, err := otlptracehttp.New(ctx, otelOpts...)
	if err != nil {
		return nil, err
	}

	// Define resource identifying the service
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
		),
	)
	if err != nil {
		return nil, err
	}

	// Create TracerProvider with the exporter
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)

	// Set as global
	otel.SetTracerProvider(tp)

	// Start Continuous Profiler if enabled
	if config.Profiler.Enable {
		startProfiler(ctx, config.Profiler, projectID, ingestorURL, serviceName)
	}

	return tp.Shutdown, nil
}

// Middleware wraps an http.Handler with OpenTelemetry HTTP auto-instrumentation
// and TracePilot panic recovery.
func Middleware(next http.Handler) http.Handler {
	return otelhttp.NewHandler(RecoveryMiddleware(next), "http.request")
}

// RecoveryMiddleware catches panics, records them as Critical errors in TracePilot,
// and then re-panics so the server handles it appropriately (usually returning 500).
func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				// Record the panic as an error span
				ctx := r.Context()
				span := trace.SpanFromContext(ctx)
				if span != nil {
					span.SetStatus(codes.Error, fmt.Sprintf("panic: %v", err))
					span.SetAttributes(semconv.ExceptionMessageKey.String(fmt.Sprintf("%v", err)))
					span.SetAttributes(semconv.ExceptionStacktraceKey.String(string(debug.Stack())))
				}

				// Repanic
				panic(err)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
