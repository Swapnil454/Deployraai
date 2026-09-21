"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock3,
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
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MonitorStatus = "up" | "down" | "paused" | "pending";

interface Monitor {
  id: string;
  url: string;
  status: MonitorStatus;
  interval_seconds: number;
  is_paused: boolean;
  last_checked_at: string | null;
  group_id: string | null;
  group_name: string | null;
  uptime_24h: string | null;  // "99.98"
  last_response_ms: number | null;
  last_status_code: number | null;
  open_incidents: number;
  sparkline: boolean[];       // newest first, up to 90 booleans
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

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

function StatusDot({ status }: { status: MonitorStatus }) {
  const cls: Record<MonitorStatus, string> = {
    up: "bg-emerald-500",
    down: "bg-red-500 animate-pulse",
    paused: "bg-zinc-500",
    pending: "bg-yellow-500 animate-pulse",
  };
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls[status]}`} />;
}

// ─── 90-tick Sparkbar ─────────────────────────────────────────────────────────

function Sparkbar({ sparkline }: { sparkline: boolean[] }) {
  // sparkline is newest-first; we render oldest-first (left to right)
  const bars = [...sparkline].reverse();
  // Pad to 90 if fewer checks exist
  while (bars.length < 90) bars.unshift(null as unknown as boolean);

  return (
    <div className="flex items-end gap-[1.5px]" style={{ height: 28 }}>
      {bars.map((ok, i) => (
        <div
          key={i}
          className={`flex-1 rounded-[1px] transition-colors ${
            ok === null
              ? "bg-zinc-800"
              : ok
              ? "bg-emerald-500/80"
              : "bg-red-500/90"
          }`}
          style={{ height: ok === null ? "40%" : ok ? "100%" : "65%" }}
          title={ok === null ? "No data" : ok ? "Up" : "Down"}
        />
      ))}
    </div>
  );
}

// ─── Action menu ──────────────────────────────────────────────────────────────

function MonitorActions({
  monitor,
  onPause,
  onDelete,
  pendingDelete,
  deletingId,
  cancelDelete,
}: {
  monitor: Monitor;
  onPause: (id: string, paused: boolean) => void;
  onDelete: (id: string) => void;
  pendingDelete: string | null;
  deletingId: string | null;
  cancelDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const isPending = pendingDelete === monitor.id;
  const isDeleting = deletingId === monitor.id;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <Link
            href={`/dashboard/uptime-cron/monitoring/${monitor.id}`}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <Activity className="h-4 w-4" /> View dashboard
          </Link>
          <a href={monitor.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800">
            <ExternalLink className="h-4 w-4" /> Visit URL
          </a>
          <button
            onClick={() => { setOpen(false); onPause(monitor.id, !monitor.is_paused); }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            {monitor.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {monitor.is_paused ? "Resume" : "Pause"}
          </button>
          <div className="my-1 border-t border-zinc-800" />
          {isPending ? (
            <div className="flex items-center gap-1 px-3 py-2">
              <span className="flex-1 text-xs text-red-400">Sure?</span>
              <button onClick={() => { setOpen(false); onDelete(monitor.id); }}
                className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500">
                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
              </button>
              <button onClick={() => { setOpen(false); cancelDelete(); }}
                className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-600">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setOpen(false); onDelete(monitor.id); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Monitor row ──────────────────────────────────────────────────────────────

function MonitorRow({
  monitor,
  onPause,
  onDelete,
  pendingDelete,
  deletingId,
  cancelDelete,
}: {
  monitor: Monitor;
  onPause: (id: string, paused: boolean) => void;
  onDelete: (id: string) => void;
  pendingDelete: string | null;
  deletingId: string | null;
  cancelDelete: () => void;
}) {
  const uptimePct = formatUptime(monitor.uptime_24h);
  const uptimeNum = monitor.uptime_24h ? Number(monitor.uptime_24h) : null;
  const uptimeColor =
    uptimeNum === null ? "text-zinc-500" :
    uptimeNum >= 99.9 ? "text-emerald-400" :
    uptimeNum >= 95 ? "text-yellow-400" : "text-red-400";

  const host = (() => {
    try { return new URL(monitor.url).hostname; } catch { return monitor.url; }
  })();

  return (
    <Link
      href={`/dashboard/uptime-cron/monitoring/${monitor.id}`}
      className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-zinc-900/60"
    >
      {/* Status */}
      <StatusDot status={monitor.status} />

      {/* URL + metadata */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
          {host}
        </p>
        <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-zinc-500">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            {monitor.status.toUpperCase()}
          </span>
          {monitor.last_response_ms !== null && (
            <span>{monitor.last_response_ms} ms</span>
          )}
          {monitor.open_incidents > 0 && (
            <span className="font-semibold text-red-400">
              {monitor.open_incidents} open incident{monitor.open_incidents > 1 ? "s" : ""}
            </span>
          )}
        </p>
      </div>

      {/* Sparkbar — hidden on small screens */}
      <div className="hidden w-28 lg:block">
        <Sparkbar sparkline={monitor.sparkline} />
      </div>

      {/* 24h uptime */}
      <div className="hidden w-16 text-right sm:block">
        <span className={`text-sm font-bold tabular-nums ${uptimeColor}`}>{uptimePct}</span>
        <p className="text-[10px] text-zinc-600">24h</p>
      </div>

      {/* Interval badge */}
      <div className="hidden w-12 text-right md:block">
        <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
          {formatInterval(monitor.interval_seconds)}
        </span>
      </div>

      {/* Last check */}
      <div className="hidden w-24 text-right text-xs text-zinc-500 lg:block">
        <Clock3 className="mr-1 inline h-3 w-3" />
        {timeAgo(monitor.last_checked_at)}
      </div>

      {/* Actions — stop link propagation */}
      <div onClick={(e) => e.preventDefault()}>
        <MonitorActions monitor={monitor} onPause={onPause} onDelete={onDelete}
          pendingDelete={pendingDelete} deletingId={deletingId} cancelDelete={cancelDelete} />
      </div>
    </Link>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function GroupSection({
  name,
  monitors,
  onPause,
  onDelete,
  pendingDelete,
  deletingId,
  cancelDelete,
}: {
  name: string;
  monitors: Monitor[];
  onPause: (id: string, paused: boolean) => void;
  onDelete: (id: string) => void;
  pendingDelete: string | null;
  deletingId: string | null;
  cancelDelete: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const up = monitors.filter((m) => m.status === "up").length;
  const down = monitors.filter((m) => m.status === "down").length;
  const paused = monitors.filter((m) => m.status === "paused").length;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-zinc-800 bg-[#0a0a0a]">
      {/* Group header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/40"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${collapsed ? "" : "rotate-90"}`}
        />
        <span className="flex-1 text-sm font-semibold text-zinc-200">{name}</span>
        <div className="flex items-center gap-2 text-xs">
          {up > 0 && <span className="flex items-center gap-1 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{up} up</span>}
          {down > 0 && <span className="flex items-center gap-1 text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{down} down</span>}
          {paused > 0 && <span className="text-zinc-500">{paused} paused</span>}
          <span className="ml-1 text-zinc-600">({monitors.length})</span>
        </div>
      </button>

      {/* Monitor rows */}
      {!collapsed && (
        <div className="divide-y divide-zinc-800/60">
          {monitors.map((m) => (
            <MonitorRow key={m.id} monitor={m} onPause={onPause} onDelete={onDelete}
              pendingDelete={pendingDelete} deletingId={deletingId} cancelDelete={cancelDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ monitors }: { monitors: Monitor[] }) {
  const total = monitors.length;
  const up = monitors.filter((m) => m.status === "up").length;
  const down = monitors.filter((m) => m.status === "down").length;
  const paused = monitors.filter((m) => m.status === "paused").length;
  const pending = monitors.filter((m) => m.status === "pending").length;

  const avgUptime =
    total === 0
      ? null
      : monitors.reduce((sum, m) => sum + (m.uptime_24h ? Number(m.uptime_24h) : 0), 0) / total;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {[
        { label: "Total", value: total, color: "text-white" },
        { label: "Up", value: up, color: "text-emerald-400" },
        { label: "Down", value: down, color: down > 0 ? "text-red-400" : "text-zinc-500" },
        { label: "Paused", value: paused, color: "text-zinc-400" },
        { label: "24h Avg Uptime", value: avgUptime !== null ? `${avgUptime.toFixed(2)}%` : "—", color: avgUptime !== null && avgUptime >= 99.9 ? "text-emerald-400" : "text-yellow-400" },
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
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MonitorStatus>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null); // monitorId awaiting confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch(`${API}/monitors`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setMonitors(data.monitors ?? []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMonitors(); }, [fetchMonitors]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(fetchMonitors, 30_000);
    return () => clearInterval(id);
  }, [fetchMonitors]);

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  async function handlePause(id: string, paused: boolean) {
    // Optimistic update
    setMonitors((ms) =>
      ms.map((m) =>
        m.id === id ? { ...m, is_paused: paused, status: paused ? "paused" : "pending" } : m
      )
    );
    await fetch(`${API}/monitors/${id}/pause`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused }),
    });
    fetchMonitors(); // re-sync
  }

  async function handleDelete(id: string) {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      return;
    }
    setDeletingId(id);
    setPendingDelete(null);
    try {
      await fetch(`${API}/monitors/${id}`, { method: "DELETE", credentials: "include" });
      setMonitors((ms) => ms.filter((m) => m.id !== id));
    } catch {
      // re-fetch to get accurate state
      fetchMonitors();
    } finally {
      setDeletingId(null);
    }
  }

  function cancelDelete() { setPendingDelete(null); }

  // Filter
  const filtered = monitors.filter((m) => {
    const matchSearch =
      !search ||
      m.url.toLowerCase().includes(search.toLowerCase()) ||
      (m.group_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Group by group_name
  const grouped = filtered.reduce<Record<string, Monitor[]>>((acc, m) => {
    const key = m.group_name ?? "Ungrouped";
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const filterLabels: Record<string, string> = {
    all: "All monitors",
    up: "Up",
    down: "Down",
    paused: "Paused",
    pending: "Pending",
  };

  return (
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
            <p className="mt-2 text-sm text-zinc-400">
              Keep an eye on every endpoint your customers depend on.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchMonitors}
              className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-zinc-700 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <Link
              href="/dashboard/uptime-cron/monitoring/new"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" /> New monitor
            </Link>
          </div>
        </header>

        {/* Summary bar */}
        {monitors.length > 0 && (
          <div className="pt-7">
            <SummaryBar monitors={monitors} />
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col justify-between gap-3 py-4 sm:flex-row">
          <label className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 focus-within:border-indigo-500">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              placeholder="Search monitors or groups…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div ref={filterRef} className="relative">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 hover:border-zinc-700"
            >
              {filterLabels[statusFilter]}
              <ChevronDown className="h-4 w-4" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                {Object.entries(filterLabels).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => { setStatusFilter(val as typeof statusFilter); setFilterOpen(false); }}
                    className={`block w-full px-5 py-2.5 text-left text-sm transition hover:bg-zinc-800 ${statusFilter === val ? "text-indigo-400 font-semibold" : "text-zinc-300"}`}
                  >
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
              <Link
                href="/dashboard/uptime-cron/monitoring/new"
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
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
                key={groupName}
                name={groupName}
                monitors={groupMonitors}
                onPause={handlePause}
                onDelete={handleDelete}
                pendingDelete={pendingDelete}
                deletingId={deletingId}
                cancelDelete={cancelDelete}
              />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
