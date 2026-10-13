# Brutal Soak Report - 2026-10-13 22:40

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 1947 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 16:37:58 [EFFECTIVE_CONFIG] arm=C-off commit=8397a4d build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=2 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-13T22:07:53                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 9.01% | 44.76% | 249.4 MB | 291.3 MB | 211 | 280 |
| postgres       | 1.24%  | 23.2%  | 56.4 MB  | 61.6 MB  | 11.1  | 3.78  |
| clickhouse     | 7.91%  | 31.5%  | 348.6 MB  | 469 MB  | 5.17  | 1.87  |
| mock-farm      | 9.39% | 78.09% | 29.4 MB | 41.9 MB | 265 | 205 |

- **CPU secs / check (HTTP-class, whole run):** 0.000892 s (all) | 0.000913 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 1460.48 B (window min 10-30) | 2505.65 B (whole run)
- **NIC bytes (engine container total - secondary):** 2617.6 B (all) | 2787.34 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 196195
- **Flushed:** 196124
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 71
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 196688 |
| Unique rows (id, ts) | 196688 |
| Exec rows (statusâ‰ 3) | 196688 |
| OK rows (status=1) | 185428 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 190495 |
| Scheduled expected | 194700 |
| Scheduled gap | 2.2% |
| Verification rows (probe_kind=1) | 6193 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 4629 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 0% |
| HTTP did_resume share | 95.2% |
| HTTP warm_retry share | 0% |
| Spool files | 0 |

## HTTP-Class Breakdown

   ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ 1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2133 Γöé 94.23347398030943 Γöé  118.3 Γöé  187.1 Γöé 2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé                94 Γöé  106.3 Γöé  159.2 Γöé 3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   62419 Γöé 94.11397170733271 Γöé  123.5 Γöé  197.1 Γöé 4. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   62446 Γöé 94.63056080453512 Γöé  124.4 Γöé  196.9 Γöé 5. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2107 Γöé 94.54200284765069 Γöé  119.9 Γöé  186.1 Γöé 6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.6 Γöé  108.3 Γöé    161 Γöé 7. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2108 Γöé 93.54838709677419 Γöé  118.6 Γöé  185.4 Γöé 8. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.1 Γöé  107.2 Γöé  161.3 Γöé 9. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   62475 Γöé  94.1000400160064 Γöé  123.4 Γöé  198.7 Γöé    ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 196697 |
| Mock errors | 17992 |
| Mock inject_5xx | 6726 |
| Mock 5s idle closes | 0 |
| Mock 15s idle closes | 0 |
| Mock 60s idle closes | 0 |
| Mock 75s idle closes | 0 |
| Mock vs Engine check gap | 0% |

## Shutdown

- docker stop elapsed: 2.18s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.18 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (2.2%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | N/A (C-off) |
| Warm retry in late window <= 1.0% | N/A (C-off) |
| Goroutines, FDs, RSS flat min 10-30 | FAIL |