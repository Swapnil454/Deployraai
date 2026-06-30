import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const sloRouter: FastifyPluginAsync = async (app) => {
  // GET /slo/:projectId
  app.get('/:projectId', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId } = req.params as any;

    const sloRes = await db.query(
      'SELECT id, name, type, target_percentage as target_percent, window_days, latency_threshold_ms FROM service_level_objectives WHERE project_id = $1',
      [projectId]
    );

    if (sloRes.rows.length === 0) {
      return { slos: [] };
    }

    // Utility to split array into chunks
    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const result: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
      }
      return result;
    };

    const results: any[] = [];
    const chunks = chunkArray(sloRes.rows, 5); // Max 5 parallel SLO evaluations

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(async (slo) => {
        const windowStartStr = new Date(Date.now() - slo.window_days * 24 * 60 * 60 * 1000).toISOString();
        let currentPerformance = 0;
        let totalBudget = 0;
        let consumedBudget = 0;
        let isNoData = false;

        try {
          if (slo.type === 'success_rate') {
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
            
            const chData = await chRes.json<any>();
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
          } else if (slo.type === 'uptime') {
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
          } else if (slo.type === 'latency') {
            const chRes = await clickhouse.query({
              query: `
                SELECT 
                  sum(request_count) as total_reqs,
                  sumIf(request_count, p99_duration_ms > {threshold: Int32}) as slow_reqs
                FROM metrics_minutely_mv
                WHERE project_id = {projectId: String} AND bucket >= parseDateTimeBestEffort({from: String})
              `,
              query_params: { projectId, from: windowStartStr, threshold: slo.latency_threshold_ms || 200 },
              format: 'JSONEachRow'
            });
            
            const chData = await chRes.json<any>();
            const totalReqs = parseInt((chData[0] as any)?.total_reqs || '0', 10);
            const slowReqs = parseInt((chData[0] as any)?.slow_reqs || '0', 10);

            if (totalReqs > 0) {
              currentPerformance = ((totalReqs - slowReqs) / totalReqs) * 100;
              totalBudget = Math.floor(totalReqs * (1 - slo.target_percent / 100));
              consumedBudget = slowReqs;
            } else {
              isNoData = true;
              currentPerformance = 100;
              totalBudget = 100;
              consumedBudget = 0;
            }
          }
        } catch (err: any) {
          // Clickhouse offline — show no_data
          isNoData = true;
          currentPerformance = 100;
          totalBudget = 100;
          consumedBudget = 0;
        }

        const remainingBudget = Math.max(0, totalBudget - consumedBudget);
        const budgetStatus = isNoData ? 'no_data' : remainingBudget > 0 ? 'healthy' : 'exhausted';
        const isMet = currentPerformance >= slo.target_percent;

        const burnRate = totalBudget > 0 ? (consumedBudget / totalBudget) : 0;
        const budgetExhaustionDays = burnRate > 0 ? Math.round(slo.window_days / burnRate) : null;

        return {
          id: slo.id,
          name: slo.name,
          type: slo.type,
          target: parseFloat(slo.target_percent),
          windowDays: slo.window_days,
          currentPerformance: parseFloat(currentPerformance.toFixed(3)),
          isMet,
          burnRate: parseFloat(burnRate.toFixed(2)),
          budgetExhaustionDays,
          budget: {
            total: totalBudget,
            consumed: consumedBudget,
            remaining: remainingBudget,
            status: budgetStatus
          }
        };
      }));
      results.push(...chunkResults);
    }

    return { slos: results };
  });
};
