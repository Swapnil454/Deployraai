import sys
import subprocess

def tier_for_host(host):
    if ":" in host:
        host = host.split(":")[0]
    h = 2166136261
    for ch in host:
        h = (h ^ ord(ch)) * 16777619
        h &= 0xFFFFFFFF
    tiers = [5, 15, 60, 75]
    return tiers[h % 4]

def main():
    mock_log_path = sys.argv[1] if len(sys.argv) > 1 else "mock_requests.log"

    # 1. Parse mock log
    mock_requests = {}
    mock_by_gen = {}
    mock_200 = 0
    mock_5xx = 0
    try:
        with open(mock_log_path, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) >= 5:
                    status = int(parts[3])
                    req_id = parts[4]
                    mock_requests[req_id] = status
                    if len(req_id) >= 38:
                        m_id = req_id[:36]
                        rem = req_id[37:].split("-")
                        try:
                            gen = int(rem[0])
                            mock_by_gen.setdefault((m_id, gen), []).append(status)
                        except Exception:
                            pass
                    if status == 200:
                        mock_200 += 1
                    elif status >= 500:
                        mock_5xx += 1
    except Exception as e:
        print(f"Error reading {mock_log_path}: {e}")

    # 2. Query Postgres for monitor URLs and tags
    cmd_pg = [
        "docker", "exec", "-i", "brutal-db", "psql", "-U", "engine", "-d", "engine_test",
        "-t", "-c", "SELECT id, url, tags::text FROM uptime_monitors;"
    ]
    res_pg = subprocess.run(cmd_pg, capture_output=True, text=True)
    mon_meta = {}
    for line in res_pg.stdout.strip().split("\n"):
        line = line.strip()
        if "|" in line:
            p = [x.strip() for x in line.split("|")]
            m_id = p[0]
            url = p[1]
            tag = p[2]
            host = url.replace("https://", "").replace("http://", "").split("/")[0]
            tier = tier_for_host(host)
            mon_meta[m_id] = {"url": url, "tag": tag, "tier": tier}

    # 3. Query ClickHouse for all telemetry rows including generation
    cmd = [
        "docker", "exec", "-i", "brutal-clickhouse", "clickhouse-client",
        "--query", "SELECT toString(monitor_id), probe_kind, phase_kind, status, err_code, attempts, generation FROM default.uptime_telemetry WHERE status != 3 FORMAT TabSeparated"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    rows = []
    for line in res.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) >= 7:
            rows.append({
                "monitor_id": parts[0],
                "probe_kind": int(parts[1]),
                "phase_kind": int(parts[2]),
                "status": int(parts[3]),
                "err_code": int(parts[4]),
                "attempts": int(parts[5]),
                "generation": int(parts[6]),
            })

    total_checks = len(rows)
    up_count = sum(1 for r in rows if r["status"] == 1)
    down_count = sum(1 for r in rows if r["status"] == 0)

    # 4. Strict Full-ID Join on (monitor_id, generation, attempt)
    false_down = 0
    false_up = 0
    matched_mock = 0
    down_with_mock_err = 0
    down_no_mock = 0
    down_no_mock_breakdown = {}

    tier_retries = {5: 0, 15: 0, 60: 0, 75: 0}
    tier_checks = {5: 0, 15: 0, 60: 0, 75: 0}

    # Healthy vs Forced breakdown
    healthy_checks = 0
    healthy_down = 0
    forced_checks = 0
    forced_down = 0

    for r in rows:
        m_id = r["monitor_id"]
        gen = r["generation"]
        probe_k = r["probe_kind"]
        attempts = r["attempts"]
        status = r["status"]
        phase_k = r["phase_kind"]

        meta = mon_meta.get(m_id, {"tag": "unknown", "tier": 0})
        tier = meta["tier"]
        tag = meta["tag"]
        is_forced = ("down" in tag) or ("timeout" in tag)

        if is_forced:
            forced_checks += 1
            if status == 0:
                forced_down += 1
        else:
            healthy_checks += 1
            if status == 0:
                healthy_down += 1

        if tier in tier_checks:
            tier_checks[tier] += 1
        if phase_k == 2 or attempts == 2:
            if tier in tier_retries:
                tier_retries[tier] += 1

        # Construct full ID
        if probe_k == 1:
            suffix = f"v{attempts}"
        else:
            suffix = str(attempts)
        full_id = f"{m_id}-{gen}-{suffix}"

        mock_status = mock_requests.get(full_id)
        if mock_status is not None:
            matched_mock += 1
            if status == 1 and mock_status >= 500:
                false_up += 1
            elif status == 0 and mock_status == 200:
                false_down += 1
            elif status == 0 and mock_status >= 500:
                down_with_mock_err += 1
        elif (m_id, gen) in mock_by_gen:
            # Fallback join on (monitor_id, generation) for Arm A
            gen_statuses = mock_by_gen[(m_id, gen)]
            matched_mock += 1
            if status == 1 and all(s >= 500 for s in gen_statuses):
                false_up += 1
            elif status == 0 and all(s == 200 for s in gen_statuses):
                false_down += 1
            elif status == 0 and any(s >= 500 for s in gen_statuses):
                down_with_mock_err += 1
        else:
            if status == 0:
                down_no_mock += 1
                reason = "stale_socket_dropped_before_mock"
                if "timeout" in tag:
                    reason = "forced_timeout_abandoned"
                down_no_mock_breakdown[reason] = down_no_mock_breakdown.get(reason, 0) + 1

    print("\n" + "="*50)
    print("  MOCK GROUND TRUTH & FULL-ID JOIN AUDIT")
    print("="*50)
    print(f"Mock Total Hits:            {len(mock_requests)} (200 OK: {mock_200}, 5xx: {mock_5xx})")
    print(f"Engine Executed Checks:     {total_checks} (UP: {up_count}, DOWN: {down_count})")
    print(f"Full-ID Joined Rows:        {matched_mock}")
    print(f"False-DOWN (Engine 0, Mock 200): {false_down} [GATE: 0]")
    print(f"False-UP   (Engine 1, Mock 5xx): {false_up} [GATE: 0]")
    print(f"DOWN with Confirmed Mock Error: {down_with_mock_err}")
    print(f"DOWN with No Mock Entry:        {down_no_mock}")
    for k, v in down_no_mock_breakdown.items():
        print(f"   • {k}: {v}")

    print("\n" + "-"*50)
    print("  RETRY BREAKDOWN BY HOSTNAME IDLE TIER")
    print("-"*50)
    for t in [5, 15, 60, 75]:
        tot = tier_checks[t]
        ret = tier_retries[t]
        pct = (ret * 100.0 / tot) if tot > 0 else 0.0
        print(f"  Tier {t:2d}s: {ret:5d} retries / {tot:5d} checks ({pct:5.2f}%)")

    print("\n" + "-"*50)
    print("  FLEET SEGMENTATION (HEALTHY VS FORCED-FAILURE)")
    print("-"*50)
    print(f"Healthy Monitors (2,930):  {healthy_checks} checks, {healthy_down} DOWN ({healthy_down*100.0/healthy_checks if healthy_checks else 0:.2f}%)")
    print(f"Forced Failure (70):      {forced_checks} checks, {forced_down} DOWN ({forced_down*100.0/forced_checks if forced_checks else 0:.2f}%)")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
