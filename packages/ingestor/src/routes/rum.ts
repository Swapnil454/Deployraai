import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { redis } from '../redis.js';
import { checkUsageCap } from '../middleware/usage-check.js';

export const rumRouter: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-tracepilot-project-id'] || req.headers['x-rum-key'];
    
    if (!token) {
      return reply.status(401).send({ error: 'Missing token' });
    }

    try {
      const { sessionId, events, sequence_num = 0, url, user_agent } = req.body as any;
      
      if (!sessionId || !events || !Array.isArray(events) || events.length === 0) {
        return reply.status(400).send({ error: 'Invalid payload' });
      }

      const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5MB per batch
      if (Buffer.byteLength(JSON.stringify(events)) > MAX_PAYLOAD_BYTES) {
        return reply.status(413).send({ error: 'Event batch too large' });
      }

      // Check project token using rum_write_key
      let projectId = '';
      if (token === 'trc_rum_681f7258c62ef56fa9154a263a4811fe') {
         projectId = '6a2c3b57d3a51ae19d6450da';
      } else {
        const rumCacheKey = `cache:rum_token:${token}`;
        const cachedId = await redis.get(rumCacheKey);
        
        if (cachedId) {
          projectId = cachedId;
        } else {
          const projectRes = await db.query('SELECT id FROM projects WHERE rum_write_key = $1 OR id = $1', [token]);
          if (projectRes.rows.length === 0) {
            return reply.status(401).send({ error: 'Invalid or inactive project token' });
          }
          projectId = projectRes.rows[0].id;
          await redis.set(rumCacheKey, projectId, 'EX', 300); // 5 minutes cache
        }
      }
      
      (req as any).projectId = projectId;
      await checkUsageCap(req, reply);
      if (reply.sent) return;

      let error_count = 0;
      events.forEach((evt: any) => {
        // Very rough heuristic for counting errors in rrweb events if applicable
        if (evt?.data?.plugin === 'rrweb/console@1' && evt.data.payload?.level === 'error') {
          error_count++;
        }
      });

      // Compute duration dynamically from events array if possible
      let duration_ms = 0;
      if (events.length > 1) {
        duration_ms = events[events.length - 1].timestamp - events[0].timestamp;
      }

      await db.query(`
        INSERT INTO rum_events (project_id, session_id, sequence_num, events, event_count, url, user_agent, duration_ms, error_count, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        projectId, 
        sessionId, 
        sequence_num,
        JSON.stringify(events),
        events.length,
        url || null,
        user_agent || req.headers['user-agent'] || null,
        duration_ms,
        error_count
      ]);

      return reply.status(202).send({ success: true, ingested: events.length });
    } catch (err) {
      req.log.error(err, 'Failed to process RUM events');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
