import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { buildFlamegraphTrie, ProfileRow } from '../utils/trie.js';

interface FlamegraphQuery {
  projectId: string;
  serviceName: string;
  profileType?: string;
  startTime: string;
  endTime: string;
}

export const profilesRouter: FastifyPluginAsync = async (app) => {
  app.get('/flamegraph', {
    preHandler: requireAuth,
  }, async (req, reply) => {
    const { projectId, serviceName, profileType = 'cpu', startTime, endTime } = req.query as FlamegraphQuery;

    if (!serviceName || !startTime || !endTime) {
      return reply.status(400).send({ error: 'serviceName, startTime, and endTime are required' });
    }

    try {
      // Query Postgres to aggregate stack traces across the time window
      const query = `
        SELECT stack_trace, sum(value) as total_value
        FROM profiles
        WHERE project_id = $1
          AND service_name = $2
          AND profile_type = $3
          AND timestamp >= $4
          AND timestamp <= $5
        GROUP BY stack_trace
      `;

      const result = await db.query(query, [
        projectId,
        serviceName,
        profileType,
        startTime,
        endTime
      ]);

      const rows: ProfileRow[] = result.rows.map(row => ({
        stack_trace: row.stack_trace,
        total_value: Number(row.total_value) // pg sum() returns BigInt or string
      }));

      if (!rows || rows.length === 0) {
        return reply.status(200).send({
          name: 'root',
          value: 0
        });
      }

      const trie = buildFlamegraphTrie(rows);

      return reply.status(200).send(trie);
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to generate flamegraph', details: err.message });
    }
  });
};
