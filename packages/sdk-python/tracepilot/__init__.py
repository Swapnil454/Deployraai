import os
import sys
import traceback
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.requests import RequestsInstrumentor
import re

_provider = None

# Scrubbing regex patterns for PII
PII_PATTERNS = [
    re.compile(r"(password|secret|token|api_key|credit_card)(?:\s*=|:\s*)['\"]?([^'\"\s,]+)['\"]?", re.IGNORECASE)
]

class ScrubbingSpanProcessor(BatchSpanProcessor):
    def on_end(self, span):
        if span.attributes:
            for k, v in list(span.attributes.items()):
                if isinstance(v, str):
                    scrubbed_v = v
                    for pattern in PII_PATTERNS:
                        if pattern.search(scrubbed_v):
                            scrubbed_v = pattern.sub(r"\1=***scrubbed***", scrubbed_v)
                    if scrubbed_v != v:
                        span.set_attribute(k, scrubbed_v)
        super().on_end(span)

def init():
    """
    Initialize the TracePilot OpenTelemetry exporter.
    Requires TRACEPILOT_TOKEN to be set.
    """
    project_id = os.getenv("TRACEPILOT_TOKEN")
    
    # Silent disable pattern
    if not project_id:
        return trace.get_tracer("tracepilot")
        
    ingestor_url = os.getenv("TRACEPILOT_COLLECTOR_URL", "https://ingestor.tracepilot.io")

    # Set up the resource (identifies the service)
    resource = Resource(attributes={
        "service.name": os.getenv("SERVICE_NAME", "python-service"),
        "tracepilot.project.id": project_id
    })

    global _provider
    _provider = TracerProvider(resource=resource)
    
    # Configure OTLP HTTP Exporter
    exporter = OTLPSpanExporter(
        endpoint=f"{ingestor_url}/v1/traces",
        headers={"x-tracepilot-project-id": project_id}
    )
    
    # Use ScrubbingSpanProcessor for Payload PII Scrubbing and performance
    _provider.add_span_processor(ScrubbingSpanProcessor(exporter))
    trace.set_tracer_provider(_provider)

    # Base instrumentation
    RequestsInstrumentor().instrument()
    
    # Auto-instrument web frameworks based on what's installed
    _try_instrument_fastapi()
    _try_instrument_django()
    _try_instrument_flask()
    
    # Setup global unhandled exception hook
    _setup_excepthook()

    return trace.get_tracer("tracepilot")

def _try_instrument_fastapi():
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        FastAPIInstrumentor().instrument()
    except ImportError:
        pass  # FastAPI not installed - skip silently

def _try_instrument_django():
    try:
        from opentelemetry.instrumentation.django import DjangoInstrumentor
        DjangoInstrumentor().instrument()
    except ImportError:
        pass

def _try_instrument_flask():
    try:
        from opentelemetry.instrumentation.flask import FlaskInstrumentor
        FlaskInstrumentor().instrument()
    except ImportError:
        pass

def _setup_excepthook():
    _original_excepthook = sys.excepthook
    def _tracepilot_excepthook(exc_type, exc_value, exc_traceback):
        tracer = trace.get_tracer("tracepilot.exception")
        with tracer.start_as_current_span("Unhandled Exception") as span:
            span.record_exception(exc_value)
            span.set_status(trace.StatusCode.ERROR, str(exc_value))
            # Include traceback as a span attribute
            tb_str = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
            span.set_attribute("exception.traceback", tb_str)
        
        # Flush the provider to ensure the span is sent before crashing
        _provider.force_flush()
        
        # Call original
        _original_excepthook(exc_type, exc_value, exc_traceback)

    sys.excepthook = _tracepilot_excepthook

    # Auto-instrumentation hooks
    try:
        from opentelemetry.instrumentation.requests import RequestsInstrumentor
        RequestsInstrumentor().instrument()
    except ImportError:
        pass # Requests instrumentor not installed

    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        # FastAPI requires the app instance to instrument, typically done via FastAPIInstrumentor.instrument_app(app)
        # We can expose this helper if needed, or if instrument() works globally, do it here.
    except ImportError:
        pass

    return trace.get_tracer("tracepilot")
