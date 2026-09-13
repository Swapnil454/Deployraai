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

  // Stable metrics resembling a typical healthy Render-style app
  const metrics = [
    { name: 'system.cpu.utilization', base: 12, spikeProbability: 0.05, spikeSize: 15 },
    { name: 'system.memory.usage', base: 450, spikeProbability: 0.02, spikeSize: 100 },
    { name: 'network.io', base: 120, spikeProbability: 0.1, spikeSize: 300 },
  ];

  const pods = ['api-pod-xyz', 'worker-pod-abc', 'frontend-pod-123'];

  // Clear old noisy data
  await client.exec({
    query: `ALTER TABLE infrastructure_metrics DELETE WHERE project_id = '${projectId}'`,
  });
  console.log('Cleared old noisy data.');

  // Insert data for the last 24 hours, 1 point per minute
  for (const pod of pods) {
    let currentCpu = 12 + Math.random() * 5;
    let currentMem = 450 + Math.random() * 50;
    let currentNet = 120 + Math.random() * 20;

    for (let i = 0; i < 24 * 60; i++) { 
      const ts = now - (i * 60 * 1000);

      // Random walk for very smooth, flat lines
      currentCpu += (Math.random() - 0.5) * 0.5;
      currentMem += (Math.random() - 0.5) * 2;
      currentNet += (Math.random() - 0.5) * 5;

      // Occasional spikes
      if (Math.random() < 0.01) currentCpu += 15 + Math.random() * 20;
      if (Math.random() < 0.01) currentNet += 300 + Math.random() * 500;

      // Normalize bounds
      currentCpu = Math.max(1, Math.min(100, currentCpu));
      currentMem = Math.max(100, currentMem);
      currentNet = Math.max(10, currentNet);

      points.push({
        project_id: projectId,
        timestamp: ts,
        metric_name: 'system.cpu.utilization',
        metric_type: 'gauge',
        host_name: 'node-us-east-1a',
        k8s_pod_name: pod,
        k8s_namespace_name: 'default',
        container_name: 'main-app',
        value: currentCpu,
        attributes: {}
      });

      points.push({
        project_id: projectId,
        timestamp: ts,
        metric_name: 'system.memory.usage',
        metric_type: 'gauge',
        host_name: 'node-us-east-1a',
        k8s_pod_name: pod,
        k8s_namespace_name: 'default',
        container_name: 'main-app',
        value: currentMem,
        attributes: {}
      });

      points.push({
        project_id: projectId,
        timestamp: ts,
        metric_name: 'network.io',
        metric_type: 'gauge',
        host_name: 'node-us-east-1a',
        k8s_pod_name: pod,
        k8s_namespace_name: 'default',
        container_name: 'main-app',
        value: currentNet,
        attributes: {}
      });
    }
  }

  console.log(`Generating ${points.length} smooth data points...`);

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
  
  console.log('Successfully seeded clean mock data!');
  process.exit(0);
}

seed().catch(console.error);
