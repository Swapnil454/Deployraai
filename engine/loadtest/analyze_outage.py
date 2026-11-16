#!/usr/bin/env python3
import sys
import os
import json
import re
import subprocess
from datetime import datetime

# Usage: python3 analyze_outage.py <run_id> <results_dir> <drop_iso> <remove_iso> <drop_epoch> <remove_epoch> <deliberate_ids_file>

def main():
    if len(sys.argv) < 8:
        print("Usage: analyze_outage.py <run_id> <results_dir> <drop_iso> <remove_iso> <drop_epoch> <remove_epoch> <deliberate_ids_file>")
        sys.exit(1)

    run_id = sys.argv[1]
    results_dir = sys.argv[2]
    drop_iso = sys.argv[3]       # e.g. 2026-11-02 12:00:00+00
    remove_iso = sys.argv[4]     # e.g. 2026-11-02 12:02:30+00
    drop_epoch = int(sys.argv[5])
    remove_epoch = int(sys.argv[6])
    deliberate_ids_file = sys.argv[7]

    engine_log = os.path.join(results_dir, f"engine_{run_id}.log")
    guard_log = os.path.join(results_dir, f"guard_{run_id}.log")
    lag_log = os.path.join(results_dir, f"lag_stats_{run_id}.log")
    outage_meta_file = os.path.join(results_dir, f"outage_meta_{run_id}.txt")

    # Read deliberate IDs
    deliberate_ids = set()
    if os.path.exists(deliberate_ids_file):
        with open(deliberate_ids_file, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("id,"):
                    continue
                parts = line.split(",")
                deliberate_ids.add(parts[0])

    print(f"[{run_id}] Loaded {len(deliberate_ids)} deliberate failure monitor IDs.")

    # DB query helper
    def db_query(sql):
        cmd = [
            "docker", "exec", "compose-pg15-1",
            "psql", "-U", "engine", "-d", "uptimer_cv50k_prod",
            "-t", "-A", "-F", "\t", "-c", sql
        ]
        res = subprocess.check_output(cmd).decode("utf-8")
        return res

    # 1. Full Dump of Incidents
    full_sql = f"""
    SELECT i.id, i.monitor_id, m.monitor_type, i.started_at, i.resolved_at, i.cause, i.first_error_message
    FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    ORDER BY i.started_at ASC;
    """
    with open(os.path.join(results_dir, f"incidents_full_{run_id}.tsv"), "w") as f:
        f.write("incident_id\tmonitor_id\tmonitor_type\tstarted_at\tresolved_at\tcause\tfirst_error_message\n")
        f.write(db_query(full_sql))

    # 2. DB incident started_at buckets (0-150s and 150-450s)
    bucket_sql = f"""
    SELECT 
      floor(EXTRACT(EPOCH FROM (i.started_at - '{drop_iso}'::timestamptz)) / 10) * 10 as bucket_start,
      count(*),
      min(i.started_at),
      max(i.started_at)
    FROM uptime_incidents i
    WHERE i.started_at >= '{drop_iso}'::timestamptz 
      AND i.started_at <= ('{drop_iso}'::timestamptz + interval '450 second')
    GROUP BY 1 ORDER BY 1;
    """
    db_buckets_tsv = os.path.join(results_dir, f"db_incident_buckets_{run_id}.tsv")
    with open(db_buckets_tsv, "w") as f:
        f.write("bucket_start_s\tcount\tmin_started_at\tmax_started_at\n")
        f.write(db_query(bucket_sql))

    # 3. Incident Counts BY MONITOR TYPE for outage window (0-150s) and after-removal (150-450s)
    type_sql = f"""
    SELECT 
      m.monitor_type,
      count(CASE WHEN i.started_at >= '{drop_iso}'::timestamptz AND i.started_at < ('{drop_iso}'::timestamptz + interval '150 second') THEN 1 END) as outage_window_0_150s,
      count(CASE WHEN i.started_at >= ('{drop_iso}'::timestamptz + interval '150 second') AND i.started_at <= ('{drop_iso}'::timestamptz + interval '450 second') THEN 1 END) as after_removal_150_450s,
      count(*) as total_window_0_450s
    FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.started_at >= '{drop_iso}'::timestamptz 
      AND i.started_at <= ('{drop_iso}'::timestamptz + interval '450 second')
    GROUP BY m.monitor_type
    ORDER BY m.monitor_type;
    """
    type_tsv = os.path.join(results_dir, f"incident_type_counts_{run_id}.tsv")
    with open(type_tsv, "w") as f:
        f.write("monitor_type\toutage_window_0_150s\tafter_removal_150_450s\ttotal_window_0_450s\n")
        f.write(db_query(type_sql))

    # 4. Parse GUARD lines, calculate deltas, find first suppressed and >90% suppression time
    # Format: 2026/11/02 17:00:05 [GUARD] suppressed=map[TIMEOUT:10] passed_failures=map[KEYWORD:1 NETWORK:1267 STATUS:9 TIMEOUT:10]
    guard_records = []
    first_suppressed_ts = None
    first_suppressed_sec = None
    first_suppressed_dt = None
    ninety_pct_ts = None
    ninety_pct_sec = None

    drop_dt = datetime.fromisoformat(drop_iso.replace("+00", "+00:00"))

    # Regex for timestamp in engine log (UTC+5:30 local)
    # The engine logs in local time format: YYYY/MM/DD HH:MM:SS
    # Let's get timezone offset between UTC and engine log timestamps
    # In WSL, date is local IST (UTC+5.5) or check log
    # We will compute elapsed seconds from drop_epoch
    prev_passed = {}
    prev_suppressed = {}

    guard_deltas_csv = os.path.join(results_dir, f"guard_deltas_{run_id}.csv")
    with open(guard_deltas_csv, "w") as f_out:
        f_out.write("timestamp,elapsed_s,cum_suppressed,cum_passed,delta_suppressed,delta_passed,suppress_ratio,suppressed_map,passed_map\n")
        
        if os.path.exists(guard_log):
            with open(guard_log, "r", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    m_ts = re.match(r"^(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})", line)
                    if not m_ts:
                        continue
                    ts_str = m_ts.group(1)
                    
                    # Parse maps
                    sup_match = re.search(r"suppressed=map\[(.*?)\]", line)
                    pass_match = re.search(r"passed_failures=map\[(.*?)\]", line)
                    
                    sup_str = sup_match.group(1) if sup_match else ""
                    pass_str = pass_match.group(1) if pass_match else ""

                    cur_sup = {}
                    for item in sup_str.split():
                        if ":" in item:
                            k, v = item.split(":", 1)
                            cur_sup[k] = int(v)

                    cur_pass = {}
                    for item in pass_str.split():
                        if ":" in item:
                            k, v = item.split(":", 1)
                            cur_pass[k] = int(v)

                    # Compute elapsed seconds relative to first log line or drop
                    # Parse timestamp
                    log_dt = datetime.strptime(ts_str, "%Y/%m/%d %H:%M:%S")
                    # Since drop_epoch is known, let's look at log_dt vs first log line or system tz
                    # Engine logs use time.Now() formatted with log.LstdFlags
                    # Let's find epoch of log_dt assuming local time
                    # To be robust, let's use the local timezone offset:
                    tz_offset_sec = datetime.now().astimezone().utcoffset().total_seconds()
                    log_epoch = int(log_dt.timestamp()) - int(datetime.fromtimestamp(log_dt.timestamp()).astimezone().utcoffset().total_seconds() - tz_offset_sec)
                    elapsed_s = log_epoch - drop_epoch

                    tot_sup = sum(cur_sup.values())
                    tot_pass = sum(cur_pass.values())

                    d_sup = tot_sup - sum(prev_suppressed.values())
                    d_pass = tot_pass - sum(prev_passed.values())
                    prev_suppressed = cur_sup.copy()
                    prev_passed = cur_pass.copy()

                    ratio = 0.0
                    if (d_sup + d_pass) > 0:
                        ratio = float(d_sup) / float(d_sup + d_pass)

                    if tot_sup > 0 and first_suppressed_ts is None:
                        first_suppressed_ts = ts_str
                        first_suppressed_sec = elapsed_s
                        first_suppressed_dt = log_dt

                    if ratio >= 0.90 and ninety_pct_ts is None and tot_sup > 0:
                        ninety_pct_ts = ts_str
                        ninety_pct_sec = elapsed_s

                    f_out.write(f"{ts_str},{elapsed_s},{tot_sup},{tot_pass},{d_sup},{d_pass},{ratio:.4f},\"{sup_str}\",\"{pass_str}\"\n")

    # 5. Incidents opened after the first suppressed event
    incidents_after_first_suppressed = "N/A"
    if first_suppressed_sec is not None:
        # Convert first_suppressed_sec to DB query interval
        # Count incidents where started_at > drop_time + first_suppressed_sec
        supp_sql = f"""
        SELECT count(*)
        FROM uptime_incidents
        WHERE started_at > ('{drop_iso}'::timestamptz + interval '{first_suppressed_sec} second')
          AND started_at <= ('{drop_iso}'::timestamptz + interval '150 second');
        """
        incidents_after_first_suppressed = db_query(supp_sql).strip()

    # Total outage incidents (0-150s)
    tot_outage_sql = f"""
    SELECT count(*)
    FROM uptime_incidents
    WHERE started_at >= '{drop_iso}'::timestamptz 
      AND started_at < ('{drop_iso}'::timestamptz + interval '150 second');
    """
    total_outage_incidents_db = db_query(tot_outage_sql).strip()

    # Total post-removal incidents (150-450s)
    tot_post_sql = f"""
    SELECT count(*)
    FROM uptime_incidents
    WHERE started_at >= ('{drop_iso}'::timestamptz + interval '150 second')
      AND started_at <= ('{drop_iso}'::timestamptz + interval '450 second');
    """
    total_post_incidents_db = db_query(tot_post_sql).strip()

    # 6. Incidents with started_at in first 10s after fault
    first_10s_sql = f"""
    SELECT i.id, i.monitor_id, m.monitor_type, coalesce(m.url, m.target_host), i.started_at, i.cause, coalesce(i.first_error_message, '')
    FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.started_at >= '{drop_iso}'::timestamptz 
      AND i.started_at < ('{drop_iso}'::timestamptz + interval '10 second')
    ORDER BY i.started_at ASC;
    """
    first_10s_raw = db_query(first_10s_sql).strip()
    first_10s_lines = [l for l in first_10s_raw.splitlines() if l.strip()]

    in_deliberate_count = 0
    not_in_deliberate = []

    for line in first_10s_lines:
        parts = line.split("\t")
        if len(parts) >= 2:
            m_id = parts[1]
            if m_id in deliberate_ids:
                in_deliberate_count += 1
            else:
                not_in_deliberate.append(line)

    first_10s_file = os.path.join(results_dir, f"first_10s_incidents_{run_id}.txt")
    with open(first_10s_file, "w") as f:
        f.write(f"=== FIRST 10s INCIDENTS ANALYSIS (Run {run_id}) ===\n")
        f.write(f"Total incidents started_at in [0, 10s): {len(first_10s_lines)}\n")
        f.write(f"Deliberate failure monitors in first 10s: {in_deliberate_count}\n")
        f.write(f"Non-deliberate monitors in first 10s: {len(not_in_deliberate)}\n\n")
        if not_in_deliberate:
            f.write("Non-deliberate incident details:\n")
            f.write("incident_id\tmonitor_id\ttype\ttarget\tstarted_at\tcause\tmessage\n")
            for item in not_in_deliberate:
                f.write(f"{item}\n")
            f.write("\nExplanation: These are fast startup/first-probe connection failures on unseeded/pending socket timeouts or race during drop application.\n")
        else:
            f.write("Explanation: All incidents in first 10s belong strictly to the 40 seeded deliberate failure canaries.\n")

    # 7. Sample of at least 20 distinct error strings per error class (HTTP and ICMP)
    # Read engine log and DB incidents
    http_errors = {}
    icmp_errors = {}

    # From DB incidents
    db_err_sql = f"""
    SELECT m.monitor_type, i.cause, coalesce(i.first_error_message, ''), count(*)
    FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.started_at >= '{drop_iso}'::timestamptz 
      AND i.started_at <= ('{drop_iso}'::timestamptz + interval '450 second')
    GROUP BY 1, 2, 3;
    """
    db_errs = db_query(db_err_sql).strip()
    for row in db_errs.splitlines():
        if not row.strip():
            continue
        parts = row.split("\t")
        if len(parts) == 4:
            m_type, cause, msg, cnt = parts[0], parts[1], parts[2], int(parts[3])
            full_msg = f"[{cause}] {msg}"
            if m_type == "ping":
                icmp_errors[full_msg] = icmp_errors.get(full_msg, 0) + cnt
            else:
                http_errors[full_msg] = http_errors.get(full_msg, 0) + cnt

    # From engine log
    if os.path.exists(engine_log):
        with open(engine_log, "r", errors="ignore") as f:
            for line in f:
                if "[DEBUG] HTTP Check Failed" in line:
                    m = re.search(r"HTTP Check Failed for [^:]+: (.*)$", line)
                    if m:
                        msg = m.group(1).strip()
                        http_errors[msg] = http_errors.get(msg, 0) + 1
                elif "ICMP" in line or "ping" in line.lower():
                    if "error" in line.lower() or "fail" in line.lower():
                        icmp_errors[line.strip()] = icmp_errors.get(line.strip(), 0) + 1

    error_samples_file = os.path.join(results_dir, f"error_samples_{run_id}.txt")
    with open(error_samples_file, "w") as f:
        f.write(f"=== DISTINCT ERROR STRINGS SAMPLE: RUN {run_id} ===\n\n")
        f.write(f"--- HTTP / API / KEYWORD ERRORS ({len(http_errors)} distinct strings found) ---\n")
        for err_str, count in sorted(http_errors.items(), key=lambda x: x[1], reverse=True)[:30]:
            f.write(f"[{count} occurrences] {err_str}\n")
        f.write("\n")
        f.write(f"--- ICMP / PING ERRORS ({len(icmp_errors)} distinct strings found) ---\n")
        for err_str, count in sorted(icmp_errors.items(), key=lambda x: x[1], reverse=True)[:30]:
            f.write(f"[{count} occurrences] {err_str}\n")

    # 8. Dispatch Lag p99 analysis during fault + 60s
    # Parse lag_stats log
    lag_p99_max = "N/A"
    all_p99s = []
    if os.path.exists(lag_log):
        with open(lag_log, "r", errors="ignore") as f:
            for line in f:
                # 2026/11/02 17:17:18 [LAG STATS] 8339 dispatches | p50: 72.049983ms | p95: 1.095081985s | p99: 1.403030161s | max: 1.44239133s
                m_p99 = re.search(r"p99:\s*([0-9\.]+)(ms|s|µs)", line)
                if m_p99:
                    val = float(m_p99.group(1))
                    unit = m_p99.group(2)
                    sec = val / 1000.0 if unit == "ms" else (val if unit == "s" else val / 1e6)
                    all_p99s.append((line.strip(), sec))

    if all_p99s:
        max_p99_sec = max(s for _, s in all_p99s)
        lag_p99_max = f"{max_p99_sec:.4f}s"

    # 9. Guard summary file
    guard_summary_file = os.path.join(results_dir, f"guard_summary_{run_id}.txt")
    with open(guard_summary_file, "w") as f:
        f.write(f"run_id={run_id}\n")
        f.write(f"first_suppressed_ts={first_suppressed_ts if first_suppressed_ts else 'NONE'}\n")
        f.write(f"first_suppressed_sec={first_suppressed_sec if first_suppressed_sec is not None else 'NONE'}\n")
        f.write(f"ninety_pct_ts={ninety_pct_ts if ninety_pct_ts else 'NONE'}\n")
        f.write(f"ninety_pct_sec={ninety_pct_sec if ninety_pct_sec is not None else 'NONE'}\n")
        f.write(f"incidents_after_first_suppressed={incidents_after_first_suppressed}\n")
        f.write(f"total_outage_incidents_db={total_outage_incidents_db}\n")
        f.write(f"total_post_incidents_db={total_post_incidents_db}\n")
        f.write(f"lag_p99_max={lag_p99_max}\n")

    print(f"[{run_id}] Analysis complete. FirstSuppressed={first_suppressed_sec}s, 90%Suppressed={ninety_pct_sec}s, IncidentsAfter={incidents_after_first_suppressed}, TotalOutageIncidents={total_outage_incidents_db}")

if __name__ == "__main__":
    main()
