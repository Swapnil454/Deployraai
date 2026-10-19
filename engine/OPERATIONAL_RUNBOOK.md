# Production Telemetry Pipeline Operational Runbook

## 1. Architecture & Storage Partition Layout
The telemetry pipeline buffers and spools check samples to provide zero-loss durability during ClickHouse network partitions, quorum degradation, and server slowdowns.

- **Primary Transmission**: Fast non-blocking channel buffered to 65,536 samples (`core.TelemetryQueue`).
- **Production Storage Partition**: The telemetry spool directory defaults to `/var/lib/uptime-engine/spool` on the host, mounted to a dedicated 250 GB NVMe partition to ensure telemetry backlogs never contend with root filesystem I/O.
- **Configurability**: Configurable via the `TELEMETRY_SPOOL_DIR` environment variable.
- **Circuit Breaker**: When ClickHouse fails or merges stall, the circuit breaker opens for 5 seconds, diverting all batches directly to local NVMe spooling without blocking worker goroutines.
- **Breaker Re-Probe Alignment**: When the 5-second breaker window expires, the accumulator executes `core.ProbeClickHouseHealth(ctx, conn, core.ClickHouseProbeTimeout)` (`conn.Ping`). The probe deadline is strictly aligned with the query flush context deadline (`core.ClickHouseFlushTimeout = 2 * time.Second`). Bare TCP connects (`net.DialTimeout`) are never used as a health signal.
- **Monotonic Sequence Ordering**: Every spooled batch is assigned an atomic monotonic sequence number `globalSpoolSequence` and formatted as:
  `/var/lib/uptime-engine/spool/seg-%016d-%s.bin` (e.g. `seg-0000000000000001-<token>.bin`).
  Replay ordering is strictly keyed on `(seq, filename)`, making replay order completely immune to filesystem timestamp coarseness, timezone resets, or `cp`/`tar` restore timestamp alterations.

---

## 2. Spool Directory Layout
```
/var/lib/uptime-engine/spool/
├── seg-0000000000000001-000000015205e542859c482c000000000000000100000000.bin
├── seg-0000000000000002-000000015205e542859c482c000000000000000200000000.bin
└── quarantine/
    └── seg-broken-schema-example.bin
```

---

## 3. Quarantine Classification Rules & SLA Monitoring
1. **Retryable Errors** (e.g., connection refused, dial timeout, context deadline exceeded, quorum failed code 285):
   - **NEVER quarantined**.
   - Spool files remain in `/var/lib/uptime-engine/spool/` and will be re-attempted indefinitely until ClickHouse recovers.
2. **Non-Retryable Errors** (e.g., code 60 table not found, code 115 unknown setting, type mismatch):
   - Increments `core.TelemetryAlertCount` immediately.
   - Quarantined only after $\ge 3$ failed attempts spaced across `core.QuarantineBackoffWindow` (10 minutes).
   - Increments `core.TelemetryQuarantineCount`.
3. **10-Minute SLA Alert**:
   - `core.TelemetryOldestSpoolAgeSeconds` monitors the age of the oldest pending spool segment.
   - If any un-replayed segment exceeds 600 seconds (10 minutes), the engine fires:
     `[TELEMETRY ALERT] Oldest spool segment <name> has been un-replayed for <age> (exceeds 10m SLA)`
     and increments `core.TelemetryAlertCount`.

---

## 4. Quarantine Alert Triage Procedure
When Prometheus alert `TelemetryQuarantineActive` fires (`TelemetryQuarantineCount > 0`):

### Step 1: Inspect Quarantined Files
List quarantined files and inspect file metadata:
```bash
ls -lh /var/lib/uptime-engine/spool/quarantine/
```

### Step 2: Decode Segment Header & Preimage
Inspect the 24-byte header to identify the originating worker, nonce, and batch ID:
```bash
hexdump -C -n 30 /var/lib/uptime-engine/spool/quarantine/seg-*.bin
# Bytes 00-03: Magic "AGYS"
# Bytes 04-05: uint16 Version (2)
# Bytes 06-09: uint32 WorkerID (big-endian)
# Bytes 10-17: uint64 Nonce (big-endian)
# Bytes 18-25: uint64 BatchID (big-endian)
# Bytes 26-29: uint32 BlockOffset (big-endian)
```

### Step 3: Determine Root Cause from Engine Logs
Grep engine logs for non-retryable alert entries:
```bash
grep "\[TELEMETRY ALERT\]" /var/log/uptime-engine/engine.log | tail -n 20
```

---

## 5. Quarantine Re-Queue Procedure

Once the underlying issue in ClickHouse or the schema has been resolved:

### Step 1: Verify ClickHouse DDL & Connectivity
Test that ClickHouse is able to accept the table's inserts cleanly:
```bash
clickhouse-client --query "SELECT count() FROM default.uptime_checks_telemetry"
```

### Step 2: Atomic Re-Queue
Move the quarantined `.bin` segment(s) back into the active spool directory:
```bash
# Move a single segment:
mv /var/lib/uptime-engine/spool/quarantine/seg-<id>.bin /var/lib/uptime-engine/spool/

# Or bulk re-queue all segments:
mv /var/lib/uptime-engine/spool/quarantine/*.bin /var/lib/uptime-engine/spool/
```

### Step 3: Automated Monotonic Replay & Verification
The background replayer automatically detects newly restored segments on its next cycle:
1. Files are re-sorted strictly by monotonic sequence `(seq, filename)`.
2. Ingested under rate-limit ($\le 10\text{ batches/s}$).
3. Deduplication is enforced via the original immutable token, ensuring zero duplicate rows even if previously partially acknowledged.
4. Segments are deleted atomically upon receipt of ClickHouse ACK.
5. Verify that `quarantine/` is empty and pending spool files drain to 0:
```bash
ls -la /var/lib/uptime-engine/spool/
```
