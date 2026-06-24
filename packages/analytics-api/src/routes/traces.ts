import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const tracesRouter: FastifyPluginAsync = async (app) => {
  // Get a full trace (all spans with same trace_id)
  app.get('/:traceId', { preHandler: requireAuth }, async (req, reply) => {
    const { traceId } = req.params as { traceId: string };
    const { projectId } = req.query as any;

    const spans = await db.query(`
      SELECT
        span_id, parent_span_id, name,
        start_time, end_time, duration_ms,
        status_code, attributes, events
      FROM spans
      WHERE project_id = $1 AND trace_id = $2
      ORDER BY start_time
    `, [projectId, traceId]);

    // Build tree structure for the waterfall view
    const spanMap = new Map(spans.rows.map(s => [s.span_id, { ...s, children: [] as any[] }]));
    const roots: any[] = [];

    for (const span of spanMap.values()) {
      if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
        spanMap.get(span.parent_span_id)!.children.push(span);
      } else {
        roots.push(span);
      }
    }

    return { traceId, spans: roots };
  });
};
