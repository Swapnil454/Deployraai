import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), 'packages/analytics-api/.env'), override: true });

async function run() {
  try {
    const { clickhouse } = await import('./packages/analytics-api/src/clickhouse.js');
    console.log("Seeding mock logs/traces...");
    
    const projectId = "6aa6c88d397c2ec071a05583";
    const now = new Date();
    
    const mockSpans = [];
    
    const endpoints = [
      { method: 'GET', url: '/api/users', status: '200', duration: 45 },
      { method: 'POST', url: '/api/auth/login', status: '200', duration: 120 },
      { method: 'GET', url: '/api/settings', status: '404', duration: 15 },
      { method: 'POST', url: '/api/checkout', status: '500', duration: 850 },
      { method: 'GET', url: '/api/products', status: '200', duration: 30 }
    ];

    for (let i = 0; i < 20; i++) {
      const ep = endpoints[i % endpoints.length];
      const traceId = 'trace-' + Math.random().toString(36).substring(2, 15);
      const spanId = 'span-' + Math.random().toString(36).substring(2, 10);
      const time = new Date(now.getTime() - i * 60000); // spread over last 20 mins
      
      const isError = ep.status === '500';

      mockSpans.push({
        project_id: projectId,
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: '',
        name: ep.method + ' ' + ep.url,
        start_time: time.toISOString().replace('T', ' ').substring(0, 19),
        end_time: new Date(time.getTime() + ep.duration).toISOString().replace('T', ' ').substring(0, 19),
        duration_ms: ep.duration,
        status_code: isError ? 2 : 1, // 2 = ERROR, 1 = OK
        attributes: {
          'http.method': ep.method,
          'http.url': 'https://api.example.com' + ep.url,
          'http.status_code': ep.status,
          'net.peer.ip': '192.168.1.' + (i % 255),
          'runtime': 'node'
        },
        events: isError ? JSON.stringify([{
          name: 'exception',
          timestamp: time.getTime() + 10,
          attributes: {
            'exception.message': 'Internal Server Error',
            'exception.stacktrace': 'Error: Internal Server Error\n    at /app/index.js:10:1'
          }
        }]) : '[]'
      });
    }

    await clickhouse.insert({
      table: 'spans',
      values: mockSpans,
      format: 'JSONEachRow'
    });

    console.log("Successfully seeded mock spans!");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
