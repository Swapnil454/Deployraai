import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const billingRouter: FastifyPluginAsync = async (app) => {
  app.get('/usage/:projectId', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId } = req.params as any;
    
    const chRes = await clickhouse.query({
      query: `
        SELECT sum(request_count) as total_spans
        FROM metrics_minutely_mv
        WHERE project_id = {projectId: String}
          AND bucket >= toStartOfMonth(now())
      `,
      query_params: { projectId },
      format: 'JSONEachRow'
    });
    
    const data = await chRes.json<any[]>();
    const totalSpans = parseInt((data[0] as any)?.total_spans || '0', 10);
    
    // Define the free tier limit (e.g., 1,000,000 spans/month)
    const tierLimit = 1_000_000;
    
    return {
      currentSpans: totalSpans,
      tierLimit: tierLimit,
      usagePercent: Math.min(100, (totalSpans / tierLimit) * 100)
    };
  });
};
