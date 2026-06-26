-- ClickHouse spans table (for when you scale)
CREATE TABLE IF NOT EXISTS spans (
  project_id    String,
  deploy_id     String,
  trace_id      String,
  span_id       String,
  parent_span_id String DEFAULT '',
  name          String,
  start_time    DateTime64(3),
  duration_ms   UInt32,
  status_code   UInt8,
  http_method   String MATERIALIZED attributes['http.method'],
  http_route    String MATERIALIZED attributes['http.route'],
  http_status   UInt16 MATERIALIZED toUInt16OrZero(attributes['http.status_code']),
  attributes    Map(String, String),
  date          Date MATERIALIZED toDate(start_time)
) ENGINE = MergeTree()
PARTITION BY (project_id, toYYYYMM(start_time))
ORDER BY (project_id, start_time)
TTL date + INTERVAL 30 DAY;
