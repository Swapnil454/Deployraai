# Brutal Soak Report - 2026-10-13 21:58

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 127 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 16:25:54 [EFFECTIVE_CONFIG] arm=C-off commit=8397a4d build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=2 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T21:55:48                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 9.53% | 20.58% | 165.1 MB | 225.8 MB | 16.1 | 18.7 |
| postgres       | 2.18%  | 14.69%  | 49.2 MB  | 52.1 MB  | 1.23  | 0.454  |
| clickhouse     | 6.04%  | 16.99%  | 188.8 MB  | 225.8 MB  | 0.341  | 0.128  |
| mock-farm      | 10.53% | 24.66% | 23.4 MB | 27.8 MB | 18.1 | 15.9 |

- **CPU secs / check (HTTP-class, whole run):** 0.000879 s (all) | 0.000904 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 0 B (window min 10-30) | 2590.39 B (whole run)
- **NIC bytes (engine container total - secondary):** 2651.34 B (all) | 0 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 13422
- **Flushed:** 13180
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 242
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 13763 |
| Unique rows (id, ts) | 13763 |
| Exec rows (statusâ‰ 3) | 13763 |
| OK rows (status=1) | 12931 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 13259 |
| Scheduled expected | 12700 |
| Scheduled gap | 4.4% |
| Verification rows (probe_kind=1) | 504 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 358 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 0% |
| HTTP did_resume share | 75.1% |
| HTTP warm_retry share | 0% |
| Spool files | 0 |

## HTTP-Class Breakdown

   ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ 1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     146 Γöé 95.89041095890411 Γöé  107.9 Γöé    160 Γöé 2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.4 Γöé  107.4 Γöé  162.8 Γöé 3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé    3430 Γöé 93.52769679300292 Γöé  105.8 Γöé  160.9 Γöé 4. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé    3449 Γöé 94.52015076833865 Γöé  107.3 Γöé  160.5 Γöé 5. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     144 Γöé 95.13888888888889 Γöé  103.7 Γöé  155.7 Γöé 6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              93.5 Γöé  107.4 Γöé  160.9 Γöé 7. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     140 Γöé 94.28571428571429 Γöé  103.5 Γöé  152.9 Γöé 8. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.1 Γöé  107.8 Γöé  161.2 Γöé 9. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé    3454 Γöé 93.63057324840764 Γöé  105.9 Γöé  159.4 Γöé    ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 13772 |
| Mock errors | 1307 |
| Mock inject_5xx | 469 |
| Mock 5s idle closes | 0 |
| Mock 15s idle closes | 0 |
| Mock 60s idle closes | 0 |
| Mock 75s idle closes | 0 |
| Mock vs Engine check gap | 0.1% |

## Shutdown

- docker stop elapsed: 2.14s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.14 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (4.4%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0.1%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | N/A (C-off) |
| Warm retry in late window <= 1.0% | N/A (C-off) |
| Goroutines, FDs, RSS flat min 10-30 | PASS |