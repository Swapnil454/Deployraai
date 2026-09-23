import dns from "node:dns/promises";
import crypto from "node:crypto";

const privateAddress = (address) => (
  /^127\./.test(address)
  || /^10\./.test(address)
  || /^192\.168\./.test(address)
  || /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  || /^169\.254\./.test(address)
  || /^0\./.test(address)
  || /^::1$/i.test(address)
  || /^f[cd]/i.test(address)
  || /^fe80:/i.test(address)
);

async function assertPublicTarget(url) {
  const parsed = new URL(url);
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
    throw new Error("The monitor URL resolves to a private or unavailable network address.");
  }
}

/**
 * Belt-and-suspenders: ensure a value from the DB is always a JS array.
 * pg driver correctly parses TEXT[] with our type-parser in db.js, but
 * this guard handles any edge case (old monitors, direct DB edits, etc.).
 */
function toArray(value) {
  if (Array.isArray(value)) return value;
  // Raw PostgreSQL TEXT[] string e.g. "{2xx,3xx}"
  if (typeof value === "string" && value.startsWith("{")) {
    const inner = value.slice(1, -1);
    if (!inner) return [];
    return inner.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g)
      ?.map((s) => s.startsWith('"') ? s.slice(1, -1) : s) ?? [];
  }
  return [];
}

function statusIsAccepted(statusCode, acceptedPatterns) {
  const patterns = toArray(acceptedPatterns);
  return patterns.some((pattern) => {
    if (/^[2-5]xx$/i.test(pattern)) return Math.floor(statusCode / 100) === Number(pattern[0]);
    return Number(pattern) === statusCode;
  });
}

/**
 * Full RFC 2617 / RFC 7616 Digest authentication.
 * Performs the two-round-trip challenge-response flow:
 *   1. Send request without credentials → server responds 401 + WWW-Authenticate
 *   2. Parse nonce/realm/algorithm, compute hash, resend with Authorization header
 *
 * Supports: algorithm=MD5 (default) and SHA-256.
 * Supports: qop=auth and no-qop.
 */
async function digestFetch(url, method, headers, body, signal) {
  // Round 1 — probe to get the challenge
  const probe = await fetch(url, {
    method: method === "QUERY" ? "GET" : method,
    headers,
    body,
    signal,
    redirect: "manual",
  });

  if (probe.status !== 401) return probe; // Server didn’t request auth — return as-is

  const wwwAuth = probe.headers.get("www-authenticate") ?? "";
  if (!wwwAuth.toLowerCase().startsWith("digest ")) return probe; // Not Digest — bail

  // Parse challenge parameters
  const params = {};
  for (const [, k, v] of wwwAuth.matchAll(/(\w+)=["']?([^"',]+)["']?/g)) {
    params[k.toLowerCase()] = v;
  }

  const { realm = "", nonce = "", qop, algorithm = "MD5", opaque } = params;
  const username = headers.get("_digest_username") ?? "";
  const password = headers.get("_digest_password") ?? "";
  headers.delete("_digest_username");
  headers.delete("_digest_password");

  const parsedUrl = new URL(url);
  const uri = parsedUrl.pathname + parsedUrl.search;
  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");

  function hash(str) {
    const algo = algorithm.toUpperCase().replace("-SESS", "");
    return crypto.createHash(algo === "SHA-256" ? "sha256" : "md5").update(str).digest("hex");
  }

  let ha1 = hash(`${username}:${realm}:${password}`);
  if (algorithm.toUpperCase().includes("-SESS")) {
    ha1 = hash(`${ha1}:${nonce}:${cnonce}`);
  }
  const ha2 = hash(`${method}:${uri}`);

  let responseHash;
  let qopPart = "";
  if (qop && qop.split(",").map((s) => s.trim()).includes("auth")) {
    responseHash = hash(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
    qopPart = `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  } else {
    responseHash = hash(`${ha1}:${nonce}:${ha2}`);
  }

  const authHeader = [
    `Digest username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `algorithm=${algorithm}`,
    `response="${responseHash}"`,
    opaque ? `opaque="${opaque}"` : "",
    qopPart,
  ].filter(Boolean).join(", ");

  headers.set("authorization", authHeader);

  // Round 2 — authenticated request
  return fetch(url, {
    method: method === "QUERY" ? "GET" : method,
    headers,
    body,
    signal,
    redirect: "manual",
  });
}


export async function runHttpCheck(monitor) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), monitor.timeout_seconds * 1000);

  try {
    await assertPublicTarget(monitor.url);

    const headers = new Headers();

    // Safely iterate request_headers — handles raw pg string, array, or empty
    for (const { key, value } of toArray(monitor.request_headers)) {
      if (key) headers.set(key, value ?? "");
    }

    if (monitor.auth_type === "basic" || monitor.auth_type === "digest") {
      // For Basic: encode and send directly.
      // For Digest: we stash credentials in special headers that digestFetch() will
      // read internally — they are NEVER forwarded to the target server.
      if (monitor.auth_type === "basic") {
        headers.set(
          "authorization",
          "Basic " + Buffer.from((monitor.auth_username ?? "") + ":" + (monitor.auth_password ?? "")).toString("base64"),
        );
      } else {
        // Stash for digestFetch() — removed before round-2 request
        headers.set("_digest_username", monitor.auth_username ?? "");
        headers.set("_digest_password", monitor.auth_password ?? "");
      }
    }
    if (monitor.auth_type === "bearer") {
      headers.set("authorization", "Bearer " + (monitor.auth_bearer_token ?? ""));
    }
    if (monitor.request_body && ["POST", "PUT", "PATCH"].includes(monitor.http_method)) {
      headers.set("content-type", monitor.send_as_json ? "application/json" : "application/x-www-form-urlencoded");
    }

    const fetchArgs = [
      monitor.url,
      monitor.http_method === "QUERY" ? "GET" : monitor.http_method,
      headers,
      ["POST", "PUT", "PATCH"].includes(monitor.http_method) ? monitor.request_body : undefined,
      controller.signal,
    ];

    const response = monitor.auth_type === "digest"
      ? await digestFetch(...fetchArgs)
      : await fetch(monitor.url, {
          method: monitor.http_method === "QUERY" ? "GET" : monitor.http_method,
          headers,
          body: ["POST", "PUT", "PATCH"].includes(monitor.http_method) ? monitor.request_body : undefined,
          redirect: monitor.follow_redirects ? "follow" : "manual",
          signal: controller.signal,
        });

    const responseTimeMs = Date.now() - startedAt;
    const patterns = toArray(monitor.up_status_codes);
    let success = statusIsAccepted(response.status, patterns);

    // Capture response headers as plain object for incident detail view
    const responseHeaders = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    let errorMessage = success ? null : `Received ${response.status}, expected ${patterns.join("/")}`;
    let cause = success ? null : "bad_status_code";

    if (success && monitor.monitor_type === "keyword" && monitor.keyword) {
      try {
        const text = await response.text();
        const keywordToFind = monitor.case_sensitive ? monitor.keyword : monitor.keyword.toLowerCase();
        const textToSearch = monitor.case_sensitive ? text : text.toLowerCase();
        
        const exists = textToSearch.includes(keywordToFind);
        const condition = monitor.keyword_condition;

        if (condition === "exists" && !exists) {
          success = false;
          errorMessage = `Keyword "${monitor.keyword}" was not found in response`;
          cause = "keyword_match_failed";
        } else if (condition === "not_exists" && exists) {
          success = false;
          errorMessage = `Keyword "${monitor.keyword}" was found in response`;
          cause = "keyword_match_failed";
        }
      } catch (err) {
        success = false;
        errorMessage = "Failed to read response body for keyword check";
        cause = "keyword_match_failed";
      }
    }

    return {
      success,
      statusCode: response.status,
      responseTimeMs,
      responseHeaders,
      errorMessage,
      cause,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startedAt;
    const timedOut = error.name === "AbortError";
    return {
      success: false,
      statusCode: null,
      responseTimeMs,
      errorMessage: timedOut ? "Request timed out" : (error.message ?? "Unknown error"),
      cause: timedOut ? "timeout" : "connection_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
