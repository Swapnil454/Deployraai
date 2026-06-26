// packages/ingestor/src/middleware/usage-check.ts
import { db } from '../db.js';

export async function checkUsageCap(req: any, reply: any) {
  const { projectId } = req.auth;
  const project = await db.query(
    'SELECT monthly_span_cap, plan FROM projects WHERE id = $1', [projectId]
  );
  
  if (!project.rows[0]) return;
  const { monthly_span_cap, plan } = project.rows[0];
  
  if (!monthly_span_cap) return; // no cap set — allow

  const used = await db.query(`
    SELECT COUNT(*) as count FROM spans
    WHERE project_id = $1 AND start_time > date_trunc('month', NOW())
  `, [projectId]);

  if (parseInt(used.rows[0].count) >= monthly_span_cap) {
    return reply.status(429).send({
      error: 'Monthly span limit reached. Upgrade your plan.',
      code: 'SPAN_LIMIT_EXCEEDED'
    });
  }
}
