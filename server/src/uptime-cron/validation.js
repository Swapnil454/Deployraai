const supportedIntervals = [
  15, 30, 45,
  ...Array.from({ length: 30 }, (_, index) => (index + 1) * 60),
  ...Array.from({ length: 5 }, (_, index) => (index + 7) * 5 * 60),
  ...Array.from({ length: 24 }, (_, index) => (index + 1) * 3600),
];

const allowedMethods = new Set(["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"]);
const allowedIpVersions = new Set(["auto_ipv4_priority", "ipv4_only", "ipv6_only"]);
const allowedAuthTypes = new Set(["none", "basic", "bearer"]);

function validatePairs(value, fieldName) {
  if (!Array.isArray(value) || value.length > 20) throw new Error(`${fieldName} must contain at most 20 entries.`);
  return value.map((pair) => {
    const key = String(pair?.key || "").trim();
    const pairValue = String(pair?.value || "").trim();
    if (!key) throw new Error(`Each ${fieldName} entry needs a key.`);
    if (/[\r\n]/.test(key) || /[\r\n]/.test(pairValue)) throw new Error(`${fieldName} cannot contain newlines.`);
    return { key, value: pairValue };
  });
}

export function validateMonitorPayload(payload) {
  let parsedUrl;
  try {
    parsedUrl = new URL(payload.url);
  } catch {
    throw new Error("A valid absolute HTTP or HTTPS URL is required.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Monitor URL must use HTTP or HTTPS.");

  const intervalSeconds = Number(payload.interval_seconds);
  const timeoutSeconds = Number(payload.timeout_seconds ?? 30);
  if (!supportedIntervals.includes(intervalSeconds)) throw new Error("The chosen monitor interval is not supported.");
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > 60) throw new Error("Timeout must be between 5 and 60 seconds.");
  if (timeoutSeconds >= intervalSeconds) throw new Error("Request timeout must be shorter than the monitor interval.");

  const authType = payload.auth_type || "none";
  if (!allowedAuthTypes.has(authType)) throw new Error("Unsupported authentication type.");
  if (authType === "basic" && (!payload.auth_username || !payload.auth_password)) throw new Error("Basic authentication needs a username and password.");
  if (authType === "bearer" && !payload.auth_bearer_token) throw new Error("Bearer authentication needs a token.");
  if (!allowedMethods.has(payload.http_method || "HEAD")) throw new Error("Unsupported HTTP method.");
  if (!allowedIpVersions.has(payload.ip_version || "auto_ipv4_priority")) throw new Error("Unsupported IP version.");

  if (payload.send_as_json && payload.request_body) {
    try { JSON.parse(payload.request_body); } catch { throw new Error("Request body must be valid JSON when Send as JSON is enabled."); }
  }

  const headers = validatePairs(payload.request_headers || [], "request headers");
  const duplicateHeaders = new Set(headers.map((header) => header.key.toLowerCase()));
  if (duplicateHeaders.size !== headers.length) throw new Error("Request header keys must be unique.");

  const slowThreshold = payload.slow_response_threshold_ms == null || payload.slow_response_threshold_ms === ""
    ? null
    : Number(payload.slow_response_threshold_ms);
  if (payload.slow_response_alert_enabled && (!Number.isInteger(slowThreshold) || slowThreshold <= 0)) {
    throw new Error("A positive slow response threshold in milliseconds is required.");
  }

  return {
    url: parsedUrl.toString(),
    group_id: payload.group_id || null,
    tags: Array.from(new Set((payload.tags || []).map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 30),
    interval_seconds: intervalSeconds,
    timeout_seconds: timeoutSeconds,
    ip_version: payload.ip_version || "auto_ipv4_priority",
    follow_redirects: payload.follow_redirects !== false,
    up_status_codes: Array.isArray(payload.up_status_codes) && payload.up_status_codes.length ? payload.up_status_codes : ["2xx", "3xx"],
    auth_type: authType,
    auth_username: payload.auth_username || null,
    auth_password: payload.auth_password || null,
    auth_bearer_token: payload.auth_bearer_token || null,
    http_method: payload.http_method || "HEAD",
    request_body: payload.request_body || null,
    send_as_json: Boolean(payload.send_as_json),
    request_headers: headers,
    meta_fields: validatePairs(payload.meta_fields || [], "meta fields"),
    ssl_check_enabled: Boolean(payload.ssl_check_enabled),
    ssl_error_check_enabled: payload.ssl_error_check_enabled !== false,
    ssl_expiry_reminder_enabled: payload.ssl_expiry_reminder_enabled !== false,
    domain_expiry_reminder_enabled: payload.domain_expiry_reminder_enabled !== false,
    slow_response_alert_enabled: Boolean(payload.slow_response_alert_enabled),
    slow_response_threshold_ms: slowThreshold,
  };
}

