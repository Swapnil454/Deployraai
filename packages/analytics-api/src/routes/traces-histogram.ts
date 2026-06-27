import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

export const tracesHistogramRouter: FastifyPluginAsync = async (app) => {
  app.get('/histogram', async (req, reply) => {
    const { projectId } = req.query as any;

    try {
      // Group traces by 1-minute intervals over the last hour
      const result = await db.query(`
        SELECT
          date_trunc('minute', start_time) as bucket,
          COUNT(*) as volume,
          AVG(duration_ms) as avg_latency,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) as p90,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99,
          SUM(CASE WHEN status_code = 2 THEN 1 ELSE 0 END) as errors
        FROM spans
        WHERE project_id = $1 AND (parent_span_id IS NULL OR parent_span_id = '') AND start_time > NOW() - INTERVAL '1 hour'
        GROUP BY bucket
        ORDER BY bucket ASC
      `, [projectId]);

      return { histogram: result.rows };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch histogram');
      return reply.status(500).send({ error: 'Failed to fetch histogram' });
    }
  });
};
