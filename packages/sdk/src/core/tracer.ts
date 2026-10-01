import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { HostMetrics } from '@opentelemetry/host-metrics';
import * as os from 'os';
import { getConfig, isEnabled } from './config';
import { createExporter, createMetricExporter } from './transport';

let sdk: NodeSDK | null = null;
let hostMetrics: HostMetrics | null = null;

export function initTracer() {
  if (!isEnabled()) return;
  if (sdk) return; // already initialized — safe to call multiple times

  const config = getConfig();

  const exporters = [createExporter()];

  // In debug mode, also log spans to console
  if (config.debug) {
    exporters.push(new ConsoleSpanExporter() as any);
  }

  const metricExporter = createMetricExporter();
  const metricReader = new PeriodicExportingMetricReader({
    exporter: config.debug ? (new ConsoleMetricExporter() as any) : metricExporter,
    exportIntervalMillis: 10000, // Export metrics every 10 seconds
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: config.projectId,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment,
      'host.name': os.hostname(),
      'k8s.pod.name': os.hostname(), // Fallback for dashboards that group by pod
      // Custom attributes that show up on every span
      'yourplatform.project_id': config.projectId,
      'yourplatform.deploy_id': config.deployId,
      'yourplatform.environment': config.environment,
    }),
    spanProcessors: exporters.map(e => new BatchSpanProcessor(e, {
      maxQueueSize: 512,
      scheduledDelayMillis: 2000, // flush every 2s
      exportTimeoutMillis: 5000,
      maxExportBatchSize: 128,
    }) as any),
    metricReader: metricReader as any,
    instrumentations: [
      // Auto-instruments all Node.js http/https calls, plus databases
      new HttpInstrumentation({
        // Don't trace calls to your own collector — would be recursive
        ignoreOutgoingRequestHook: (req) => {
          return req.hostname?.includes('deployai.in') || req.hostname?.includes('localhost') || false;
        },
      }),
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // Disable FS to reduce noise
        '@opentelemetry/instrumentation-http': { enabled: false }, // Already manually configured above
      }),
    ],
  });

  sdk.start();
  
  // Start host metrics collection using the global meter provider configured by NodeSDK
  hostMetrics = new HostMetrics({ name: 'host-metrics' });
  hostMetrics.start();

  // Graceful shutdown — flush remaining spans before process exits
  process.on('SIGTERM', () => sdk?.shutdown());
  process.on('SIGINT', () => sdk?.shutdown());
}

// Call this if you need to force-flush spans (e.g. at end of a serverless function)
export async function flushTraces() {
  if (sdk) await sdk.shutdown();
}
