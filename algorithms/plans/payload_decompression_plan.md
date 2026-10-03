# Cross-Verification and Upgraded Plan

The plan is directionally right, but several claims are wrong, unsupported, or too absolute, and fixing them makes it stronger. Some of the issues come from my earlier answer, which I flag below.

## Part 1: Verification findings

| # | Claim in plan | Verdict | Fix |
|---|---|---|---|
| 1 | "Saves ~36 TB/month" | **Unverifiable.** No inputs are given. | Derive it from monitor count × interval × median body size. |
| 2 | Compression saves bandwidth | **Misleading baseline.** Go's `net/http` already requests gzip transparently. The real *incremental* gain from br/zstd is about 15-25% over gzip, not the full compression ratio. | Report savings vs. a gzip-only baseline, and be honest about which number is which. |
| 3 | `Accept-Encoding: br, zstd, gzip` "mimics modern Chrome" | **Not literally true.** Chrome sends `gzip, deflate, br, zstd`. | Send the exact browser string. CDNs often normalize cache keys on it. |
| 4 | "WAF Evasion" | **Overstated.** Accept-Encoding is a minor signal. TLS fingerprint (JA3/JA4), header order, and HTTP/2 settings matter far more. | Rename it "variant fidelity", and recommend customers allowlist probe IPs/UA. |
| 5 | `io.LimitReader` as bomb defense | **Flawed (my earlier code had this bug too).** It returns clean EOF at the cap, so a truncated body looks complete. A "keyword absent" check would then give a false pass. | Use a custom reader that returns `ErrBodyTooLarge` (code below). |
| 6 | `sync.Pool` for decoders, "per-request allocation strictly forbidden" | **Partly wrong.** klauspost zstd decoders can spawn goroutines, and a GC-dropped pooled decoder leaks them. Pooled decoders also pin the previous connection's body unless you `Reset(nil)`. "Forbidden" is too absolute. | Use a bounded channel pool with `WithDecoderConcurrency(1)`, `Reset(nil)` on return, and explicit `Close` on eviction. Benchmark before mandating pooling. |
| 7 | Early abort with forced TCP close | **Often a net loss.** Killing the connection forces a new TCP+TLS handshake next check, which can cost more than the remaining bytes of a small page. Also, "within first few KB" is unrealistic for body text. | On HTTP/2/3, cancel the stream and keep the connection. On HTTP/1.1, abort only if the remaining body is large or unknown, otherwise drain up to a threshold. |
| 8 | "Keyword must be present" stops at the first match | **Correct.** | Keep, with the policy above. |
| 9 | Ratio drop 5:1 → 1:1 as alert | **Noisy.** Ratio depends on content, and error pages compress differently. | Alert on *loss of Content-Encoding* or a deviation from a per-monitor baseline with hysteresis. |
| 10 | Dictionary transport yields "practically zero bytes" | **Overoptimistic.** It requires the origin to opt in (`Use-As-Dictionary`), is same-origin only, needs per-origin dictionary storage on every probe, and pages with unique tokens still send deltas. Origin adoption is currently low. | Expect large but not zero savings, only on opted-in origins. Verify the current RFC status before citing it. |
| 11 | zstd 8 MB window cap per RFC 9659 | **Correct.** | Also set `WithDecoderMaxMemory` as a second guard. |
| 12 | KMP / overlap buffer for chunk boundaries | **Correct.** | Add Aho-Corasick for multi-keyword, plus charset and case-folding rules. |

## Part 2: The biggest missed lever

**Conditional requests beat compression for stable pages.** Send `If-None-Match` / `If-Modified-Since`. A `304` costs a few hundred bytes versus the whole body, so it is far larger than the br-vs-gzip delta.

Guardrails:
- Reuse the previous keyword result on 304.
- Force a full unconditional GET every Nth check (e.g., every 10th) and on any state change, because a CDN can serve 304 from cache while the origin is down.
- Never use it for API monitors that assert on dynamic fields unless the ETag is trusted.

## Part 3: The upgraded plan

**Phase 0: Baseline (week 1).** Measure wire bytes and decoded bytes per check, split by codec. Compute true savings against the gzip baseline. This replaces the 36 TB guess with a real number.

**Phase 1: Safe core.**
- Set `Transport.DisableCompression = true` and send the exact browser `Accept-Encoding`.
- Use a decoder registry for gzip, br, zstd, and identity. Tolerate multi-member gzip, reject unknown or chained encodings with a classified error, and handle servers that lie about the encoding.
- Apply hard caps on wire bytes, decoded bytes, expansion ratio, and total wall-clock time, plus a minimum-throughput check for slow-drip.
- Give every failure its own class: `body_truncated`, `body_too_large`, `decode_error`, `keyword_missing`. Never merge them.

```go
type cappedReader struct{ r io.Reader; left int64 }
var ErrBodyTooLarge = errors.New("decoded body exceeds cap")

func (c *cappedReader) Read(p []byte) (int, error) {
    if c.left <= 0 {
        // probe one byte: EOF means exactly at cap, data means over cap
        var b [1]byte
        if n, _ := c.r.Read(b[:]); n > 0 { return 0, ErrBodyTooLarge }
        return 0, io.EOF
    }
    if int64(len(p)) > c.left { p = p[:c.left] }
    n, err := c.r.Read(p)
    c.left -= int64(n)
    return n, err
}
```

**Phase 2: Bandwidth multipliers.**
- Conditional requests with periodic full verification.
- Connection reuse, HTTP/2, and TLS session resumption. For small pages, handshakes can cost more than payload.
- Smart early exit as described in finding 7.
- Optional `Range` for "keyword in first N KB" monitors. Be careful here, since ranges apply to the *encoded* representation and many servers ignore them on compressed content.

**Phase 3: Fidelity and observability.**
- Per-check record: encoding, wire bytes, decoded bytes, TTFB, download time, decode time, HTTP version, connection reused.
- Alert on encoding loss, not raw ratio.
- Periodically probe each encoding variant separately (e.g., 1 in 20 checks forces gzip) to catch broken CDN variants.

**Phase 4: Rollout discipline.**
- Feature flag with per-monitor opt-out and a global kill switch.
- Canary on about 1% of monitors, then 10%, then 100%, gated on the false-alert rate.
- Test corpus: valid gzip/br/zstd, truncated streams, chunk-boundary keywords, bombs, concatenated members, wrong header, empty body, non-UTF-8 charsets.
- Fuzz the decoder wrappers and benchmark decoder pooling.

**Phase 5: Dictionary transport (opportunistic).** Add it behind a flag, only for origins that advertise `Use-As-Dictionary`, with per-probe dictionary caches, size limits, and a fallback to normal decoding on a miss.

## The honest optimistic framing

Realistic gains in order of impact:
1. Conditional requests, where they apply.
2. Connection reuse and avoiding handshakes.
3. br/zstd over gzip, a modest 15-25% on text.
4. Dictionary transport, large on a small slice of origins.

Reliability gains (correct failure classification, cap-aware matching, no false "keyword missing" alerts) may matter more to your customers than the bandwidth savings.
