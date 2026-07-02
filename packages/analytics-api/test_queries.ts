import { db } from './src/db.js'; 

const run = async () => {
  const projectId = '6a2c3b57d3a51ae19d6450da';
  const intervalStr = '1 hour';
  const pgInterval = '24 hours';
  
  try {
    await db.query(`
        SELECT 
          date_trunc($1, start_time) as bucket,
          COALESCE(attributes->>'runtime', 'node') as runtime,
          COUNT(*) as volume
        FROM spans
        WHERE project_id = $2 
          AND (parent_span_id IS NULL OR parent_span_id = '')
          AND start_time >= NOW() - $3::interval
        GROUP BY bucket, runtime
        ORDER BY bucket ASC
      `, [intervalStr.split(' ')[1], projectId, pgInterval]);
    console.log('Query 1 OK');
  } catch (e: any) { console.error('Query 1 Failed:', e.message); }

  try {
    await db.query(`
        SELECT 
          COALESCE(attributes->>'http.status_code', CASE WHEN status_code = 2 THEN '500' ELSE '200' END) as code,
          COUNT(*) as count
        FROM spans
        WHERE project_id = $1 
          AND (parent_span_id IS NULL OR parent_span_id = '')
          AND start_time >= NOW() - $2::interval
        GROUP BY code
      `, [projectId, pgInterval]);
    console.log('Query 2 OK');
  } catch (e: any) { console.error('Query 2 Failed:', e.message); }

  try {
    await db.query(`
        SELECT 
          COALESCE(attributes->>'runtime', 'node') as runtime,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) as p90,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99,
          AVG(duration_ms) as avg_latency
        FROM spans
        WHERE project_id = $1 
          AND (parent_span_id IS NULL OR parent_span_id = '')
          AND start_time >= NOW() - $2::interval
        GROUP BY runtime
      `, [projectId, pgInterval]);
    console.log('Query 3 OK');
  } catch (e: any) { console.error('Query 3 Failed:', e.message); }

  try {
    await db.query(`
        SELECT 
          COALESCE(attributes->>'http.url', name) as endpoint,
          COALESCE(attributes->>'http.method', 'UNKNOWN') as method,
          AVG(duration_ms) as avg_latency,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) as p90_latency,
          COUNT(*) as hits
        FROM spans
        WHERE project_id = $1 
          AND (parent_span_id IS NULL OR parent_span_id = '')
          AND start_time >= NOW() - $2::interval
        GROUP BY endpoint, method
        ORDER BY p90_latency DESC NULLS LAST
        LIMIT 10
      `, [projectId, pgInterval]);
    console.log('Query 4 OK');
  } catch (e: any) { console.error('Query 4 Failed:', e.message); }

  try {
    await db.query(`
        SELECT 
          COALESCE(attributes->>'http.url', name) as endpoint,
          COALESCE(attributes->>'http.method', 'UNKNOWN') as method,
          COUNT(*) as error_count
        FROM spans
        WHERE project_id = $1 
          AND (parent_span_id IS NULL OR parent_span_id = '')
          AND start_time >= NOW() - $2::interval
          AND (status_code = 2 OR attributes->>'http.status_code' ~ '^5[0-9]{2}$')
        GROUP BY endpoint, method
        ORDER BY error_count DESC
        LIMIT 10
      `, [projectId, pgInterval]);
    console.log('Query 5 OK');
  } catch (e: any) { console.error('Query 5 Failed:', e.message); }
  
  process.exit(0);
}
run();
