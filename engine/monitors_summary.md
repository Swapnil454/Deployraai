# 80,000 Monitor Catalog Export

All **80,000 monitors** used in the 50-minute soak test are exported in:
📄 [monitors_80k.csv](file:///c:/mini%20Desktop/AI_Agents/engine/monitors_80k.csv) (15.8 MB CSV file)

## Schema

The CSV contains the following columns:
- `id`: Unique UUID generated per monitor
- `monitor_type`: Type of probe (`http`, `keyword`, `ping`, `port`, `heartbeat`, `dns`, `api`, `udp`)
- `url`: Exact target URL or address checked by the engine
- `keyword`: Expected substring match (for `keyword` and `api` types)
- `tag`: Monitoring category tag (`up_*`, `real_*`, `down`, `timeout`)
- `interval_seconds`: Check frequency (all set to 30 seconds)

## Breakdown (10,000 Monitors per Type)

| Type | Total Count | Real Targets (20%) | Mock Targets (80%) | Forced Down / Timeout |
|------|-------------|---------------------|--------------------|-----------------------|
| **`http`** | 10,000 | Google, GitHub, Cloudflare, Fastly, Wikipedia, Mozilla, httpbin | `https://mock-*.mock.local:8443/mock/up` | 200 down (503), 50 timeout |
| **`keyword`** | 10,000 | Google ("Google"), GitHub ("GitHub"), httpbin ("\"url\""), Cloudflare ("Cloudflare") | `https://mock-*.mock.local:8443/mock/keyword` ("HEALTHY") | 200 down |
| **`ping`** | 10,000 | 8.8.8.8, 1.1.1.1, 9.9.9.9, 208.67.222.222 | `https://mock-*.mock.local:8443/mock/up` | 200 down |
| **`port`** | 10,000 | google.com:443, github.com:443, cloudflare.com:443, httpbin.org:443 | `https://mock-*.mock.local:8443` | 200 down |
| **`heartbeat`**| 10,000 | Inbound check push simulation | `https://mock-*.mock.local:8443/mock/up` | 200 down |
| **`dns`** | 10,000 | google.com, github.com, cloudflare.com, mozilla.org, amazonaws.com | `https://mock-*.mock.local:8443/mock/up` | 200 down (NXDOMAIN) |
| **`api`** | 10,000 | api.github.com ("current_user_url"), httpbin.org/json ("slideshow") | `https://mock-*.mock.local:8443/mock/up` | 200 down, 50 timeout |
| **`udp`** | 10,000 | 8.8.8.8 (Google DNS:53), 1.1.1.1 | `https://mock-*.mock.local:8443/mock/up` | 200 down |
| **TOTAL** | **80,000** | **14,400 real target monitors** | **65,600 mock target monitors** | **2,000 incidents** |
