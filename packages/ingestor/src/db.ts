import { Pool } from 'pg';
import { clickhouse } from './clickhouse.js';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Connection pool sizing for production load
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initDb() {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        platform VARCHAR(255),
        token_hash TEXT,
        user_id VARCHAR(255),
        rum_write_key VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS rum_events (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        sequence_num INTEGER DEFAULT 0,
        events JSONB,
        url TEXT,
        user_agent TEXT,
        duration_ms INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Add missing columns if table already exists (safe migrations)
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS sequence_num INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS url TEXT`);
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS user_agent TEXT`);
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0`);
    
    // Custom Dashboards & Events
    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_dashboards (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        layout_json JSONB DEFAULT '[]',
        widgets_json JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_events (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        trace_id VARCHAR(255),
        event_name VARCHAR(255) NOT NULL,
        properties JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_custom_events_project_event ON custom_events(project_id, event_name, created_at DESC)`);
    
    // Create missing indexes for RUM events to prevent full table scans
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rum_events_project_time ON rum_events (project_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rum_events_session ON rum_events (session_id)`);
  } catch (err) {
    console.error('Failed to init Postgres tables', err);
  } finally {
    client.release();
  }

  // Init ClickHouse Tables
  try {
    // 1. Raw Data Table (7-day TTL)
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS infrastructure_metrics (
          project_id LowCardinality(String),
          timestamp DateTime64(3),
          metric_name LowCardinality(String), 
          metric_type LowCardinality(String),
          host_name LowCardinality(String) DEFAULT '',
          k8s_pod_name LowCardinality(String) DEFAULT '',
          k8s_namespace_name LowCardinality(String) DEFAULT '',
          container_name LowCardinality(String) DEFAULT '',
          value Float64,
          attributes Map(String, String), 
          INDEX idx_project_id project_id TYPE minmax GRANULARITY 1
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (project_id, metric_name, k8s_pod_name, host_name, timestamp)
        TTL timestamp + INTERVAL 7 DAY
      `
    });

    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS profiles (
          project_id LowCardinality(String),
          service_name LowCardinality(String),
          profile_type LowCardinality(String),
          timestamp DateTime64(3),
          stack_trace String,
          value UInt64,
          INDEX idx_project_id project_id TYPE minmax GRANULARITY 1
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (project_id, service_name, profile_type, timestamp)
        TTL timestamp + INTERVAL 7 DAY
      `
    });

    // 2. Rollup Table (30-day TTL)
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS infrastructure_metrics_1m (
          project_id LowCardinality(String),
          minute DateTime,
          metric_name LowCardinality(String), 
          host_name LowCardinality(String),
          k8s_pod_name LowCardinality(String),
          k8s_namespace_name LowCardinality(String),
          container_name LowCardinality(String),
          avg_value AggregateFunction(avg, Float64),
          max_value AggregateFunction(max, Float64)
        ) ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(minute)
        ORDER BY (project_id, metric_name, k8s_pod_name, host_name, minute)
        TTL minute + INTERVAL 30 DAY
      `
    });

    // 3. Materialized View to compute rollups
    await clickhouse.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS infrastructure_metrics_1m_mv 
        TO infrastructure_metrics_1m AS
        SELECT
          project_id,
          toStartOfMinute(timestamp) AS minute,
          metric_name,
          host_name,
          k8s_pod_name,
          k8s_namespace_name,
          container_name,
          avgState(value) AS avg_value,
          maxState(value) AS max_value
        FROM infrastructure_metrics
        GROUP BY project_id, minute, metric_name, host_name, k8s_pod_name, k8s_namespace_name, container_name
      `
    });
  } catch (err) {
    console.error('Failed to init ClickHouse infrastructure metrics tables', err);
  }
}

db.on('error', (err) => {
  // Log but don't exit — pg Pool will auto-reconnect on the next query
  console.error('Unexpected error on idle DB client (will auto-reconnect):', err.message);
});
