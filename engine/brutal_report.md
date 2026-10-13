# Brutal Soak Report - 2026-10-14 01:30

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 1954 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 19:27:03 [EFFECTIVE_CONFIG] arm=C-off commit=8397a4d build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=2 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-14T00:56:53                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 11.57% | 66.73% | 249 MB | 291.4 MB | 212 | 281 |
| postgres       | 1.02%  | 16.1%  | 50.5 MB  | 53.8 MB  | 11  | 3.74  |
| clickhouse     | 8.37%  | 43.49%  | 349.7 MB  | 447.8 MB  | 5.19  | 1.88  |
| mock-farm      | 10.08% | 64.67% | 29.7 MB | 43.9 MB | 267 | 207 |

- **CPU secs / check (HTTP-class, whole run):** 0.001146 s (all) | 0.001173 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 1457.75 B (window min 10-30) | 2519.32 B (whole run)
- **NIC bytes (engine container total - secondary):** 2620.31 B (all) | 2789.11 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 197136
- **Flushed:** 197014
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 122
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 197285 |
| Unique rows (id, ts) | 197285 |
| Exec rows (statusâ‰ 3) | 197285 |
| OK rows (status=1) | 186000 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 190921 |
| Scheduled expected | 195400 |
| Scheduled gap | 2.3% |
| Verification rows (probe_kind=1) | 6364 |
| Dup scheduled buckets (>1 sched/mon/30s) | 38 |
| Dup total buckets (>1 row/mon/30s) | 4930 |
| Dup precise tuples (id,kind,phase,30s) | 38 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 0% |
| HTTP did_resume share | 95.2% |
| HTTP warm_retry share | 0% |
| Spool files | 0 |

## HTTP-Class Breakdown

   ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ 1. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2140 Γöé 93.78504672897196 Γöé  124.6 Γöé  201.9 Γöé 2. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              93.8 Γöé    109 Γöé  163.6 Γöé 3. Γöé            1 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   62628 Γöé 94.11445359902919 Γöé  130.4 Γöé  214.9 Γöé 4. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   62626 Γöé 94.61565483984288 Γöé  131.4 Γöé  217.4 Γöé 5. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2148 Γöé 93.99441340782123 Γöé  123.7 Γöé  201.2 Γöé 6. Γöé            2 Γöé          1 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.3 Γöé  108.7 Γöé  164.2 Γöé 7. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          1 Γöé    2120 Γöé  93.5377358490566 Γöé  124.3 Γöé  201.8 Γöé 8. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          0 Γöé          0 Γöé    1000 Γöé              94.3 Γöé  108.8 Γöé  165.6 Γöé 9. Γöé            7 Γöé          0 Γöé          1 Γöé      0 Γöé          1 Γöé          0 Γöé   62623 Γöé 94.16827683119621 Γöé    131 Γöé    216 Γöé    ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 197292 |
| Mock errors | 18038 |
| Mock inject_5xx | 6747 |
| Mock 5s idle closes | 0 |
| Mock 15s idle closes | 0 |
| Mock 60s idle closes | 0 |
| Mock 75s idle closes | 0 |
| Mock vs Engine check gap | 0% |

## Shutdown

- docker stop elapsed: 2.23s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (2.23 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (2.3%) |
| Dup buckets == 0 | FAIL (38 buckets) |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | PASS (0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | N/A (C-off) |
| Warm retry in late window <= 1.0% | N/A (C-off) |
| Goroutines, FDs, RSS flat min 10-30 | FAIL |