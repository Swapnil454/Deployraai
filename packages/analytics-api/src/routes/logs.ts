import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const logsRouter: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, level, search, requestId, from, to, limit = 100, offset = 0 } = req.query as any;
    // Cap at 500 to prevent memory exhaustion on large log tables
    const safeLimit = Math.min(parseInt(limit), 500);

    let query = `
      SELECT id, timestamp, level, message, request_id, region, deploy_id, source
      FROM logs
      WHERE project_id = $1
    `;
    const params: any[] = [projectId];
    let p = 2;

    if (level) { query += ` AND level = $${p++}`; params.push(level); }
    if (requestId) { query += ` AND request_id = $${p++}`; params.push(requestId); }
    if (from) { query += ` AND timestamp >= $${p++}`; params.push(new Date(from)); }
    if (to) { query += ` AND timestamp <= $${p++}`; params.push(new Date(to)); }

    // Full-text search on message (GIN index exists in init.sql)
    if (search) {
      query += ` AND to_tsvector('english', message) @@ plainto_tsquery('english', $${p++})`;
      params.push(search);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${p++} OFFSET $${p++}`;
    params.push(safeLimit, parseInt(offset));

    try {
      const result = await db.query(query, params);
      return { logs: result.rows, total: result.rowCount };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch logs');
      return reply.status(500).send({ error: 'Failed to fetch logs' });
    }
  });
};
