CREATE TABLE IF NOT EXISTS metrics_minutely_mv (
  project_id String,
  deploy_id String,
  route String,
  method String,
  bucket DateTime,
  request_count UInt64,
  error_count UInt64,
  total_duration_ms UInt64,
  p99_duration_ms SimpleAggregateFunction(max, UInt32)
) ENGINE = SummingMergeTree()
ORDER BY (project_id, deploy_id, bucket, route, method);

CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_minutely_mv_view 
TO metrics_minutely_mv AS
SELECT
  project_id,
  deploy_id,
  http_route AS route,
  http_method AS method,
  toStartOfMinute(start_time) AS bucket,
  toUInt64(count(status_code)) AS request_count,
  toUInt64(countIf(status_code >= 400)) AS error_count,
  toUInt64(sum(duration_ms)) AS total_duration_ms,
  toUInt32(quantile(0.99)(duration_ms)) AS p99_duration_ms
FROM spans
WHERE parent_span_id = '' AND http_method != ''
GROUP BY project_id, deploy_id, route, method, bucket;
