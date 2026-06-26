import { FastifyRequest, FastifyReply } from 'fastify';

import { db } from '../db.js';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    reply.status(401).send({ error: 'Missing Authorization header' });
    return;
  }
  
  // For the sake of this phase, extract the user_id from the Bearer token simply 
  // (In a real app, this would be a JWT verification)
  const userId = authHeader.replace('Bearer ', '').trim();
  
  if (!userId) {
    reply.status(401).send({ error: 'Invalid Authorization header' });
    return;
  }

  (req as any).user = { userId };

  // RBAC Team Scoping: If a projectId is requested, verify team membership
  const projectId = (req.query as any)?.projectId || (req.params as any)?.projectId;
  if (projectId) {
    // 1. Get project's team
    const projRes = await db.query('SELECT team_id FROM projects WHERE id = $1', [projectId]);
    if (projRes.rows.length === 0) {
      reply.status(404).send({ error: 'Project not found' });
      return;
    }
    const teamId = projRes.rows[0].team_id;

    // 2. If it's a legacy project without a team, allow access (or could block depending on migration state)
    if (!teamId) {
       // Legacy check: fallback to checking if user_id matches
       const legacyRes = await db.query('SELECT user_id FROM projects WHERE id = $1', [projectId]);
       if (legacyRes.rows[0].user_id !== userId) {
         reply.status(403).send({ error: 'Access denied: You do not own this legacy project.' });
         return;
       }
       return;
    }

    // 3. Verify membership in the team
    const memberRes = await db.query(
      'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId]
    );

    if (memberRes.rows.length === 0) {
      reply.status(403).send({ error: 'Access denied: You are not a member of this project\'s team.' });
      return;
    }

    (req as any).user.role = memberRes.rows[0].role;
  }
}
