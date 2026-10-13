-- ClickHouse telemetry table (local container)
-- Engine already uses this schema via metrics.go INSERT INTO uptime_telemetry
CREATE TABLE IF NOT EXISTS uptime_telemetry (
    monitor_id  UUID,
    ts          DateTime64(3, 'UTC') CODEC(DoubleDelta, ZSTD(1)),
    latency_us  UInt32 CODEC(T64, ZSTD(1)),
    status      UInt8 CODEC(ZSTD(1)),   -- 0=DOWN, 1=UP, 2=DEGRADED, 3=REAPED
    err_code    UInt8 CODEC(ZSTD(1)),   -- ErrClass enum; 255=reaped/timeout
    monitor_type UInt8 CODEC(ZSTD(1)),  -- 1=http, 2=keyword, 3=ping, 4=port, 5=heartbeat, 6=dns, 7=api, 8=udp
    probe_kind  UInt8 DEFAULT 0 CODEC(ZSTD(1)), -- 0=scheduled, 1=verification
    interval_s  UInt16 CODEC(ZSTD(1)),
    phase_kind  UInt8 DEFAULT 0 CODEC(ZSTD(1)),
    attempts    UInt8 DEFAULT 1 CODEC(ZSTD(1)),
    total_latency_us UInt32 DEFAULT 0 CODEC(T64, ZSTD(1)),
    reused      UInt8 DEFAULT 0 CODEC(ZSTD(1)),
    did_resume  UInt8 DEFAULT 0 CODEC(ZSTD(1)),
    req_method  UInt8 DEFAULT 0 CODEC(ZSTD(1)), -- 0=HEAD, 1=GET, 2=OTHER, 3=REAPER
    req_scheme  UInt8 DEFAULT 0 CODEC(ZSTD(1)), -- 0=HTTP, 1=HTTPS
    generation  UInt64 DEFAULT 0 CODEC(ZSTD(1))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (monitor_id, ts)
TTL toDateTime(ts) + INTERVAL 30 DAY
SETTINGS non_replicated_deduplication_window = 86400;

-- Analysis view for the test report
CREATE VIEW IF NOT EXISTS v_brutalsoak_summary AS
SELECT
    monitor_type,
    count()                                                    AS total_samples,
    countIf(status NOT IN (3))                                 AS exec_samples,
    countIf(status = 1)                                        AS ok_samples,
    countIf(status = 0)                                        AS fail_samples,
    countIf(status = 3)                                        AS reaped_samples,
    round(countIf(status = 1) * 100.0 / countIf(status != 3), 2) AS success_pct,
    round(avg(if(status != 3, latency_us, null)) / 1000, 1)   AS avg_latency_ms,
    round(quantile(0.50)(if(status != 3, latency_us, null)) / 1000, 1) AS p50_ms,
    round(quantile(0.95)(if(status != 3, latency_us, null)) / 1000, 1) AS p95_ms,
    round(quantile(0.99)(if(status != 3, latency_us, null)) / 1000, 1) AS p99_ms,
    max(if(status != 3, latency_us, 0)) / 1000                AS max_ms,
    round(sum(interval_s * 1.0) / count(), 1)                 AS avg_interval_s
FROM uptime_telemetry
GROUP BY monitor_type
ORDER BY monitor_type;
