<USER_REQUEST>
Verdict: close, but don’t start the 30-minute run yet. Most of what’s open can be answered from data you already have.

This is the best run so far. The shutdown, invariant and handshake results look real. But several PASS rows contradict the data around them, and two explanations conflict with each other.

What I accept
Shutdown: exit 0 in 2.30s with in-flight load, which meets the “under 5s” gate.
Invariant arithmetic: 54,243 + 0 + 0 + 543 = 54,786. Post-stop ClickHouse count is 54,705, a 0.15% gap, with an empty spool.
Reaper rows: 0, so overload no longer shows up as outages.
The mock tiers work. It closed 10,097 connections at 5s and 5,540 at 15s. The 60s and 75s tiers show zero closes, which is expected at a 30s interval.
Handshake bound on the production path: DOWN in 2.209s against a server that never replies.
Reuse after 31s idle with the server holding the socket open: reused=true, StaleSocketCount=0. That closes my SetWriteDeadline concern for this case.
CPU per check: 0.001011 s matches 9.22% × 600s ÷ 54,705, and the bytes per check of about 3,964 matches 206.8 MiB ÷ 54,705. That is about 1,000 checks/s per core, close to my earlier guess, but it is one run with retries and handshakes included, so don’t treat it as a capacity number.
Rows marked PASS that don’t hold up

1. The scheduled count is 8.8% short. The expected figure is 20.0 checks per monitor, which is 60,000 in total. The report’s 19.5 drops the first check. Actual is 54,705 (18.23 per monitor). That fails the 5% criterion. Drift from scheduling at now + interval explains well under 1%. Show the distribution of checks per monitor (min, median, max). A group of monitors running far behind would show up there.

2. The mock reconciliation is wrong, and its explanation double counts.

The engine produced 54,705 rows; the mock’s handlers saw 43,763. That is 20% fewer, against a 5% criterion.
The explanation says 10,942 checks failed on a closed socket “before reaching the mock handlers”, then succeeded via 
<truncated 2102 bytes>
e-DOWN and false-UP against the mock’s request log	Not reported
warm_retry per tier, and NoKeepAlive count over time	Not reported
Does warm_retry fall from minutes 0-3 to 7-10?	Not reported
Effective-config line and arm switch	Not shown
-race -count=5 on the final tree	Predates the drain, scheduling and flush changes and 2 new tests

Two model issues to fix in the mock:

The idle tier is picked per connection. Real servers have one setting per host, so per-host NoKeepAlive can’t learn anything here. Pick the tier per target hostname instead.
Bytes per check includes ClickHouse and Postgres traffic from the engine container. Measure only the interface facing the mock. Use the number to compare arms, not as an absolute.
Do this once, then start Step 5
Answer 1, 2, 3 and 4 from the existing data. I mean the per-monitor distribution, the request-ID reconciliation, the real FD and goroutine series, and the recheck config diff.
Fix the mock tier per host, add false-DOWN against the mock log, and add the warm_retry per-tier and over-time breakdown.
Spool the remainder on shutdown, and add the goroutine-baseline assertions.
Run -race -count=5 ./core/... in Docker on the final tree.
Rerun the 10 minutes once and paste the full table. If the scheduled count is within 5% and the mock matches within 5%, move on to the 30-minute run, then the six.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-12T19:41:05+05:30.

The user's current state is as follows:
Active Document: c:\mini Desktop\AI_Agents\engine\core\tlstracker.go (LANGUAGE_GO)
Cursor is on line: 1
Other open documents:
- c:\mini Desktop\AI_Agents\algorithms\1M Monitors @ 30s Final Goals and Exit Criteria.md (LANGUAGE_MARKDOWN)
- c:\mini Desktop\AI_Agents\migrations\clickhouse\001_init.sql (LANGUAGE_SQL)
- c:\mini Desktop\AI_Agents\engine\core\defect_test.go (LANGUAGE_GO)
- c:\mini Desktop\AI_Agents\engine\loadtest\mock\main.go (LANGUAGE_GO)
- c:\mini Desktop\AI_Agents\engine\loadtest\seed_brutal\main.go (LANGUAGE_GO)
</ADDITIONAL_METADATA>