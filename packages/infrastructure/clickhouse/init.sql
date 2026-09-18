CREATE TABLE IF NOT EXISTS infrastructure_metrics (
  project_id String,
  timestamp DateTime64(3),
  metric_name String,
  metric_type String,
  host_name String,
  k8s_pod_name String,
  k8s_namespace_name String,
  container_name String,
  value Float64,
  attributes Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (project_id, metric_name, k8s_pod_name, timestamp);

CREATE TABLE IF NOT EXISTS infrastructure_metrics_1m (
  project_id String,
  minute DateTime,
  metric_name String,
  host_name String,
  k8s_pod_name String,
  k8s_namespace_name String,
  container_name String,
  avg_value AggregateFunction(avg, Float64),
  max_value AggregateFunction(max, Float64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(minute)
ORDER BY (project_id, metric_name, k8s_pod_name, minute);

CREATE MATERIALIZED VIEW IF NOT EXISTS infrastructure_metrics_1m_mv
TO infrastructure_metrics_1m
AS SELECT
  project_id,
  toStartOfInterval(timestamp, INTERVAL 1 minute) AS minute,
  metric_name,
  host_name,
  k8s_pod_name,
  k8s_namespace_name,
  container_name,
  avgState(value) AS avg_value,
  maxState(value) AS max_value
FROM infrastructure_metrics
GROUP BY project_id, minute, metric_name, host_name, k8s_pod_name, k8s_namespace_name, container_name;

CREATE TABLE IF NOT EXISTS logs (
  project_id String,
  deploy_id String,
  timestamp DateTime64(3),
  level String,
  message String,
  request_id String,
  region String,
  source String,
  attributes Map(String, String),
  raw String
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (project_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

CREATE TABLE IF NOT EXISTS spans (
  project_id String,
  deploy_id String,
  trace_id String,
  span_id String,
  parent_span_id String,
  name String,
  start_time DateTime64(3),
  duration_ms Float64,
  status_code Int32,
  attributes Map(String, String),
  events String,
  http_method String ALIAS coalesce(attributes['http.method'], attributes['http.request.method']),
  INDEX trace_id_idx trace_id TYPE bloom_filter GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(start_time)
ORDER BY (project_id, start_time, trace_id, span_id)
TTL toDateTime(start_time) + INTERVAL 30 DAY;

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
TTL timestamp + INTERVAL 7 DAY;

CREATE TABLE IF NOT EXISTS metrics_minutely_mv (
  project_id LowCardinality(String),
  deploy_id LowCardinality(String),
  route String,
  method LowCardinality(String),
  bucket DateTime,
  request_count SimpleAggregateFunction(sum, UInt64),
  error_count SimpleAggregateFunction(sum, UInt64),
  total_duration_ms SimpleAggregateFunction(sum, Float64),
  p99_duration_ms SimpleAggregateFunction(max, Float64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(bucket)
ORDER BY (project_id, deploy_id, route, method, bucket);

CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_minutely_mv_populator
TO metrics_minutely_mv
AS SELECT
  project_id,
  deploy_id,
  name AS route,
  coalesce(attributes['http.method'], attributes['http.request.method']) AS method,
  toStartOfMinute(start_time) AS bucket,
  toUInt64(count()) AS request_count,
  toUInt64(sum(status_code = 2)) AS error_count,
  toFloat64(sum(duration_ms)) AS total_duration_ms,
  toFloat64(quantile(0.99)(duration_ms)) AS p99_duration_ms
FROM spans
WHERE parent_span_id = ''
GROUP BY project_id, deploy_id, route, method, bucket;

CREATE TABLE IF NOT EXISTS project_spans_daily_mv (
  project_id LowCardinality(String),
  date Date,
  span_count SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date);

CREATE MATERIALIZED VIEW IF NOT EXISTS project_spans_daily_mv_populator
TO project_spans_daily_mv
AS SELECT
  project_id,
  toDate(start_time) AS date,
  toUInt64(count()) AS span_count
FROM spans
GROUP BY project_id, date;
