import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const logsRouter: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, level, search, requestId, from, to, limit = 100, offset = 0 } = req.query as any;
    // Cap at 500 to prevent memory exhaustion on large log tables
    const safeLimit = Math.min(parseInt(limit), 500);

    let query = `
      SELECT timestamp, level, message, request_id, region, deploy_id, source, raw
      FROM logs
      WHERE project_id = {projectId: String}
    `;
    const params: Record<string, any> = { projectId };

    if (level) { 
      query += ` AND level = {level: String}`; 
      params.level = level; 
    }
    if (requestId) { 
      query += ` AND request_id = {requestId: String}`; 
      params.requestId = requestId; 
    }
    if (from) { 
      query += ` AND timestamp >= {from: DateTime64(3)}`; 
      params.from = new Date(from).getTime(); 
    }
    if (to) { 
      query += ` AND timestamp <= {to: DateTime64(3)}`; 
      params.to = new Date(to).getTime(); 
    }

    // Full-text search on message (ClickHouse bloom filter on message_idx)
    if (search) {
      query += ` AND positionCaseInsensitive(message, {search: String}) > 0`;
      params.search = search;
    }

    query += ` ORDER BY timestamp DESC LIMIT {limit: UInt32} OFFSET {offset: UInt32}`;
    params.limit = safeLimit;
    params.offset = parseInt(offset);

    try {
      const resultSet = await clickhouse.query({
        query,
        query_params: params,
        format: 'JSONEachRow'
      });
      const rows = await resultSet.json();
      return { logs: rows, total: rows.length }; // Note: total is page size here since CH pagination count requires a second query
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch logs');
      return reply.status(500).send({ error: 'Failed to fetch logs' });
    }
  });
};
