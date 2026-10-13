# Brutal Soak Report - 2026-10-13 17:07

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 1918 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 11:05:38 [EFFECTIVE_CONFIG] arm=C-on workers=3000 enable_engine_b=false idle_conn_dur_s=90 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T16:35:31                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 5.38% | 34.51% | 286.9 MB | 319.2 MB | 184 | 196 |
| postgres       | 1.08%  | 14.45%  | 71.7 MB  | 74 MB  | 10.9  | 3.73  |
| clickhouse     | 8.63%  | 32.73%  | 449.7 MB  | 548.2 MB  | 5.23  | 1.85  |
| mock-farm      | 6.28% | 29.41% | 93 MB | 104.4 MB | 181 | 179 |

- **CPU secs / check (HTTP-class):** 0.000533 s (all) | 0.000545 s (healthy)
- **NIC bytes (mock) / check:** 1948.27 B (all) | 1994.16 B (healthy)
- **NIC bytes (total) / check:** 2056.51 B (all) | 2104.95 B (healthy)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 193688
- **Flushed:** 193049
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 639
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 193755 |
| Unique rows (id, ts) | 193755 |
| Exec rows (statusâ‰ 3) | 193755 |
| OK rows (status=1) | 182672 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 187370 |
| Scheduled expected | 191800 |
| Scheduled gap | 2.3% |
| Verification rows (probe_kind=1) | 6385 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 4723 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Enqueued gap | 67 (0.03%) |
| HTTP reuse share | 44.3% |
| HTTP did_resume share | 49.4% |
| HTTP warm_retry share | 3.1% |
| Spool files | 0 |

## HTTP-Class Breakdown

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2097 Γöé 94.27753934191702 Γöé  105.1 Γöé  157.4 Γöé  2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1977 Γöé 94.68892261001517 Γöé  102.8 Γöé  154.4 Γöé  3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31982 Γöé 93.48070789819273 Γöé  106.5 Γöé  162.4 Γöé  4. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   28533 Γöé 94.76395752286825 Γöé   95.7 Γöé  145.9 Γöé  5. Γöé            1 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé       8 Γöé                 0 Γöé      0 Γöé      0 Γöé  6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31750 Γöé 94.37795275590551 Γöé  107.7 Γöé  161.5 Γöé  7. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2090 Γöé 94.30622009569377 Γöé  103.2 Γöé  156.7 Γöé  8. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1962 Γöé 95.71865443425077 Γöé    104 Γöé    154 Γöé  9. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   28719 Γöé 94.99982589923047 Γöé   96.2 Γöé  146.7 Γöé 10. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé       7 Γöé                 0 Γöé      0 Γöé      0 Γöé 11. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2112 Γöé 93.41856060606061 Γöé  104.5 Γöé  158.1 Γöé 12. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          2 Γöé    1953 Γöé 94.87967229902713 Γöé    104 Γöé  154.6 Γöé 13. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   31938 Γöé  93.3684012774751 Γöé  106.5 Γöé    163 Γöé 14. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          0 Γöé   28620 Γöé 94.84276729559748 Γöé   95.9 Γöé  146.2 Γöé 15. Γöé            7 Γöé          0 Γöé          1 Γöé      1 Γöé          0 Γöé          2 Γöé       7 Γöé                 0 Γöé      0 Γöé      0 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 193763 |
| Mock errors | 17718 |
| Mock inject_5xx | 6628 |
| Mock 5s idle closes | 2361 |
| Mock 15s idle closes | 2374 |
| Mock 60s idle closes | 2701 |
| Mock 75s idle closes | 1317 |
| Mock vs Engine check gap | 0% |

## Kill-Switch Drill

- HTTP response: 200
- Status: PASS - kill-switch functional

## Shutdown

- docker stop elapsed: 2.22s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.22 s) |
| Reaper rows == 0 | PASS |
| Scheduled rate within 5% of 60,000 | PASS (2.3%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0.03%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
