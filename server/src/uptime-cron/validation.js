import net from "net";
import crypto from "node:crypto";

export function isForbiddenIP(ip) {
  if (!net.isIP(ip)) return false;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true;
  if (ip === "::1" || ip.toLowerCase() === "::ffff:127.0.0.1") return true;
  return false;
}

export function isValidTargetHost(host) {
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) return false;
  if (isForbiddenIP(host)) return false;
  return true;
}

const supportedIntervals = [
  15, 30, 45,
  ...Array.from({ length: 30 }, (_, index) => (index + 1) * 60),
  ...Array.from({ length: 5 }, (_, index) => (index + 7) * 5 * 60),
  ...Array.from({ length: 24 }, (_, index) => (index + 1) * 3600),
];

const allowedMethods = new Set(["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"]);
const allowedIpVersions = new Set(["auto_ipv4_priority", "ipv4_only", "ipv6_only"]);
const allowedAuthTypes = new Set(["none", "basic", "digest", "bearer"]);

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
  const monitor_type = payload.monitor_type === "dns" ? "dns" : payload.monitor_type === "heartbeat" ? "heartbeat" : payload.monitor_type === "keyword" ? "keyword" : payload.monitor_type === "ping" ? "ping" : payload.monitor_type === "port" ? "port" : "http";

  let parsedUrl = null;
  let target_host = null;
  let target_port = null;
  let connect_timeout = null;
  let packet_count = null;
  let packet_timeout = null;

  if (monitor_type === "ping" || monitor_type === "port") {
    target_host = String(payload.target_host || "").trim();
    if (!target_host) throw new Error(`A target host or IP is required for ${monitor_type} monitoring.`);
    if (target_host.includes("://") || target_host.includes("/")) {
      throw new Error("Target host must be a bare IP or hostname, not a URL.");
    }
    if (!isValidTargetHost(target_host)) {
      throw new Error("Target host points to a forbidden internal or private network address.");
    }
    
    if (monitor_type === "ping") {
      packet_count = Number(payload.packet_count);
      if (!Number.isInteger(packet_count) || packet_count < 1 || packet_count > 10) {
        throw new Error("Packet count must be between 1 and 10.");
      }

      packet_timeout = Number(payload.packet_timeout);
      if (!Number.isInteger(packet_timeout) || packet_timeout < 100 || packet_timeout > 5000) {
        throw new Error("Packet timeout must be between 100ms and 5000ms.");
      }
    } else if (monitor_type === "port") {
      target_port = Number(payload.target_port);
      if (!Number.isInteger(target_port) || target_port < 1 || target_port > 65535) {
        throw new Error("Target port must be a valid integer between 1 and 65535.");
      }
      
      connect_timeout = Number(payload.connect_timeout);
      if (!Number.isInteger(connect_timeout) || connect_timeout < 1000 || connect_timeout > 60000) {
        throw new Error("Connect timeout must be between 1000ms and 60000ms.");
      }
    }
  } else if (monitor_type !== "heartbeat" && monitor_type !== "dns") {
    try {
      parsedUrl = new URL(payload.url);
    } catch {
      throw new Error("A valid absolute HTTP or HTTPS URL is required.");
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Monitor URL must use HTTP or HTTPS.");
  }

  const intervalSeconds = Number(payload.interval_seconds);
  const timeoutSeconds = Number(payload.timeout_seconds ?? 30);
  if (!supportedIntervals.includes(intervalSeconds)) throw new Error("The chosen monitor interval is not supported.");
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > 60) throw new Error("Timeout must be between 5 and 60 seconds.");
  if (timeoutSeconds >= intervalSeconds) throw new Error("Request timeout must be shorter than the monitor interval.");

  const authType = payload.auth_type || "none";
  if (monitor_type !== "ping" && monitor_type !== "port") {
    if (!allowedAuthTypes.has(authType)) throw new Error("Unsupported authentication type.");
    if ((authType === "basic" || authType === "digest") && (!payload.auth_username || !payload.auth_password)) {
      throw new Error("Basic/Digest authentication needs a username and password.");
    }
    if (authType === "bearer" && !payload.auth_bearer_token) throw new Error("Bearer authentication needs a token.");
    if (!allowedMethods.has(payload.http_method || "HEAD")) throw new Error("Unsupported HTTP method.");
  }
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


  let keyword = null;
  let keyword_condition = null;
  let case_sensitive = false;

  if (monitor_type === "keyword") {
    keyword = String(payload.keyword || "").trim();
    if (!keyword) throw new Error("A keyword is required for keyword monitoring.");
    keyword_condition = payload.keyword_condition === "exists" ? "exists" : "not_exists";
    case_sensitive = Boolean(payload.case_sensitive);
  }

  let grace_period_seconds = null;
  let heartbeat_token = null;
  if (monitor_type === "heartbeat") {
    grace_period_seconds = Number(payload.grace_period_seconds);
    if (!Number.isInteger(grace_period_seconds) || grace_period_seconds < 0 || grace_period_seconds > 604800) {
      throw new Error("Grace period must be an integer between 0 and 7 days.");
    }
    heartbeat_token = payload.heartbeat_token;
    if (!heartbeat_token) {
      heartbeat_token = crypto.randomBytes(16).toString("hex");
    }
  }

  let dns_hostname = null;
  let dns_record_type = null;
  let dns_expected_values = [];
  let dns_match_mode = null;
  let dns_resolver_mode = null;
  let dns_custom_resolver_ip = null;

  if (monitor_type === "dns") {
    dns_hostname = String(payload.dns_hostname || "").trim();
    if (!dns_hostname) throw new Error("A hostname is required for DNS monitoring.");
    
    dns_record_type = String(payload.dns_record_type || "").toUpperCase();
    if (!["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA"].includes(dns_record_type)) {
      throw new Error("Unsupported DNS record type.");
    }
    
    dns_match_mode = String(payload.dns_match_mode || "exact_set").toLowerCase();
    if (!["exact_set", "contains", "any_match"].includes(dns_match_mode)) {
      throw new Error("Invalid match mode.");
    }
    
    dns_resolver_mode = String(payload.dns_resolver_mode || "authoritative").toLowerCase();
    if (!["system_default", "public_resolver", "authoritative"].includes(dns_resolver_mode)) {
      dns_resolver_mode = "authoritative";
    }
    
    if (dns_resolver_mode === "public_resolver") {
      dns_custom_resolver_ip = String(payload.dns_custom_resolver_ip || "").trim();
      if (!net.isIP(dns_custom_resolver_ip)) {
        throw new Error("A valid public resolver IP is required for public_resolver mode.");
      }
    }
    
    if (Array.isArray(payload.dns_expected_values)) {
      dns_expected_values = payload.dns_expected_values.map(String).map(s => s.trim()).filter(Boolean);
      if (dns_expected_values.length === 0) throw new Error("At least one expected DNS value is required.");
      if (dns_expected_values.length > 20) throw new Error("Maximum of 20 expected values allowed.");
    } else {
      throw new Error("Expected values must be an array.");
    }
  }

  return {
    url: monitor_type === "heartbeat" ? String(payload.url || "Heartbeat Monitor").trim() : (parsedUrl ? parsedUrl.toString() : null),
    target_host,
    target_port,
    connect_timeout,
    packet_count,
    packet_timeout,
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
    monitor_type,
    keyword,
    keyword_condition,
    case_sensitive,
    grace_period_seconds,
    heartbeat_token,
    dns_hostname,
    dns_record_type,
    dns_expected_values,
    dns_match_mode,
    dns_resolver_mode,
    dns_custom_resolver_ip,
  };
}

