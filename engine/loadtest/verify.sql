-- ============================================================
-- Production Readiness Verification — 35k Monitor Loadtest
-- ============================================================

-- 1. Monitor distribution (matches seed expectations)
SELECT tags[1] AS tag_group,
       COUNT(*) AS monitor_count,
       ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS pct
FROM uptime_monitors
GROUP BY tags[1]
ORDER BY tag_group;

-- 2. Incident correctness (the critical pass/fail table)
--    Expected: down=all, timeout=all, up=0, 405=0, keyword=0
SELECT m.tags[1] AS tag_group,
       COUNT(DISTINCT m.id) AS total_monitors,
       COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL) AS open_incidents,
       COUNT(i.id) AS ever_incidents,
       CASE WHEN m.tags[1] IN ('up', '405', 'keyword') THEN 0
            ELSE COUNT(DISTINCT m.id) END AS expected_incidents,
       CASE
         WHEN (COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL)) =
              (CASE WHEN m.tags[1] IN ('up', '405', 'keyword') THEN 0 ELSE COUNT(DISTINCT m.id) END)
              AND COUNT(i.id) =
              (CASE WHEN m.tags[1] IN ('up', '405', 'keyword') THEN 0 ELSE COUNT(DISTINCT m.id) END)
         THEN 'PASS' ELSE 'FAIL'
       END AS status
FROM uptime_monitors m
LEFT JOIN uptime_incidents i ON i.monitor_id = m.id
GROUP BY m.tags[1]
ORDER BY tag_group;

-- 3. Check throughput (raw numbers from metrics)
SELECT
  SUM(total_checks) AS all_checks,
  SUM(successful_checks) AS all_ok,
  ROUND(SUM(successful_checks) * 100.0 / NULLIF(SUM(total_checks), 0), 2) AS success_rate_pct,
  ROUND(SUM(total_response_time_ms)::numeric / NULLIF(SUM(successful_checks), 0), 1) AS avg_latency_ms
FROM uptime_daily_metrics;

-- 4. Interval distribution (confirms varied intervals were loaded)
SELECT interval_seconds, COUNT(*) AS monitor_count
FROM uptime_monitors
GROUP BY interval_seconds
ORDER BY interval_seconds;

-- 5. Check rate per interval bucket (checks/monitor in 5 minutes)
SELECT
  m.interval_seconds,
  COUNT(DISTINCT m.id) AS monitors,
  SUM(dm.total_checks) AS total_checks,
  ROUND(SUM(dm.total_checks)::numeric / NULLIF(COUNT(DISTINCT m.id), 0), 1) AS checks_per_monitor,
  ROUND(300.0 / m.interval_seconds, 1) AS expected_checks_per_5min
FROM uptime_monitors m
LEFT JOIN uptime_daily_metrics dm ON dm.monitor_id = m.id
GROUP BY m.interval_seconds
ORDER BY m.interval_seconds;

-- 6. False positive / negative analysis
SELECT
  'False Positives (UP got incident)' AS check_type,
  COUNT(*) AS count
FROM uptime_monitors m
JOIN uptime_incidents i ON i.monitor_id = m.id
WHERE m.tags[1] IN ('up', '405', 'keyword')
UNION ALL
SELECT
  'False Negatives (DOWN missed incident)',
  COUNT(DISTINCT m.id)
FROM uptime_monitors m
LEFT JOIN uptime_incidents i ON i.monitor_id = m.id AND i.resolved_at IS NULL
WHERE m.tags[1] IN ('down', 'timeout')
  AND i.id IS NULL;
