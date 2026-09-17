import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { redis } from '../redis.js';
import { checkUsageCap } from '../middleware/usage-check.js';
import { rumWriter, RumRecord } from '../writers/rum.js';
import jwt from 'jsonwebtoken';

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

      // Check project token: support both JWT tokens and raw rum_write_keys
      let projectId = '';
      try {
        const payload = jwt.decode(token) as any;
        if (payload && payload.projectId) {
          projectId = payload.projectId;
        }
      } catch (e) {
        // Not a JWT, ignore
      }

      if (!projectId) {
        const rumCacheKey = `cache:rum_token:${token}`;
        let cachedId = null;
        try {
          cachedId = await redis.get(rumCacheKey);
        } catch (e) {}

        if (cachedId) {
          projectId = cachedId;
        } else {
          // Wrap in try/catch to prevent Postgres UUID parse errors if token is randomly malformed
          try {
            const projectRes = await db.query('SELECT id FROM projects WHERE rum_write_key = $1 OR (id::text = $1)', [token]);
            if (projectRes.rows.length === 0) {
              return reply.status(401).send({ error: 'Invalid or inactive project token' });
            }
            projectId = projectRes.rows[0].id;
            await redis.set(rumCacheKey, projectId, 'EX', 300).catch(() => {});
          } catch (dbErr) {
            req.log.error(dbErr, 'DB Error querying RUM token');
            return reply.status(401).send({ error: 'Invalid project token format' });
          }
        }
      }
      
      (req as any).projectId = projectId;
      await checkUsageCap(req, reply);
      if (reply.sent) return;

      // Unblock SDK instantly
      reply.status(202).send({ success: true, ingested: events.length });

      // Run background processing
      const processRumAsync = async () => {
        try {
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

          const record: RumRecord = {
            projectId,
            sessionId,
            sequenceNum: sequence_num,
            events,
            eventCount: events.length,
            url: url || null,
            userAgent: user_agent || req.headers['user-agent'] || null,
            durationMs: duration_ms,
            errorCount: error_count,
            createdAt: new Date()
          };

          await rumWriter.write([record]);
        } catch (err) {
          req.log.error(err, 'Failed to background process RUM events');
        }
      };

      processRumAsync();

    } catch (err) {
      req.log.error(err, 'Failed to process RUM events');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
