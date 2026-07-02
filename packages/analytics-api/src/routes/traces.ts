import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const tracesRouter: FastifyPluginAsync = async (app) => {
  // Get list of traces (root spans) for a project
  app.get('/', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, method, statusCode, limit = 50, offset = 0 } = req.query as any;

    let query = `
      SELECT
        span_id, trace_id, parent_span_id, name,
        start_time, duration_ms,
        status_code, attributes, events
      FROM spans
      WHERE project_id = {projectId: String} AND parent_span_id = ''
    `;
    const params: any = { projectId, limit: parseInt(limit), offset: parseInt(offset) };

    if (method) {
      query += ` AND attributes['http.method'] = {method: String}`;
      params.method = method.toUpperCase();
    }
    if (statusCode) {
      if (statusCode === 'ERROR') {
        query += ` AND status_code = 2`; // OTLP status code ERROR
      } else {
        query += ` AND attributes['http.status_code'] = {statusCode: String}`;
        params.statusCode = statusCode.toString();
      }
    }

    query += ` ORDER BY start_time DESC LIMIT {limit: UInt32} OFFSET {offset: UInt32}`;

    try {
      const result = await clickhouse.query({
        query,
        query_params: params,
        format: 'JSONEachRow'
      });
      const rows = await result.json<any>();
      
      // Parse events back to objects since they are stored as JSON strings in CH
      const parsedRows = rows.map(r => ({
        ...r,
        events: r.events && r.events !== '[]' ? JSON.parse(r.events) : []
      }));

      // ClickHouse doesn't easily return rowCount in the same query as LIMIT/OFFSET without a second COUNT() query.
      // We will just return the array length or run a count if needed.
      return { traces: parsedRows, total: parsedRows.length }; // We skip exact total for now to avoid second query
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch traces');
      return reply.status(500).send({ error: 'Failed to fetch traces' });
    }
  });

  // Get a full trace (all spans with same trace_id)
  app.get('/:traceId', { preHandler: requireAuth }, async (req, reply) => {
    const { traceId } = req.params as { traceId: string };
    const { projectId } = req.query as any;

    try {
      const result = await clickhouse.query({
        query: `
          SELECT
            span_id, parent_span_id, name,
            start_time, duration_ms,
            status_code, attributes, events
          FROM spans
          WHERE project_id = {projectId: String} AND trace_id = {traceId: String}
          ORDER BY start_time ASC
          LIMIT 5000
        `,
        query_params: { projectId, traceId },
        format: 'JSONEachRow'
      });
      
      const rows = await result.json<any>();
      const parsedRows = rows.map(r => ({
        ...r,
        events: r.events && r.events !== '[]' ? JSON.parse(r.events) : []
      }));

      // Build tree structure for the waterfall view
      const spanMap = new Map(parsedRows.map(s => [s.span_id, { ...s, children: [] as any[] }]));
      const roots: any[] = [];

      for (const span of spanMap.values()) {
        if (span.parent_span_id && span.parent_span_id !== '' && spanMap.has(span.parent_span_id)) {
          spanMap.get(span.parent_span_id)!.children.push(span);
        } else {
          roots.push(span);
        }
      }

      return { traceId, spans: roots };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch trace');
      return reply.status(500).send({ error: 'Failed to fetch trace' });
    }
  });
};
