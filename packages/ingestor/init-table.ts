import { createClient } from '@clickhouse/client';

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'default',
});

async function run() {
  await clickhouse.command({
    query: `
      CREATE TABLE IF NOT EXISTS topology_edges_1m (
        project_id LowCardinality(String),
        bucket DateTime,
        source String,
        target String,
        target_type String,
        request_count SimpleAggregateFunction(sum, UInt64),
        error_count SimpleAggregateFunction(sum, Float64),
        total_duration_ms SimpleAggregateFunction(sum, Float64)
      ) ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMMDD(bucket)
      ORDER BY (project_id, bucket, source, target);
    `
  });
  console.log('topology_edges_1m created');
}

run().catch(console.error);
