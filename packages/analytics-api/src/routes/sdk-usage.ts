import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * SDK-Based Usage Fallback Route
 *
 * When hosting platforms (like Render's free tier) don't provide CPU/Request
 * metrics via their API, this route queries ClickHouse directly using:
 *  - `infrastructure_metrics` table: populated by @opentelemetry/host-metrics
 *    (which the tracepilot SDK starts automatically via HostMetrics)
 *  - `spans` table: populated by OTel auto-instrumentation for HTTP requests
 *
 * The data shape mirrors the Render API response format so the frontend
 * doesn't need any changes — both sources feed the same parseTimeSeries().
 */
export const sdkUsageRouter: FastifyPluginAsync = async (app) => {
  // Accept either a valid user session (from browser) OR an internal server-to-server secret
  app.addHook('preHandler', async (req, reply) => {
    const internalSecret = (req.headers as any)['x-internal-secret'];
    if (internalSecret && internalSecret === (process.env.INTERNAL_API_SECRET || 'deployra-internal')) {
      return; // Internal call from DeployraAI server — skip user auth
    }
    // Otherwise fall through to normal user auth
    return requireAuth(req, reply);
  });

  app.get('/', async (req, reply) => {
    const query = req.query as any;
    const { projectId, range = 'current' } = query;

    if (!projectId) {
      return reply.code(400).send({ error: 'projectId is required' });
    }

    // Build time range
    const now = new Date();
    let startDate = new Date();
    if (range === '7d') {
      startDate.setDate(now.getDate() - 7);
    } else if (range === '30d') {
      startDate.setDate(now.getDate() - 30);
    } else {
      // current billing cycle — approximate start of current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const startMs = startDate.getTime();
    const endMs = now.getTime();

    try {
      // 1. CPU Usage — query infrastructure_metrics from HostMetrics SDK data
      //    HostMetrics emits `system.cpu.utilization` as a Gauge (0.0 - 1.0)
      //    We sample avg per day bucket and convert to "Core-hours" approximation
      const cpuQuery = `
        SELECT
          toStartOfDay(timestamp) as day,
          avg(value) as avg_cpu_utilization
        FROM infrastructure_metrics
        WHERE project_id = {projectId:String}
          AND timestamp >= toDateTime64({start:UInt64}/1000, 3)
          AND timestamp <= toDateTime64({end:UInt64}/1000, 3)
          AND metric_name = 'system.cpu.utilization'
        GROUP BY day
        ORDER BY day ASC
      `;

      // 2. HTTP Requests — count SERVER spans by looking for http.method attribute
      //    (same pattern used in infrastructure.ts throughput query)
      const requestsQuery = `
        SELECT
          toStartOfDay(start_time) as day,
          count() as request_count
        FROM spans
        WHERE project_id = {projectId:String}
          AND start_time >= toDateTime64({start:UInt64}/1000, 3)
          AND start_time <= toDateTime64({end:UInt64}/1000, 3)
          AND mapContains(attributes, 'http.method')
        GROUP BY day
        ORDER BY day ASC
      `;

      const [cpuResult, requestsResult] = await Promise.all([
        clickhouse.query({
          query: cpuQuery,
          format: 'JSONEachRow',
          query_params: { projectId, start: startMs, end: endMs }
        }),
        clickhouse.query({
          query: requestsQuery,
          format: 'JSONEachRow',
          query_params: { projectId, start: startMs, end: endMs }
        })
      ]);

      const cpuRows: any[] = await cpuResult.json();
      const requestRows: any[] = await requestsResult.json();

      // Convert CPU utilization (0.0-1.0) to a Core-hours approximation per day
      // CPU cores from os.cpus() is baked into the host-metrics collector.
      // A simpler approach: avg_utilization * 24h = Core-hrs (normalized to 1 core)
      const cpuFormatted = cpuRows.map(row => ({
        date: new Date(row.day).toISOString(),
        value: Number(row.avg_cpu_utilization) * 24  // utilization * hours = core-hrs
      }));

      // Requests are a simple count per day
      const requestsFormatted = requestRows.map(row => ({
        date: new Date(row.day).toISOString(),
        value: Number(row.request_count)
      }));

      // Total aggregates
      const totalCpuCoreHrs = cpuFormatted.reduce((sum, r) => sum + r.value, 0);
      const totalRequests = requestsFormatted.reduce((sum, r) => sum + r.value, 0);

      return reply.send({
        success: true,
        source: 'sdk', // So the frontend can show a badge like "via SDK"
        totals: {
          cpu: totalCpuCoreHrs,
          requests: totalRequests
        },
        usage: {
          // Shaped to match parseTimeSeries() expectations in the frontend
          cpu: {
            data: cpuFormatted.map(p => ({
              date: p.date,
              values: [{ date: p.date, value: p.value }],
              unit: 'core'
            }))
          },
          requests: {
            data: requestsFormatted.map(p => ({
              date: p.date,
              values: [{ date: p.date, value: p.value }],
              unit: 'count'
            }))
          }
        }
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to query SDK usage metrics');
      return reply.code(500).send({ error: 'Failed to query SDK metrics', details: err.message });
    }
  });
};
