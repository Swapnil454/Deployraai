# Brutal Soak Report - 2026-10-13 23:14

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 1950 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 17:11:46 [EFFECTIVE_CONFIG] arm=C-on commit=8397a4d build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=90 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T22:41:38                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 7.3% | 31.28% | 294.8 MB | 324.2 MB | 187 | 199 |
| postgres       | 1.21%  | 24.02%  | 54.3 MB  | 59.1 MB  | 11  | 3.77  |
| clickhouse     | 7.44%  | 35.71%  | 349.8 MB  | 427.7 MB  | 5.31  | 1.88  |
| mock-farm      | 6.89% | 47.71% | 91.9 MB | 101.4 MB | 184 | 181 |

- **CPU secs / check (HTTP-class, whole run):** 0.000723 s (all) | 0.00074 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 1038.89 B (window min 10-30) | 1944.21 B (whole run)
- **NIC bytes (engine container total - secondary):** 2056.07 B (all) | 2179.48 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 196811
- **Flushed:** 196474
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 337
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 196856 |
| Unique rows (id, ts) | 196856 |
| Exec rows (statusâ‰ 3) | 196856 |
| OK rows (status=1) | 185589 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 190547 |
| Scheduled expected | 195000 |
| Scheduled gap | 2.3% |
| Verification rows (probe_kind=1) | 6309 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 4827 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 44.3% |
| HTTP did_resume share | 50.9% |
| HTTP warm_retry share | 3% |
| Spool files | 0 |

## HTTP-Class Breakdown

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2115 Γöé 93.61702127659575 Γöé    107 Γöé  163.7 Γöé  2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.3 Γöé  110.3 Γöé  165.2 Γöé  3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31603 Γöé 93.44049615542828 Γöé  112.4 Γöé  172.5 Γöé  4. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé    1995 Γöé 94.48621553884712 Γöé    104 Γöé  155.9 Γöé  5. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   28955 Γöé 94.58815403211881 Γöé   95.9 Γöé  146.8 Γöé  6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31246 Γöé 94.55610318120719 Γöé  113.1 Γöé  171.8 Γöé  7. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé    2005 Γöé 94.81296758104739 Γöé  104.1 Γöé  157.1 Γöé  8. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2156 Γöé 94.15584415584415 Γöé  107.3 Γöé  162.1 Γöé  9. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.7 Γöé  114.2 Γöé  176.9 Γöé 10. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   29161 Γöé 94.96930832275984 Γöé   96.2 Γöé  146.8 Γöé 11. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2146 Γöé 95.01397949673812 Γöé  108.2 Γöé  162.3 Γöé 12. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé                94 Γöé  110.4 Γöé  171.3 Γöé 13. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31415 Γöé 93.28982969918829 Γöé  111.4 Γöé  171.3 Γöé 14. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé    1991 Γöé  94.7262682069312 Γöé  105.3 Γöé  156.2 Γöé 15. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   29068 Γöé 94.86032750791249 Γöé   96.3 Γöé  146.7 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 196865 |
| Mock errors | 18006 |
| Mock inject_5xx | 6733 |
| Mock 5s idle closes | 2370 |
| Mock 15s idle closes | 2414 |
| Mock 60s idle closes | 2776 |
| Mock 75s idle closes | 1315 |
| Mock vs Engine check gap | 0% |

## Shutdown

- docker stop elapsed: 2.3s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.3 s) |
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
| Warm retry in late window <= 1.0% | PASS (0.77%) |
| Goroutines, FDs, RSS flat min 10-30 | PASS |