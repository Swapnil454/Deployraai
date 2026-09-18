import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const topologyRouter: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  
  app.get('/', async (req, reply) => {
    const { projectId } = req.query as { projectId: string };

    if (!projectId) {
      return reply.status(400).send({ error: 'Missing projectId' });
    }

    try {
      // Look at spans in the last hour
      // Using ClickHouse syntax with CTEs
      // WARNING: ClickHouse materializes CTEs differently than Postgres. 
      // At production scale (millions of spans/hour), this O(N^2) self-join will cause Memory Limit Exceeded (OOM).
      // ARCHITECTURE RECOMMENDATION: The ingestor pipeline MUST be refactored to pre-calculate 
      // edge relationships and write them directly into an AggregatingMergeTree (e.g. 'span_edges') 
      // to avoid querying and joining raw spans for topology generation.
      const nodesQuery = `
        SELECT 
          attributes['service.name'] as service_name,
          COUNT(*) as request_count,
          avg(duration_ms) as avg_latency_ms,
          sum(if(status_code = 2, 1, 0)) / COUNT(*) as error_rate
        FROM spans
        WHERE project_id = {projectId: String} 
          AND start_time > now() - INTERVAL 1 HOUR
          AND attributes['service.name'] != ''
        GROUP BY attributes['service.name']
      `;

      const nodesResult = await clickhouse.query({
        query: nodesQuery,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      const nodeRows = await nodesResult.json<any>();
      
      const nodesMap = new Map<string, { id: string, type: string, reqCount: number, errCount: number, totalLatency: number }>();
      
      for (const row of nodeRows) {
        nodesMap.set(row.service_name, {
          id: row.service_name,
          type: 'service',
          reqCount: Number(row.request_count),
          errCount: Number(row.request_count) * Number(row.error_rate),
          totalLatency: Number(row.request_count) * Number(row.avg_latency_ms)
        });
      }

      const query = `
        SELECT 
          source, 
          target,
          any(target_type) as target_type,
          sum(request_count) as request_count,
          sum(error_count) / max2(sum(request_count), 1) as error_rate,
          sum(total_duration_ms) / max2(sum(request_count), 1) as avg_latency_ms
        FROM topology_edges_1m
        WHERE project_id = {projectId: String}
          AND bucket >= now() - INTERVAL 1 HOUR
        GROUP BY source, target
      `;

      const result = await clickhouse.query({
        query,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      const rows = await result.json<any>();
      
      const edges = [];
      
      for (const row of rows) {
        const sourceId = row.source;
        const targetId = row.target;
        
        // We now safely rely on OpenTelemetry's db.system attribute directly from the query
        // instead of brittle javascript string-matching.
        const targetType = row.target_type || 'service';
        
        // Add target node if it doesn't exist (e.g. database)
        if (!nodesMap.has(targetId)) {
          nodesMap.set(targetId, { 
            id: targetId, 
            type: targetType, 
            reqCount: 0, 
            errCount: 0, 
            totalLatency: 0 
          });
        }
        
        // Accumulate stats for non-service nodes (like databases) from edges
        if (targetType === 'database') {
          const node = nodesMap.get(targetId)!;
          node.type = 'database';
          node.reqCount += Number(row.request_count);
          node.errCount += Number(row.request_count) * Number(row.error_rate);
          node.totalLatency += Number(row.request_count) * Number(row.avg_latency_ms);
        }

        // Add to source node if missing (fallback)
        if (!nodesMap.has(sourceId)) {
          nodesMap.set(sourceId, {
            id: sourceId,
            type: 'service',
            reqCount: Number(row.request_count),
            errCount: Number(row.request_count) * Number(row.error_rate),
            totalLatency: Number(row.request_count) * Number(row.avg_latency_ms)
          });
        }
        
        edges.push({
          id: `${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          data: {
            requestCount: Number(row.request_count),
            errorRate: Number(row.error_rate),
            avgLatency: Number(row.avg_latency_ms)
          }
        });
      }

      // Convert map to array and compute averages
      const nodes = Array.from(nodesMap.values()).map(n => ({
        id: n.id,
        type: 'serviceNode', // Custom React Flow node type
        data: {
          label: n.id,
          serviceType: n.type,
          errorRate: n.reqCount > 0 ? n.errCount / n.reqCount : 0,
          avgLatency: n.reqCount > 0 ? n.totalLatency / n.reqCount : 0,
          requestCount: n.reqCount
        }
      }));



      return { nodes, edges };
    } catch (err) {
      req.log.error({ err }, 'Failed to generate topology');
      return reply.status(500).send({ error: 'Failed to generate topology' });
    }
  });
};
