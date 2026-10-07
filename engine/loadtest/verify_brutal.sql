-- ============================================================
-- Brutal Soak Verification — 8-Type Equal-Split, 30s, 50min
-- ============================================================

-- 1. Monitor type distribution (must be ~12.5% each = 8 equal buckets)
SELECT
    monitor_type,
    COUNT(*)                                                            AS monitor_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2)                AS pct
FROM uptime_monitors
GROUP BY monitor_type
ORDER BY monitor_type;

-- 2. Interval distribution (all must be 30s only)
SELECT interval_seconds, COUNT(*) AS monitor_count
FROM uptime_monitors
GROUP BY interval_seconds
ORDER BY interval_seconds;

-- 3. Incident correctness by monitor type
--    Expected: down/timeout types → 1 incident per monitor. All others → 0.
SELECT
    m.monitor_type,
    COUNT(DISTINCT m.id)                                                          AS total_monitors,
    COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL)                              AS open_incidents,
    CASE WHEN m.monitor_type IN ('http','keyword','ping','port','heartbeat','dns','api','udp')
             AND m.tags[1] NOT IN ('down','timeout')
         THEN 0
         ELSE COUNT(DISTINCT m.id) END                                           AS expected_incidents,
    CASE
      WHEN COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL) =
           CASE WHEN m.tags[1] IN ('down','timeout') THEN COUNT(DISTINCT m.id) ELSE 0 END
      THEN 'PASS' ELSE 'FAIL'
    END AS verdict
FROM uptime_monitors m
LEFT JOIN uptime_incidents i ON i.monitor_id = m.id
GROUP BY m.monitor_type, m.tags[1]
ORDER BY m.monitor_type;

-- 4. Check throughput (per type, 50 min at 30s = 100 expected checks/monitor)
SELECT
    m.monitor_type,
    COUNT(DISTINCT m.id)                                                      AS monitors,
    SUM(dm.total_checks)                                                      AS total_checks,
    ROUND(SUM(dm.total_checks)::numeric / NULLIF(COUNT(DISTINCT m.id),0), 1) AS checks_per_monitor,
    100                                                                       AS expected_50min_30s,
    SUM(dm.successful_checks)                                                 AS ok_checks,
    ROUND(SUM(dm.successful_checks)*100.0 / NULLIF(SUM(dm.total_checks),0),2) AS success_pct,
    ROUND(SUM(dm.total_response_time_ms)::numeric / NULLIF(SUM(dm.successful_checks),0), 1) AS avg_latency_ms
FROM uptime_monitors m
LEFT JOIN uptime_daily_metrics dm ON dm.monitor_id = m.id
GROUP BY m.monitor_type
ORDER BY m.monitor_type;

-- 5. Fleet totals
SELECT
    COUNT(DISTINCT m.id)                                                       AS total_monitors,
    SUM(dm.total_checks)                                                       AS all_checks,
    SUM(dm.successful_checks)                                                  AS all_ok,
    ROUND(SUM(dm.successful_checks)*100.0 / NULLIF(SUM(dm.total_checks),0),2) AS success_pct,
    ROUND(SUM(dm.total_response_time_ms)::numeric / NULLIF(SUM(dm.successful_checks),0),1) AS avg_latency_ms,
    COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL)                           AS open_incidents,
    COUNT(i.id)                                                                AS ever_incidents
FROM uptime_monitors m
LEFT JOIN uptime_daily_metrics dm ON dm.monitor_id = m.id
LEFT JOIN uptime_incidents i ON i.monitor_id = m.id;

-- 6. False positive / negative analysis
SELECT 'False Positives (UP monitor got incident)' AS check_type,
       COUNT(*) AS count
FROM uptime_monitors m
JOIN uptime_incidents i ON i.monitor_id = m.id
WHERE m.tags[1] NOT IN ('down','timeout')
UNION ALL
SELECT 'False Negatives (DOWN/TIMEOUT monitor missed incident)',
       COUNT(DISTINCT m.id)
FROM uptime_monitors m
LEFT JOIN uptime_incidents i ON i.monitor_id = m.id AND i.resolved_at IS NULL
WHERE m.tags[1] IN ('down','timeout')
  AND i.id IS NULL;

-- 7. Real-site check results (not mock)
SELECT
    m.tags[1]  AS tag,
    m.url,
    dm.total_checks,
    dm.successful_checks,
    ROUND(dm.successful_checks*100.0/NULLIF(dm.total_checks,0),1) AS success_pct,
    ROUND(dm.total_response_time_ms::numeric/NULLIF(dm.successful_checks,0),0) AS avg_ms
FROM uptime_monitors m
LEFT JOIN uptime_daily_metrics dm ON dm.monitor_id = m.id
WHERE m.tags[1] LIKE 'real_%'
ORDER BY m.monitor_type, m.url
LIMIT 50;
