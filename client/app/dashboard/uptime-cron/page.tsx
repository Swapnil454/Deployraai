"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock3,
  Edit2,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MonitorStatus = "up" | "down" | "paused" | "pending";

interface Monitor {
  id: string;
  url: string;
  status: MonitorStatus;
  interval_seconds: number;
  timeout_seconds: number;
  is_paused: boolean;
  last_checked_at: string | null;
  group_id: string | null;
  group_name: string | null;
  uptime_24h: string | null;
  last_response_ms: number | null;
  last_status_code: number | null;
  open_incidents: number;
  slow_warning: number;
  sparkline: boolean[];
  created_at: string;
  heartbeat_token: string | null;
  grace_period_seconds: number | null;
  last_ping_at: string | null;
  next_expected_at: string | null;
  http_method: string;
  auth_type: string;
  auth_username: string | null;
  auth_password: string | null;
  auth_bearer_token: string | null;
  request_body: string | null;
  send_as_json: boolean;
  request_headers: Array<{ key: string; value: string }>;
  meta_fields: Array<{ key: string; value: string }>;
  ip_version: string;
  follow_redirects: boolean;
  dns_hostname: string | null;
  dns_record_type: string | null;
  dns_expected_values: string[] | null;
  dns_match_mode: string | null;
  dns_resolver_mode: string | null;
  dns_custom_resolver_ip: string | null;
  api_assertions: any[] | null;
  api_assertion_logic: string | null;
  api_response_size_limit_kb: number | null;
  up_status_codes: string[];
  ssl_check_enabled: boolean;
  ssl_error_check_enabled: boolean;
  ssl_expiry_reminder_enabled: boolean;
  domain_expiry_reminder_enabled: boolean;
  slow_response_alert_enabled: boolean;
  slow_response_threshold_ms: number;
  tags: string[];
  monitor_type: string;
  keyword: string | null;
  keyword_condition: string | null;
  case_sensitive: boolean;
  target_host: string | null;
  target_port: number | null;
  connect_timeout: number | null;
  packet_count: number | null;
  packet_timeout: number | null;
  under_maintenance?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatInterval(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60}m`;
  return `${s / 3600}h`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 10) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatUptime(val: string | null): string {
  if (val === null) return "—";
  return `${Number(val).toFixed(2)}%`;
}

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ status, under_maintenance }: { status: MonitorStatus, under_maintenance?: boolean }) {
  if (under_maintenance) {
    return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-500 animate-pulse" title="Maintenance" />;
  }
  const cls: Record<MonitorStatus, string> = {
    up: "bg-emerald-500",
    down: "bg-red-500 animate-pulse",
    paused: "bg-zinc-500",
    pending: "bg-yellow-500 animate-pulse",
  };
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls[status]}`} title={status} />;
}

// ─── 90-tick Sparkbar ─────────────────────────────────────────────────────────

function Sparkbar({ sparkline }: { sparkline: boolean[] }) {
  const bars = [...sparkline].reverse();
  while (bars.length < 90) bars.unshift(null as unknown as boolean);
  return (
    <div className="flex items-end gap-[1.5px]" style={{ height: 28 }}>
      {bars.map((ok, i) => (
        <div key={i}
          className={`flex-1 rounded-[1px] transition-colors ${ok === null ? "bg-zinc-800" : ok ? "bg-emerald-500/80" : "bg-red-500/90"}`}
          style={{ height: ok === null ? "40%" : ok ? "100%" : "65%" }}
          title={ok === null ? "No data" : ok ? "Up" : "Down"}
        />
      ))}
    </div>
  );
}

// ─── Edit Slide-Over Panel ────────────────────────────────────────────────────

function EditPanel({ monitor, groups, onClose, onSaved }: {
  monitor: Monitor;
  groups: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (updated: Monitor) => void;
}) {
  const [form, setForm] = useState({
    url:                           monitor.monitor_type === "ping" || monitor.monitor_type === "port" ? monitor.target_host : monitor.url,
    target_port:                   monitor.target_port || "",
    http_method:                   monitor.http_method || "GET",
    interval_seconds:              monitor.interval_seconds,
    grace_period_seconds:          monitor.grace_period_seconds || 30,
    timeout_seconds:               Math.min(monitor.timeout_seconds || 30, 60),
    group_id:                      monitor.group_id || "",
    ip_version:                    monitor.ip_version || "auto_ipv4_priority",
    follow_redirects:              monitor.follow_redirects ?? true,
    up_status_codes:               (monitor.up_status_codes || ["2xx"]).join(", "),
    auth_type:                     monitor.auth_type || "none",
    auth_username:                 monitor.auth_username || "",
    auth_password:                 monitor.auth_password || "",
    auth_bearer_token:             monitor.auth_bearer_token || "",
    request_body:                  monitor.request_body || "",
    send_as_json:                  monitor.send_as_json ?? false,
    slow_response_alert_enabled:   monitor.slow_response_alert_enabled ?? false,
    slow_response_threshold_ms:    monitor.slow_response_threshold_ms || 2000,
    ssl_check_enabled:             monitor.ssl_check_enabled ?? true,
    ssl_error_check_enabled:       monitor.ssl_error_check_enabled ?? true,
    ssl_expiry_reminder_enabled:   monitor.ssl_expiry_reminder_enabled ?? false,
    domain_expiry_reminder_enabled:monitor.domain_expiry_reminder_enabled ?? false,
    monitor_type:                  monitor.monitor_type ?? "http",
    keyword:                       monitor.keyword ?? "",
    keyword_condition:             monitor.keyword_condition ?? "exists",
    case_sensitive:                monitor.case_sensitive ?? false,
    dns_record_type:               monitor.dns_record_type || "A",
    dns_match_mode:                monitor.dns_match_mode || "exact_set",
    dns_resolver_mode:             monitor.dns_resolver_mode || "authoritative",
    dns_custom_resolver_ip:        monitor.dns_custom_resolver_ip || "",
    dns_expected_values:           (monitor.dns_expected_values || []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [apiAssertions, setApiAssertions] = useState<{ id: number; path: string; operator: string; expected: string; path_mode: string }[]>(
    monitor.api_assertions && monitor.api_assertions.length > 0 
      ? monitor.api_assertions.map((a, i) => ({ ...a, id: i })) 
      : [{ id: 1, path: "", operator: "equals", expected: "", path_mode: "dot" }]
  );
  const [apiAssertionLogic, setApiAssertionLogic] = useState<"all_must_pass" | "any_must_pass">(
    (monitor.api_assertion_logic as "all_must_pass" | "any_must_pass") || "all_must_pass"
  );
  const [apiResponseSizeLimit, setApiResponseSizeLimit] = useState(
    monitor.api_response_size_limit_kb ? String(monitor.api_response_size_limit_kb) : "512"
  );

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm(f => ({ ...f, [k]: val }));
  };
  const toggle = (k: keyof typeof form) => () => setForm(f => ({ ...f, [k]: !f[k as keyof typeof f] }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // DB returns JSONB — could be {} or null, not necessarily an array
      const toArray = (v: unknown) => Array.isArray(v) ? v : [];

      const body = {
        ...form,
        url:                       form.monitor_type === "ping" || form.monitor_type === "port" ? null : form.url,
        target_host:               form.monitor_type === "ping" || form.monitor_type === "port" ? form.url : null,
        target_port:               form.monitor_type === "port" ? Number(form.target_port) : null,
        connect_timeout:           form.monitor_type === "port" ? Number(form.timeout_seconds) * 1000 : null,
        packet_count:              form.monitor_type === "ping" ? (monitor as any).packet_count || 4 : null,
        packet_timeout:            form.monitor_type === "ping" ? (monitor as any).packet_timeout || 2000 : null,
        interval_seconds:          Number(form.interval_seconds),
        grace_period_seconds:      form.monitor_type === "heartbeat" ? Number(form.grace_period_seconds) : null,
        timeout_seconds:           Number(form.timeout_seconds),
        slow_response_threshold_ms:Number(form.slow_response_threshold_ms),
        up_status_codes:           form.up_status_codes.split(",").map(s => s.trim()).filter(Boolean),
        group_id:                  form.group_id || null,
        request_headers:           toArray(monitor.request_headers),
        meta_fields:               toArray(monitor.meta_fields),
        tags:                      toArray(monitor.tags),
        monitor_type:              form.monitor_type,
        keyword:                   form.keyword,
        keyword_condition:         form.keyword_condition,
        case_sensitive:            form.case_sensitive,
        dns_hostname:              form.monitor_type === "dns" ? form.url : null,
        dns_record_type:           form.monitor_type === "dns" ? form.dns_record_type : null,
        dns_match_mode:            form.monitor_type === "dns" ? form.dns_match_mode : null,
        dns_resolver_mode:         form.monitor_type === "dns" ? form.dns_resolver_mode : null,
        dns_custom_resolver_ip:    form.monitor_type === "dns" ? form.dns_custom_resolver_ip : null,
        dns_expected_values:       form.monitor_type === "dns" ? form.dns_expected_values.split(",").map(s => s.trim()).filter(Boolean) : null,
        api_assertions:            form.monitor_type === "api" ? apiAssertions.map(({ id, ...rest }) => rest) : null,
        api_assertion_logic:       form.monitor_type === "api" ? apiAssertionLogic : null,
        api_response_size_limit_kb:form.monitor_type === "api" ? Number(apiResponseSizeLimit) : null,
      };

      if ((form.monitor_type === "ping" || form.monitor_type === "port") && form.url) {
        if (form.url.includes("://") || form.url.includes("/")) {
          throw new Error(`${form.monitor_type === "ping" ? "Ping" : "Port"} monitors require a bare IP or hostname (e.g. 8.8.8.8), not a full URL.`);
        }
      }
      
      if (form.monitor_type === "port") {
        const port = Number(form.target_port);
        if (!port || port < 1 || port > 65535 || !Number.isInteger(port)) {
          throw new Error("Port must be a valid integer between 1 and 65535.");
        }
      }

      // client-side guard: timeout must be < interval
      if (body.timeout_seconds >= body.interval_seconds) {
        throw new Error(`Timeout (${body.timeout_seconds}s) must be less than check interval (${formatInterval(body.interval_seconds)})`);
      }

      const res = await fetch(`${API}/monitors/${monitor.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      const data = await res.json();
      onSaved(data.monitor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const needsBody = ["POST", "PUT", "PATCH"].includes(form.http_method);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950 shadow-2xl sm:w-[520px]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-4">
          <Edit2 className="h-5 w-5 text-indigo-400" />
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">Edit Monitor</h2>
            <p className="text-xs text-zinc-500 truncate">{monitor.url}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-800 text-zinc-500 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* URL / Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
              {form.monitor_type === "heartbeat" ? "Monitor Name" : form.monitor_type === "ping" ? "IP or Host to monitor" : form.monitor_type === "port" ? "IP, Host or URL to monitor" : "URL"}
            </label>
            <input value={form.url || ""} onChange={set("url")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              placeholder={form.monitor_type === "heartbeat" ? "e.g. Database Backup" : form.monitor_type === "ping" || form.monitor_type === "port" ? "e.g. 8.8.8.8" : "https://example.com"} />
          </div>

          {form.monitor_type === "port" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">TCP port</label>
              <input type="number" min={1} max={65535} value={form.target_port || ""} onChange={set("target_port")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                placeholder="e.g. 22" />
            </div>
          )}

          {/* Method + Interval row */}
          <div className="grid grid-cols-2 gap-4">
            {form.monitor_type !== "ping" && form.monitor_type !== "port" && form.monitor_type !== "heartbeat" && form.monitor_type !== "dns" ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">HTTP Method</label>
                <select value={form.http_method} onChange={set("http_method")}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                  {["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div />
            )}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">{form.monitor_type === "heartbeat" ? "Expected Interval" : "Check Interval"}</label>
              <select value={form.interval_seconds} onChange={set("interval_seconds")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                {[60,120,180,300,600,900,1800,3600].map(s => (
                  <option key={s} value={s}>{formatInterval(s)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Timeout/Grace Period + Group row */}
          <div className="grid grid-cols-2 gap-4">
            {form.monitor_type === "heartbeat" ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Grace Period</label>
                <select value={form.grace_period_seconds} onChange={set("grace_period_seconds")}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                  {[30,45,60,300,1800,3600,86400].map(s => (
                    <option key={s} value={s}>{formatInterval(s)}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Timeout (seconds)</label>
                <input type="number" min={5} max={60} value={form.timeout_seconds} onChange={set("timeout_seconds")}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                {Number(form.timeout_seconds) >= Number(form.interval_seconds) && (
                  <p className="mt-1 text-[11px] text-red-400">Timeout must be less than interval ({formatInterval(Number(form.interval_seconds))})</p>
                )}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Group</label>
              <select value={form.group_id} onChange={set("group_id")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                <option value="">Default group</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>

          {/* Up Status Codes */}
          {form.monitor_type !== "ping" && form.monitor_type !== "port" && form.monitor_type !== "heartbeat" && form.monitor_type !== "dns" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Up Status Codes</label>
              <input value={form.up_status_codes} onChange={set("up_status_codes")}
                placeholder="2xx, 3xx, 404"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
              <p className="mt-1 text-[11px] text-zinc-600">Comma-separated. Use 2xx for any 2xx range or exact codes like 200, 201.</p>
            </div>
          )}

          {/* Keyword Monitoring */}
          {form.monitor_type === "keyword" && (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-5">
              <h3 className="mb-3 text-sm font-bold text-white">Keyword Monitoring</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Keyword to look for</label>
                  <input required value={form.keyword} onChange={set("keyword")}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Condition</label>
                    <select value={form.keyword_condition} onChange={set("keyword_condition")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                      <option value="exists">Start incident when keyword exists</option>
                      <option value="not_exists">Start incident when keyword doesn't exist</option>
                    </select>
                  </div>
                  <div>
                    <label className="mt-7 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                      <input type="checkbox" checked={form.case_sensitive} onChange={toggle("case_sensitive")}
                        className="h-3.5 w-3.5 accent-indigo-500" />
                      Case-sensitive check
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DNS Monitoring */}
          {form.monitor_type === "dns" && (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-5">
              <h3 className="mb-3 text-sm font-bold text-white">DNS Monitoring</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Record Type</label>
                    <select value={form.dns_record_type} onChange={set("dns_record_type")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                      {["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA", "SRV", "CAA", "PTR"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Match Mode</label>
                    <select value={form.dns_match_mode} onChange={set("dns_match_mode")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                      <option value="any_match">Contains (Subset match)</option>
                      <option value="exact_set">Must match exactly (Order independent)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Expected Values (Comma-separated)</label>
                  <input value={form.dns_expected_values} onChange={set("dns_expected_values")}
                    placeholder="1.1.1.1, 1.0.0.1"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Resolver Mode</label>
                    <select value={form.dns_resolver_mode} onChange={set("dns_resolver_mode")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                      <option value="authoritative">Authoritative NS (Bypass Cache)</option>
                      <option value="public_resolver">Specific Public Resolver</option>
                      <option value="system">System Default Resolver</option>
                    </select>
                  </div>
                  {form.dns_resolver_mode === "public_resolver" && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Resolver IP</label>
                      <input value={form.dns_custom_resolver_ip} onChange={set("dns_custom_resolver_ip")}
                        placeholder="e.g. 1.1.1.1"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* API Monitoring */}
          {form.monitor_type === "api" && (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">API Assertions</h3>
                <button type="button" onClick={() => setApiAssertions([...apiAssertions, { id: Date.now(), path: "", operator: "equals", expected: "", path_mode: "dot" }])} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                  <Plus className="w-3 h-3"/> Add Assertion
                </button>
              </div>
              
              <div className="space-y-3">
                {apiAssertions.map((a, i) => (
                  <div key={a.id} className="flex gap-2 items-start">
                    <input value={a.path} onChange={e => { const n = [...apiAssertions]; n[i].path = e.target.value; setApiAssertions(n); }} placeholder="e.g. data.items[0].id" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                    <select value={a.operator} onChange={e => { const n = [...apiAssertions]; n[i].operator = e.target.value; setApiAssertions(n); }} className="w-full max-w-[150px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                      <option value="equals">Equals</option>
                      <option value="not_equals">Not equals</option>
                      <option value="exists">Exists</option>
                      <option value="not_exists">Does not exist</option>
                      <option value="contains">Contains</option>
                      <option value="greater_than">Greater than</option>
                      <option value="less_than">Less than</option>
                      <option value="type_is">Is type</option>
                      <option value="matches_regex">Matches regex</option>
                    </select>
                    {!["exists", "not_exists"].includes(a.operator) && (
                      <input value={a.expected} onChange={e => { const n = [...apiAssertions]; n[i].expected = e.target.value; setApiAssertions(n); }} placeholder="Expected value" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                    )}
                    <select value={a.path_mode} onChange={e => { const n = [...apiAssertions]; n[i].path_mode = e.target.value; setApiAssertions(n); }} className="w-full max-w-[100px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] text-white outline-none focus:border-indigo-500" title="Path Mode">
                      <option value="dot">Dot Path</option>
                      <option value="jmespath">JMESPath</option>
                    </select>
                    <button type="button" onClick={() => { if (apiAssertions.length > 1) setApiAssertions(apiAssertions.filter((_, idx) => idx !== i)); }} className="h-[38px] w-[38px] shrink-0 grid place-items-center text-rose-400 hover:bg-rose-500/10 rounded-lg">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 sm:grid-cols-2 pt-5 mt-5 border-t border-zinc-700/50">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Assertion Logic</label>
                  <select value={apiAssertionLogic} onChange={e => setApiAssertionLogic(e.target.value as any)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                    <option value="all_must_pass">All assertions must pass (AND)</option>
                    <option value="any_must_pass">At least one must pass (OR)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Max Response Size (KB)</label>
                  <input type="number" min="1" value={apiResponseSizeLimit} onChange={e => setApiResponseSizeLimit(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                </div>
              </div>
            </div>
          )}

          {/* Request Body */}
          {form.monitor_type !== "ping" && form.monitor_type !== "port" && form.monitor_type !== "heartbeat" && form.monitor_type !== "dns" && needsBody && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-400">Request Body</label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
                  <input type="checkbox" checked={form.send_as_json} onChange={toggle("send_as_json")}
                    className="h-3.5 w-3.5 accent-indigo-500" />
                  Send as JSON
                </label>
              </div>
              <textarea value={form.request_body} onChange={set("request_body")} rows={3}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-white outline-none focus:border-indigo-500"
                placeholder={form.send_as_json ? '{"key": "value"}' : "raw body"} />
            </div>
          )}

          {/* Auth */}
          {form.monitor_type !== "ping" && form.monitor_type !== "port" && form.monitor_type !== "heartbeat" && form.monitor_type !== "dns" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Authentication</label>
              <select value={form.auth_type} onChange={set("auth_type")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                <option value="none">None</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="digest">Digest Auth</option>
              </select>
              {(form.auth_type === "basic" || form.auth_type === "digest") && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input placeholder="Username" value={form.auth_username} onChange={set("auth_username")}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                  <input placeholder="Password" type="password" value={form.auth_password} onChange={set("auth_password")}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
                </div>
              )}
              {form.auth_type === "bearer" && (
                <input placeholder="Bearer token" value={form.auth_bearer_token} onChange={set("auth_bearer_token")}
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
              )}
            </div>
          )}

          {/* Advanced toggles */}
          {form.monitor_type !== "heartbeat" && form.monitor_type !== "dns" && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Advanced</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">IP Version</label>
                  <select value={form.ip_version} onChange={set("ip_version")}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500">
                    <option value="auto_ipv4_priority">IPv4/IPv6 (IPv4 priority)</option>
                    <option value="ipv4_only">IPv4 only</option>
                    <option value="ipv6_only">IPv6 only</option>
                  </select>
                </div>
                {form.monitor_type !== "ping" && form.monitor_type !== "port" && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition">
                    <input type="checkbox" checked={form.follow_redirects} onChange={toggle("follow_redirects")}
                      className="h-3.5 w-3.5 accent-indigo-500" />
                    Follow redirects
                  </label>
                )}
              </div>

              {/* Slow response */}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition">
                <input type="checkbox" checked={form.slow_response_alert_enabled} onChange={toggle("slow_response_alert_enabled")}
                  className="h-3.5 w-3.5 accent-indigo-500" />
                Slow response alert
                {form.slow_response_alert_enabled && (
                  <span className="ml-auto flex items-center gap-1">
                    <input type="number" min={100} max={30000} value={form.slow_response_threshold_ms}
                      onChange={set("slow_response_threshold_ms")}
                      onClick={(e) => e.stopPropagation()}
                      className="w-20 rounded border border-zinc-600 bg-zinc-900 px-2 py-0.5 text-right text-xs text-white outline-none" />
                    ms
                  </span>
                )}
              </label>

              {/* Checkboxes */}
              {form.monitor_type !== "ping" && form.monitor_type !== "port" && (
                <div className="space-y-2">
                  {[
                    { key: "ssl_check_enabled" as const,              label: "SSL check enabled" },
                    { key: "ssl_error_check_enabled" as const,        label: "Alert on SSL errors" },
                    { key: "ssl_expiry_reminder_enabled" as const,    label: "SSL expiry reminders" },
                    { key: "domain_expiry_reminder_enabled" as const, label: "Domain expiry reminders" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400 hover:text-zinc-300">
                      <input type="checkbox" checked={form[key] as boolean} onChange={toggle(key)}
                        className="h-3.5 w-3.5 accent-indigo-500" />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-2.5 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-zinc-800 px-6 py-4">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}


import { createPortal } from "react-dom";

function MonitorActions({
  monitor, onPause, onDelete, onEdit, pendingDelete, deletingId, cancelDelete,
}: {
  monitor: Monitor;
  onPause: (id: string, paused: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (monitor: Monitor) => void;
  pendingDelete: string | null;
  deletingId: string | null;
  cancelDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_WIDTH = 208; // w-52
  const MENU_HEIGHT_ESTIMATE = 260;

  const computePosition = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < MENU_HEIGHT_ESTIMATE;

    setCoords({
      left: rect.right - MENU_WIDTH, // right-align to the button, like right-0 did
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      openUpward,
    });
  };

  const toggleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open) computePosition();
    setOpen((o) => !o);
  };

  // Reposition on scroll/resize while open, close on outside click
  useEffect(() => {
    if (!open) return;

    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const reposition = () => computePosition();

    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", reposition, true); // capture: catches inner scroll containers too
    window.addEventListener("resize", reposition);

    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const isPending  = pendingDelete === monitor.id;
  const isDeleting = deletingId   === monitor.id;

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        id={`actions-${monitor.id}`}
        onClick={toggleOpen}
        className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: coords.openUpward ? undefined : coords.top,
            bottom: coords.openUpward ? window.innerHeight - coords.top : undefined,
            left: coords.left,
          }}
          className="z-[999] w-52 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        >
          <Link
            href={`/dashboard/uptime-cron/monitoring/${monitor.id}`}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            <Activity className="h-4 w-4" /> View dashboard
          </Link>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(monitor); }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-indigo-300 hover:bg-indigo-500/10"
          >
            <Edit2 className="h-4 w-4" /> Edit
          </button>
          <a href={monitor.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="h-4 w-4" /> Visit URL
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onPause(monitor.id, !monitor.is_paused); }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            {monitor.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {monitor.is_paused ? "Resume" : "Pause"}
          </button>
          <div className="my-1 border-t border-zinc-800" />
          {isPending ? (
            <div className="flex items-center gap-1 px-3 py-2">
              <span className="flex-1 text-xs text-red-400">Sure?</span>
              <button onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(monitor.id); }}
                className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500">
                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
              </button>
              <button onClick={(e) => { e.stopPropagation(); setOpen(false); cancelDelete(); }}
                className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-600">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(monitor.id); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Monitor row ──────────────────────────────────────────────────────────────

function MonitorRow({
  monitor, onPause, onDelete, onEdit, pendingDelete, deletingId, cancelDelete,
}: {
  monitor: Monitor;
  onPause: (id: string, paused: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (monitor: Monitor) => void;
  pendingDelete: string | null;
  deletingId: string | null;
  cancelDelete: () => void;
}) {
  const router = useRouter();
  const uptimePct  = formatUptime(monitor.uptime_24h);
  const uptimeNum  = monitor.uptime_24h ? Number(monitor.uptime_24h) : null;
  const uptimeColor = uptimeNum === null ? "text-zinc-500" : uptimeNum >= 99.9 ? "text-emerald-400" : uptimeNum >= 95 ? "text-yellow-400" : "text-red-400";
  const host = (() => {
    if (monitor.monitor_type === "ping" || monitor.monitor_type === "port") return monitor.target_host;
    if (monitor.monitor_type === "heartbeat") return monitor.url;
    try { return new URL(monitor.url).hostname; } catch { return monitor.url; }
  })();

  return (
    // Use div + onClick instead of <Link> wrapper to avoid nested <a> from actions menu
    <div
      onClick={() => router.push(`/dashboard/uptime-cron/monitoring/${monitor.id}`)}
      className="group flex cursor-pointer items-center gap-3 px-4 py-3.5 transition hover:bg-zinc-900/60"
    >
      <StatusDot status={monitor.status} under_maintenance={monitor.under_maintenance} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">{host}</p>
        <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-zinc-500">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            {monitor.under_maintenance ? "MAINTENANCE" : monitor.status.toUpperCase()}
          </span>
          {monitor.last_response_ms !== null && <span>{monitor.last_response_ms} ms</span>}
          {monitor.open_incidents > 0 && (
            <span className="font-semibold text-red-400">
              {monitor.open_incidents} open incident{monitor.open_incidents > 1 ? "s" : ""}
            </span>
          )}
          {monitor.slow_warning > 0 && monitor.open_incidents === 0 && (
            <span className="font-semibold text-yellow-400">⚠ slow response
            </span>
          )}
        </p>
      </div>

      <div className="hidden w-28 lg:block">
        <Sparkbar sparkline={monitor.sparkline} />
      </div>

      <div className="hidden w-16 text-right sm:block">
        <span className={`text-sm font-bold tabular-nums ${uptimeColor}`}>{uptimePct}</span>
        <p className="text-[10px] text-zinc-600">24h</p>
      </div>

      <div className="hidden w-12 text-right md:block">
        <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
          {formatInterval(monitor.interval_seconds)}
        </span>
      </div>

      <div className="hidden w-24 text-right text-xs text-zinc-500 lg:block">
        <Clock3 className="mr-1 inline h-3 w-3" />
        {timeAgo(monitor.last_checked_at)}
      </div>

      {/* Stop propagation so actions never trigger row navigation */}
      <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <MonitorActions
          monitor={monitor}
          onPause={onPause}
          onDelete={onDelete}
          onEdit={onEdit}
          pendingDelete={pendingDelete}
          deletingId={deletingId}
          cancelDelete={cancelDelete}
        />
      </div>
    </div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function GroupSection({
  name, monitors, onPause, onDelete, onEdit, pendingDelete, deletingId, cancelDelete,
}: {
  name: string;
  monitors: Monitor[];
  onPause: (id: string, paused: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (monitor: Monitor) => void;
  pendingDelete: string | null;
  deletingId: string | null;
  cancelDelete: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const up     = monitors.filter((m) => m.status === "up").length;
  const down   = monitors.filter((m) => m.status === "down").length;
  const paused = monitors.filter((m) => m.status === "paused").length;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-zinc-800 bg-[#0a0a0a]">
      <button onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/40">
        <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${collapsed ? "" : "rotate-90"}`} />
        <span className="flex-1 text-sm font-semibold text-zinc-200">{name}</span>
        <div className="flex items-center gap-2 text-xs">
          {up > 0 && <span className="flex items-center gap-1 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{up} up</span>}
          {down > 0 && <span className="flex items-center gap-1 text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{down} down</span>}
          {paused > 0 && <span className="text-zinc-500">{paused} paused</span>}
          <span className="ml-1 text-zinc-600">({monitors.length})</span>
        </div>
      </button>
      {!collapsed && (
        <div className="divide-y divide-zinc-800/60">
          {monitors.map((m) => (
            <MonitorRow key={m.id} monitor={m}
              onPause={onPause} onDelete={onDelete} onEdit={onEdit}
              pendingDelete={pendingDelete} deletingId={deletingId} cancelDelete={cancelDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ monitors }: { monitors: Monitor[] }) {
  const total   = monitors.length;
  const up      = monitors.filter((m) => m.status === "up").length;
  const down    = monitors.filter((m) => m.status === "down").length;
  const paused  = monitors.filter((m) => m.status === "paused").length;
  const pending = monitors.filter((m) => m.status === "pending").length;
  const avgUptime = total === 0 ? null
    : monitors.reduce((sum, m) => sum + (m.uptime_24h ? Number(m.uptime_24h) : 0), 0) / total;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {[
        { label: "Total", value: total, color: "text-white" },
        { label: "Up", value: up, color: "text-emerald-400" },
        { label: "Down", value: down, color: down > 0 ? "text-red-400" : "text-zinc-500" },
        { label: "Paused", value: paused, color: "text-zinc-400" },
        { label: "24h Avg Uptime", value: avgUptime !== null ? `${avgUptime.toFixed(2)}%` : "—",
          color: avgUptime !== null && avgUptime >= 99.9 ? "text-emerald-400" : "text-yellow-400" },
      ].map(({ label, value, color }) => (
        <div key={label} className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
          <span className="mt-0.5 text-xs text-zinc-500">{label}</span>
        </div>
      ))}
      {pending > 0 && (
        <div className="hidden lg:flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <span className="text-2xl font-bold text-yellow-400 tabular-nums">{pending}</span>
          <span className="mt-0.5 text-xs text-zinc-500">Pending</span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UptimeCronMonitoringPage() {
  const [monitors, setMonitors]     = useState<Monitor[]>([]);
  const [groups, setGroups]         = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MonitorStatus>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const fetchMonitors = useCallback(async () => {
    try {
      const [mRes, gRes] = await Promise.all([
        fetch(`${API}/monitors`, { credentials: "include" }),
        fetch(`${API}/groups`,   { credentials: "include" }),
      ]);
      if (mRes.ok) { const d = await mRes.json(); setMonitors(d.monitors ?? []); }
      if (gRes.ok) { const d = await gRes.json(); setGroups(d.groups  ?? []); }
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMonitors(); }, [fetchMonitors]);
  useEffect(() => { const id = setInterval(fetchMonitors, 30_000); return () => clearInterval(id); }, [fetchMonitors]);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => { if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  // Close edit panel on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setEditingMonitor(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handlePause(id: string, paused: boolean) {
    setMonitors((ms) => ms.map((m) => m.id === id ? { ...m, is_paused: paused, status: paused ? "paused" : "pending" } : m));
    await fetch(`${API}/monitors/${id}/pause`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused }),
    });
    fetchMonitors();
  }

  async function handleDelete(id: string) {
    if (pendingDelete !== id) { setPendingDelete(id); return; }
    setDeletingId(id);
    setPendingDelete(null);
    try {
      await fetch(`${API}/monitors/${id}`, { method: "DELETE", credentials: "include" });
      setMonitors((ms) => ms.filter((m) => m.id !== id));
    } catch { fetchMonitors(); }
    finally { setDeletingId(null); }
  }

  function handleSaved(updated: Monitor) {
    setMonitors((ms) => ms.map((m) => m.id === updated.id ? { ...m, ...updated } : m));
    setEditingMonitor(null);
  }

  const filtered = monitors.filter((m) => {
    const matchSearch = !search || m.url.toLowerCase().includes(search.toLowerCase()) || (m.group_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const grouped = filtered.reduce<Record<string, Monitor[]>>((acc, m) => {
    const key = m.group_name ?? "Ungrouped";
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const filterLabels: Record<string, string> = { all: "All monitors", up: "Up", down: "Down", paused: "Paused", pending: "Pending" };

  return (
    <>
      <main className="min-h-full bg-black px-6 py-8 text-zinc-100 lg:px-10">
        <div className="mx-auto w-full max-w-7xl">

          {/* Header */}
          <header className="flex flex-col justify-between gap-5 border-b border-zinc-800 pb-8 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-xs font-bold tracking-[0.18em] text-emerald-400">UPTIME MONITORING</p>
              <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-white">
                <Activity className="h-7 w-7 text-emerald-400" />
                Monitors
                {!loading && <span className="text-zinc-600">.</span>}
                {loading && <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />}
              </h1>
              <p className="mt-2 text-sm text-zinc-400">Keep an eye on every endpoint your customers depend on.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchMonitors}
                className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-zinc-700 hover:text-white"
                title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </button>
              <Link href="/dashboard/uptime-cron/monitoring/new"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500">
                <Plus className="h-4 w-4" /> New monitor
              </Link>
            </div>
          </header>

          {monitors.length > 0 && <div className="pt-7"><SummaryBar monitors={monitors} /></div>}

          {/* Toolbar */}
          <div className="flex flex-col justify-between gap-3 py-4 sm:flex-row">
            <label className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 focus-within:border-indigo-500">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" />
              <input className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                placeholder="Search monitors or groups…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <div ref={filterRef} className="relative">
              <button onClick={() => setFilterOpen((o) => !o)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 hover:border-zinc-700">
                {filterLabels[statusFilter]}
                <ChevronDown className="h-4 w-4" />
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                  {Object.entries(filterLabels).map(([val, label]) => (
                    <button key={val}
                      onClick={() => { setStatusFilter(val as typeof statusFilter); setFilterOpen(false); }}
                      className={`block w-full px-5 py-2.5 text-left text-sm transition hover:bg-zinc-800 ${statusFilter === val ? "text-indigo-400 font-semibold" : "text-zinc-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
            </div>
          ) : filtered.length === 0 ? (
            <section className="flex min-h-[380px] flex-col items-center justify-center rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <Radio className="h-7 w-7" />
              </span>
              <h2 className="mt-5 text-xl font-semibold text-white">
                {monitors.length === 0 ? "No monitors yet" : "No monitors match your filter"}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
                {monitors.length === 0
                  ? "Create an HTTP monitor to check your website, API, or scheduled endpoint."
                  : "Try clearing the search or changing the status filter."}
              </p>
              {monitors.length === 0 && (
                <Link href="/dashboard/uptime-cron/monitoring/new"
                  className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500">
                  <Plus className="h-4 w-4" /> Create your first monitor
                </Link>
              )}
              <p className="mt-7 flex items-center gap-2 text-xs text-zinc-500">
                <Clock3 className="h-4 w-4" />
                Checks run on a schedule and alert your team when something changes.
              </p>
            </section>
          ) : (
            <div>
              {Object.entries(grouped).map(([groupName, groupMonitors]) => (
                <GroupSection
                  key={groupName} name={groupName} monitors={groupMonitors}
                  onPause={handlePause} onDelete={handleDelete} onEdit={setEditingMonitor}
                  pendingDelete={pendingDelete} deletingId={deletingId} cancelDelete={() => setPendingDelete(null)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Edit slide-over */}
      {editingMonitor && (
        <EditPanel
          monitor={editingMonitor}
          groups={groups}
          onClose={() => setEditingMonitor(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
