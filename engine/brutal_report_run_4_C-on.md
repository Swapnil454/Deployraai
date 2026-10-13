# Brutal Soak Report - 2026-10-14 00:22

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 1951 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 18:19:18 [EFFECTIVE_CONFIG] arm=C-on commit=8397a4d build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=90 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T23:49:12                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 8.85% | 42.5% | 294.9 MB | 313 MB | 187 | 200 |
| postgres       | 1.29%  | 20.13%  | 52.5 MB  | 54.9 MB  | 11  | 3.75  |
| clickhouse     | 9.76%  | 90.29%  | 344.6 MB  | 429.1 MB  | 5.33  | 1.89  |
| mock-farm      | 8.02% | 33.05% | 89.5 MB | 101.9 MB | 185 | 182 |

- **CPU secs / check (HTTP-class, whole run):** 0.000876 s (all) | 0.000897 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 1040.06 B (window min 10-30) | 1952.64 B (whole run)
- **NIC bytes (engine container total - secondary):** 2059.05 B (all) | 2185.91 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 196685
- **Flushed:** 196551
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 134
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 197081 |
| Unique rows (id, ts) | 197081 |
| Exec rows (statusâ‰ 3) | 197081 |
| OK rows (status=1) | 185815 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 190655 |
| Scheduled expected | 195100 |
| Scheduled gap | 2.3% |
| Verification rows (probe_kind=1) | 6426 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 4841 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 44.2% |
| HTTP did_resume share | 51% |
| HTTP warm_retry share | 3% |
| Spool files | 0 |

## HTTP-Class Breakdown

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2129 Γöé 94.22263973696572 Γöé  105.8 Γöé  158.6 Γöé  2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé                94 Γöé    110 Γöé  167.3 Γöé  3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31584 Γöé 93.58219351570415 Γöé  110.2 Γöé  168.5 Γöé  4. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé    1985 Γöé 95.41561712846348 Γöé  103.5 Γöé  154.3 Γöé  5. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   28963 Γöé 94.72085074060007 Γöé   96.4 Γöé  146.7 Γöé  6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31424 Γöé 94.39918533604887 Γöé  110.8 Γöé  168.9 Γöé  7. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé    2016 Γöé 94.69246031746032 Γöé  102.8 Γöé  154.1 Γöé  8. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2153 Γöé 94.37993497445424 Γöé  105.4 Γöé  156.7 Γöé  9. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              93.2 Γöé  107.9 Γöé  164.7 Γöé 10. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   29134 Γöé 94.71751218507586 Γöé   96.4 Γöé  147.1 Γöé 11. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2120 Γöé 94.29245283018868 Γöé  105.9 Γöé  160.2 Γöé 12. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              95.4 Γöé  111.8 Γöé  167.4 Γöé 13. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31525 Γöé 93.47184773988897 Γöé  110.1 Γöé  169.6 Γöé 14. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé    1986 Γöé  94.6122860020141 Γöé  103.2 Γöé  154.8 Γöé 15. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   29062 Γöé   94.807652604776 Γöé   96.3 Γöé  146.5 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 197090 |
| Mock errors | 18010 |
| Mock inject_5xx | 6740 |
| Mock 5s idle closes | 2386 |
| Mock 15s idle closes | 2394 |
| Mock 60s idle closes | 2787 |
| Mock 75s idle closes | 1427 |
| Mock vs Engine check gap | 0% |

## Shutdown

- docker stop elapsed: 2.29s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.29 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (2.3%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | PASS (1495) |
| Warm retry in late window <= 1.0% | PASS (0.75%) |
| Goroutines, FDs, RSS flat min 10-30 | PASS |