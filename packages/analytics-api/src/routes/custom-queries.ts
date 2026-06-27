import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

interface CustomQueryRequest {
  projectId: string;
  dimensions: string[]; // e.g. ["http_route", "http_method"]
  metrics: string[]; // e.g. ["avg(duration_ms)"]
  timeRange: { from: string, to: string };
  filters?: { field: string, operator: string, value: string }[];
}

export const customQueriesRouter: FastifyPluginAsync = async (app) => {

  app.post('/metrics/query', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, dimensions, metrics, timeRange, filters } = req.body as CustomQueryRequest;
    
    // Safety check - we must constrain what users can query directly to prevent SQL injection
    // In production, we should validate 'dimensions' and 'metrics' against an allowlist.
    const allowedDimensions = ['http_route', 'http_method', 'status_code', 'deploy_id'];
    const allowedMetrics = ['count()', 'avg(duration_ms)', 'max(duration_ms)', 'quantile(0.99)(duration_ms)'];
    
    const safeDims = dimensions.filter(d => allowedDimensions.includes(d));
    const safeMetrics = metrics.filter(m => allowedMetrics.includes(m));

    if (safeMetrics.length === 0) {
      return reply.status(400).send({ error: 'At least one valid metric is required.' });
    }

    let queryStr = `SELECT `;
    if (safeDims.length > 0) {
      queryStr += safeDims.join(', ') + ', ';
    }
    
    queryStr += safeMetrics.map((m, i) => `${m} as m${i}`).join(', ');
    
    queryStr += ` FROM spans WHERE project_id = {projectId: String} `;
    queryStr += ` AND start_time BETWEEN parseDateTimeBestEffort({from: String}) AND parseDateTimeBestEffort({to: String})`;

    const queryParams: Record<string, any> = {
      projectId,
      from: timeRange.from,
      to: timeRange.to
    };

    if (filters && filters.length > 0) {
      for (let i = 0; i < filters.length; i++) {
        const f = filters[i];
        if (allowedDimensions.includes(f.field) && f.operator === '=') {
          queryStr += ` AND ${f.field} = {filterVal${i}: String}`;
          queryParams[`filterVal${i}`] = f.value;
        }
      }
    }

    if (safeDims.length > 0) {
      queryStr += ` GROUP BY ${safeDims.join(', ')}`;
    }
    
    queryStr += ` ORDER BY m0 DESC LIMIT 50`;

    try {
      const res = await clickhouse.query({
        query: queryStr,
        query_params: queryParams,
        format: 'JSONEachRow'
      });
      const data = await res.json<any[]>();
      return data;
    } catch (err: any) {
      req.log.error({ err }, 'Custom query failed');
      return reply.status(500).send({ error: 'Query execution failed', detail: err.message });
    }
  });
};
