import dns from "node:dns/promises";

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

    if (monitor.auth_type === "basic") {
      headers.set(
        "authorization",
        "Basic " + Buffer.from((monitor.auth_username ?? "") + ":" + (monitor.auth_password ?? "")).toString("base64"),
      );
    }
    if (monitor.auth_type === "bearer") {
      headers.set("authorization", "Bearer " + (monitor.auth_bearer_token ?? ""));
    }
    if (monitor.request_body && ["POST", "PUT", "PATCH"].includes(monitor.http_method)) {
      headers.set("content-type", monitor.send_as_json ? "application/json" : "application/x-www-form-urlencoded");
    }

    const response = await fetch(monitor.url, {
      method: monitor.http_method === "QUERY" ? "GET" : monitor.http_method,
      headers,
      body: ["POST", "PUT", "PATCH"].includes(monitor.http_method) ? monitor.request_body : undefined,
      redirect: monitor.follow_redirects ? "follow" : "manual",
      signal: controller.signal,
    });

    const responseTimeMs = Date.now() - startedAt;
    const patterns = toArray(monitor.up_status_codes);
    const success = statusIsAccepted(response.status, patterns);

    return {
      success,
      statusCode: response.status,
      responseTimeMs,
      errorMessage: success ? null : `Received ${response.status}, expected ${patterns.join("/")}`,
      cause: success ? null : "bad_status_code",
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
