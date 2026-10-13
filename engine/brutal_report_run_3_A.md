# Brutal Soak Report - 2026-10-13 23:48

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 1947 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 17:45:30 [EFFECTIVE_CONFIG] arm=A commit=25f99d9 build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=2 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T23:15:25                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 10.41% | 38.2% | 97.6 MB | 112.7 MB | 205 | 278 |
| postgres       | 1.35%  | 20.83%  | 48.4 MB  | 51.2 MB  | 11.3  | 3.72  |
| clickhouse     | 8.55%  | 31.11%  | 350.1 MB  | 444.9 MB  | 4.89  | 1.86  |
| mock-farm      | 9.76% | 15.88% | 22.7 MB | 25 MB | 263 | 200 |

- **CPU secs / check (HTTP-class, whole run):** 0.001045 s (all) | 0.00107 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 1448.82 B (window min 10-30) | 2504.05 B (whole run)
- **NIC bytes (engine container total - secondary):** 2612.22 B (all) | 2779.12 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 193716
- **Flushed:** 193509
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 207
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 193882 |
| Unique rows (id, ts) | 193882 |
| Exec rows (statusâ‰ 3) | 193882 |
| OK rows (status=1) | 182868 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 187525 |
| Scheduled expected | 194700 |
| Scheduled gap | 3.7% |
| Verification rows (probe_kind=1) | 6357 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 5073 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 0% |
| HTTP did_resume share | 0% |
| HTTP warm_retry share | 0% |
| Spool files | 0 |

## HTTP-Class Breakdown

   ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ 1. Γöé            1 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé   64579 Γöé  94.2070951857415 Γöé  104.5 Γöé    157 Γöé 2. Γöé            2 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé   64703 Γöé 94.53502928766827 Γöé  105.2 Γöé    156 Γöé 3. Γöé            7 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé   64600 Γöé 94.21517027863777 Γöé  104.7 Γöé    157 Γöé    ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 193888 |
| Mock errors | 17654 |
| Mock inject_5xx | 6635 |
| Mock 5s idle closes | 0 |
| Mock 15s idle closes | 0 |
| Mock 60s idle closes | 0 |
| Mock 75s idle closes | 0 |
| Mock vs Engine check gap | 0% |

## Shutdown

- docker stop elapsed: 4.2s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (4.2 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (3.7%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | N/A (Arm A gap=0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | N/A (A) |
| Warm retry in late window <= 1.0% | N/A (A) |
| Goroutines, FDs, RSS flat min 10-30 | PASS |