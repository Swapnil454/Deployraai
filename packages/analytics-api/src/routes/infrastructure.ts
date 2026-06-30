import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';

export const infrastructureRouter: FastifyPluginAsync = async (app) => {
  app.get('/metrics', async (req, reply) => {
    const query = req.query as any;
    const { projectId } = query;

    const startTs = parseInt(query.start, 10);
    const endTs = parseInt(query.end, 10) || Date.now();
    const metrics = query.metrics ? query.metrics.split(',') : [];
    const groupBy = query.groupBy || 'k8s_pod_name'; // e.g. host_name, k8s_pod_name, container_name

    if (!projectId) {
      return reply.code(400).send({ error: 'projectId query parameter is required' });
    }
    if (!startTs || isNaN(startTs)) {
      return reply.code(400).send({ error: 'start timestamp required' });
    }
    if (metrics.length === 0) {
      return reply.code(400).send({ error: 'metrics parameter required (e.g. system.cpu.utilization)' });
    }

    // Dynamic routing: < 24h uses raw table, > 24h uses rollup table
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const useRollup = startTs < (Date.now() - ONE_DAY_MS);

    // Validate groupBy to prevent SQL injection
    const allowedGroupBy = ['host_name', 'k8s_pod_name', 'k8s_namespace_name', 'container_name'];
    const safeGroupBy = allowedGroupBy.includes(groupBy) ? groupBy : 'k8s_pod_name';

    try {
      let chQuery = '';
      
      if (useRollup) {
        chQuery = `
          SELECT 
            toStartOfInterval(minute, INTERVAL 1 minute) as time,
            metric_name,
            ${safeGroupBy} as group_val,
            avgMerge(avg_value) as avg_value,
            maxMerge(max_value) as max_value
          FROM infrastructure_metrics_1m
          WHERE project_id = {projectId:String}
            AND minute >= toDateTime({start:UInt64}/1000)
            AND minute <= toDateTime({end:UInt64}/1000)
            AND metric_name IN ({metrics:Array(String)})
          GROUP BY time, metric_name, group_val
          ORDER BY time ASC
        `;
      } else {
        chQuery = `
          SELECT 
            toStartOfInterval(timestamp, INTERVAL 1 minute) as time,
            metric_name,
            ${safeGroupBy} as group_val,
            avg(value) as avg_value,
            max(value) as max_value
          FROM infrastructure_metrics
          WHERE project_id = {projectId:String}
            AND timestamp >= toDateTime64({start:UInt64}/1000, 3)
            AND timestamp <= toDateTime64({end:UInt64}/1000, 3)
            AND metric_name IN ({metrics:Array(String)})
          GROUP BY time, metric_name, group_val
          ORDER BY time ASC
        `;
      }

      const result = await clickhouse.query({
        query: chQuery,
        format: 'JSONEachRow',
        query_params: {
          projectId,
          start: startTs,
          end: endTs,
          metrics
        }
      });

      const data = await result.json();
      return reply.send({ success: true, data, source: useRollup ? 'rollup' : 'raw' });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to query infrastructure metrics');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
};
