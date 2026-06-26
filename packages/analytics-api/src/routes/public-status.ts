import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

export const publicStatusRouter: FastifyPluginAsync = async (app) => {
  // This route has NO auth middleware — it's intentionally public
  app.get('/:slug', async (req, reply) => {
    // Add CDN cache header — this gets hammered during incidents
    reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    const project = await db.query(
      'SELECT id, name FROM projects WHERE slug = $1 AND status_page_enabled = true',
      [(req.params as any).slug]
    );
    
    if (!project.rows[0]) return reply.status(404).send();

    const { id, name } = project.rows[0];

    // 90-day daily uptime aggregated by region
    const uptime = await db.query(`
      SELECT
        date_trunc('day', checked_at) as day,
        region,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 399)
          / NULLIF(COUNT(*), 0), 2) as uptime_pct,
        ROUND(AVG(latency_ms)) as avg_latency_ms,
        COUNT(*) FILTER (WHERE status_code IS NULL OR status_code >= 500) as incidents
      FROM synthetic_checks
      WHERE project_id = $1 AND checked_at > NOW() - INTERVAL '90 days'
      GROUP BY day, region
      ORDER BY day DESC, region
    `, [id]);

    // Current status: majority-vote across regions in last 5 minutes
    const current = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 399) as healthy_regions,
        COUNT(*) as total_regions,
        AVG(latency_ms) as avg_latency_ms
      FROM (
        SELECT DISTINCT ON (region) region, status_code, latency_ms
        FROM synthetic_checks
        WHERE project_id = $1 AND checked_at > NOW() - INTERVAL '5 minutes'
        ORDER BY region, checked_at DESC
      ) latest_per_region
    `, [id]);

    const { healthy_regions, total_regions } = current.rows[0];
    const status = (healthy_regions >= Math.ceil(total_regions / 2)) || total_regions === 0 ? 'operational' : 'outage';

    return { 
      name, 
      status, 
      uptime: uptime.rows, 
      currentLatencyMs: current.rows[0]?.avg_latency_ms || 0 
    };
  });
};
