import subprocess
import csv
from datetime import datetime, timezone

def run_query(sql):
    cmd = ['docker', 'compose', '-f', '/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml', 'exec', '-T', 'pg15', 'psql', '-U', 'engine', '-d', 'uptimer_cv50k_prod', '-t', '-A', '-F', '\t', '-c', sql]
    res = subprocess.check_output(cmd).decode('utf-8')
    lines = [l.strip().split('\t') for l in res.strip().split('\n') if l.strip()]
    return lines

failing_monitors = []
with open('/home/swapnil/final_crossverify_results/deliberately_failing_monitors.txt') as f:
    reader = csv.DictReader(f)
    for r in reader:
        failing_monitors.append(r)

by_type = {}
for m in failing_monitors:
    by_type.setdefault(m['monitor_type'], []).append(m)

steady_start = datetime.fromisoformat("2026-11-01 13:06:04+00:00")

print("=== TABLE: 40 DELIBERATELY FAILING MONITORS DETECTION IN STEADY STATE ===")
print("Type       | Seeded | Detected | Min Delay (s) | Max Delay (s) | Mean Delay (s) | Detection Rate")
print("-----------|--------|----------|---------------|---------------|----------------|---------------")

for mtype in ['http', 'api', 'keyword', 'ping']:
    mon_list = by_type[mtype]
    id_in = ",".join([f"'{m['id']}'" for m in mon_list])
    sql = f"SELECT i.monitor_id, i.started_at, i.cause FROM uptime_incidents i WHERE i.monitor_id IN ({id_in}) AND i.started_at >= '2026-11-01 13:06:04' ORDER BY i.started_at;"
    rows = run_query(sql)
    
    first_detect = {}
    for r in rows:
        if len(r) < 3: continue
        mid, sat, cause = r[0], r[1], r[2]
        dt = datetime.fromisoformat(sat)
        delay = (dt - steady_start).total_seconds()
        if mid not in first_detect:
            first_detect[mid] = (delay, cause)
            
    delays = [v[0] for v in first_detect.values()]
    det_count = len(first_detect)
    min_d = min(delays) if delays else 0
    max_d = max(delays) if delays else 0
    avg_d = sum(delays)/len(delays) if delays else 0
    pct = (det_count / len(mon_list)) * 100
    print(f"{mtype:10} | {len(mon_list):6} | {det_count:8} | {min_d:13.2f} | {max_d:13.2f} | {avg_d:14.2f} | {pct:12.1f}%")

print("\n--- Individual Monitor Breakdown ---")
for mtype in ['http', 'api', 'keyword', 'ping']:
    print(f"\n--- {mtype.upper()} MONITORS ---")
    mon_list = by_type[mtype]
    id_in = ",".join([f"'{m['id']}'" for m in mon_list])
    sql = f"SELECT i.monitor_id, i.started_at, i.cause FROM uptime_incidents i WHERE i.monitor_id IN ({id_in}) AND i.started_at >= '2026-11-01 13:06:04' ORDER BY i.started_at;"
    rows = run_query(sql)
    first_detect = {}
    for r in rows:
        if len(r) < 3: continue
        mid, sat, cause = r[0], r[1], r[2]
        dt = datetime.fromisoformat(sat)
        delay = (dt - steady_start).total_seconds()
        if mid not in first_detect:
            first_detect[mid] = (delay, cause, sat)
    for m in mon_list:
        info = first_detect.get(m['id'])
        if info:
            print(f"ID: {m['id']} | Target: {m['target']} | Delay: {info[0]:.2f}s | StartedAt: {info[2]} | Cause: {info[1]}")
        else:
            print(f"ID: {m['id']} | Target: {m['target']} | NOT DETECTED")
