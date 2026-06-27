import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const tracesRouter: FastifyPluginAsync = async (app) => {
  // Get list of traces (root spans) for a project
  app.get('/', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, method, statusCode, limit = 50, offset = 0 } = req.query as any;

    let query = `
      SELECT
        span_id, trace_id, parent_span_id, name,
        start_time, end_time, duration_ms,
        status_code, attributes, events
      FROM spans
      WHERE project_id = $1 AND parent_span_id IS NULL
    `;
    const params: any[] = [projectId];
    let p = 2;

    if (method) {
      // JSONB query to filter by http.method
      query += ` AND attributes->>'http.method' = $${p++}`;
      params.push(method.toUpperCase());
    }
    if (statusCode) {
      if (statusCode === 'ERROR') {
        query += ` AND status_code = 2`; // OTLP status code ERROR
      } else {
        query += ` AND attributes->>'http.status_code' = $${p++}`;
        params.push(statusCode);
      }
    }

    query += ` ORDER BY start_time DESC LIMIT $${p++} OFFSET $${p++}`;
    params.push(parseInt(limit), parseInt(offset));

    try {
      const result = await db.query(query, params);
      return { traces: result.rows, total: result.rowCount };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch traces');
      return reply.status(500).send({ error: 'Failed to fetch traces' });
    }
  });

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
