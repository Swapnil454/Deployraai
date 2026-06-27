import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

export const tracesStreamRouter: FastifyPluginAsync = async (app) => {
  app.get('/stream', async (req, reply) => {
    const { projectId } = req.query as any;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    // Ensure we handle CORS correctly for stream
    reply.raw.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');

    // Send an initial heartbeat
    reply.raw.write(':\n\n');

    // We'll keep track of the last checked timestamp to only fetch new spans
    let lastChecked = new Date();

    const interval = setInterval(async () => {
      try {
        const newTraces = await db.query(`
          SELECT
            span_id, trace_id, parent_span_id, name,
            start_time, end_time, duration_ms,
            status_code, attributes, events
          FROM spans
          WHERE project_id = $1 AND (parent_span_id IS NULL OR parent_span_id = '') AND start_time > $2
          ORDER BY start_time DESC
          LIMIT 50
        `, [projectId, lastChecked]);

        if (newTraces.rows.length > 0) {
          reply.raw.write(`data: ${JSON.stringify(newTraces.rows)}\n\n`);
          lastChecked = new Date(); // update only when we've processed up to this point
        }
      } catch (err) {
        console.error('Error fetching stream traces:', err);
      }
    }, 2000);

    req.raw.on('close', () => clearInterval(interval));
  });
};
