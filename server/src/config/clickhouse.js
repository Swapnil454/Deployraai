import { createClient } from '@clickhouse/client';
import dotenv from 'dotenv';
dotenv.config({ override: true });

export const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'tracepilot'
});
