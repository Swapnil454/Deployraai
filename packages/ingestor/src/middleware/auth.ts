import { FastifyRequest, FastifyReply } from 'fastify';

export async function validateProjectToken(req: FastifyRequest, reply: FastifyReply) {
  // Placeholder for token validation
  // Expecting token in Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    reply.status(401).send({ error: 'Missing Authorization header' });
    return;
  }
  
  // Attach auth context
  (req as any).auth = {
    projectId: 'demo-project-id',
    deployId: 'demo-deploy-id'
  };
}
