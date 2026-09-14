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
      const query = `
        WITH recent_spans AS (
          SELECT 
            span_id,
            parent_span_id,
            attributes['service.name'] as service_name,
            attributes['db.system'] as db_system,
            duration_ms,
            status_code
          FROM spans
          WHERE project_id = {projectId: String} 
            AND start_time > now() - INTERVAL 1 HOUR
            AND attributes['service.name'] != '' -- Predicate pushdown to drastically reduce CTE footprint
        ),
        edges AS (
          -- Edge type 1: Service to Service (parent-child relationship)
          SELECT 
            parent.service_name as source,
            child.service_name as target,
            'service' as target_type,
            child.duration_ms as duration_ms,
            child.status_code as status_code
          FROM recent_spans child
          JOIN recent_spans parent ON child.parent_span_id = parent.span_id
          WHERE child.service_name != '' 
            AND parent.service_name != child.service_name
            
          UNION ALL
          
          -- Edge type 2: Service to Database
          SELECT 
            service_name as source,
            db_system as target,
            'database' as target_type,
            duration_ms,
            status_code
          FROM recent_spans
          WHERE db_system != ''
        )
        SELECT 
          source, 
          target,
          any(target_type) as target_type,
          COUNT(*) as request_count,
          avg(duration_ms) as avg_latency_ms,
          sum(if(status_code = 2, 1, 0)) / COUNT(*) as error_rate
        FROM edges
        GROUP BY source, target
      `;

      const result = await clickhouse.query({
        query,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      const rows = await result.json<any>();
      
      const nodesMap = new Map<string, { id: string, type: string, reqCount: number, errCount: number, totalLatency: number }>();
      const edges = [];
      
      const addNodeStat = (id: string, type: string, count: number, errRate: number, avgLat: number) => {
        if (!nodesMap.has(id)) {
          nodesMap.set(id, { id, type, reqCount: 0, errCount: 0, totalLatency: 0 });
        }
        const node = nodesMap.get(id)!;
        node.reqCount += count;
        node.errCount += count * errRate;
        node.totalLatency += (avgLat * count);
        // Ensure type isn't downgraded from 'database' to 'service' if seen in multiple edges
        if (type === 'database') node.type = 'database';
      };

      for (const row of rows) {
        const sourceId = row.source;
        const targetId = row.target;
        
        // We now safely rely on OpenTelemetry's db.system attribute directly from the query
        // instead of brittle javascript string-matching.
        const targetType = row.target_type || 'service';
        
        addNodeStat(sourceId, 'service', Number(row.request_count), Number(row.error_rate), Number(row.avg_latency_ms));
        addNodeStat(targetId, targetType, Number(row.request_count), Number(row.error_rate), Number(row.avg_latency_ms));
        
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
