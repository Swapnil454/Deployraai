# Brutal Soak Report - 2026-10-13 17:54

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 661 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 12:12:47 [EFFECTIVE_CONFIG] arm=C-off workers=3000 enable_engine_b=false idle_conn_dur_s=2 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T17:42:42                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 6.35% | 24.9% | 218.1 MB | 248 MB | 72.6 | 94.1 |
| postgres       | 1.15%  | 24.06%  | 56.1 MB  | 59 MB  | 4.33  | 1.56  |
| clickhouse     | 7.47%  | 33.75%  | 299.7 MB  | 393.6 MB  | 1.71  | 0.625  |
| mock-farm      | 7.81% | 31.59% | 28 MB | 39.3 MB | 90.1 | 71.2 |

- **CPU secs / check (HTTP-class, whole run):** 0.000621 s (all) | 0.000636 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0.004431 s
- **NIC bytes (mock) / check:** 2502.19 B (all) | 2562.7 B (healthy)
- **NIC bytes (total) / check:** 2585.95 B (all) | 2648.49 B (healthy)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 66987
- **Flushed:** 66981
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 6
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 67595 |
| Unique rows (id, ts) | 67595 |
| Exec rows (statusâ‰ 3) | 67595 |
| OK rows (status=1) | 63690 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 65327 |
| Scheduled expected | 66100 |
| Scheduled gap | 1.2% |
| Verification rows (probe_kind=1) | 2268 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 1717 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 0% |
| HTTP did_resume share | 96.7% |
| HTTP warm_retry share | 0% |
| Spool files | 0 |

## HTTP-Class Breakdown

   ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ 1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     726 Γöé 93.66391184573003 Γöé  111.8 Γöé  172.8 Γöé 2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   21812 Γöé 94.09957821382726 Γöé  114.3 Γöé  178.2 Γöé 3. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   21818 Γöé 94.50912090934091 Γöé  114.8 Γöé  178.4 Γöé 4. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     721 Γöé 95.00693481276005 Γöé  112.3 Γöé  168.1 Γöé 5. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé     754 Γöé 94.16445623342175 Γöé  112.9 Γöé  172.5 Γöé 6. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   21764 Γöé 94.05440176438155 Γöé  113.8 Γöé  175.7 Γöé    ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 67612 |
| Mock errors | 6228 |
| Mock inject_5xx | 2316 |
| Mock 5s idle closes | 0 |
| Mock 15s idle closes | 0 |
| Mock 60s idle closes | 0 |
| Mock 75s idle closes | 0 |
| Mock vs Engine check gap | 0% |

## Shutdown

- docker stop elapsed: 2.21s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.21 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (1.2%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | FAIL (0) |
| Warm retry in late window <= 1.0% | PASS (0%) |
| Goroutines, FDs, RSS flat min 10-30 | PASS |