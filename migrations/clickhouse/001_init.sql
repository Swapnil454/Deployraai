-- Raw samples, 30-day retention
CREATE TABLE IF NOT EXISTS uptime_telemetry
(
    monitor_id  UUID,
    ts          DateTime64(3, 'UTC') CODEC(DoubleDelta, ZSTD(1)),
    latency_us  UInt32               CODEC(T64, ZSTD(1)),  -- 0 when status = 0
    status      UInt8,               -- 1 = UP, 0 = DOWN, 2 = DEGRADED
    err_code    UInt8,               -- 0 ok, 1 timeout, 2 rst, 3 unreachable, 4 late
    probe_kind  UInt8,               -- 0 scheduled, 1 verification (5 s recheck)
    interval_s  UInt16,              -- effective interval that produced this sample (Phase 5)
    phase_kind  UInt8 DEFAULT 0,     -- 0 warm, 1 full, 2 warm_retry
    attempts    UInt8 DEFAULT 1,     -- attempt count (1 or 2)
    total_latency_us UInt32 DEFAULT 0, -- total latency across attempts (us)
    reused      UInt8 DEFAULT 0,     -- 0 new conn, 1 reused conn
    did_resume  UInt8 DEFAULT 0,     -- 0 full handshake, 1 TLS session resumed
    region      LowCardinality(String) DEFAULT 'default'
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(ts)
ORDER BY (monitor_id, ts)
TTL toDateTime(ts) + INTERVAL 30 DAY DELETE
SETTINGS ttl_only_drop_parts = 1,
         non_replicated_deduplication_window = 1000;   -- enables insert dedup on a single node

-- 5-minute rollup, kept 180 days. Hourly rollup is identical with toStartOfHour and TTL 2 years.
CREATE TABLE IF NOT EXISTS telemetry_5m
(
    monitor_id  UUID,
    bucket      DateTime('UTC'),
    probes      SimpleAggregateFunction(sum, UInt32),
    up_probes   SimpleAggregateFunction(sum, UInt32),
    total_s     SimpleAggregateFunction(sum, UInt64),   -- sum(interval_s)
    up_s        SimpleAggregateFunction(sum, UInt64),   -- sumIf(interval_s, status != 0)
    lat_sum_us  SimpleAggregateFunction(sum, UInt64),
    lat_min_us  SimpleAggregateFunction(min, UInt32),
    lat_max_us  SimpleAggregateFunction(max, UInt32),
    lat_q       AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), UInt32)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (monitor_id, bucket)
TTL bucket + INTERVAL 180 DAY DELETE
SETTINGS ttl_only_drop_parts = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_5m_mv TO telemetry_5m AS
SELECT
    monitor_id,
    toStartOfFiveMinutes(toDateTime(ts))               AS bucket,
    count()                                            AS probes,
    countIf(status != 0)                               AS up_probes,
    sum(interval_s)                                    AS total_s,
    sumIf(interval_s, status != 0)                     AS up_s,
    sumIf(latency_us, status != 0)                     AS lat_sum_us,
    minIf(latency_us, status != 0)                     AS lat_min_us,
    maxIf(latency_us, status != 0)                     AS lat_max_us,
    quantilesTDigestIfState(0.5, 0.95, 0.99)(latency_us, status != 0) AS lat_q
FROM uptime_telemetry
GROUP BY monitor_id, bucket;
