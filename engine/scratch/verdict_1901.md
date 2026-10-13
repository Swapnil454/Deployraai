<USER_REQUEST>
# Verdict: good run, but 4 of the 6 PASS rows aren't proven. Fix shutdown and rerun the 10 minutes.

This is the first run where the rate, invariant and footprint look plausible together. The two failures are real. The explanation for the duplicates is believable but needs a number behind it.

## What holds up

- **The invariant arithmetic is right:** 62,123 + 1,041 + 0 + 101 = 63,265.
- **Reaper rows are 0.** Overload no longer shows up as outages in this run.
- **RSS is flat at about 268 MiB** for 8+ minutes. That is a reasonable footprint at this scale (3,000 monitors, about 105 checks/s).
- **The duplicate explanation is plausible.** At 3.5% injected failures, about 2,100 scheduled checks fail over 600s, each triggering one or more verification probes in the same 30s bucket. 4,170 buckets fits that.

## Rows marked PASS that I can't accept yet

**1. The rate target was fitted to the result.** 3,000 monitors × 600s ÷ 30s is 60,000 scheduled checks, not about 63,000. The 62,996 total includes verification probes (`probe_kind=1`). Report scheduled and verification counts separately. Scheduled should land within 5% of 60,000, and the verification count should roughly match the failure count times the recheck rule. "Gap 0.0%" against a target derived from the actual is not a test.

**2. The telemetry gate is not met.** The criterion was: after a clean stop and one replay, `flushed == enqueued` within 0.5%, `in_flight` 0, spool empty.
- At the stop, 1,041 rows were `failed` and 101 were `in_flight`. That is 1.8% of rows not yet flushed.
- The spool is empty, so those 1,041 either landed on the server despite the client failing them (the 2s-timeout pattern from before) or were lost. If they had been replayed, `failed` would have dropped.
- The run ended with a forced exit at 5.07s, so no final flush or replay can have completed.
- Query ClickHouse `count()` and `uniqExact` against `enqueued` after the engine is down. It should be within 0.5%, and `failed` and `in_flight` should be
<truncated 1838 bytes>
rkers
- abandon the rest, leaving each abandoned goroutine its own request and response, never returned to the pools
- run the final telemetry flush with a short timeout and spool the remainder
- exit 0

Waiting on slow handshakes for the full 5s is what causes the forced exit and loses the final flush.

## Still missing from the full table

| Item | Status |
|---|---|
| Mock request count vs engine HTTP checks (within 5%) | Not reported |
| False-DOWN and false-UP vs mock log | Not reported |
| Bytes per check, CPU seconds per check | Not reported |
| Goroutines and FDs flat | Not reported |
| Production-path handshake test (check ends at about the deadline) | Open |
| Reuse after 30-60s idle, server keeps connection open | Open |
| Body-hang test through the production path | Open |
| `docker stop` exit code with in-flight load | Open (this run forced exit 2) |

## Next

1. Implement the bounded drain above, and fix the duplicate query to report both kinds.
2. Close the open tests in the table (the three production-path items).
3. Rerun the 10-minute C-on run and paste the full table: scheduled vs verification counts, post-stop `count()` vs `enqueued`, tier breakdown of reuse and `warm_retry`, mock vs engine counts, false-DOWN, bytes and CPU per check, goroutines and FDs, exit code and time to exit.

Hold the 30-minute run until that table is clean.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-12T18:55:03+05:30.

The user's current state is as follows:
Active Document: c:\mini Desktop\AI_Agents\engine\core\tlstracker.go (LANGUAGE_GO)
Cursor is on line: 1
Other open documents:
- c:\mini Desktop\AI_Agents\engine\loadtest\run_brutal.ps1 (LANGUAGE_POWERSHELL)
- c:\mini Desktop\AI_Agents\engine\loadtest\mock\idle_test.go (LANGUAGE_GO)
- c:\mini Desktop\AI_Agents\engine\core\confirmation.go (LANGUAGE_GO)
- c:\mini Desktop\AI_Agents\engine\core\tlstracker.go (LANGUAGE_GO)
- c:\mini Desktop\AI_Agents\engine\core\keepalive_test.go (LANGUAGE_GO)
</ADDITIONAL_METADATA>