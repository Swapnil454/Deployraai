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
ORDER BY (project_id, timestamp);
