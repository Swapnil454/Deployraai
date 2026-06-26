module github.com/swapnil454/tracepilot-go

go 1.21

require (
	go.opentelemetry.io/otel v1.20.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.20.0
	go.opentelemetry.io/otel/sdk v1.20.0
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.46.1
)
