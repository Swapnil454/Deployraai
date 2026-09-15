import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'default',
});

async function seedAnalysis() {
  const projectId = '6aa6c88d397c2ec071a05583';
  const now = Date.now();
  const points = [];

  const endpoints = [
    { route: '/api/v1/users', method: 'GET', errorRate: 0.01, baseLatency: 50, runtime: 'node' },
    { route: '/api/v1/users', method: 'POST', errorRate: 0.05, baseLatency: 120, runtime: 'node' },
    { route: '/api/v1/products', method: 'GET', errorRate: 0.02, baseLatency: 30, runtime: 'edge' },
    { route: '/api/v1/checkout', method: 'POST', errorRate: 0.1, baseLatency: 300, runtime: 'edge' },
    { route: '/_next/image', method: 'GET', errorRate: 0.005, baseLatency: 15, runtime: 'edge' },
  ];

  // Insert data for the last 24 hours (1440 minutes), roughly 5 requests per minute per endpoint
  for (let i = 0; i < 24 * 60; i++) { 
    const ts = now - (i * 60 * 1000);

    for (const ep of endpoints) {
      // Simulate varying traffic
      const reqs = Math.floor(Math.random() * 10) + 1;
      
      for (let r = 0; r < reqs; r++) {
        const isError = Math.random() < ep.errorRate;
        const statusCode = isError ? 2 : 1; // OTel status code: 2 = ERROR, 1 = OK
        const httpStatus = isError ? (Math.random() > 0.5 ? '500' : '400') : '200';
        
        // Add some jitter to latency
        const latency = ep.baseLatency + (Math.random() * ep.baseLatency * 0.5);

        points.push({
          project_id: projectId,
          deploy_id: 'mock-deploy-id',
          trace_id: Math.random().toString(16).substring(2, 18),
          span_id: Math.random().toString(16).substring(2, 10),
          parent_span_id: '',
          name: ep.route,
          start_time: Math.floor(ts + (Math.random() * 60000)), // Random offset within the minute
          duration_ms: latency,
          status_code: statusCode,
          attributes: {
            'http.method': ep.method,
            'http.status_code': httpStatus,
            'runtime': ep.runtime
          },
          events: '[]'
        });
      }
    }
  }

  console.log(`Generating ${points.length} span data points for analysis dashboard...`);

  // Insert in batches of 5000
  for (let i = 0; i < points.length; i += 5000) {
    const batch = points.slice(i, i + 5000);
    await client.insert({
      table: 'spans',
      values: batch,
      format: 'JSONEachRow',
    });
    console.log(`Inserted batch ${i} to ${i + batch.length}`);
  }
  
  console.log('Successfully seeded mock analysis data!');
  process.exit(0);
}

seedAnalysis().catch(console.error);
