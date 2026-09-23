"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  KeyRound,
  Network,
  Plus,
  Server,
  ShieldCheck,
  Target,
  Trash2,
  Webhook,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MonitorType =
  | "HTTP / website monitoring"
  | "Keyword monitoring"
  | "Ping monitoring"
  | "Port monitoring"
  | "Cron job / Heartbeat monitoring"
  | "DNS monitoring"
  | "API monitoring"
  | "UDP monitoring";

const monitorTypes: Array<{
  name: MonitorType;
  description: string;
  icon: typeof Globe2;
}> = [
  { name: "HTTP / website monitoring", description: "Use HTTP(S) monitoring for websites, APIs, and anything running on HTTP.", icon: Globe2 },
  { name: "Keyword monitoring", description: "Check the presence or absence of specific text in an HTTP response.", icon: KeyRound },
  { name: "Ping monitoring", description: "Make sure your server or network device is always available.", icon: Target },
  { name: "Port monitoring", description: "Monitor services such as SMTP, POP3, FTP, and other TCP ports.", icon: Server },
  { name: "Cron job / Heartbeat monitoring", description: "Check that scheduled requests arrive at the expected time.", icon: Clock3 },
  { name: "DNS monitoring", description: "Monitor DNS servers and verify records resolve to expected values.", icon: Network },
  { name: "API monitoring", description: "Validate API responses with JSON assertions.", icon: Webhook },
  { name: "UDP monitoring", description: "Monitor UDP services such as DNS, SNMP, and other data services.", icon: ShieldCheck },
];

const intervalSeconds = [
  15, 30, 45,
  ...Array.from({ length: 30 }, (_, i) => (i + 1) * 60),
  ...Array.from({ length: 5  }, (_, i) => (i + 7) * 5 * 60),
  ...Array.from({ length: 24 }, (_, i) => (i + 1) * 3600),
];

const intervalMarks = [
  { seconds: 15,    label: "15s" },
  { seconds: 30,    label: "30s" },
  { seconds: 60,    label: "1m" },
  { seconds: 300,   label: "5m" },
  { seconds: 1800,  label: "30m" },
  { seconds: 3600,  label: "1h" },
  { seconds: 43200, label: "12h" },
  { seconds: 86400, label: "24h" },
];

const intervalScaleAnchors = [
  { seconds: 15,    position: 0   },
  { seconds: 30,    position: 4   },
  { seconds: 60,    position: 9   },
  { seconds: 300,   position: 14  },
  { seconds: 1800,  position: 25  },
  { seconds: 3600,  position: 30  },
  { seconds: 43200, position: 65  },
  { seconds: 86400, position: 100 },
];

function intervalPosition(index: number) {
  const seconds = intervalSeconds[index];
  const nextIdx = intervalScaleAnchors.findIndex((a) => a.seconds >= seconds);
  const end   = intervalScaleAnchors[nextIdx === -1 ? intervalScaleAnchors.length - 1 : nextIdx];
  const start = intervalScaleAnchors[Math.max(0, nextIdx - 1)];
  if (start.seconds === end.seconds) return start.position;
  const progress = (seconds - start.seconds) / (end.seconds - start.seconds);
  return start.position + (end.position - start.position) * progress;
}

function closestIntervalIndex(position: number) {
  return intervalSeconds.reduce(
    (best, _, i) => Math.abs(intervalPosition(i) - position) < Math.abs(intervalPosition(best) - position) ? i : best,
    0,
  );
}

function formatInterval(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60}m`;
  return `${s / 3600}h`;
}

const gracePeriodSeconds = [
  30, 45,
  ...Array.from({ length: 30 }, (_, i) => (i + 1) * 60),
  ...Array.from({ length: 5  }, (_, i) => (i + 7) * 5 * 60),
  ...Array.from({ length: 24 }, (_, i) => (i + 1) * 3600),
  ...Array.from({ length: 6  }, (_, i) => (i + 2) * 86400),
];

const gracePeriodMarks = [
  { seconds: 30,     label: "30s" },
  { seconds: 300,    label: "5m" },
  { seconds: 3600,   label: "1h" },
  { seconds: 86400,  label: "24h" },
  { seconds: 604800, label: "7d" },
];

const gracePeriodScaleAnchors = [
  { seconds: 30,     position: 0   },
  { seconds: 300,    position: 25  },
  { seconds: 3600,   position: 50  },
  { seconds: 86400,  position: 75  },
  { seconds: 604800, position: 100 },
];

function gracePeriodPosition(index: number) {
  const seconds = gracePeriodSeconds[index];
  const nextIdx = gracePeriodScaleAnchors.findIndex((a) => a.seconds >= seconds);
  const end   = gracePeriodScaleAnchors[nextIdx === -1 ? gracePeriodScaleAnchors.length - 1 : nextIdx];
  const start = gracePeriodScaleAnchors[Math.max(0, nextIdx - 1)];
  if (start.seconds === end.seconds) return start.position;
  const progress = (seconds - start.seconds) / (end.seconds - start.seconds);
  return start.position + (end.position - start.position) * progress;
}

function closestGracePeriodIndex(position: number) {
  return gracePeriodSeconds.reduce(
    (best, _, i) => Math.abs(gracePeriodPosition(i) - position) < Math.abs(gracePeriodPosition(best) - position) ? i : best,
    0,
  );
}

function formatGracePeriod(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60}m`;
  if (s < 86400) return `${s / 3600}h`;
  return `${s / 86400}d`;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type UptimeGroup = { id: string; name: string };
const uptimeApi = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

// Valid up-status-code patterns accepted by the backend
const VALID_CODE_RE = /^([2-5]xx|\d{3})$/i;
const DEFAULT_STATUS_CODES = ["2xx", "3xx"];

// Auth type definitions
const AUTH_TYPES = [
  { value: "none",   label: "None" },
  { value: "basic",  label: "Basic" },
  { value: "digest", label: "Digest" },
  { value: "bearer", label: "Bearer" },
] as const;

type AuthType = "none" | "basic" | "digest" | "bearer";

// HTTP methods that allow a body
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

// ─── Style helpers ────────────────────────────────────────────────────────────

const inputClass =
  "mt-2 h-11 w-full rounded-lg border border-zinc-700 bg-[#0b0d12] px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:opacity-40 disabled:cursor-not-allowed";

function CardSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-700/80 px-6 py-7 last:border-b-0 md:px-8">
      {children}
    </section>
  );
}

// ─── Dynamic row list (headers / meta fields) ─────────────────────────────────

interface KVRow { id: number; key: string; value: string }

function KVRowList({
  rows, onChange, onAdd, onRemove,
  keyPlaceholder, valuePlaceholder,
  valueWidth = "flex-1",
}: {
  rows: KVRow[];
  onChange: (id: number, field: "key" | "value", val: string) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  valueWidth?: string;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex gap-2">
          <input
            value={row.key}
            onChange={(e) => onChange(row.id, "key", e.target.value)}
            placeholder={keyPlaceholder}
            className="mt-0 h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-[#0b0d12] px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-indigo-500"
          />
          <input
            value={row.value}
            onChange={(e) => onChange(row.id, "value", e.target.value)}
            placeholder={valuePlaceholder}
            className={`mt-0 h-10 min-w-0 ${valueWidth} rounded-lg border border-zinc-700 bg-[#0b0d12] px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-indigo-500`}
          />
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-400 transition hover:bg-rose-500/20"
            title="Remove row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white"
      >
        <Plus className="h-4 w-4" /> Add row
      </button>
    </div>
  );
}

// ─── String tag input (Generic / DNS) ─────────────────────────────────────────

function StringListInput({
  values, onChange, placeholder, hint
}: { values: string[]; onChange: (vals: string[]) => void; placeholder: string; hint: React.ReactNode }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const val = raw.trim();
    if (!val) return;
    if (values.includes(val)) return;
    onChange([...values, val]);
    setInput("");
  }

  function remove(val: string) { onChange(values.filter((v) => v !== val)); }

  return (
    <div>
      <div
        className="mt-3 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-[#0b0d12] px-3 py-2 focus-within:border-indigo-500 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((val) => (
          <span key={val} className="inline-flex items-center gap-1 rounded border border-zinc-600 bg-zinc-700 px-2 py-0.5 text-xs font-semibold text-zinc-300">
            {val}
            <button type="button" onClick={() => remove(val)} className="ml-0.5 hover:opacity-70">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); } }}
          onBlur={() => { if (input.trim()) add(input); }}
          placeholder={values.length ? "Add value…" : placeholder}
          className="h-7 min-w-24 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
        />
      </div>
      {hint}
    </div>
  );
}

// ─── Status-code tag input ────────────────────────────────────────────────────

function StatusCodeInput({
  codes, onChange,
}: { codes: string[]; onChange: (codes: string[]) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const val = raw.trim().toLowerCase();
    if (!val) return;
    if (!VALID_CODE_RE.test(val)) { setError(`"${val}" is not valid (use e.g. 2xx, 3xx, 200, 404)`); return; }
    if (codes.includes(val)) { setError(`"${val}" is already added`); return; }
    setError("");
    onChange([...codes, val]);
    setInput("");
  }

  function remove(code: string) { onChange(codes.filter((c) => c !== code)); }

  const colorFor = (code: string) => {
    if (/^2/.test(code)) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/20";
    if (/^3/.test(code)) return "bg-indigo-500/20 text-indigo-200 border-indigo-500/20";
    if (/^4/.test(code)) return "bg-orange-500/20 text-orange-300 border-orange-500/20";
    if (/^5/.test(code)) return "bg-red-500/20 text-red-300 border-red-500/20";
    return "bg-zinc-700 text-zinc-300 border-zinc-600";
  };

  return (
    <div>
      <div
        className="mt-3 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-[#0b0d12] px-3 py-2 focus-within:border-indigo-500 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {codes.map((code) => (
          <span key={code} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${colorFor(code)}`}>
            {code}
            <button type="button" onClick={() => remove(code)} className="ml-0.5 hover:opacity-70">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); add(input); } }}
          onBlur={() => { if (input.trim()) add(input); }}
          placeholder={codes.length ? "Add code…" : "2xx, 3xx, 200, 404…"}
          className="h-7 min-w-24 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
        />
      </div>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
      <p className="mt-1.5 text-xs text-slate-500">
        Type a pattern and press <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[10px]">Enter</kbd>.
        Use <code className="text-zinc-400">2xx</code>, <code className="text-zinc-400">3xx</code>, or exact codes like <code className="text-zinc-400">200</code>.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

let _kvId = 1;
function newKVRow(): KVRow { return { id: _kvId++, key: "", value: "" }; }

export default function NewUptimeMonitorPage() {
  const router = useRouter();

  // ── Basic fields ──
  const [monitorType, setMonitorType] = useState<MonitorType>("HTTP / website monitoring");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [intervalIndex, setIntervalIndex] = useState(6);
  const [gracePeriodIndex, setGracePeriodIndex] = useState(2); // default 60s
  const [timeout, setTimeoutValue] = useState("30");

  // ── Keyword fields ──
  const [keyword, setKeyword] = useState("");
  const [keywordCondition, setKeywordCondition] = useState<"exists" | "not_exists">("exists");
  const [caseSensitive, setCaseSensitive] = useState(false);

  // ── DNS fields ──
  const [dnsRecordType, setDnsRecordType] = useState("A");
  const [dnsMatchMode, setDnsMatchMode] = useState("exact_set");
  const [dnsResolverMode, setDnsResolverMode] = useState("authoritative");
  const [dnsCustomResolverIp, setDnsCustomResolverIp] = useState("");
  const [dnsExpectedValues, setDnsExpectedValues] = useState<string[]>([]);

  // ── Groups / tags ──
  const [groups, setGroups] = useState<UptimeGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // ── Advanced ──
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [sslOpen, setSslOpen] = useState(false);

  // IP version — value matches backend enum
  const [ipVersion, setIpVersion] = useState<"auto_ipv4_priority" | "ipv4_only" | "ipv6_only">("auto_ipv4_priority");

  // Follow redirects
  const [followRedirects, setFollowRedirects] = useState(true);

  // Up status codes — dynamic tag list
  const [upStatusCodes, setUpStatusCodes] = useState<string[]>(DEFAULT_STATUS_CODES);

  // Auth
  const [authType, setAuthType] = useState<AuthType>("none");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authToken, setAuthToken] = useState("");

  // HTTP method
  const [method, setMethod] = useState("HEAD");

  // Request body (only for POST/PUT/PATCH)
  const [requestBody, setRequestBody] = useState("");
  const [sendAsJson, setSendAsJson] = useState(false);

  // Request headers — dynamic rows
  const [headerRows, setHeaderRows] = useState<KVRow[]>([newKVRow()]);

  // Meta fields — dynamic rows
  const [metaRows, setMetaRows] = useState<KVRow[]>([newKVRow()]);

  // SSL / slow response
  const [sslChecks, setSslChecks] = useState({ errors: true, certificateExpiry: true, domainExpiry: true });
  const [slowResponseAlert, setSlowResponseAlert] = useState(false);
  const [slowResponseMs, setSlowResponseMs] = useState("2000");

  // Form state
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const selectedType = monitorTypes.find((t) => t.name === monitorType) ?? monitorTypes[0];
  const SelectedIcon = selectedType.icon;
  const intervalSecondsValue = intervalSeconds[intervalIndex];
  const intervalProgress = intervalPosition(intervalIndex);
  const gracePeriodSecondsValue = gracePeriodSeconds[gracePeriodIndex];
  const gracePeriodProgress = gracePeriodPosition(gracePeriodIndex);
  const timeoutProgress = ((Number(timeout) - 5) / 55) * 100;
  const bodyEnabled = BODY_METHODS.has(method);

  // ── Load groups ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    void fetch(`${uptimeApi}/groups`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load groups.")))
      .then((d: { groups: UptimeGroup[] }) => {
        if (!active) return;
        setGroups(d.groups);
        setSelectedGroup((cur) => cur || d.groups[0]?.id || "");
      })
      .catch((e: Error) => active && setFormError(e.message));
    return () => { active = false; };
  }, []);

  // ── KV row helpers ────────────────────────────────────────────────────────────

  function updateKVRow(setter: React.Dispatch<React.SetStateAction<KVRow[]>>) {
    return (id: number, field: "key" | "value", val: string) =>
      setter((rows) => rows.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  function addKVRow(setter: React.Dispatch<React.SetStateAction<KVRow[]>>) {
    return () => setter((rows) => [...rows, newKVRow()]);
  }

  function removeKVRow(setter: React.Dispatch<React.SetStateAction<KVRow[]>>) {
    return (id: number) => setter((rows) => rows.length <= 1 ? rows.map((r) => r.id === id ? newKVRow() : r) : rows.filter((r) => r.id !== id));
  }

  // ── Group creation ────────────────────────────────────────────────────────────

  async function addGroup() {
    const name = newGroup.trim();
    if (!name) return;
    try {
      const r = await fetch(`${uptimeApi}/groups`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not create group.");
      setGroups((cur) => cur.some((g) => g.id === d.group.id) ? cur : [...cur, d.group]);
      setSelectedGroup(d.group.id);
      setNewGroup("");
      setAddingGroup(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create group.");
    }
  }

  function addTags() {
    const next = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    setTags((cur) => Array.from(new Set([...cur, ...next])));
    setTagInput("");
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    const urlValue = (event.currentTarget.elements.namedItem("url") as HTMLInputElement)?.value;
    const portValue = (event.currentTarget.elements.namedItem("target_port") as HTMLInputElement)?.value;
    
    if ((monitorType === "Ping monitoring" || monitorType === "Port monitoring") && urlValue) {
      if (urlValue.includes("://") || urlValue.includes("/")) {
        setFormError(`${monitorType.split(' ')[0]} monitors require a bare IP or hostname (e.g. 8.8.8.8), not a full URL.`);
        return;
      }
    }

    if (monitorType === "Port monitoring") {
      const port = Number(portValue);
      if (!port || port < 1 || port > 65535 || !Number.isInteger(port)) {
        setFormError("Port must be a valid integer between 1 and 65535.");
        return;
      }
    }

    if (monitorType !== "Ping monitoring" && monitorType !== "DNS monitoring" && upStatusCodes.length === 0) { 
      setFormError("Add at least one Up HTTP status code."); 
      return; 
    }

    if (monitorType === "DNS monitoring" && dnsExpectedValues.length === 0) {
      setFormError("Add at least one expected DNS value.");
      return;
    }

    if (monitorType === "DNS monitoring" && dnsResolverMode === "public_resolver" && !dnsCustomResolverIp) {
      setFormError("A custom resolver IP is required when using a public resolver.");
      return;
    }

    setSaving(true);
    setFormError("");

    // Collect only filled-in rows
    const request_headers = headerRows
      .filter((r) => r.key.trim())
      .map((r) => ({ key: r.key.trim(), value: r.value.trim() }));

    const meta_fields = metaRows
      .filter((r) => r.key.trim())
      .map((r) => ({ key: r.key.trim(), value: r.value.trim() }));

    // Build auth payload
    const authPayload: Record<string, string | null> = {
      auth_type: authType,
      auth_username: (authType === "basic" || authType === "digest") ? authUsername : null,
      auth_password: (authType === "basic" || authType === "digest") ? authPassword : null,
      auth_bearer_token: authType === "bearer" ? authToken : null,
    };

    try {
      const res = await fetch(`${uptimeApi}/monitors`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: (monitorType === "Ping monitoring" || monitorType === "Port monitoring") ? null : urlValue,
          target_host: (monitorType === "Ping monitoring" || monitorType === "Port monitoring") ? urlValue : null,
          target_port: monitorType === "Port monitoring" ? Number(portValue) : null,
          grace_period_seconds: monitorType === "Cron job / Heartbeat monitoring" ? gracePeriodSecondsValue : null,
          connect_timeout: monitorType === "Port monitoring" ? Number(timeout) * 1000 : null,
          packet_count: monitorType === "Ping monitoring" ? 4 : null,
          packet_timeout: monitorType === "Ping monitoring" ? 2000 : null,
          group_id: selectedGroup || null,
          tags,
          interval_seconds: intervalSecondsValue,
          timeout_seconds: Number(timeout),
          ip_version: ipVersion,
          follow_redirects: followRedirects,
          up_status_codes: upStatusCodes,
          ...authPayload,
          http_method: method,
          request_body: bodyEnabled ? (requestBody || null) : null,
          send_as_json: bodyEnabled ? sendAsJson : false,
          request_headers,
          meta_fields,
          ssl_check_enabled: sslOpen,
          ssl_error_check_enabled: sslChecks.errors,
          ssl_expiry_reminder_enabled: sslChecks.certificateExpiry,
          domain_expiry_reminder_enabled: sslChecks.domainExpiry,
          slow_response_alert_enabled: slowResponseAlert,
          slow_response_threshold_ms: slowResponseAlert ? Number(slowResponseMs) : null,
          monitor_type: monitorType === "Keyword monitoring" ? "keyword" : (monitorType === "Ping monitoring" ? "ping" : (monitorType === "Port monitoring" ? "port" : (monitorType === "Cron job / Heartbeat monitoring" ? "heartbeat" : (monitorType === "DNS monitoring" ? "dns" : "http")))),
          keyword: monitorType === "Keyword monitoring" ? keyword : null,
          keyword_condition: monitorType === "Keyword monitoring" ? keywordCondition : null,
          case_sensitive: monitorType === "Keyword monitoring" ? caseSensitive : false,
          dns_hostname: monitorType === "DNS monitoring" ? urlValue : null,
          dns_record_type: monitorType === "DNS monitoring" ? dnsRecordType : null,
          dns_expected_values: monitorType === "DNS monitoring" ? dnsExpectedValues : [],
          dns_match_mode: monitorType === "DNS monitoring" ? dnsMatchMode : null,
          dns_resolver_mode: monitorType === "DNS monitoring" ? dnsResolverMode : null,
          dns_custom_resolver_ip: (monitorType === "DNS monitoring" && dnsResolverMode === "public_resolver") ? dnsCustomResolverIp : null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create monitor.");
      router.push(`/dashboard/uptime-cron/monitoring/${data.monitor.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create monitor.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex min-h-[calc(100vh-40px)] w-full flex-col bg-black px-5 py-5 text-zinc-100 md:px-8">
      <div className="mx-auto w-full max-w-6xl">

        <header className="flex items-center gap-3 border-b border-zinc-800 pb-4">
          <Link
            href="/dashboard/uptime-cron"
            aria-label="Back to monitoring"
            className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              Add single monitor<span className="text-emerald-400">.</span>
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">Create a reliable endpoint check with advanced controls.</p>
          </div>
        </header>

        <div className="mt-5">
          <form
            onSubmit={submit}
            className="overflow-visible rounded-2xl border border-zinc-800 bg-[#111318] shadow-[0_24px_60px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.035)]"
          >

            {/* ── Monitor type + URL + group + tags ── */}
            <CardSection>
              <label className="block text-sm font-semibold text-slate-100">Monitor type</label>
              <div className="relative mt-3">
                <button
                  type="button"
                  onClick={() => setTypeMenuOpen((o) => !o)}
                  className="flex w-full items-center gap-4 rounded-lg border border-zinc-700 bg-[#0b0d12] p-4 text-left shadow-inner transition hover:border-indigo-500/60"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <SelectedIcon className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-base text-slate-100">{selectedType.name}</strong>
                    <small className="mt-1 block text-sm font-normal leading-5 text-slate-400">{selectedType.description}</small>
                  </span>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-slate-300 transition-transform ${typeMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {typeMenuOpen && (
                  <div className="absolute z-20 mt-2 max-h-[560px] w-full overflow-y-auto rounded-lg border border-zinc-700 bg-[#111318] shadow-2xl">
                    {monitorTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.name}
                          type="button"
                          onClick={() => { setMonitorType(type.name); setTypeMenuOpen(false); }}
                          className="flex w-full items-center gap-3 border-b border-slate-700/80 px-4 py-3 text-left last:border-b-0 hover:bg-slate-800"
                        >
                          <Icon className="h-6 w-6 shrink-0 text-emerald-400" />
                          <span className="min-w-0 flex-1">
                            <strong className="block text-sm text-slate-100">{type.name}</strong>
                            <small className="mt-0.5 block text-xs text-slate-400">{type.description}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {monitorType !== "Cron job / Heartbeat monitoring" && (
                <div className="mt-6 flex flex-col gap-4 sm:flex-row">
                  <label className="flex-1 block text-sm font-semibold">
                    {monitorType === "Ping monitoring" ? "IP or host to monitor" : monitorType === "Port monitoring" ? "URL, IP or host to monitor" : monitorType === "DNS monitoring" ? "Domain to monitor" : "URL to monitor"}
                    <input 
                      key={monitorType}
                      required 
                      name="url" 
                      type={monitorType === "Ping monitoring" || monitorType === "Port monitoring" || monitorType === "DNS monitoring" ? "text" : "url"} 
                      defaultValue={monitorType === "Ping monitoring" || monitorType === "Port monitoring" || monitorType === "DNS monitoring" ? "" : "https://"}
                      placeholder={monitorType === "Ping monitoring" || monitorType === "Port monitoring" ? "e.g. 98.22.45.23 or example.com" : monitorType === "DNS monitoring" ? "e.g. example.com" : "https://"} 
                      className={inputClass} 
                    />
                  </label>
                  {monitorType === "Port monitoring" && (
                    <label className="w-full sm:w-32 block text-sm font-semibold">
                      TCP port
                      <input 
                        required 
                        name="target_port" 
                        type="number"
                        min={1}
                        max={65535}
                        placeholder="e.g. 22" 
                        className={inputClass} 
                      />
                    </label>
                  )}
                </div>
              )}

              {monitorType === "Cron job / Heartbeat monitoring" && (
                <div className="mt-6 space-y-4">
                  <label className="block text-sm font-semibold">
                    Monitor Name
                    <input 
                      required 
                      name="url" 
                      type="text" 
                      placeholder="e.g. Nightly Database Backup" 
                      className={inputClass} 
                    />
                  </label>
                  <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4">
                    <p className="text-sm text-indigo-200">
                      <strong>Ping URL:</strong> A unique ping URL will be generated after you create this monitor.
                    </p>
                    <p className="mt-1 text-xs text-indigo-300/70">
                      Use it in your cron jobs or background workers to send a GET or POST request to signal they are healthy.
                    </p>
                  </div>
                </div>
              )}

              {monitorType === "Keyword monitoring" && (
                <div className="mt-6 space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                  <label className="block text-sm font-semibold">
                    Keyword to look for
                    <input 
                      required={monitorType === "Keyword monitoring"} 
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="e.g. Welcome or Error" 
                      className={inputClass} 
                    />
                  </label>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold">
                      Condition
                      <select 
                        value={keywordCondition}
                        onChange={(e) => setKeywordCondition(e.target.value as "exists" | "not_exists")}
                        className={inputClass}
                      >
                        <option value="exists">Start incident when keyword exists</option>
                        <option value="not_exists">Start incident when keyword doesn't exist</option>
                      </select>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 pt-8 text-sm">
                      <input 
                        type="checkbox" 
                        checked={caseSensitive}
                        onChange={(e) => setCaseSensitive(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-indigo-600" 
                      />
                      <span>
                        <strong className="block font-semibold">Case-sensitive check</strong>
                        <small className="block text-xs text-slate-400">Match exact casing.</small>
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {monitorType === "DNS monitoring" && (
                <div className="mt-6 space-y-5 rounded-lg border border-zinc-700 bg-zinc-900/50 p-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm font-semibold">
                      Record Type
                      <select 
                        value={dnsRecordType}
                        onChange={(e) => setDnsRecordType(e.target.value)}
                        className={inputClass}
                      >
                        <option value="A">A (IPv4 Address)</option>
                        <option value="AAAA">AAAA (IPv6 Address)</option>
                        <option value="CNAME">CNAME (Canonical Name)</option>
                        <option value="MX">MX (Mail Exchange)</option>
                        <option value="TXT">TXT (Text)</option>
                        <option value="NS">NS (Name Server)</option>
                        <option value="SOA">SOA (Start of Authority)</option>
                      </select>
                    </label>

                    <label className="block text-sm font-semibold">
                      Match Mode
                      <select 
                        value={dnsMatchMode}
                        onChange={(e) => setDnsMatchMode(e.target.value)}
                        className={inputClass}
                      >
                        <option value="exact_set">Must match exactly (Order independent)</option>
                        <option value="contains">Must include these values</option>
                        <option value="any_match">Any of these is fine</option>
                      </select>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold">
                      Resolver Mode
                      <select 
                        value={dnsResolverMode}
                        onChange={(e) => setDnsResolverMode(e.target.value)}
                        className={inputClass}
                      >
                        <option value="authoritative">Authoritative nameservers (Recommended, bypasses cache)</option>
                        <option value="system_default">Default (System resolver)</option>
                        <option value="public_resolver">Public resolver (e.g. Google, Cloudflare)</option>
                      </select>
                    </label>
                    <p className="mt-1 text-xs text-slate-400">
                      DNS answers can be cached. If you just changed a record and want to detect that immediately, choose Authoritative.
                    </p>
                  </div>

                  {dnsResolverMode === "public_resolver" && (
                    <label className="block text-sm font-semibold">
                      Custom Resolver IP
                      <input 
                        required 
                        value={dnsCustomResolverIp}
                        onChange={(e) => setDnsCustomResolverIp(e.target.value)}
                        placeholder="e.g. 8.8.8.8 or 1.1.1.1" 
                        className={inputClass} 
                      />
                    </label>
                  )}

                  <div>
                    <label className="block text-sm font-semibold">Expected Values</label>
                    <StringListInput 
                      values={dnsExpectedValues} 
                      onChange={setDnsExpectedValues} 
                      placeholder={dnsRecordType === "A" ? "e.g. 192.168.1.1" : dnsRecordType === "MX" ? "e.g. 10 mail.example.com" : "Add expected value..."}
                      hint={<p className="mt-1.5 text-xs text-slate-500">Type a value and press <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[10px]">Enter</kbd>.</p>}
                    />
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-sm font-semibold">Group</label>
                    <button type="button" onClick={() => setAddingGroup((o) => !o)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                      <Plus className="h-3.5 w-3.5" />Add group
                    </button>
                  </div>
                  <span className="mt-1 block text-xs text-slate-400">Your monitor is added to this group.</span>
                  <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className={inputClass}>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {addingGroup && (
                    <div className="mt-2 flex gap-2">
                      <input
                        autoFocus value={newGroup}
                        onChange={(e) => setNewGroup(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
                        placeholder="New group name"
                        className="mt-0 h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-[#0b0d12] px-3 text-sm text-white outline-none focus:border-indigo-500"
                      />
                      <button type="button" onClick={addGroup}
                        className="h-10 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500">
                        Create
                      </button>
                    </div>
                  )}
                </div>

                <label className="block text-sm font-semibold">
                  Add tags
                  <span className="mt-1 block text-xs font-normal text-slate-400">Organise monitors using searchable tags.</span>
                  <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-[#0b0d12] px-2 py-1.5 focus-within:border-indigo-500">
                    {tags.map((tag) => (
                      <button type="button" key={tag}
                        onClick={() => setTags((cur) => cur.filter((t) => t !== tag))}
                        className="rounded-md bg-indigo-500/15 px-2 py-1 text-xs font-medium text-indigo-200">
                        {tag} ×
                      </button>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTags(); } }}
                      onBlur={addTags}
                      placeholder={tags.length ? "Add another tag" : "Add one or more tags"}
                      className="h-7 min-w-32 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                    />
                  </div>
                </label>
              </div>
            </CardSection>

            {/* ── Notifications ── */}
            <CardSection>
              <h2 className="text-base font-bold text-white">How will we notify you?</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { title: "E-mail",       note: "workspace@deployai.dev", enabled: true },
                  { title: "SMS message",  note: "Add phone number" },
                  { title: "Voice call",   note: "Add phone number" },
                  { title: "Push",         note: "Download the app" },
                ].map((ch) => (
                  <label key={ch.title} className="flex gap-2 text-sm">
                    <input type="checkbox" defaultChecked={ch.enabled} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                    <span>
                      <strong className="block text-slate-200">{ch.title}</strong>
                      <small className="mt-1 block text-slate-400">{ch.note}</small>
                      <span className="mt-2 inline-block text-xs text-slate-500">No delay, no repeat</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-5 text-xs text-slate-400">
                Set up notification channels in <span className="text-emerald-400">Integrations &amp; Team</span> and edit them later.
              </p>
            </CardSection>

            {/* ── Monitor interval ── */}
            <CardSection>
              <h2 className="text-base font-bold text-white">{monitorType === "Cron job / Heartbeat monitoring" ? "Expected interval" : "Monitor interval"}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {monitorType === "Cron job / Heartbeat monitoring" 
                  ? <>We expect to receive a ping from your cron job every <strong className="text-white">{formatInterval(intervalSecondsValue)}</strong>.</>
                  : <>Your monitor will be checked every <strong className="text-white">{formatInterval(intervalSecondsValue)}</strong>.</>}
              </p>
              <input
                type="range" min="0" max="100" step="0.1" value={intervalProgress}
                onChange={(e) => setIntervalIndex(closestIntervalIndex(Number(e.target.value)))}
                style={{ background: `linear-gradient(90deg, #4f46e5 0%, #6366f1 ${intervalProgress}%, #334155 ${intervalProgress}%, #334155 100%)` }}
                className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
              />
              <div className="relative mt-3 h-4 text-xs text-slate-500">
                {intervalMarks.map((mark) => (
                  <span
                    key={mark.label}
                    style={{ left: `${intervalPosition(intervalSeconds.indexOf(mark.seconds))}%` }}
                    className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
                  >
                    {mark.label}
                  </span>
                ))}
              </div>

              {monitorType === "Cron job / Heartbeat monitoring" && (
                <div className="mt-10">
                  <h2 className="text-base font-bold text-white">Grace period</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Wait an additional <strong className="text-white">{formatGracePeriod(gracePeriodSecondsValue)}</strong> after the expected interval before marking as down.
                  </p>
                  <input
                    type="range" min="0" max="100" step="0.1" value={gracePeriodProgress}
                    onChange={(e) => setGracePeriodIndex(closestGracePeriodIndex(Number(e.target.value)))}
                    style={{ background: `linear-gradient(90deg, #10b981 0%, #34d399 ${gracePeriodProgress}%, #334155 ${gracePeriodProgress}%, #334155 100%)` }}
                    className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(16,185,129,0.18)]"
                  />
                  <div className="relative mt-3 h-4 text-xs text-slate-500">
                    {gracePeriodMarks.map((mark) => (
                      <span
                        key={mark.label}
                        style={{ left: `${gracePeriodPosition(gracePeriodSeconds.indexOf(mark.seconds))}%` }}
                        className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
                      >
                        {mark.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {monitorType !== "Cron job / Heartbeat monitoring" && (
                <>
                  <h3 className="mt-7 text-sm font-bold text-white">Location to monitor from</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-[#0b0d12] p-2">
                    <span className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-semibold">🇺🇸 Default (auto-select)</span>
                    <span className="text-xs text-slate-400">
                      <Globe2 className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />
                      Additional monitoring locations can be selected after creation.
                    </span>
                  </div>
                </>
              )}

              {monitorType !== "Ping monitoring" && monitorType !== "Port monitoring" && monitorType !== "Cron job / Heartbeat monitoring" && (
                <>
                  <button
                    type="button"
                    onClick={() => setSslOpen((o) => !o)}
                    className="mt-6 flex w-full items-center justify-between border-t border-slate-700 pt-5 text-left text-sm font-bold text-white"
                  >
                    <span className="flex items-center gap-1">
                      <ChevronRight className={`h-4 w-4 transition-transform ${sslOpen ? "rotate-90" : ""}`} />
                      SSL certificate and Domain checks
                    </span>
                  </button>
                  {sslOpen && (
                    <div className="mt-4 grid gap-3 rounded-lg border border-zinc-700 bg-[#0b0d12] p-4 sm:grid-cols-3">
                      {[
                        ["errors",            "Check SSL errors",         "Detect invalid or insecure certificates."],
                        ["certificateExpiry", "SSL expiry reminders",     "Alert before the certificate expires."],
                        ["domainExpiry",      "Domain expiry reminders",  "Alert before the domain registration expires."],
                      ].map(([key, title, desc]) => (
                        <label key={key} className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={sslChecks[key as keyof typeof sslChecks]}
                            onChange={(e) => setSslChecks((cur) => ({ ...cur, [key]: e.target.checked }))}
                            className="mt-0.5 h-4 w-4 accent-indigo-600"
                          />
                          <span>
                            <strong className="block text-sm text-slate-200">{title}</strong>
                            <small className="mt-1 block text-xs leading-4 text-slate-500">{desc}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardSection>

            {/* ── Advanced settings ── */}
            {monitorType !== "Cron job / Heartbeat monitoring" && (
              <CardSection>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  className="flex w-full items-center gap-1 text-left text-base font-bold text-white"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-90" : ""}`} />
                  Advanced settings
                </button>

                {advancedOpen && (
                <div className="mt-6 space-y-8">

                  {/* Request timeout */}
                  <div>
                    <h3 className="text-sm font-bold text-white">Request timeout</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      The request timeout is <strong className="text-white">{timeout} seconds</strong>. The shorter the timeout, the earlier we mark the website as down.
                    </p>
                    <input
                      type="range" min="5" max="60" step="1" value={timeout}
                      onChange={(e) => setTimeoutValue(e.target.value)}
                      style={{ background: `linear-gradient(90deg, #4f46e5 0%, #6366f1 ${timeoutProgress}%, #334155 ${timeoutProgress}%, #334155 100%)` }}
                      className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
                    />
                    <div className="relative mt-3 h-4 text-xs text-slate-500">
                      {[5, 10, 15, 30, 45, 60].map((mark) => (
                        <span key={mark} style={{ left: `${((mark - 5) / 55) * 100}%` }}
                          className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full">
                          {mark}s
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Slow response alert */}
                  <label className="block border-y border-slate-700 py-5 text-sm">
                    <span className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" checked={slowResponseAlert}
                        onChange={(e) => setSlowResponseAlert(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-indigo-600" />
                      <span>
                        <strong className="block">Slow response time alert</strong>
                        <small className="mt-1 block text-slate-400">Receive a notification when the response time exceeds this threshold.</small>
                      </span>
                    </span>
                    {slowResponseAlert && (
                      <div className="mt-4 max-w-sm">
                        <span className="text-xs font-semibold text-slate-300">Response time threshold</span>
                        <div className="relative">
                          <input type="number" min="1" value={slowResponseMs}
                            onChange={(e) => setSlowResponseMs(e.target.value)}
                            className={`${inputClass} pr-12`} />
                          <span className="absolute right-3 top-5 text-xs text-slate-500">ms</span>
                        </div>
                      </div>
                    )}
                  </label>

                  {/* ① Internet Protocol version — FIXED: bound to state, correct values sent */}
                  <div>
                    <h3 className="text-sm font-bold text-white">Internet Protocol version</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Controls whether the monitor connects using IPv4, IPv6, or tries IPv4 first.
                    </p>
                    <select
                      value={ipVersion}
                      onChange={(e) => setIpVersion(e.target.value as typeof ipVersion)}
                      className={`${inputClass} max-w-md`}
                    >
                      <option value="auto_ipv4_priority">IPv4 / IPv6 (IPv4 Priority) — default</option>
                      <option value="ipv4_only">IPv4 only</option>
                      <option value="ipv6_only">IPv6 only</option>
                    </select>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Use <em>IPv6 only</em> if your server is only reachable over IPv6.
                    </p>
                  </div>

                  {/* ② Follow redirections — WORKS, keeping */}
                  {monitorType !== "Ping monitoring" && monitorType !== "Port monitoring" && (
                    <label className="flex cursor-pointer items-start gap-3 border-y border-slate-700 py-5 text-sm">
                      <input type="checkbox" checked={followRedirects}
                        onChange={(e) => setFollowRedirects(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-indigo-600" />
                      <span>
                        <strong className="block">Follow redirections</strong>
                        <small className="mt-1 block text-slate-400">
                          ON: follows the full redirect chain and checks the final destination.<br />
                          OFF: reports the redirect code (3xx) as the result — useful to verify a redirect exists without following it.
                        </small>
                      </span>
                    </label>
                  )}                  {monitorType !== "Ping monitoring" && monitorType !== "Port monitoring" && (
                    <>
                      {/* ③ Up HTTP status codes */}
                      <div>
                        <h3 className="text-sm font-bold text-white">Up HTTP status codes</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          Responses matching these codes are considered <span className="text-emerald-400">Up</span>. Anything else triggers a down incident.
                        </p>
                        <StatusCodeInput codes={upStatusCodes} onChange={setUpStatusCodes} />
                      </div>

                      {/* ④ Auth type + credentials */}
                      <div>
                        <h3 className="text-sm font-bold text-white">Authentication</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          Configure how the monitor authenticates with your server or API.
                        </p>
                        <div className="mt-4 grid gap-5 md:grid-cols-[200px_1fr]">
                          <div>
                            <label className="block text-xs font-semibold text-slate-400">Auth type</label>
                            <select
                              value={authType}
                              onChange={(e) => { setAuthType(e.target.value as AuthType); setAuthUsername(""); setAuthPassword(""); setAuthToken(""); }}
                              className={inputClass}
                            >
                              {AUTH_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-400">Auth credentials</label>
                            {authType === "none" && (
                              <p className="mt-4 text-sm text-slate-600 italic">No authentication required for public endpoints.</p>
                            )}
                            {(authType === "basic" || authType === "digest") && (
                              <div className="mt-2 grid grid-cols-2 gap-3">
                                <input
                                  required
                                  value={authUsername}
                                  onChange={(e) => setAuthUsername(e.target.value)}
                                  placeholder="Username"
                                  autoComplete="off"
                                  className={`${inputClass} mt-0`}
                                />
                                <input
                                  required
                                  type="password"
                                  value={authPassword}
                                  onChange={(e) => setAuthPassword(e.target.value)}
                                  placeholder="Password"
                                  autoComplete="new-password"
                                  className={`${inputClass} mt-0`}
                                />
                              </div>
                            )}
                            {authType === "bearer" && (
                              <div className="mt-2">
                                <input
                                  required
                                  value={authToken}
                                  onChange={(e) => setAuthToken(e.target.value)}
                                  placeholder="Bearer token"
                                  autoComplete="off"
                                  className={`${inputClass} mt-0 font-mono`}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ⑤ HTTP method */}
                      <div>
                        <h3 className="text-sm font-bold text-white">HTTP method</h3>
                        <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-lg border border-zinc-700 sm:grid-cols-8">
                          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "QUERY"].map((m) => (
                            <button
                              key={m} type="button"
                              onClick={() => setMethod(m)}
                              className={`h-10 border-r border-zinc-700 text-xs font-semibold last:border-r-0 transition
                                ${method === m ? "bg-emerald-500/15 text-emerald-400" : "bg-[#0b0d12] text-slate-400 hover:bg-zinc-800 hover:text-white"}`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ⑥ Request body */}
                      {bodyEnabled && (
                        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-5">
                          <h3 className="text-sm font-bold text-white">Request body</h3>
                          <textarea
                            value={requestBody}
                            onChange={(e) => setRequestBody(e.target.value)}
                            placeholder={'{\n  "key": "value"\n}'}
                            className="mt-3 min-h-28 w-full rounded-lg border border-zinc-700 bg-[#0b0d12] p-3 font-mono text-sm text-white outline-none focus:border-indigo-500"
                          />
                          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={sendAsJson} onChange={(e) => setSendAsJson(e.target.checked)}
                              className="h-4 w-4 accent-indigo-600" />
                            Send as JSON
                          </label>
                        </div>
                      )}

                      {/* ⑦ Request headers */}
                      <div>
                        <h3 className="text-sm font-bold text-white">Request headers</h3>
                        <div className="mt-3">
                          <KVRowList
                            rows={headerRows}
                            onChange={updateKVRow(setHeaderRows)}
                            onAdd={addKVRow(setHeaderRows)}
                            onRemove={removeKVRow(setHeaderRows)}
                            keyPlaceholder="Header name (e.g. X-API-Key)"
                            valuePlaceholder="Value"
                          />
                        </div>
                      </div>

                      {/* ⑧ Meta fields */}
                      <div>
                        <h3 className="text-sm font-bold text-white">Meta fields</h3>
                        <div className="mt-3">
                          <KVRowList
                            rows={metaRows}
                            onChange={updateKVRow(setMetaRows)}
                            onAdd={addKVRow(setMetaRows)}
                            onRemove={removeKVRow(setMetaRows)}
                            keyPlaceholder="Key (e.g. env)"
                            valuePlaceholder="Value"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardSection>
            )}

            {/* ── Footer ── */}
            <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-zinc-800 bg-[#111318]/95 px-6 py-4 backdrop-blur md:px-8">
              <p className="hidden text-xs text-slate-400 sm:block">You can refine these settings at any time.</p>
              <div className="ml-auto flex gap-3">
                <Link
                  href="/dashboard/uptime-cron"
                  className="inline-flex h-10 items-center rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Link>
                <button
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creating…
                    </>
                  ) : (
                    <>✦ Create monitor</>
                  )}
                </button>
              </div>
            </footer>

            {formError && (
              <p className="px-6 pb-5 text-sm text-rose-400 md:px-8">{formError}</p>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
