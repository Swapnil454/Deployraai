# Brutal Soak Report - 2026-10-13 22:04

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 127 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 16:31:38 [EFFECTIVE_CONFIG] arm=A commit=25f99d9 build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=2 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T22:01:33                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 10% | 14.13% | 88.5 MB | 95.7 MB | 15.6 | 18.4 |
| postgres       | 1.88%  | 11.99%  | 46.3 MB  | 49.5 MB  | 1.25  | 0.463  |
| clickhouse     | 5.54%  | 16.65%  | 190.3 MB  | 221.2 MB  | 0.333  | 0.128  |
| mock-farm      | 8.66% | 12.93% | 21.6 MB | 23.4 MB | 17.8 | 15.3 |

- **CPU secs / check (HTTP-class, whole run):** 0.000945 s (all) | 0.000971 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 0 B (window min 10-30) | 2582.81 B (whole run)
- **NIC bytes (engine container total - secondary):** 2653.04 B (all) | 0 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 13214
- **Flushed:** 12940
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 274
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 13438 |
| Unique rows (id, ts) | 13438 |
| Exec rows (statusâ‰ 3) | 13438 |
| OK rows (status=1) | 12627 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 12962 |
| Scheduled expected | 12700 |
| Scheduled gap | 2.1% |
| Verification rows (probe_kind=1) | 476 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 373 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 0% |
| HTTP did_resume share | 0% |
| HTTP warm_retry share | 0% |
| Spool files | 0 |

## HTTP-Class Breakdown

   ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ 1. Γöé            1 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé    4475 Γöé 93.76536312849161 Γöé  105.2 Γöé    158 Γöé 2. Γöé            2 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé    4495 Γöé 94.12680756395996 Γöé  105.6 Γöé    157 Γöé 3. Γöé            7 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé    4468 Γöé 94.00179051029544 Γöé  105.1 Γöé    157 Γöé    ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 13445 |
| Mock errors | 1277 |
| Mock inject_5xx | 461 |
| Mock 5s idle closes | 0 |
| Mock 15s idle closes | 0 |
| Mock 60s idle closes | 0 |
| Mock 75s idle closes | 0 |
| Mock vs Engine check gap | 0.1% |

## Shutdown

- docker stop elapsed: 4.08s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (4.08 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (2.1%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | N/A (Arm A gap=0.1%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | N/A (A) |
| Warm retry in late window <= 1.0% | N/A (A) |
| Goroutines, FDs, RSS flat min 10-30 | PASS |