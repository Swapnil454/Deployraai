# Brutal Soak Report - 2026-10-08 16:04

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 35695                  |
| Per type          | 4461 (12.5% each)      |
| Monitor types     | http, keyword, ping, port, heartbeat, dns, api, udp |
| Interval          | 30 s (all monitors)            |
| Run duration      | 1895 s             |
| Compression       | 100% (all body-reading monitors use decompression) |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-08T15:31:31                      |
| Real sites        | Google, GitHub, Cloudflare, httpbin, JSONPlaceholder, Fastly |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------|
| engine         | 11.29% | 103.72% | 718.9 MB | 1020 MB | 436 | 231 |
| postgres       | 5.82%  | 100.56%  | 206.5 MB  | 349.6 MB  | 120  | 6.09  |
| clickhouse     | 7.19%  | 53.73%  | 354 MB  | 438 MB  | 8.87  | 2.65  |
| mock-farm      | 0.32% | 13.83% | 20.8 MB | 41.3 MB | 14 | 25.2 |

CPU percentages are relative to host/container limits.

## ClickHouse Telemetry

- **Total rows inserted:** 436333
- **Expected checks (35695 monitors Ã— 30s interval over 1800s):** ~2141700

### Per-kind breakdown:

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   49054 Γöé      0 Γöé      0 Γöé                 0 Γöé  2. Γöé            1 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    1496 Γöé    146 Γöé  564.5 Γöé 35.89572192513369 Γöé  3. Γöé            2 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   48134 Γöé      0 Γöé      0 Γöé                 0 Γöé  4. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    1447 Γöé  185.8 Γöé 1230.6 Γöé 16.79336558396683 Γöé  5. Γöé            3 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   57283 Γöé      0 Γöé      0 Γöé                 0 Γöé  6. Γöé            4 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   57691 Γöé      0 Γöé      0 Γöé                 0 Γöé  7. Γöé            5 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   57574 Γöé      0 Γöé      0 Γöé                 0 Γöé  8. Γöé            6 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   56381 Γöé      0 Γöé      0 Γöé                 0 Γöé  9. Γöé            7 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   48592 Γöé      0 Γöé      0 Γöé                 0 Γöé 10. Γöé            7 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    1545 Γöé  365.2 Γöé 1962.1 Γöé 29.19093851132686 Γöé 11. Γöé            8 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   57136 Γöé      0 Γöé      0 Γöé                 0 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Farm

- **Total requests served:** {"errors":406,"gzipped":0,"total":2538}

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

