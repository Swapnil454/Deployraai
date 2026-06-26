# TracePilot Python SDK

![PyPI version](https://badge.fury.io/py/swapnil-tracepilot.svg)
![Python Versions](https://img.shields.io/pypi/pyversions/swapnil-tracepilot.svg)
![License](https://img.shields.io/github/license/swapnil454/tracepilot)

The official TracePilot SDK for Python. TracePilot provides zero-configuration distributed tracing, performance metrics, and global crash reporting for your Python applications. 

This SDK is built on top of OpenTelemetry, meaning it provides industry-standard, vendor-neutral instrumentation out of the box, but specifically tuned and optimized for the TracePilot platform.

---

##  Quick Start

### 1. Installation

Install the package via pip or poetry:

```bash
pip install swapnil-tracepilot
# or
poetry add swapnil-tracepilot
```

### 2. Initialization

Initialize the TracePilot SDK at the very beginning of your application, ideally before importing other major libraries.

```python
import os
from tracepilot import init_tracepilot

# Initialize TracePilot before your framework code
init_tracepilot(
    token=os.environ.get("TRACEPILOT_TOKEN")
)

# Your normal application code...
```

---

## Features

- **Global Crash Reporting:** Implements a custom `sys.excepthook` that guarantees unhandled exceptions (like a `ZeroDivisionError` or database disconnect) are caught, serialized into an OpenTelemetry span with the full stack trace, and reliably flushed to the TracePilot ingestor before the Python runtime exits.
- **Auto-Instrumentation:** Uses standard OpenTelemetry instrumentors to automatically trace outgoing HTTP requests (`requests`, `urllib3`), database queries (`sqlalchemy`, `psycopg2`), and web frameworks (`FastAPI`, `Flask`, `Django`).
- **Zero Config:** Just provide a token and let the SDK handle batching, export processing, and retry logic.

---

## Advanced Configuration

You can configure the SDK using environment variables or by passing arguments to `init_tracepilot()`:

| Environment Variable | Argument | Description | Default |
|----------------------|----------|-------------|---------|
| `TRACEPILOT_TOKEN` | `token` | **Required.** Your project's API token. | `None` |
| `TRACEPILOT_COLLECTOR_URL`| `collector_url` | Custom OTLP ingestor endpoint (e.g., if you are self-hosting TracePilot). | `http://localhost:4318/v1/traces` |

### Example with Custom Endpoint
```python
init_tracepilot(
    token="tp_live_12345",
    collector_url="https://ingestor.tracepilot.io/v1/traces"
)
```

---

## Manual Tracing

While TracePilot auto-instruments your code, you can also create custom spans to track specific business logic:

```python
from opentelemetry import trace

tracer = trace.get_tracer("my_custom_module")

def process_payment(amount):
    with tracer.start_as_current_span("process_payment") as span:
        span.set_attribute("payment.amount", amount)
        try:
            # Complex logic here
            pass
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.Status(trace.StatusCode.ERROR))
            raise
```

---

## Troubleshooting

**No data showing up in TracePilot?**
1. Check that your `TRACEPILOT_TOKEN` is correct.
2. Ensure outbound network access to port `4318` (or your custom collector port) is unblocked.
3. Enable OpenTelemetry debug logging by setting `OTEL_LOG_LEVEL=debug` in your environment.

## License
MIT License. See [LICENSE](LICENSE) for more details.
