# Bandwidth Optimization Algorithms for Distributed Uptime Monitoring

These four protocol-level and architectural algorithms are designed to massively reduce outbound and inbound bandwidth usage for high-frequency monitoring engines (like Uptime-Engine), without compromising reliability or existing features.

## 1. Algorithmic Payload Decompression (`Accept-Encoding: br, gzip, zstd`)

### The Concept
For HTTP/API and "Keyword" monitors, the engine must download the HTML body of a website to scan it for specific strings. Downloading uncompressed text at high frequency (e.g., every 30 seconds) consumes massive bandwidth.

### The Optimization
For keyword monitors, the engine injects `Accept-Encoding: gzip, deflate, br, zstd` on outbound GET requests. Modern web servers compress the response before transmitting. The engine decodes up to a 64 KB keyword window in memory, then discards the remainder — so decompression bombs are capped at window size regardless of Content-Encoding.

### The Benefit
Standard HTML/JSON text compresses at a **70% to 90% ratio**. A 128 KB payload is compressed down to roughly 15 KB to 25 KB over the wire. For a fleet of 35,000 monitors, this algorithm single-handedly saves approximately **36 Terabytes of bandwidth per month**.

### Implementation Status — Canary Rollout

The feature is implemented and live but gated behind `COMPRESSION_PERCENT` (default 0).

**Architecture:**
- `bodyread.go` — bounded, classified, multi-codec body reader (identity/gzip/deflate/br/zstd). The keyword window is measured in decoded bytes; a full window is not an error.
- `bodymetrics.go` — lock-free atomic counters per cohort (control/canary) × encoding. Flushed as one `[BODY_STATS]` log line per minute. Exposes `StartAdminServer` on `ADMIN_ADDR` (default `127.0.0.1:9101`) for runtime `COMPRESSION_PERCENT` changes without a redeploy:
  ```
  GET  /admin/compression          # current value
  POST /admin/compression?pct=10   # set to 10%
  ```
- Per-monitor cohort selection is a stable FNV hash of the monitor ID, so canary/control membership does not change between check intervals.

**Ramp criteria (do not skip steps):**

| Step | Wait | Gate |
|------|------|------|
| 1% canary | 24 h, ≥ several thousand canary checks | Canary `failures` ≤ control + noise; no excess `BODY_DECODE` / `BODY_TRUNCATED`; `window_full` ratio similar between cohorts |
| 10% | 24 h | Same |
| 100% | — | Same |

`RecordBody` only covers the body-read phase. **Also compare canary vs control on:** check failure rate, incidents opened, alerts sent, probe RSS and CPU at each ramp step.

**Kill switch:** `POST /admin/compression?pct=0` — takes effect on the next check cycle, no restart needed.

**Known gap:** Truncated chunked identity bodies surface as clean `io.EOF` at the fasthttp stream layer (tracked in `TestChunkedTruncationGap`, marked `t.Skip`). The multi-ASN quorum limits the damage: one probe's truncation cannot flip a monitor DOWN alone. Compressed chunked bodies are protected by the codec's own truncation detection.

---

## 1a. Phase 2: Conditional Requests (`If-None-Match` / `If-Modified-Since`)

### Pre-qualification gate (build this first)
Add a counter to `RecordBody` for responses that carry a stable `ETag` or `Last-Modified` header. **If fewer than ~20% of monitored responses have a stable validator, skip Phase 2** — conditional requests save nothing on dynamic pages that emit a per-request ETag or none at all.

### Design (only if the gate passes)
- **Only when the last full result was a clean pass.** If a monitor is failing or recovering, always do an unconditional GET so recovery detection is not delayed. On a 304, reuse the stored pass.
- **State lives in memory** (validator, last-full-check time, last result) — not in the DB.
- **Force a full GET at least every 5 minutes per monitor.** A CDN would serve the same stale content on a 200 as on a 304; the unconditional floor protects against servers whose ETag is not content-derived (e.g. a build-ID ETag on a page with a dynamic error banner).
- **Skip for API-assertion monitors** unless the validators are known to be trustworthy.

### Honest sizing note
With `MaxIdleConnDuration: 2s`, most checks pay a fresh TCP+TLS handshake (~4–6 KB or more). A 304 saves only the remaining body bytes on top of that. **Connection reuse may be a comparable lever**, but it costs probe RAM (idle connections stay open). Measure connection reuse savings separately, at each ramp step, before attributing bandwidth reduction to conditional requests alone.

---

## 2. TCP Half-Open "Stealth" Handshakes (SYN-RST)

### The Concept
For standard TCP Port monitors (e.g., verifying if a database on port 5432 is alive), standard HTTP clients perform a full TCP 3-way handshake (`SYN` → `SYN-ACK` → `ACK`) and a graceful teardown (`FIN` → `ACK`). This uses 5 network packets.

### The Optimization
The port monitor is rewritten to function as a stealth port scanner. The engine sends a `SYN` packet. As soon as the target server replies with a `SYN-ACK` (verifying the port is open and listening), the engine immediately fires an `RST` (Reset) packet and abandons the connection.

### The Benefit
This intentionally skips the final `ACK` and the entire `FIN` teardown sequence. It reduces the packet count for port checks by **40%**. More importantly, it bypasses the operating system's `FIN_WAIT` and `TIME_WAIT` states, freeing up thousands of ephemeral sockets and saving OS network buffer RAM.

---

## 3. TLS Certificate Compression (RFC 8879)

### The Concept
When an engine establishes an HTTPS connection, the remote server transmits its SSL/TLS certificate chain. These certificates are typically 3 KB to 5 KB in size, meaning the certificate overhead is often larger than the actual HTTP request/response combined.

### The Optimization
TLS 1.3 supports RFC 8879 (Certificate Compression). The Go TLS client is explicitly configured to advertise support for `compress_certificate` during the `ClientHello` phase.

### The Benefit
If the remote server supports RFC 8879, it compresses the SSL certificate chain before transmission. Because the engine establishes millions of TLS connections daily (whenever Keep-Alive pooling fails or times out), saving 2 KB to 3 KB per handshake translates to hundreds of gigabytes in cumulative monthly bandwidth savings.

---

## 4. Dynamic "Lazy-Sync" In-Memory Cache for DNS

### The Concept
When an HTTP Keep-Alive connection drops, the engine must re-establish the connection. Standard HTTP clients will organically perform a DNS resolution query (UDP packet to `127.0.0.53` or upstream `1.1.1.1`) to resolve the domain to an IP address.

### The Optimization
Implement a strictly enforced, memory-mapped LRU cache for DNS records that perfectly obeys the domain's TTL (Time-To-Live). The HTTP dialer is hooked into this cache. The engine forces the dialer to read from the local `sync.Map` hashmap, and only triggers an outbound UDP query when the TTL mathematically expires.

### The Benefit
Eliminates hundreds of millions of redundant outbound UDP packets. While the bandwidth saved is relatively small (~50 GB/month), it drastically reduces **latency** and CPU context-switching overhead by entirely skipping the OS-level system calls for DNS resolution.
