import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

export const logsStreamRouter: FastifyPluginAsync = async (app) => {
  app.get('/stream', async (req, reply) => {
    const { projectId } = req.query as any;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    // Polling for new logs every 2 seconds
    const interval = setInterval(async () => {
      try {
        const newLogs = await db.query(`
          SELECT * FROM logs
          WHERE project_id = $1 AND created_at > NOW() - INTERVAL '3 seconds'
          ORDER BY timestamp DESC
          LIMIT 50
        `, [projectId]);

        if (newLogs.rows.length > 0) {
          reply.raw.write(`data: ${JSON.stringify(newLogs.rows)}\n\n`);
        }
      } catch (err) {
        console.error('Error fetching stream logs:', err);
      }
    }, 2000);

    req.raw.on('close', () => clearInterval(interval));
  });
};
