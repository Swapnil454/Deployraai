import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getConfig } from './config';

// Creates the exporter that sends spans to YOUR ingestor,
// not to any public OTEL endpoint.
export function createExporter() {
  const config = getConfig();

  return new OTLPTraceExporter({
    url: `${config.collectorUrl}/v1/traces`,
    headers: {
      // Bearer token scoped to this project — validated by ingestor
      'Authorization': `Bearer ${config.token}`,
      'X-YourPlatform-Project': config.projectId,
      'X-YourPlatform-Deploy': config.deployId,
      'Content-Type': 'application/json',
    },
    // Send spans in small batches, quickly — don't wait
    timeoutMillis: 5000,
  });
}
