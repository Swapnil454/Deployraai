import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const sloRouter: FastifyPluginAsync = async (app) => {
  // GET /slo/:projectId
  app.get('/:projectId', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId } = req.params as any;

    const sloRes = await db.query(
      'SELECT id, metric, target_percent, window_days FROM service_level_objectives WHERE project_id = $1',
      [projectId]
    );

    if (sloRes.rows.length === 0) {
      return { slos: [] };
    }

    const results = [];

    for (const slo of sloRes.rows) {
      const windowStartStr = new Date(Date.now() - slo.window_days * 24 * 60 * 60 * 1000).toISOString();
      let currentPerformance = 0;
      let totalBudget = 0;
      let consumedBudget = 0;

      let isNoData = false;

      if (slo.metric === 'success_rate') {
        const chRes = await clickhouse.query({
          query: `
            SELECT 
              sum(request_count) as req_count,
              sum(error_count) as err_count
            FROM metrics_minutely_mv
            WHERE project_id = {projectId: String} AND bucket >= parseDateTimeBestEffort({from: String})
          `,
          query_params: { projectId, from: windowStartStr },
          format: 'JSONEachRow'
        });
        
        const chData = await chRes.json<any[]>();
        const reqCount = parseInt((chData[0] as any)?.req_count || '0', 10);
        const errCount = parseInt((chData[0] as any)?.err_count || '0', 10);

        if (reqCount > 0) {
          currentPerformance = ((reqCount - errCount) / reqCount) * 100;
          totalBudget = Math.floor(reqCount * (1 - slo.target_percent / 100));
          consumedBudget = errCount;
        } else {
          isNoData = true;
          currentPerformance = 100;
          totalBudget = 100;
          consumedBudget = 0;
        }

      } else if (slo.metric === 'uptime') {
        const upRes = await db.query(`
          SELECT 
            COUNT(*) as total_checks,
            COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 399) as successful_checks
          FROM synthetic_checks
          WHERE project_id = $1 AND checked_at >= $2
        `, [projectId, new Date(windowStartStr)]);

        const total = parseInt(upRes.rows[0].total_checks, 10);
        const successful = parseInt(upRes.rows[0].successful_checks, 10);
        
        if (total > 0) {
          currentPerformance = (successful / total) * 100;
          totalBudget = Math.floor(total * (1 - slo.target_percent / 100));
          consumedBudget = total - successful;
        } else {
          isNoData = true;
          currentPerformance = 100;
          totalBudget = 100;
          consumedBudget = 0;
        }
      }

      const remainingBudget = Math.max(0, totalBudget - consumedBudget);
      const budgetStatus = isNoData ? 'no_data' : remainingBudget > 0 ? 'healthy' : 'exhausted';
      const isMet = currentPerformance >= slo.target_percent;

      results.push({
        id: slo.id,
        metric: slo.metric,
        target: parseFloat(slo.target_percent),
        windowDays: slo.window_days,
        currentPerformance: parseFloat(currentPerformance.toFixed(3)),
        isMet,
        budget: {
          total: totalBudget,
          consumed: consumedBudget,
          remaining: remainingBudget,
          status: budgetStatus
        }
      });
    }

    return { slos: results };
  });
};
