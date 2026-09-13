import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'default',
});

async function seed() {
  const projectId = '6aa6c88d397c2ec071a05583';
  const now = Date.now();
  const points = [];

  const metrics = [
    { name: 'system.cpu.utilization', base: 45, variance: 30 },
    { name: 'system.memory.usage', base: 1024, variance: 256 },
    { name: 'network.io', base: 5000, variance: 3000 },
  ];

  const pods = ['api-pod-xyz', 'worker-pod-abc', 'frontend-pod-123'];

  // Insert data for the last 24 hours, 1 point per minute
  for (let i = 0; i < 24 * 60; i++) { 
    const ts = now - (i * 60 * 1000);
    for (const pod of pods) {
      for (const m of metrics) {
        // Add some noise
        const val = m.base + (Math.random() * m.variance * (Math.random() > 0.5 ? 1 : -1));
        
        // Ensure CPU maxes at 100, etc.
        let finalVal = Math.max(0, val);
        if (m.name === 'system.cpu.utilization') finalVal = Math.min(100, finalVal);

        points.push({
          project_id: projectId,
          timestamp: ts,
          metric_name: m.name,
          metric_type: 'gauge',
          host_name: 'node-us-east-1a',
          k8s_pod_name: pod,
          k8s_namespace_name: 'default',
          container_name: 'main-app',
          value: finalVal,
          attributes: {}
        });
      }
    }
  }

  console.log(`Generating ${points.length} data points...`);

  // Insert in batches of 10000
  for (let i = 0; i < points.length; i += 10000) {
    const batch = points.slice(i, i + 10000);
    await client.insert({
      table: 'infrastructure_metrics',
      values: batch,
      format: 'JSONEachRow',
    });
    console.log(`Inserted batch ${i} to ${i + batch.length}`);
  }
  
  console.log('Successfully seeded mock data into ClickHouse!');
  process.exit(0);
}

seed().catch(console.error);
