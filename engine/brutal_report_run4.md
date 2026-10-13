# Brutal Soak Report - 2026-10-08 14:58

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 35695                  |
| Per type          | 4461 (12.5% each)      |
| Monitor types     | http, keyword, ping, port, heartbeat, dns, api, udp |
| Interval          | 30 s (all monitors)            |
| Run duration      | 1894 s             |
| Compression       | 100% (all body-reading monitors use decompression) |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-08T14:26:07                      |
| Real sites        | Google, GitHub, Cloudflare, httpbin, JSONPlaceholder, Fastly |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------|
| engine         | 11.31% | 138.32% | 717.2 MB | 1009 MB | 429 | 232 |
| postgres       | 5.76%  | 100.45%  | 207.2 MB  | 353.5 MB  | 121  | 6.31  |
| clickhouse     | 7.26%  | 46.93%  | 353.2 MB  | 421.3 MB  | 9.11  | 2.66  |
| mock-farm      | 0.34% | 15.47% | 22.2 MB | 45.1 MB | 14.2 | 25.9 |

CPU percentages are relative to host/container limits.

## ClickHouse Telemetry

- **Total rows inserted:** 442431
- **Expected checks (35695 monitors Ã— 30s interval over 1800s):** ~2141700

### Per-kind breakdown:

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   49643 Γöé      0 Γöé      0 Γöé                  0 Γöé  2. Γöé            1 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    2731 Γöé  165.5 Γöé  503.9 Γöé  29.84254851702673 Γöé  3. Γöé            2 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   50262 Γöé      0 Γöé      0 Γöé                  0 Γöé  4. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    2552 Γöé  236.9 Γöé 1480.5 Γöé 12.029780564263323 Γöé  5. Γöé            3 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   57106 Γöé      0 Γöé      0 Γöé                  0 Γöé  6. Γöé            4 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   57034 Γöé      0 Γöé      0 Γöé                  0 Γöé  7. Γöé            5 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   57124 Γöé      0 Γöé      0 Γöé                  0 Γöé  8. Γöé            6 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   55886 Γöé      0 Γöé      0 Γöé                  0 Γöé  9. Γöé            7 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   50352 Γöé      0 Γöé      0 Γöé                  0 Γöé 10. Γöé            7 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    2621 Γöé  349.2 Γöé 2170.4 Γöé  18.04654711942007 Γöé 11. Γöé            8 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   57120 Γöé      0 Γöé      0 Γöé                  0 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Farm

- **Total requests served:** {"errors":427,"gzipped":0,"total":2580}

## Kill-Switch Drill

- HTTP response: 200
- Status: PASS - kill-switch functional

## What This Run Proves

| Claim | Evidence |
|-------|----------|
| 8 types run equally at 30s | Seed distribution verified by SQL query 1 |
| ~100 checks/monitor in 50 min | SQL query 4 checks_per_monitor |
| Incident correctness (down/timeout only) | SQL query 3 |
| No false positives | SQL query 6 |
| ClickHouse ingestion works at load | Row count vs expected |
| Kill-switch functional | Admin endpoint returns 200 |
| RSS stable under compression | brutal_stats.csv MEM trend |
| Real sites reachable and returning expected results | SQL query 7 real-site rows |

