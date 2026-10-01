import { createClient } from '@clickhouse/client';

export const ch = createClient({
  url: process.env.UPTIMER_CLICKHOUSE_HTTP_URL || 'http://localhost:8123',
  username: process.env.UPTIMER_CLICKHOUSE_RO_USER || 'default',
  password: process.env.UPTIMER_CLICKHOUSE_RO_PASSWORD || '',
  request_timeout: 10000,
  compression: { response: true },
  clickhouse_settings: {
    readonly: '1',
    max_execution_time: 8,
    max_rows_to_read: '50000000',
    max_result_rows: '5000',
  },
});

export const chWrite = createClient({
  url: process.env.UPTIMER_CLICKHOUSE_HTTP_URL || 'http://localhost:8123',
  username: process.env.UPTIMER_CLICKHOUSE_RW_USER || 'default',
  password: process.env.UPTIMER_CLICKHOUSE_RW_PASSWORD || '',
  request_timeout: 10000,
  compression: { request: true },
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 0,
  },
});
