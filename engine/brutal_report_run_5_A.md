# Brutal Soak Report - 2026-10-14 00:56

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 3000                  |
| Run duration      | 1949 s             |
| Engine Exit Code  | 0                      |
| Effective Config  | 2026/10/13 18:53:11 [EFFECTIVE_CONFIG] arm=A commit=25f99d9 build_tag=loadtest workers=3000 enable_engine_b=false idle_conn_dur_s=2 dns_cache=off rechecks=on tier_model=per_host compression_pct=0 |
| Interval          | 30 s (all monitors)            |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-14T00:23:04                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | 9.03% | 17.63% | 99.6 MB | 114.4 MB | 205 | 278 |
| postgres       | 1.15%  | 12.38%  | 57.9 MB  | 61.5 MB  | 11.4  | 3.77  |
| clickhouse     | 7.36%  | 26.58%  | 353.5 MB  | 451.3 MB  | 4.89  | 1.86  |
| mock-farm      | 9.2% | 14.32% | 22.6 MB | 25.2 MB | 264 | 200 |

- **CPU secs / check (HTTP-class, whole run):** 0.000906 s (all) | 0.000927 s (healthy)
- **CPU secs / check (Minutes 10-30 window):** 0 s
- **NIC bytes (mock interface - HEADLINE):** 1450.98 B (window min 10-30) | 2505.43 B (whole run)
- **NIC bytes (engine container total - secondary):** 2608.02 B (all) | 2781.47 B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** 194003
- **Flushed:** 193492
- **Failed:** 0
- **Dropped:** 0
- **In-flight:** 511
- **Invariant:** HOLDS

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | 194194 |
| Unique rows (id, ts) | 194194 |
| Exec rows (statusâ‰ 3) | 194194 |
| OK rows (status=1) | 183161 |
| Reaped rows (status=3) | 0 |
| Scheduled rows (probe_kind=0) | 187823 |
| Scheduled expected | 194900 |
| Scheduled gap | 3.6% |
| Verification rows (probe_kind=1) | 6371 |
| Dup scheduled buckets (>1 sched/mon/30s) | 0 |
| Dup total buckets (>1 row/mon/30s) | 5054 |
| Dup precise tuples (id,kind,phase,30s) | 0 |
| Post-stop CH count vs Flushed gap | 0 (0%) |
| HTTP reuse share | 0% |
| HTTP did_resume share | 0% |
| HTTP warm_retry share | 0% |
| Spool files | 0 |

## HTTP-Class Breakdown

   ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇphase_kindΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓöÉ 1. Γöé            1 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé   64749 Γöé 94.14199447095709 Γöé    104 Γöé    156 Γöé 2. Γöé            2 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé   64776 Γöé  94.5643448190688 Γöé  104.4 Γöé    156 Γöé 3. Γöé            7 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé          0 Γöé   64669 Γöé 94.24917657610293 Γöé  104.3 Γöé    156 Γöé    ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | 194200 |
| Mock errors | 17687 |
| Mock inject_5xx | 6649 |
| Mock 5s idle closes | 0 |
| Mock 15s idle closes | 0 |
| Mock 60s idle closes | 0 |
| Mock 75s idle closes | 0 |
| Mock vs Engine check gap | 0% |

## Shutdown

- docker stop elapsed: 4.14s
- Exit code: 0

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | PASS (4.14 s) |
| Reaper rows == 0 | PASS |
| HTTP-class rate within 5% | PASS (3.6%) |
| Dup buckets == 0 | PASS |
| Telemetry invariant holds | PASS |
| Post-stop telemetry match <=0.5% | PASS (0%) |
| Spool empty | PASS |
| Mock request count within 5% | N/A (Arm A gap=0%) |
| False-DOWN == 0 | PASS |
| False-UP == 0 | PASS |
| NoKeepAlive reaches ~1500 by min 5 | N/A (A) |
| Warm retry in late window <= 1.0% | N/A (A) |
| Goroutines, FDs, RSS flat min 10-30 | FAIL |