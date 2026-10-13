# Brutal Soak Report - 2026-10-13 22:01

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 128 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 16:28:47 [EFFECTIVE_CONFIG] arm=C-on commit=8397a4d build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=90 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T21:58:41                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 5.84% | 9.97% | 186.5 MB | 231.3 MB | 14.6 | 14.6 |
| postgres       | 1.45%  | 4.1%  | 43.3 MB  | 46.2 MB  | 1.23  | 0.452  |
| clickhouse     | 6.09%  | 10.52%  | 195.9 MB  | 239.6 MB  | 0.353  | 0.128  |
| mock-farm      | 5.42% | 10.6% | 83.4 MB | 101.8 MB | 14.2 | 14.6 |

- **CPU secs / check (HTTP-class, whole run):** 0.000546 s (all) | 0.000561 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 0 B (window min 10-30) | 2206.88 B (whole run)
- **NIC bytes (engine container total - secondary):** 2237.53 B (all) | 0 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 13258
- **Flushed:** 13059
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 199
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 13684 |
| Unique rows (id, ts) | 13684 |
| Exec rows (statusâ‰ 3) | 13684 |
| OK rows (status=1) | 12856 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 13180 |
| Scheduled expected | 12800 |
| Scheduled gap | 3% |
| Verification rows (probe_kind=1) | 504 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 386 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 34.7% |
| HTTP did_resume share | 40.2% |
| HTTP warm_retry share | 21.4% |
| Spool files | 0 |

## HTTP-Class Breakdown

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     142 Γöé 92.95774647887323 Γöé   99.6 Γöé  154.3 Γöé  2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              93.8 Γöé    107 Γöé    161 Γöé  3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé     866 Γöé 91.57043879907621 Γöé   98.6 Γöé    153 Γöé  4. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé     976 Γöé 94.05737704918033 Γöé  103.6 Γöé  154.4 Γöé  5. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé    1576 Γöé 94.60659898477158 Γöé   96.5 Γöé  146.3 Γöé  6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé     856 Γöé 93.45794392523365 Γöé    102 Γöé    154 Γöé  7. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé     980 Γöé 92.65306122448979 Γöé     99 Γöé  152.4 Γöé  8. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     152 Γöé 93.42105263157895 Γöé   99.8 Γöé  150.9 Γöé  9. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.9 Γöé  107.9 Γöé  165.5 Γöé 10. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé    1576 Γöé 95.43147208121827 Γöé   96.1 Γöé  145.6 Γöé 11. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     136 Γöé 97.05882352941177 Γöé  102.1 Γöé  151.7 Γöé 12. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              93.7 Γöé  108.8 Γöé  163.8 Γöé 13. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé     851 Γöé 90.48178613396004 Γöé   95.9 Γöé  152.5 Γöé 14. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          2 Γöé     977 Γöé 93.85875127942681 Γöé  101.9 Γöé  153.1 Γöé 15. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé    1596 Γöé  95.5513784461153 Γöé   96.6 Γöé  146.8 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 13691 |
| Mock errors | 1299 |
| Mock inject_5xx | 468 |
| Mock 5s idle closes | 1792 |
| Mock 15s idle closes | 1623 |
| Mock 60s idle closes | 130 |
| Mock 75s idle closes | 47 |
| Mock vs Engine check gap | 0.1% |

## Shutdown

- docker stop elapsed: 2.21s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.21 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (3%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0.1%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | PASS (0) |
| Warm retry in late window <= 1.0% | PASS (0%) |
| Goroutines, FDs, RSS flat min 10-30 | PASS |