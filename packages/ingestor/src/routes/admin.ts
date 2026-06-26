import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import crypto from 'crypto';

export const adminRouter: FastifyPluginAsync = async (app) => {
  app.post('/cleanup', async (req, reply) => {
    // Basic protection
    const token = req.headers.authorization || '';
    const expected = `Bearer ${process.env.ADMIN_SECRET || 'dev-admin-secret'}`;
    
    try {
      const tokenBuf = Buffer.from(token);
      const expectedBuf = Buffer.from(expected);
      if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    } catch(e) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      // Delete data older than 30 days
      const result = await db.query(`
        WITH deleted_spans AS (
          DELETE FROM spans
          WHERE start_time < NOW() - INTERVAL '30 days'
          RETURNING 1
        ),
        deleted_logs AS (
          DELETE FROM logs
          WHERE timestamp < NOW() - INTERVAL '30 days'
          RETURNING 1
        ),
        deleted_sourcemaps AS (
          DELETE FROM sourcemaps
          WHERE created_at < NOW() - INTERVAL '30 days'
          RETURNING 1
        )
        SELECT 
          (SELECT count(*) FROM deleted_spans) as spans_deleted,
          (SELECT count(*) FROM deleted_logs) as logs_deleted,
          (SELECT count(*) FROM deleted_sourcemaps) as sourcemaps_deleted
      `);

      return {
        success: true,
        spansDeleted: result.rows[0].spans_deleted,
        logsDeleted: result.rows[0].logs_deleted,
        sourcemapsDeleted: result.rows[0].sourcemaps_deleted
      };
    } catch (err) {
      req.log.error({ err }, 'Cleanup failed');
      return reply.status(500).send({ error: 'Cleanup failed' });
    }
  });
};
