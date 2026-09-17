const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');
const { HostMetrics } = require('@opentelemetry/host-metrics');

const metricReader = new PeriodicExportingMetricReader({
  exporter: new ConsoleMetricExporter(),
  exportIntervalMillis: 2000,
});

const sdk = new NodeSDK({
  resource: new Resource({ 'service.name': 'test-service' }),
  metricReader,
});

sdk.start();

const hostMetrics = new HostMetrics({ name: 'host-metrics' });
hostMetrics.start();

console.log('SDK started, waiting 5 seconds for metrics...');
setTimeout(() => {
  sdk.shutdown().then(() => console.log('SDK shut down'));
}, 5000);
