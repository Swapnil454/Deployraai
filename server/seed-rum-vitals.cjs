const { Pool } = require('pg');
const { createClient } = require('@clickhouse/client');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/observability',
});

const clickhouse = createClient({
  url: 'http://localhost:8123',
  username: 'default',
  password: '',
  database: 'default',
});

const PROJECT_ID = '6aa6c88d397c2ec071a05583';

async function seed() {
  console.log(`Seeding RUM and Vitals data for Project ${PROJECT_ID}...`);

  try {
    // 1. Seed RUM Sessions (Postgres)
    const sessions = [];
    for (let i = 0; i < 20; i++) {
      const sessionId = crypto.randomUUID();
      const createdAt = new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000); // within last 24h
      const durationMs = Math.floor(Math.random() * 60000) + 1000;
      const errorCount = Math.random() > 0.8 ? 1 : 0;
      const url = `https://myapp.com/${['', 'dashboard', 'settings', 'login'][Math.floor(Math.random() * 4)]}`;
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/118.0.0.0 Safari/537.36';

      sessions.push([
        PROJECT_ID,
        sessionId,
        0,
        JSON.stringify([{ type: 'mock_rrweb_event' }]),
        1,
        url,
        userAgent,
        durationMs,
        errorCount,
        createdAt.toISOString()
      ]);
    }

    let valuesStr = [];
    let flatArgs = [];
    let idx = 1;
    for (const s of sessions) {
      valuesStr.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}::jsonb, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}::timestamptz)`);
      flatArgs.push(...s);
    }

    await db.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS event_count INTEGER DEFAULT 0`);

    await db.query(`
      INSERT INTO rum_events (project_id, session_id, sequence_num, events, event_count, url, user_agent, duration_ms, error_count, created_at)
      VALUES ${valuesStr.join(', ')}
    `, flatArgs);
    console.log(`Inserted ${sessions.length} RUM sessions.`);

    // 2. Seed Web Vitals (ClickHouse)
    const vitals = [];
    const metrics = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
    const routes = ['/', '/dashboard', '/settings', '/login'];

    for (let i = 0; i < 250; i++) {
      const metric = metrics[Math.floor(Math.random() * metrics.length)];
      let value = 0;
      if (metric === 'LCP') value = Math.random() * 3000 + 500; // 500 - 3500ms
      if (metric === 'INP') value = Math.random() * 400 + 10;   // 10 - 410ms
      if (metric === 'CLS') value = Math.random() * 0.3;        // 0 - 0.3
      if (metric === 'FCP') value = Math.random() * 2000 + 300; // 300 - 2300ms
      if (metric === 'TTFB') value = Math.random() * 1200 + 100; // 100 - 1300ms

      const route = routes[Math.floor(Math.random() * routes.length)];
      const startTime = Date.now() - Math.floor(Math.random() * 24 * 60 * 60 * 1000);

      vitals.push({
        project_id: PROJECT_ID,
        deploy_id: 'deploy_123',
        trace_id: crypto.randomBytes(16).toString('hex'),
        span_id: crypto.randomBytes(8).toString('hex'),
        parent_span_id: '',
        name: 'web-vitals',
        start_time: startTime,
        duration_ms: 0,
        status_code: 1,
        attributes: {
          'web.vital.name': metric,
          'web.vital.value': value.toString(),
          'http.route': route
        },
        events: '[]'
      });
    }

    await clickhouse.insert({
      table: 'spans',
      values: vitals,
      format: 'JSONEachRow'
    });
    console.log(`Inserted ${vitals.length} Web Vitals spans.`);

  } catch (err) {
    console.error(err);
  } finally {
    await db.end();
    await clickhouse.close();
  }
}

seed();
