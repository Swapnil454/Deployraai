"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Incident {
  id: string;
  cause: string;
  first_error_message: string | null;
  started_at: string;
  resolved_at: string | null;
  affected_checks: number;
  duration_seconds: number;
  status: "ongoing" | "degraded" | "resolved";
  monitor_id: string;
  monitor_url: string;
  http_method: string;
}

interface Pagination {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

interface Totals {
  ongoing: number;
  degraded: number;
  resolved: number;
  grand: number;
}

type StatusFilter = "all" | "ongoing" | "degraded" | "resolved";

// ─── Constants ────────────────────────────────────────────────────────────────

const API = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname);
  } catch { return url; }
}

function causeBadge(cause: string, errorMessage: string | null) {
  const label = errorMessage ?? cause.replace(/_/g, " ");
  const map: Record<string, string> = {
    bad_status_code:  "bg-red-500/20 text-red-300 border border-red-500/30",
    timeout:          "bg-orange-500/20 text-orange-300 border border-orange-500/30",
    connection_error: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
    slow_response:    "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  };
  const cls = map[cause] ?? "bg-zinc-700/50 text-zinc-300 border border-zinc-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Pagination bar ───────────────────────────────────────────────────────────

function PaginationBar({ pagination, onChange }: { pagination: Pagination; onChange: (p: number) => void }) {
  const { page, total_pages, total, per_page } = pagination;
  const from = (page - 1) * per_page + 1;
  const to   = Math.min(page * per_page, total);
  return (
    <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-3 text-xs text-zinc-500">
      <span>Showing {from}–{to} of {total} incidents</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1}
          className="rounded p-1 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 font-medium text-zinc-300">{page} / {total_pages}</span>
        <button onClick={() => onChange(page + 1)} disabled={page >= total_pages}
          className="rounded p-1 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const router = useRouter();
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [pagination, setPagination]   = useState<Pagination | null>(null);
  const [totals, setTotals]           = useState<Totals | null>(null);
  const [loading, setLoading]         = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage]               = useState(1);
  const [refreshing, setRefreshing]   = useState(false);

  const fetchIncidents = useCallback(async (pg = page, sf = statusFilter, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ page: String(pg), per_page: "20", status: sf });
      const res = await fetch(`${API}/incidents?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load incidents");
      const data = await res.json();
      setIncidents(data.incidents);
      setPagination(data.pagination);
      if (data.totals) setTotals(data.totals);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchIncidents(page, statusFilter); }, [page, statusFilter]);

  // Auto-refresh ongoing incidents every 30s
  useEffect(() => {
    const id = setInterval(() => fetchIncidents(page, statusFilter, true), 30_000);
    return () => clearInterval(id);
  }, [page, statusFilter, fetchIncidents]);

  // No need for local ongoing/resolved counts — use API totals

  return (
    <main className="min-h-screen bg-zinc-950 pb-20 text-white">
      {/* ── Header ── */}
      <div className="border-b border-zinc-800/60 bg-zinc-950 px-8 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-400">
                Uptime Monitoring
              </p>
              <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-white">
                <AlertCircle className="h-7 w-7 text-red-400" />
                Incidents
                <span className="text-zinc-600">.</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Track downtime events and slow response alerts across all monitors.
              </p>
            </div>
            <button
              onClick={() => fetchIncidents(page, statusFilter, true)}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Stats bar */}
          {totals && (
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                <span className="h-2 w-2 rounded-full bg-zinc-500" />
                <span className="text-sm font-semibold text-zinc-300">{totals.grand} Total</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-semibold text-red-300">{totals.ongoing} Ongoing</span>
              </div>
              {totals.degraded > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="text-sm font-semibold text-yellow-300">{totals.degraded} Degraded</span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-300">{totals.resolved} Resolved</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-7xl px-8 pt-6">
        {/* Filter bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex overflow-hidden rounded-lg border border-zinc-700 text-sm">
            {(["all", "ongoing", "degraded", "resolved"] as StatusFilter[]).map(f => (
              <button key={f} id={`filter-${f}`}
                onClick={() => { setStatusFilter(f); setPage(1); }}
                className={`px-4 py-2 font-semibold capitalize transition ${
                  statusFilter === f ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800"
                }`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Filter className="h-3.5 w-3.5" />
            {pagination ? `${pagination.total} incident${pagination.total !== 1 ? "s" : ""}` : ""}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/30">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_2fr_1fr_1fr_1fr_auto] items-center gap-4 border-b border-zinc-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <span>Status</span>
            <span>Monitor</span>
            <span>Root Cause</span>
            <span>Started</span>
            <span>Resolved</span>
            <span>Duration</span>
            <span></span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-zinc-600" />
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-600">
              <CheckCircle2 className="h-10 w-10 text-emerald-800" />
              <p className="text-sm font-medium">No incidents found</p>
              <p className="text-xs">All monitors are operating normally 🎉</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {incidents.map(incident => (
                <div
                  key={incident.id}
                  onClick={() => router.push(`/dashboard/uptime-cron/incidents/${incident.id}`)}
                  className={`grid grid-cols-[auto_1fr_2fr_1fr_1fr_1fr_auto] items-center gap-4 px-5 py-3.5 text-sm transition cursor-pointer
                    ${incident.status === "ongoing"
                      ? "hover:bg-red-500/5 border-l-2 border-red-500/60"
                      : incident.status === "degraded"
                      ? "hover:bg-yellow-500/5 border-l-2 border-yellow-500/60"
                      : "hover:bg-zinc-800/30 border-l-2 border-transparent"}`}
                >
                  {/* Status */}
                  <div>
                    {incident.status === "ongoing" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400 border border-red-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        Ongoing
                      </span>
                    ) : incident.status === "degraded" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-2.5 py-1 text-xs font-bold text-yellow-400 border border-yellow-500/20">
                        <AlertCircle className="h-3 w-3" />
                        Degraded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Resolved
                      </span>
                    )}
                  </div>

                  {/* Monitor */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-xs font-mono font-semibold text-zinc-200">
                      <span className="shrink-0 rounded bg-zinc-700/60 px-1 py-0.5 text-[10px] font-bold text-zinc-400">
                        {incident.http_method}
                      </span>
                      <span className="truncate" title={incident.monitor_url}>{shortUrl(incident.monitor_url)}</span>
                    </div>
                  </div>

                  {/* Root cause */}
                  <div>{causeBadge(incident.cause, incident.first_error_message)}</div>

                  {/* Started */}
                  <div className="text-xs text-zinc-400">{formatDateTime(incident.started_at)}</div>

                  {/* Resolved */}
                  <div className="text-xs text-zinc-500">
                    {incident.resolved_at ? formatDateTime(incident.resolved_at) : (
                      <span className="text-zinc-600 italic">Not yet resolved</span>
                    )}
                  </div>

                  {/* Duration */}
                  <div className="flex items-center gap-1 text-xs text-zinc-400">
                    <Clock className="h-3 w-3 text-zinc-600" />
                    {formatDuration(incident.duration_seconds)}
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="h-4 w-4 text-zinc-600" />
                </div>
              ))}
            </div>
          )}

          {pagination && pagination.total_pages > 1 && (
            <PaginationBar pagination={pagination} onChange={(p) => setPage(p)} />
          )}
        </div>
      </div>
    </main>
  );
}
