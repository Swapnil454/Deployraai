import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from '../db.js';
import { redis } from '../redis.js';

const pendingValidations = new Map<string, Promise<boolean>>();

export async function validateProjectToken(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  // SMOKE_TEST_TOKEN is strictly disabled in production to prevent unauthorized ingest.
  // It is only allowed in non-production environments for integration/smoke tests.
  if (authHeader === 'Bearer SMOKE_TEST_TOKEN') {
    if (process.env.NODE_ENV === 'production') {
      reply.status(401).send({ error: 'Smoke test tokens are disabled in production' });
      return;
    }
    (req as any).auth = { projectId: '6a2a42c1fda511a6d5eaa129', deployId: 'smoke' };
    return;
  }

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
      let isValid = false;
      const memoKey = `${payload.projectId}:${token}`;
      
      if (pendingValidations.has(memoKey)) {
        isValid = await pendingValidations.get(memoKey)!;
      } else {
        const validationPromise = (async () => {
          try {
            const res = await db.query('SELECT token_hash FROM projects WHERE id = $1', [payload.projectId]);
            if (res.rows.length === 0) return false;
            return await bcrypt.compare(token, res.rows[0].token_hash);
          } finally {
            pendingValidations.delete(memoKey);
          }
        })();
        
        pendingValidations.set(memoKey, validationPromise);
        isValid = await validationPromise;
      }

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
