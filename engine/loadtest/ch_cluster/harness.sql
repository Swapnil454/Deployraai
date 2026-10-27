
CREATE TABLE IF NOT EXISTS uptime_checks_telemetry_harness (
    
    monitor_id UUID CODEC(ZSTD(1)),
    checked_at DateTime64(3, 'UTC') CODEC(DoubleDelta, ZSTD(1)),
    status_code UInt16 CODEC(T64, ZSTD(1)),
    success UInt8 CODEC(T64, ZSTD(1)),
    response_time_ms UInt32 CODEC(T64, ZSTD(1)),
    error_message LowCardinality(String) CODEC(ZSTD(1)),
    location LowCardinality(String) CODEC(ZSTD(1)),
    suppressed_by_window_id Nullable(UUID) CODEC(ZSTD(1)),
    latency_us UInt32 CODEC(T64, ZSTD(1)),
    status UInt8 CODEC(ZSTD(1)),
    err_code UInt8 CODEC(ZSTD(1)),
    monitor_type UInt8 CODEC(ZSTD(1)),
    probe_kind UInt8 CODEC(ZSTD(1)),
    interval_s UInt16 CODEC(ZSTD(1)),
    phase_kind UInt8 CODEC(ZSTD(1)),
    attempts UInt8 CODEC(ZSTD(1)),
    total_latency_us UInt32 CODEC(T64, ZSTD(1)),
    reused UInt8 CODEC(ZSTD(1)),
    did_resume UInt8 CODEC(ZSTD(1)),
    req_method UInt8 CODEC(ZSTD(1)),
    req_scheme UInt8 CODEC(ZSTD(1)),
    generation UInt64 CODEC(ZSTD(1))
  
) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/uptime_checks_telemetry_harness_v1', '{replica}')
PARTITION BY toYYYYMMDD(checked_at)
ORDER BY (monitor_id, checked_at)
TTL toDateTime(checked_at) + INTERVAL 7 DAY DELETE
SETTINGS ttl_only_drop_parts = 1,
         min_bytes_for_wide_part = 10485760,
         replicated_deduplication_window = 5000,
         replicated_deduplication_window_seconds = 604800,
         index_granularity = 8192;

