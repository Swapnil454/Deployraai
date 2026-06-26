import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from '../db.js';
import { redis } from '../redis.js';

export async function validateProjectToken(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, process.env.INGESTOR_JWT_SECRET || 'secret') as any;
    
    // Check Redis Cache to avoid expensive bcrypt.compare on every request
    const cacheKey = `token:valid:${payload.projectId}`;
    const cached = await redis.get(cacheKey);

    if (!cached) {
      // Check against DB to ensure token wasn't regenerated (invalidated)
      const res = await db.query('SELECT token_hash FROM projects WHERE id = $1', [payload.projectId]);
      if (res.rows.length === 0) {
        reply.status(401).send({ error: 'Project not found' });
        return;
      }

      const isValid = await bcrypt.compare(token, res.rows[0].token_hash);
      if (!isValid) {
        reply.status(401).send({ error: 'Token has been revoked or is invalid' });
        return;
      }

      // Cache the validation success for 5 minutes
      await redis.set(cacheKey, '1', 'EX', 300);
    }

    // Attach auth context
    (req as any).auth = {
      projectId: payload.projectId,
      deployId: 'dynamic-deploy-id' // Could be extracted from headers if SDK passes it
    };
  } catch (err) {
    reply.status(401).send({ error: 'Invalid or expired token' });
    return;
  }
}
