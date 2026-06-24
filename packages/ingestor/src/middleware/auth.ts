import { FastifyRequest, FastifyReply } from 'fastify';

import jwt from 'jsonwebtoken';

export async function validateProjectToken(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, process.env.INGESTOR_JWT_SECRET || 'secret') as any;
    
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
