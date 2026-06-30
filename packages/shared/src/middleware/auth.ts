import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Decode the userId from a JWT without re-verifying the signature.
 * The server has already verified the JWT before proxying here.
 * Falls back to treating the token as a raw userId for legacy/test cases.
 */
function extractUserIdFromToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return payload.userId || payload.sub || payload.id || null;
    } catch {
      // Not a valid JWT — fall through
    }
  }
  return token || null;
}

export function createRequireAuth(db: { query: (q: string, p?: any[]) => Promise<any> }) {
  return async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.replace('Bearer ', '').trim();
    } else if ((req.query as any)?.token) {
      token = (req.query as any).token.trim();
    }

    if (!token) {
      reply.status(401).send({ error: 'Missing Authorization header or token query parameter' });
      return;
    }

    const userId = extractUserIdFromToken(token);
    if (!userId) {
      reply.status(401).send({ error: 'Cannot extract user identity from token' });
      return;
    }

    (req as any).user = { userId };

    // Use body or query/params to find projectId
    const bodyObj = req.body as any;
    const projectId = (req.query as any)?.projectId || (req.params as any)?.projectId || bodyObj?.projectId;
    
    if (projectId) {
      try {
        const projRes = await db.query('SELECT team_id, user_id FROM projects WHERE id = $1', [projectId]);
        if (projRes.rows.length === 0) {
          reply.status(404).send({ error: 'Project not found' });
          return;
        }

        const { team_id: teamId, user_id: projectOwnerId } = projRes.rows[0];

        if (!teamId) {
          if (projectOwnerId !== userId) {
            reply.status(403).send({ error: 'Access denied: You do not own this project.' });
            return;
          }
          return;
        }

        const memberRes = await db.query(
          'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
          [teamId, userId]
        );

        if (memberRes.rows.length === 0) {
          reply.status(403).send({ error: "Access denied: You are not a member of this project's team." });
          return;
        }

        (req as any).user.role = memberRes.rows[0].role;
        (req as any).user.projectId = projectId; // Ensure unified access for downstream routes
      } catch (err: any) {
        req.log.error({ err }, 'Auth middleware DB error');
        reply.status(500).send({ error: String(err), stack: err.stack, message: err.message });
      }
    }
  }
}
