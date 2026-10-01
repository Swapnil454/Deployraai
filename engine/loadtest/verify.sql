-- Monitor Counts
SELECT tags[1] AS tag_group, COUNT(*) AS monitor_count
FROM uptime_monitors
GROUP BY tags[1]
ORDER BY tag_group;

-- Sensitive False-Positive and Exact Match Check
SELECT m.tags[1] AS tag_group,
       COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL) AS open_incidents,
       COUNT(i.id) AS ever_incidents,
       CASE WHEN m.tags[1] IN ('up', '405') THEN 0
            ELSE COUNT(DISTINCT m.id) END as expected,
       CASE WHEN (COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL)) = 
                 (CASE WHEN m.tags[1] IN ('up', '405') THEN 0 ELSE COUNT(DISTINCT m.id) END)
             AND COUNT(i.id) = 
                 (CASE WHEN m.tags[1] IN ('up', '405') THEN 0 ELSE COUNT(DISTINCT m.id) END)
            THEN 'PASS' ELSE 'FAIL' END as status
FROM uptime_monitors m
LEFT JOIN uptime_incidents i ON i.monitor_id = m.id
GROUP BY m.tags[1]
ORDER BY tag_group;

-- Check Totals
SELECT 
  SUM(total_checks) as all_checks,
  SUM(successful_checks) as all_ok
FROM uptime_daily_metrics;
