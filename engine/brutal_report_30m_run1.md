# Brutal Soak Report - 2026-10-13 03:00

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 1918 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/12 20:58:18 [EFFECTIVE_CONFIG] arm=C-on workers=3000 enable_engine_b=false idle_conn_dur_s=90 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T02:28:13                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 5.66% | 34.88% | 254 MB | 267.5 MB | 184 | 197 |
| postgres       | 1.09%  | 12.93%  | 51.9 MB  | 56.7 MB  | 11.1  | 3.74  |
| clickhouse     | 7.74%  | 36.18%  | 350.1 MB  | 447.2 MB  | 5.69  | 1.85  |
| mock-farm      | 5.7% | 32.51% | 90.4 MB | 104.8 MB | 181 | 179 |

- **CPU secs / check (HTTP-class):** 0.00056 s (all) | 0.000573 s (healthy)
- **NIC bytes (mock) / check:** 1946.37 B (all) | 1992.19 B (healthy)
- **NIC bytes (total) / check:** 2059.91 B (all) | 2108.4 B (healthy)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 193855
- **Flushed:** 192988
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 867
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 193944 |
| Unique rows (id, ts) | 193944 |
| Exec rows (statusâ‰ 3) | 193944 |
| OK rows (status=1) | 182855 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 187570 |
| Scheduled expected | 191800 |
| Scheduled gap | 2.2% |
| Verification rows (probe_kind=1) | 6374 |
| Dup scheduled buckets (>1 sched/mon/30s) | 4 |
| Dup total buckets (>1 row/mon/30s) | 5186 |
| Dup precise tuples (id,kind,phase,30s) | 3 |
| Post-stop CH count vs Enqueued gap | 89 (0.05%) |
| HTTP reuse share | 44.3% |
| HTTP did_resume share | 49.4% |
| HTTP warm_retry share | 3.1% |
| Spool files | 0 |

## HTTP-Class Breakdown

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2114 Γöé 94.13434247871334 Γöé  105.4 Γöé  157.2 Γöé  2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1953 Γöé 94.67485919098823 Γöé  103.5 Γöé  155.5 Γöé  3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   32035 Γöé 93.53831746527236 Γöé  107.4 Γöé    164 Γöé  4. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   28540 Γöé 94.74772249474422 Γöé   95.9 Γöé  146.4 Γöé  5. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé      15 Γöé                 0 Γöé      0 Γöé      0 Γöé  6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31827 Γöé  94.4920979042951 Γöé  109.2 Γöé  164.4 Γöé  7. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2102 Γöé 94.14843006660324 Γöé  105.8 Γöé  158.4 Γöé  8. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1977 Γöé 94.03136064744562 Γöé  103.3 Γöé  156.9 Γöé  9. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   28710 Γöé 94.95646116335772 Γöé   96.1 Γöé  146.5 Γöé 10. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé      11 Γöé                 0 Γöé      0 Γöé      0 Γöé 11. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2103 Γöé 93.58059914407988 Γöé  104.5 Γöé  157.7 Γöé 12. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1979 Γöé 93.98686205154118 Γöé  103.2 Γöé  155.1 Γöé 13. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   32009 Γöé 93.52057233902964 Γöé  107.9 Γöé  164.1 Γöé 14. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   28559 Γöé 94.79673658041249 Γöé   95.9 Γöé  146.5 Γöé 15. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé      10 Γöé                 0 Γöé      0 Γöé      0 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 193952 |
| Mock errors | 17731 |
| Mock inject_5xx | 6635 |
| Mock 5s idle closes | 2401 |
| Mock 15s idle closes | 2433 |
| Mock 60s idle closes | 2779 |
| Mock 75s idle closes | 1350 |
| Mock vs Engine check gap | 0% |

## Kill-Switch Drill

- HTTP response: 200
- Status: PASS - kill-switch functional

## Shutdown

- docker stop elapsed: 2.24s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.24 s) |
| Reaper rows == 0 | PASS |
| Scheduled rate within 5% of 60,000 | PASS (2.2%) |
| Dup buckets == 0 | FAIL (4 buckets) |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0.05%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
