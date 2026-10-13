# Brutal Soak Report - 2026-10-13 02:24

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 661 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/12 20:43:18 [EFFECTIVE_CONFIG] arm=C-on workers=3000 enable_engine_b=false idle_conn_dur_s=90 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T02:13:12                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 6.33% | 49.13% | 228.1 MB | 257 MB | 64.6 | 68.3 |
| postgres       | 1.33%  | 22.26%  | 51.6 MB  | 56 MB  | 4.27  | 1.56  |
| clickhouse     | 7.62%  | 19.82%  | 297 MB  | 375.3 MB  | 1.94  | 0.621  |
| mock-farm      | 7.5% | 27.08% | 89.6 MB | 101.1 MB | 63.7 | 62.9 |

- **CPU secs / check (HTTP-class):** 
- **NIC bytes / check (HTTP-class):** 

## Telemetry Invariant (pre-stop)

- **Enqueued:** 67254
- **Flushed:** 66966
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 288
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 67507 |
| Unique rows (id, ts) | 67507 |
| Exec rows (statusâ‰ 3) | 67507 |
| OK rows (status=1) | 63617 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 65249 |
| Scheduled expected | 66100 |
| Scheduled gap | 1.3% |
| Verification rows (probe_kind=1) | 2258 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 1834 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Enqueued gap | 253 (0.38%) |
| HTTP reuse share | 43% |
| HTTP did_resume share | 46.4% |
| HTTP warm_retry share | 7.4% |
| Spool files | 0 |

## HTTP-Class Breakdown

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     718 Γöé 94.01114206128133 Γöé  103.1 Γöé  153.1 Γöé  2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1649 Γöé 94.60278956943603 Γöé  103.1 Γöé  153.7 Γöé  3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   10499 Γöé 93.20887703590819 Γöé  105.1 Γöé  160.2 Γöé  4. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé    9652 Γöé 94.52963116452548 Γöé     96 Γöé  146.2 Γöé  5. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé       9 Γöé                 0 Γöé      0 Γöé      0 Γöé  6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   10359 Γöé 94.37204363355536 Γöé  107.4 Γöé  162.4 Γöé  7. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     739 Γöé 94.31664411366712 Γöé  101.9 Γöé  154.7 Γöé  8. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1652 Γöé 94.79418886198548 Γöé  101.7 Γöé  153.1 Γöé  9. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé    9730 Γöé 94.98458376156218 Γöé   95.9 Γöé  146.4 Γöé 10. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé       8 Γöé                 0 Γöé      0 Γöé      0 Γöé 11. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     747 Γöé 93.57429718875503 Γöé  103.4 Γöé  155.2 Γöé 12. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1655 Γöé 94.98489425981873 Γöé  102.9 Γöé  154.5 Γöé 13. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   10439 Γöé 93.48596608870581 Γöé  106.4 Γöé    161 Γöé 14. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé    9642 Γöé 95.01140842148932 Γöé     96 Γöé  146.3 Γöé 15. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé       9 Γöé                 0 Γöé      0 Γöé      0 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 67518 |
| Mock errors | 6208 |
| Mock inject_5xx | 2309 |
| Mock 5s idle closes | 2386 |
| Mock 15s idle closes | 2396 |
| Mock 60s idle closes | 897 |
| Mock 75s idle closes | 417 |
| Mock vs Engine check gap | 0% |

## Kill-Switch Drill

- HTTP response: 200
- Status: PASS - kill-switch functional

## Shutdown

- docker stop elapsed: 2.16s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.16 s) |
| Reaper rows == 0 | PASS |
| Scheduled rate within 5% of 60,000 | PASS (1.3%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0.38%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
