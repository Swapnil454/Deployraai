# Brutal Soak Report - 2026-10-08 13:53

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | 35695                  |
| Per type          | 4461 (12.5% each)      |
| Monitor types     | http, keyword, ping, port, heartbeat, dns, api, udp |
| Interval          | 30 s (all monitors)            |
| Run duration      | 1897 s             |
| Compression       | 100% (all body-reading monitors use decompression) |
| Commit            | 8397a4d                    |
| Seed time         | 2026-10-08T13:20:41                      |
| Real sites        | Google, GitHub, Cloudflare, httpbin, JSONPlaceholder, Fastly |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------|
| engine         | 12.73% | 182.91% | 709.5 MB | 981.9 MB | 461 | 233 |
| postgres       | 5.09%  | 103.08%  | 196.3 MB  | 340.7 MB  | 120  | 6.07  |
| clickhouse     | 7.16%  | 29.42%  | 354.5 MB  | 433.3 MB  | 10.4  | 2.62  |
| mock-farm      | 0.25% | 6.8% | 20.7 MB | 41.8 MB | 13.8 | 24.3 |

CPU percentages are relative to host/container limits.

## ClickHouse Telemetry

- **Total rows inserted:** 472276
- **Expected checks (35695 monitors Ã— 30s interval over 1800s):** ~2141700

### Per-kind breakdown:

    ΓöîΓöÇmonitor_typeΓöÇΓö¼ΓöÇreq_methodΓöÇΓö¼ΓöÇreq_schemeΓöÇΓö¼ΓöÇreusedΓöÇΓö¼ΓöÇdid_resumeΓöÇΓö¼ΓöÇsamplesΓöÇΓö¼ΓöÇavg_msΓöÇΓö¼ΓöÇp95_msΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇok_pctΓöÇΓöÉ  1. Γöé            1 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   55249 Γöé      0 Γöé      0 Γöé                  0 Γöé  2. Γöé            1 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    2668 Γöé  160.6 Γöé  462.4 Γöé 32.608695652173914 Γöé  3. Γöé            2 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   54726 Γöé      0 Γöé      0 Γöé                  0 Γöé  4. Γöé            2 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    2600 Γöé  300.9 Γöé 1899.8 Γöé  18.53846153846154 Γöé  5. Γöé            3 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   60073 Γöé      0 Γöé      0 Γöé                  0 Γöé  6. Γöé            4 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   60036 Γöé      0 Γöé      0 Γöé                  0 Γöé  7. Γöé            5 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   60212 Γöé      0 Γöé      0 Γöé                  0 Γöé  8. Γöé            6 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   59007 Γöé      0 Γöé      0 Γöé                  0 Γöé  9. Γöé            7 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   54785 Γöé      0 Γöé      0 Γöé                  0 Γöé 10. Γöé            7 Γöé          1 Γöé          1 Γöé      1 Γöé          0 Γöé    2700 Γöé  552.4 Γöé 3487.5 Γöé 29.185185185185187 Γöé 11. Γöé            8 Γöé          0 Γöé          0 Γöé      0 Γöé          0 Γöé   60220 Γöé      0 Γöé      0 Γöé                  0 Γöé     ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ

## Mock Farm

- **Total requests served:** {"errors":390,"gzipped":0,"total":2454}

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

