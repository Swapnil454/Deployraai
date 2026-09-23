"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Monitor {
  id: string;
  url: string;
  monitor_type: "http" | "keyword" | "ping" | "port" | "heartbeat" | "dns";
  target_host: string | null;
  target_port: number | null;
  connect_timeout: number | null;
  packet_count: number | null;
  packet_timeout: number | null;
  status: "up" | "down" | "paused" | "pending";
  is_paused: boolean;
  interval_seconds: number;
  http_method: string;
  last_checked_at: string | null;
  heartbeat_token: string | null;
  grace_period_seconds: number | null;
  last_ping_at: string | null;
  next_expected_at: string | null;
  created_at: string;
  group_name: string | null;
  dns_hostname: string | null;
  dns_record_type: string | null;
  dns_expected_values: string[] | null;
  dns_match_mode: string | null;
  dns_resolver_mode: string | null;
  dns_custom_resolver_ip: string | null;
}

interface Check {
  checked_at: string;
  success: boolean;
  is_slow: boolean;
  status_code: number | null;
  response_time_ms: number;
  error_message: string | null;
}

interface Pagination { total: number; page: number; per_page: number; total_pages: number; }

interface Incident {
  id: string;
  started_at: string;
  resolved_at: string | null;
  cause: string;
  first_error_message: string | null;
}

interface Summary {
  "24h": { uptime_pct: string | null; avg_ms: number | null; min_ms: number | null; max_ms: number | null; incident_count: number; total_checks: number };
  "7d":  { uptime_pct: string | null; incident_count: number; avg_ms: number | null };
  "30d": { uptime_pct: string | null; incident_count: number; avg_ms: number | null };
}

interface DashboardData {
  monitor: Monitor;
  checks: Check[];       // chart data — last 30d, newest first
  incidents: Incident[];
  summary: Summary;
  up_since: string | null;
  mtbf_hours: number | null;
}

type ChartWindow = "1h" | "6h" | "24h" | "7d" | "30d";
type CheckFilter = "all" | "up" | "down";

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
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function uptimeSinceDuration(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function uptimePctColor(pct: string | null) {
  if (pct === null) return "text-zinc-400";
  const n = Number(pct);
  if (n >= 99.9) return "text-emerald-400";
  if (n >= 95) return "text-yellow-400";
  return "text-red-400";
}

function mtbfDisplay(hours: number | null): string {
  if (hours === null) return "—";
  if (hours >= 720) return `${Math.round(hours / 720)}mo`;
  if (hours >= 24) return `${Math.round(hours / 24)}d`;
  return `${hours}h`;
}

function causeBadge(cause: string) {
  const map: Record<string, { label: string; cls: string }> = {
    bad_status_code:  { label: "Bad Status",       cls: "bg-red-500/20 text-red-300 border border-red-500/20" },
    timeout:          { label: "Timeout",           cls: "bg-orange-500/20 text-orange-300 border border-orange-500/20" },
    connection_error: { label: "Connection Error",  cls: "bg-rose-500/20 text-rose-300 border border-rose-500/20" },
    slow_response:    { label: "⚠ Slow Response",   cls: "bg-amber-500/20 text-amber-300 border border-amber-500/20" },
    VALUE_MISMATCH:   { label: "Value Mismatch",    cls: "bg-orange-500/20 text-orange-300 border border-orange-500/20" },
    NXDOMAIN:         { label: "NXDOMAIN",          cls: "bg-rose-500/20 text-rose-300 border border-rose-500/20" },
    ENODATA:          { label: "ENODATA",           cls: "bg-rose-500/20 text-rose-300 border border-rose-500/20" },
    SERVFAIL:         { label: "SERVFAIL",          cls: "bg-red-500/20 text-red-300 border border-red-500/20" },
  };
  const entry = map[cause] ?? { label: cause, cls: "bg-zinc-700/50 text-zinc-300 border border-zinc-600" };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${entry.cls}`}>{entry.label}</span>;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function incidentDuration(start: string, end: string | null): string {
  const diffMs = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const s = Math.floor(diffMs / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ url, onConfirm, onCancel, loading }: {
  url: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <Trash2 className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Delete monitor</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Permanently delete <span className="font-semibold text-white">{url}</span> and all its history? This cannot be undone.
        </p>
        <div className="mt-6 flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50">
            {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Delete monitor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 24-hour Uptime Bar ────────────────────────────────────────────────────────

function UptimeBar({ checks }: { checks: Check[] }) {
  const now = Date.now();
  const cutoff = now - 24 * 3600 * 1000;
  const recent = checks.filter((c) => new Date(c.checked_at).getTime() >= cutoff);
  const BUCKETS = 48;
  const bucketMs = (24 * 3600 * 1000) / BUCKETS;
  const buckets = Array.from({ length: BUCKETS }, (_, i) => {
    const start = cutoff + i * bucketMs;
    const end = start + bucketMs;
    const inBucket = recent.filter((c) => { const t = new Date(c.checked_at).getTime(); return t >= start && t < end; });
    if (inBucket.length === 0) return null;
    return inBucket.every((c) => c.success);
  });

  return (
    <div className="flex items-end gap-px" style={{ height: 28 }}>
      {buckets.map((ok, i) => (
        <div key={i}
          className={`flex-1 rounded-[1px] transition-colors ${ok === null ? "bg-zinc-800" : ok ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ height: ok === null ? "35%" : ok ? "100%" : "70%" }}
          title={ok === null ? "No data" : ok ? "All checks passed" : "Downtime detected"} />
      ))}
    </div>
  );
}

// ─── Response Time Chart ──────────────────────────────────────────────────────

function ResponseTimeChart({ checks, windowH }: { checks: Check[]; windowH: ChartWindow }) {
  const windowMs: Record<ChartWindow, number> = {
    "1h":  1 * 3600_000,
    "6h":  6 * 3600_000,
    "24h": 24 * 3600_000,
    "7d":  7 * 86400_000,
    "30d": 30 * 86400_000,
  };
  const cutoff = Date.now() - windowMs[windowH];
  const pts = [...checks].filter((c) => new Date(c.checked_at).getTime() >= cutoff).reverse();

  if (pts.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-600">
        No data in this time window
      </div>
    );
  }

  const W = 1200, H = 200, PADX = 8, PADY = 20;
  const times = pts.map((c) => new Date(c.checked_at).getTime());
  const rtms  = pts.map((c) => c.response_time_ms);
  const tMin  = Math.min(...times), tMax = Math.max(...times);
  const rMax  = Math.max(...rtms) * 1.18 || 1;

  const tx = (t: number) => tMax === tMin ? W / 2 : PADX + ((t - tMin) / (tMax - tMin)) * (W - PADX * 2);
  const ty = (r: number) => H - PADY - (r / rMax) * (H - PADY * 2);

  const linePts  = pts.map((_, i) => `${tx(times[i])},${ty(rtms[i])}`).join(" ");
  const areaPts  = `${tx(times[0])},${H} ` + pts.map((_, i) => `${tx(times[i])},${ty(rtms[i])}`).join(" ") + ` ${tx(times[times.length - 1])},${H}`;

  const avg = Math.round(rtms.reduce((a, b) => a + b, 0) / rtms.length);
  const min = Math.min(...rtms);
  const max = Math.max(...rtms);

  // Y-axis labels
  const yLabels = [0.25, 0.5, 0.75, 1.0].map((f) => ({
    y: ty(rMax * f),
    label: `${Math.round(rMax * f)}ms`,
  }));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
            <stop offset="85%" stopColor="#6366f1" stopOpacity="0.03" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Horizontal grid */}
        {yLabels.map(({ y, label }) => (
          <g key={label}>
            <line x1={PADX} y1={y} x2={W - PADX} y2={y} stroke="#27272a" strokeWidth="1" strokeDasharray="5,5" />
            <text x={W - PADX + 4} y={y + 4} fill="#52525b" fontSize="18" textAnchor="start">{label}</text>
          </g>
        ))}

        {/* Area fill */}
        <polygon points={areaPts} fill="url(#chartGrad)" />

        {/* Down incident vertical lines */}
        {pts.map((c, i) => !c.success ? (
          <line key={`vl${i}`} x1={tx(times[i])} y1={PADY} x2={tx(times[i])} y2={H - PADY}
            stroke="#ef4444" strokeWidth="2" strokeOpacity="0.45" />
        ) : null)}

        {/* Main line */}
        <polyline points={linePts} fill="none" stroke="#818cf8" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />

        {/* Dots — green for success, red for failure */}
        {pts.map((c, i) => (
          <circle key={`dot${i}`}
            cx={tx(times[i])} cy={ty(rtms[i])}
            r={pts.length < 50 ? 4 : 3}
            fill={c.success ? "#22c55e" : "#ef4444"}
            stroke={c.success ? "#16a34a" : "#dc2626"}
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {/* Stats row */}
      <div className="mt-4 flex justify-center gap-10">
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-indigo-300">{avg} ms</p>
          <p className="mt-0.5 text-xs text-zinc-500">Average</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-emerald-400">{min} ms</p>
          <p className="mt-0.5 text-xs text-zinc-500">Minimum</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-red-400">{max} ms</p>
          <p className="mt-0.5 text-xs text-zinc-500">Maximum</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-zinc-300">{pts.length}</p>
          <p className="mt-0.5 text-xs text-zinc-500">Data points</p>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, children, accent, wide }: {
  label: string; children: React.ReactNode; accent?: string; wide?: boolean;
}) {
  return (
    <div className={`flex flex-col rounded-xl border bg-zinc-950 p-5 ${accent ?? "border-zinc-800"} ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-3 flex-1">{children}</div>
    </div>
  );
}

// ─── Pagination bar ───────────────────────────────────────────────────────────

function PaginationBar({ pagination, onChange }: { pagination: Pagination; onChange: (p: number) => void }) {
  const { page, total_pages, total, per_page } = pagination;
  const from = (page - 1) * per_page + 1;
  const to = Math.min(page * per_page, total);

  return (
    <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-3">
      <span className="text-xs text-zinc-500">
        Showing <span className="text-zinc-300">{from}–{to}</span> of <span className="text-zinc-300">{total}</span> checks
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: total_pages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === total_pages || Math.abs(p - page) <= 1)
          .reduce<(number | "...")[]>((acc, p, i, arr) => {
            if (i > 0 && (arr[i - 1] as number) < p - 1) acc.push("...");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "..." ? (
              <span key={`e${i}`} className="px-1 text-xs text-zinc-600">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p as number)}
                className={`h-7 min-w-[28px] rounded-md px-2 text-xs font-semibold transition ${
                  page === p ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                {p}
              </button>
            )
          )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= total_pages}
          className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MonitorDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const monitorId = params?.monitorId as string;

  // Dashboard data (header + chart + summary)
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Chart controls
  const [chartWindow, setChartWindow] = useState<ChartWindow>("1h");

  // Pause / delete
  const [pausing, setPausing]               = useState(false);
  const [pauseError, setPauseError]         = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting]             = useState(false);
  const [deleteError, setDeleteError]       = useState<string | null>(null);

  // Checks table (backend-paginated)
  const [checkFilter, setCheckFilter]     = useState<CheckFilter>("all");
  const [checkWindow, setCheckWindow]     = useState<ChartWindow | "all">("all");
  const [checkPage, setCheckPage]         = useState(1);
  const [checks, setChecks]               = useState<Check[]>([]);
  const [checkPagination, setCheckPagination] = useState<Pagination | null>(null);
  const [checksLoading, setChecksLoading] = useState(false);

  // Incident page
  const [incidentPage, setIncidentPage] = useState(5);

  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ── 1-second ticker — keeps timeAgo() and uptimeSinceDuration() live ────────
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch dashboard (header + chart) ────────────────────────────────────────

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const res = await fetch(`${API}/monitors/${monitorId}`, { credentials: "include" });
      if (res.status === 404) { router.replace("/dashboard/uptime-cron"); return; }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setData(await res.json());
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load monitor");
    } finally {
      setLoading(false);
    }
  }, [monitorId, router]);

  // ── Fetch checks (paginated, filtered) ──────────────────────────────────────

  const fetchChecks = useCallback(async (page: number, filter: CheckFilter, window: string) => {
    setChecksLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        per_page: "15",
        filter,
        ...(window !== "all" ? { window } : {}),
      });
      const res = await fetch(`${API}/monitors/${monitorId}/checks?${qs}`, { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      setChecks(json.checks);
      setCheckPagination(json.pagination);
    } finally {
      setChecksLoading(false);
    }
  }, [monitorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetchChecks(checkPage, checkFilter, checkWindow);
  }, [fetchChecks, checkPage, checkFilter, checkWindow]);

  // Auto-refresh every 15s
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchData(true);
      fetchChecks(checkPage, checkFilter, checkWindow);
    }, 15_000);
    return () => clearInterval(pollRef.current);
  }, [fetchData, fetchChecks, checkPage, checkFilter, checkWindow]);

  // Reset to page 1 when filter/window changes
  function applyCheckFilter(f: CheckFilter) { setCheckFilter(f); setCheckPage(1); }
  function applyCheckWindow(w: ChartWindow | "all") { setCheckWindow(w); setCheckPage(1); }

  // ── Pause / Resume ──────────────────────────────────────────────────────────

  async function handlePauseToggle() {
    if (!data || pausing) return;
    setPausing(true);
    setPauseError(null);
    const newPaused = !data.monitor.is_paused;
    try {
      const res = await fetch(`${API}/monitors/${monitorId}/pause`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: newPaused }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); }
      setData((d) => d ? { ...d, monitor: { ...d.monitor, is_paused: newPaused, status: newPaused ? "paused" : "pending" } } : d);
      await fetchData(true);
    } catch (e: unknown) {
      setPauseError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setPausing(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API}/monitors/${monitorId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); }
      router.replace("/dashboard/uptime-cron");
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete");
      setDeleting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-full items-center justify-center bg-black">
        <Loader2 className="h-10 w-10 animate-spin text-zinc-600" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-4 bg-black text-white">
        <XCircle className="h-10 w-10 text-red-500" />
        <p className="text-zinc-400">{error ?? "Monitor not found"}</p>
        <Link href="/dashboard/uptime-cron" className="text-sm text-indigo-400 hover:underline">← Back to monitors</Link>
      </main>
    );
  }

  const { monitor, checks: chartChecks, incidents, summary, up_since, mtbf_hours } = data;
  const displayUrl = monitor.monitor_type === "ping" || monitor.monitor_type === "port" ? (monitor.target_host ?? "") : (monitor.monitor_type === "dns" ? (monitor.dns_hostname ?? "") : monitor.url);
  const host = (() => { try { return new URL(displayUrl).hostname; } catch { return displayUrl; } })();

  const statusConfig = {
    up:      { label: "Up",      dot: "bg-emerald-500",              badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: <TrendingUp  className="h-5 w-5 text-emerald-400" /> },
    down:    { label: "Down",    dot: "bg-red-500 animate-pulse",    badge: "bg-red-500/15 text-red-400 border-red-500/20",             icon: <TrendingDown className="h-5 w-5 text-red-400" /> },
    paused:  { label: "Paused",  dot: "bg-zinc-500",                 badge: "bg-zinc-700/30 text-zinc-400 border-zinc-600/30",          icon: <Pause       className="h-5 w-5 text-zinc-400" /> },
    pending: { label: "Pending", dot: "bg-yellow-500 animate-pulse", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",    icon: <Loader2     className="h-5 w-5 animate-spin text-yellow-400" /> },
  }[monitor.status];

  const s24  = summary["24h"];
  const s7d  = summary["7d"];
  const s30d = summary["30d"];

  const checkWindowOptions: { label: string; value: ChartWindow | "all" }[] = [
    { label: "All time", value: "all" },
    { label: "1h",       value: "1h" },
    { label: "6h",       value: "6h" },
    { label: "24h",      value: "24h" },
    { label: "7d",       value: "7d" },
    { label: "30d",      value: "30d" },
  ];

  return (
    <>
      {showDeleteModal && (
        <DeleteModal url={monitor.url} onConfirm={handleDeleteConfirm}
          onCancel={() => { setShowDeleteModal(false); setDeleteError(null); }} loading={deleting} />
      )}

      <main className="min-h-full bg-black px-6 py-8 text-zinc-100 lg:px-10">
        <div className="mx-auto w-full max-w-7xl space-y-6">

          {/* ── Header ── */}
          <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <Link href="/dashboard/uptime-cron"
                className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:text-white">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusConfig.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
                    {statusConfig.label}
                  </span>
                  <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-xs text-zinc-400">
                    {monitor.monitor_type === "ping" 
                      ? "PING" 
                      : monitor.monitor_type === "port"
                        ? `PORT :${monitor.target_port}`
                        : monitor.monitor_type === "heartbeat"
                          ? "HEARTBEAT"
                          : monitor.monitor_type === "dns"
                            ? `DNS / ${monitor.dns_record_type}`
                            : monitor.monitor_type === "keyword" 
                            ? `${monitor.http_method} / KEYWORD` 
                            : `${monitor.http_method} / HTTP`}
                  </span>
                  {monitor.group_name && (
                    <span className="text-xs text-zinc-500">in <span className="text-zinc-300">{monitor.group_name}</span></span>
                  )}
                </div>
                <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">{host}</h1>
                {monitor.monitor_type !== "ping" && monitor.monitor_type !== "port" && monitor.monitor_type !== "heartbeat" && monitor.monitor_type !== "dns" && (
                  <a href={monitor.url} target="_blank" rel="noopener noreferrer"
                    className="mt-0.5 flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300">
                    {monitor.url} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2 sm:ml-auto">
              <div className="flex items-center gap-2">
                <button onClick={() => fetchData(false)} title="Refresh"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:text-white">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button onClick={handlePauseToggle} disabled={pausing}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-50">
                  {pausing ? <Loader2 className="h-4 w-4 animate-spin" /> : monitor.is_paused ? <Play className="h-4 w-4 text-emerald-400" /> : <Pause className="h-4 w-4" />}
                  {monitor.is_paused ? "Resume" : "Pause"}
                </button>
                <button onClick={() => { setShowDeleteModal(true); setDeleteError(null); }} title="Delete monitor"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-800 text-zinc-500 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {pauseError  && <p className="text-xs text-red-400">{pauseError}</p>}
              {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
            </div>
          </header>

          {/* ── Heartbeat URL Banner ── */}
          {monitor.monitor_type === "heartbeat" && (
            <section className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5">
              <h2 className="text-sm font-bold text-indigo-200">Ping URL</h2>
              <p className="mt-1 text-xs text-indigo-300/70">
                Send an HTTP GET or POST request to this URL to signal that your job has run successfully.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 rounded border border-indigo-500/20 bg-black/40 px-3 py-2 text-sm text-indigo-300 select-all">
                  {process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron/ping/{monitor.heartbeat_token}
                </code>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-400">
                <span><strong className="text-zinc-200">Expected interval:</strong> {formatInterval(monitor.interval_seconds)}</span>
                <span><strong className="text-zinc-200">Grace period:</strong> {monitor.grace_period_seconds ? formatInterval(monitor.grace_period_seconds) : 'None'}</span>
                <span><strong className="text-zinc-200">Last ping:</strong> {timeAgo(monitor.last_ping_at)}</span>
              </div>
            </section>
          )}

          {/* ── Status cards: 5-column grid ── */}
          {/*
            Col layout (lg):
            [Status + Last check — merged wide] [MTBF] [24h — wider] [7d] [30d]
            = col-span-2  +  col-span-1  +  col-span-2  +  col-span-1  +  col-span-1
            total = 7 cols on lg
          */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">

            {/* ① Status + Last Check — merged */}
            <div className={`col-span-2 flex flex-col rounded-xl border bg-zinc-950 p-5
              ${monitor.status === "up" ? "border-emerald-500/30" : monitor.status === "down" ? "border-red-500/30" : "border-zinc-800"}`}>
              <div className="flex items-start justify-between gap-3">
                {/* Status side */}
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Current status</span>
                  <div className="mt-2 flex items-center gap-2">
                    {statusConfig.icon}
                    <span className={`text-2xl font-bold ${monitor.status === "up" ? "text-emerald-400" : monitor.status === "down" ? "text-red-400" : "text-zinc-300"}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  {monitor.status === "up" && up_since && (
                    <p className="mt-1.5 text-xs text-zinc-500">Up for <span className="text-zinc-300">{uptimeSinceDuration(up_since)}</span></p>
                  )}
                  {monitor.status === "down" && (
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      <p className="text-xs text-red-400/70">Incident ongoing</p>
                      {incidents.find((i) => !i.resolved_at) && (
                        <Link href={`/dashboard/uptime-cron/incidents/${incidents.find((i) => !i.resolved_at)?.id}`}
                          className="inline-flex max-w-max items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 border border-red-500/20 hover:bg-red-500/20 transition">
                          View Incident <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                {/* Divider */}
                <div className="h-full w-px bg-zinc-800" />
                {/* Last check side */}
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Last check</span>
                  <p className="mt-2 text-xl font-bold text-white">{timeAgo(monitor.last_checked_at)}</p>
                  <p className="mt-1.5 text-xs text-zinc-500">Every <span className="text-zinc-300">{formatInterval(monitor.interval_seconds)}</span></p>
                </div>
              </div>
            </div>

            {/* ② MTBF */}
            <StatCard label="MTBF">
              <p className="text-2xl font-bold tabular-nums text-white">{mtbfDisplay(mtbf_hours)}</p>
              <p className="mt-1 text-xs text-zinc-500">Mean time between failures</p>
            </StatCard>

            {/* ③ Last 24 hours — wider (col-span-2) */}
            <div className="col-span-2 flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Last 24 hours</span>
              <div className="mt-3 flex items-baseline gap-3">
                <p className={`text-3xl font-bold tabular-nums ${uptimePctColor(s24.uptime_pct)}`}>
                  {s24.uptime_pct !== null ? `${Number(s24.uptime_pct).toFixed(2)}%` : "—"}
                </p>
                <span className="text-sm text-zinc-500">{s24.incident_count} incident{s24.incident_count !== 1 ? "s" : ""}</span>
              </div>
              <div className="mt-3 flex-1">
                <UptimeBar checks={chartChecks} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-zinc-700">
                <span>24h ago</span><span>Now</span>
              </div>
            </div>

            {/* ④ Last 7 days */}
            <StatCard label="Last 7 days">
              <p className={`text-2xl font-bold tabular-nums ${uptimePctColor(s7d.uptime_pct)}`}>
                {s7d.uptime_pct !== null ? `${Number(s7d.uptime_pct).toFixed(3)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{s7d.incident_count} incident{s7d.incident_count !== 1 ? "s" : ""}</p>
            </StatCard>

            {/* ⑤ Last 30 days */}
            <StatCard label="Last 30 days">
              <p className={`text-2xl font-bold tabular-nums ${uptimePctColor(s30d.uptime_pct)}`}>
                {s30d.uptime_pct !== null ? `${Number(s30d.uptime_pct).toFixed(3)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{s30d.incident_count} incident{s30d.incident_count !== 1 ? "s" : ""}</p>
            </StatCard>
          </div>

          {/* ── Response time chart ── */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-white">Response time</h2>
              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />Success</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />Failure</span>
              </div>
              {/* Window selector */}
              <div className="flex overflow-hidden rounded-lg border border-zinc-700">
                {(["1h", "6h", "24h", "7d", "30d"] as ChartWindow[]).map((w) => (
                  <button key={w} onClick={() => setChartWindow(w)}
                    className={`px-3 py-1.5 text-xs font-semibold transition
                      ${chartWindow === w ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <ResponseTimeChart checks={chartChecks} windowH={chartWindow} />
          </section>

          {/* ── Latest incidents ── */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
              <h2 className="text-sm font-bold text-white">Latest incidents</h2>
              <span className="text-xs text-zinc-500">{incidents.length} total</span>
            </div>

            {incidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <CheckCircle2 className="h-10 w-10 text-emerald-500/40" />
                <p className="text-sm text-zinc-500">No incidents — great reliability!</p>
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-4 gap-4 border-b border-zinc-800/50 px-6 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-600 md:grid">
                  <span>Status</span><span>Root cause</span><span>Started</span><span>Duration</span>
                </div>
                {incidents.slice(0, incidentPage).map((inc) => (
                  <Link key={inc.id}
                    href={`/dashboard/uptime-cron/incidents/${inc.id}`}
                    className="grid grid-cols-2 items-start gap-4 border-b border-zinc-800/40 px-6 py-3 last:border-b-0 md:grid-cols-4 md:items-center hover:bg-zinc-800/30 transition cursor-pointer group">
                    <div className="flex items-center gap-2">
                      {inc.resolved_at
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        : <XCircle className="h-4 w-4 shrink-0 animate-pulse text-red-500" />}
                      <span className={`text-sm font-semibold ${inc.resolved_at ? "text-emerald-400" : "text-red-400"}`}>
                        {inc.resolved_at ? "Resolved" : "Ongoing"}
                      </span>
                    </div>
                    <div>
                      {causeBadge(inc.cause)}
                      {inc.first_error_message && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-zinc-500" title={inc.first_error_message}>
                          {inc.first_error_message}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400">{formatDateTime(inc.started_at)}</span>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">{incidentDuration(inc.started_at, inc.resolved_at)}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition" />
                    </div>
                  </Link>
                ))}
                {incidents.length > incidentPage && (
                  <div className="border-t border-zinc-800 px-6 py-3">
                    <button onClick={() => setIncidentPage((p) => p + 10)}
                      className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">
                      Load more incidents
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Checks log (backend-paginated, filtered) ── */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-6 py-4">
              <h2 className="text-sm font-bold text-white">Check logs</h2>
              {checkPagination && (
                <span className="text-xs text-zinc-500">{checkPagination.total} total checks</span>
              )}
            </div>

            {/* Filters toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/60 px-6 py-3">
              <Filter className="h-3.5 w-3.5 shrink-0 text-zinc-600" />

              {/* Status filter */}
              <div className="flex overflow-hidden rounded-md border border-zinc-700 text-xs">
                {(["all", "up", "down"] as CheckFilter[]).map((f) => (
                  <button key={f} onClick={() => applyCheckFilter(f)}
                    className={`px-2.5 py-1 font-semibold capitalize transition
                      ${checkFilter === f ? (f === "up" ? "bg-emerald-600 text-white" : f === "down" ? "bg-red-600 text-white" : "bg-zinc-700 text-white") : "text-zinc-400 hover:bg-zinc-800"}`}>
                    {f === "all" ? "All" : f === "up" ? "✓ Up" : "✗ Down"}
                  </button>
                ))}
              </div>

              {/* Time window filter */}
              <div className="flex overflow-hidden rounded-md border border-zinc-700 text-xs">
                {checkWindowOptions.map(({ label, value }) => (
                  <button key={value} onClick={() => applyCheckWindow(value)}
                    className={`px-2.5 py-1 font-semibold transition
                      ${checkWindow === value ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table header */}
            <div className="hidden grid-cols-[1fr_auto_auto_auto_2fr] gap-4 border-b border-zinc-800/50 px-6 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-600 md:grid">
              <span>Time</span>
              <span className="text-center">Status</span>
              <span className="text-right">HTTP</span>
              <span className="text-right">Response time</span>
              <span>Message</span>
            </div>

            {/* Rows */}
            {checksLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
              </div>
            ) : checks.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-zinc-600">
                No checks match the current filter
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/40">
                {checks.map((c, i) => {
                  const rowState = !c.success ? "down" : c.is_slow ? "slow" : "up";
                  return (
                    <div key={i}
                      className={`grid grid-cols-[1fr_auto_auto_auto_2fr] items-center gap-4 px-6 py-3 transition-colors
                        ${
                          rowState === "down" ? "hover:bg-red-500/5"
                          : rowState === "slow" ? "hover:bg-amber-500/5"
                          : "hover:bg-emerald-500/5"
                        }`}>
                      {/* Time + dot */}
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${
                          rowState === "down" ? "bg-red-500"
                          : rowState === "slow" ? "bg-amber-400"
                          : "bg-emerald-500"
                        }`} />
                        {formatDateTime(c.checked_at)}
                      </div>
                      {/* Status badge */}
                      <span className={`inline-block rounded-md px-2 py-0.5 text-center text-xs font-bold ${
                        rowState === "down" ? "bg-red-500/15 text-red-300"
                        : rowState === "slow" ? "bg-amber-500/15 text-amber-300"
                        : "bg-emerald-500/15 text-emerald-300"
                      }`}>
                        {rowState === "down" ? "DOWN" : rowState === "slow" ? "SLOW" : "UP"}
                      </span>
                      {/* HTTP code */}
                      <span className={`text-right text-xs font-mono font-semibold ${
                        c.status_code != null
                          ? rowState === "down" ? "text-red-400" : rowState === "slow" ? "text-amber-400" : "text-emerald-400"
                          : "text-zinc-600"
                      }`}>
                        {c.status_code ?? "—"}
                      </span>
                      {/* Response time — amber when slow */}
                      <span className={`text-right text-xs tabular-nums font-medium ${
                        rowState === "slow" ? "text-amber-400 font-bold"
                        : c.response_time_ms > 1000 ? "text-red-400"
                        : c.response_time_ms > 500 ? "text-yellow-400"
                        : "text-zinc-300"
                      }`}>
                        {c.response_time_ms} ms
                        {rowState === "slow" && <span className="ml-1 text-[10px] text-amber-500/70">⚠</span>}
                      </span>
                      {/* Message */}
                      <span className={`truncate text-xs ${
                        rowState === "down" ? "text-red-400/80"
                        : rowState === "slow" ? "text-amber-400/70"
                        : "text-zinc-600"
                      }`} title={c.error_message ?? undefined}>
                        {rowState === "down"
                          ? (c.error_message ?? "Check failed")
                          : rowState === "slow"
                          ? (c.error_message ?? "Response exceeded threshold")
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {checkPagination && checkPagination.total_pages > 1 && (
              <PaginationBar pagination={checkPagination} onChange={(p) => setCheckPage(p)} />
            )}
          </section>

        </div>
      </main>
    </>
  );
}
