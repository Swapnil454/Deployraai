import { FastifyPluginAsync } from 'fastify';
import { validateProjectToken } from '../middleware/auth.js';
import { checkUsageCap } from '../middleware/usage-check.js';
import { metricsWriter, MetricRecord } from '../writers/metrics.js';

// Helper to extract OTLP AnyValue
const parseAnyValue = (value: any): string => {
  if (!value) return '';
  if (value.stringValue !== undefined) return String(value.stringValue);
  if (value.intValue !== undefined) return String(value.intValue);
  if (value.doubleValue !== undefined) return String(value.doubleValue);
  if (value.boolValue !== undefined) return String(value.boolValue);
  return JSON.stringify(value);
};

export const metricsRouter: FastifyPluginAsync = async (app) => {
  app.post('/', {
    bodyLimit: 10 * 1024 * 1024,
    preHandler: [validateProjectToken, checkUsageCap],
  }, async (req, reply) => {
    const { projectId } = (req as any).auth;
    const body = req.body as any;

    const metricRecords: MetricRecord[] = [];
    let droppedHistograms = 0;

    if (body && Array.isArray(body.resourceMetrics)) {
      for (const rm of body.resourceMetrics) {
        // Parse Resource Attributes
        const resourceAttrs: Record<string, string> = {};
        if (rm.resource && Array.isArray(rm.resource.attributes)) {
          for (const attr of rm.resource.attributes) {
            if (attr.key) resourceAttrs[attr.key] = parseAnyValue(attr.value);
          }
        }

        if (Array.isArray(rm.scopeMetrics)) {
          for (const sm of rm.scopeMetrics) {
            if (Array.isArray(sm.metrics)) {
              for (const metric of sm.metrics) {
                const metricName = metric.name || 'unknown';

                // We only support Gauge and Sum for now
                if (metric.histogram || metric.summary || metric.exponentialHistogram) {
                  droppedHistograms++;
                  continue;
                }

                let dataPoints = [];
                let metricType = '';

                if (metric.gauge && Array.isArray(metric.gauge.dataPoints)) {
                  dataPoints = metric.gauge.dataPoints;
                  metricType = 'Gauge';
                } else if (metric.sum && Array.isArray(metric.sum.dataPoints)) {
                  dataPoints = metric.sum.dataPoints;
                  metricType = 'Sum';
                } else {
                  continue; // unsupported type or empty
                }

                for (const dp of dataPoints) {
                  // Parse DataPoint Attributes
                  const dpAttrs: Record<string, string> = {};
                  if (Array.isArray(dp.attributes)) {
                    for (const attr of dp.attributes) {
                      if (attr.key) dpAttrs[attr.key] = parseAnyValue(attr.value);
                    }
                  }

                  // Merge attributes: Resource > DataPoint
                  const mergedAttrs = { ...dpAttrs, ...resourceAttrs };

                  // Extract Native Columns
                  const hostName = mergedAttrs['host.name'] || '';
                  const k8sPodName = mergedAttrs['k8s.pod.name'] || '';
                  const k8sNamespaceName = mergedAttrs['k8s.namespace.name'] || '';
                  const containerName = mergedAttrs['container.name'] || '';

                  // Value resolution
                  let value = 0;
                  if (dp.asDouble !== undefined) value = Number(dp.asDouble);
                  else if (dp.asInt !== undefined) value = Number(dp.asInt);

                  // Time resolution (UnixNano string or number)
                  let timestamp = new Date();
                  if (dp.timeUnixNano) {
                    const nanoStr = String(dp.timeUnixNano);
                    if (nanoStr.length > 6) {
                      timestamp = new Date(Number(nanoStr.slice(0, -6)));
                    }
                  }

                  metricRecords.push({
                    projectId,
                    timestamp,
                    metricName,
                    metricType,
                    value,
                    hostName,
                    k8sPodName,
                    k8sNamespaceName,
                    containerName,
                    attributes: mergedAttrs
                  });
                }
              }
            }
          }
        }
      }
    }

    if (droppedHistograms > 0) {
      req.log.warn(`[Metrics] Dropped ${droppedHistograms} unsupported Histogram/Summary metrics for project ${projectId}`);
    }

    if (metricRecords.length > 0) {
      metricsWriter.write(metricRecords).catch(err => {
        req.log.error({ err }, 'Failed to write metrics to buffer');
      });
    }

    reply.status(202).send({ accepted: metricRecords.length, droppedUnsupported: droppedHistograms });
  });
};
