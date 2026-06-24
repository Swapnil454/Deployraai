import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { getConfig, isEnabled } from './config';
import { createExporter } from './transport';

let sdk: NodeSDK | null = null;

export function initTracer() {
  if (!isEnabled()) return;
  if (sdk) return; // already initialized — safe to call multiple times

  const config = getConfig();

  const exporters = [createExporter()];

  // In debug mode, also log spans to console
  if (config.debug) {
    exporters.push(new ConsoleSpanExporter() as any);
  }

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.projectId,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
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
    instrumentations: [
      // Auto-instruments all Node.js http/https calls
      new HttpInstrumentation({
        // Don't trace calls to your own collector — would be recursive
        ignoreOutgoingRequestHook: (req) => {
          return req.hostname?.includes('collector.yourplatform.com') ?? false;
        },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown — flush remaining spans before process exits
  process.on('SIGTERM', () => sdk?.shutdown());
  process.on('SIGINT', () => sdk?.shutdown());
}

// Call this if you need to force-flush spans (e.g. at end of a serverless function)
export async function flushTraces() {
  if (sdk) await sdk.shutdown();
}
