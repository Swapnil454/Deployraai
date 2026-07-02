import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const issuesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/:projectId/:issueId/events', async (request, reply) => {
    const { projectId, issueId } = request.params as { projectId: string; issueId: string };
    
    // 1. Resolve issueId to fingerprint via Postgres
    const issueRes = await db.query(
      'SELECT fingerprint FROM issues WHERE id = $1 AND project_id = $2',
      [issueId, projectId]
    );

    if (issueRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Issue not found' });
    }

    const fingerprint = issueRes.rows[0].fingerprint;

    // 2. Fetch events from ClickHouse spans table
    const query = `
      SELECT span_id as id, start_time as occurred_at, attributes['session_id'] as session_id,
             trace_id, attributes['deployment.environment'] as environment,
             attributes['service.version'] as release, attributes['user.id'] as user_id
      FROM spans
      WHERE project_id = {projectId:String} 
        AND error_fingerprint = {fingerprint:String}
      ORDER BY start_time DESC
      LIMIT 50
    `;

    try {
      const result = await clickhouse.query({
        query,
        query_params: {
          projectId,
          fingerprint
        }
      });
      const rows = await result.json<{id: string, occurred_at: string, session_id: string, trace_id: string, environment: string, release: string, user_id: string}>();
      return reply.send(rows);
    } catch (err: any) {
      request.log.error(err, 'Failed to fetch issue events from ClickHouse');
      // If clickhouse is down, return empty array for resilience
      return reply.send([]);
    }
  });
};
