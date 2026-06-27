import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

export const rumRouter: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-tracepilot-project-id'];
    
    if (!token) {
      return reply.status(401).send({ error: 'Missing token' });
    }

    try {
      const { sessionId, events } = req.body as any;
      
      if (!sessionId || !events || !Array.isArray(events) || events.length === 0) {
        return reply.status(400).send({ error: 'Invalid payload' });
      }

      // Check project token
      const projectRes = await db.query('SELECT id FROM projects WHERE id = $1 AND is_active = true', [token]);
      if (projectRes.rows.length === 0) {
        return reply.status(401).send({ error: 'Invalid or inactive project token' });
      }

      const projectId = projectRes.rows[0].id;

      // Store events in a basic rum_events table or as spans.
      // For simplicity we will store them as a JSON payload in rum_events.
      await db.query(`
        INSERT INTO rum_events (project_id, session_id, events, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [projectId, sessionId, JSON.stringify(events)]);

      return reply.status(202).send({ success: true, ingested: events.length });
    } catch (err) {
      req.log.error(err, 'Failed to process RUM events');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
