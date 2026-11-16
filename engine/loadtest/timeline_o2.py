import subprocess
import csv
from datetime import datetime, timezone

def run_query(sql):
    cmd = ['docker', 'compose', '-f', '/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml', 'exec', '-T', 'pg15', 'psql', '-U', 'engine', '-d', 'uptimer_cv50k_prod', '-t', '-A', '-F', '\t', '-c', sql]
    res = subprocess.check_output(cmd).decode('utf-8')
    lines = [l.strip().split('\t') for l in res.strip().split('\n') if l.strip()]
    return lines

print("=== TIMELINE DETAILS FOR O2 ===")
sql_10 = """
SELECT i.monitor_id, m.url, i.started_at, i.cause 
FROM uptime_incidents i 
JOIN uptime_monitors m ON i.monitor_id = m.id 
WHERE i.started_at BETWEEN '2026-11-01 12:30:13' AND '2026-11-01 12:30:14';
"""
rows_10 = run_query(sql_10)
print(f"10 incidents at 12:30:13:")
for r in rows_10:
    print(f"  ID: {r[0]} | Target: {r[1]} | Started: {r[2]} | Cause: {r[3]}")

# Now let's scan /home/swapnil/final_crossverify_results/engine_O2.log for the first timeout after 12:30:12
print("\nScanning engine_O2.log for first timeout / slow error after 12:30:12 UTC (18:00:12 IST)...")
# Note: IST is UTC + 5:30. 12:30:12 UTC = 18:00:12 IST.
first_timeouts = []
with open('/home/swapnil/final_crossverify_results/engine_O2.log', 'r', errors='ignore') as f:
    for line in f:
        if '18:00:' in line or '18:01:' in line or '18:02:' in line:
            if 'timeout' in line.lower() or 'deadline' in line.lower() or 'context deadline' in line.lower():
                first_timeouts.append(line.strip())
                if len(first_timeouts) <= 10:
                    print("  Log line:", line.strip())

print(f"Total timeout lines logged around outage in engine_O2.log: {len(first_timeouts)}")
