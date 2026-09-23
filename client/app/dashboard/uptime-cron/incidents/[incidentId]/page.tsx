"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
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
  status: "ongoing" | "resolved";
  monitor_id: string;
  monitor_url: string;
  http_method: string;
  monitor_type: string;
  request_headers: Array<{ key: string; value: string }> | null;
  interval_seconds: number;
}

interface ActivityEntry {
  id: string;
  event_type: string;
  message: string | null;
  status_code: number | null;
  response_time_ms: number | null;
  location: string;
  occurred_at: string;
  response_headers_snapshot: Record<string, string> | null;
}

interface DetailData {
  incident: Incident;
  activity: ActivityEntry[];
  response_headers: Record<string, string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

const EVENT_META: Record<string, { label: string; color: string; icon: string }> = {
  failure_detected: { label: "Failure detected",        color: "text-red-400",     icon: "🔴" },
  failure_confirmed:{ label: "Failure confirmed",       color: "text-red-400",     icon: "🔴" },
  resolved:         { label: "Incident resolved",       color: "text-emerald-400", icon: "✅" },
  slow_detected:    { label: "Slow response detected",  color: "text-amber-400",   icon: "⚠" },
  slow_confirmed:   { label: "Slow response confirmed", color: "text-amber-400",   icon: "⚠" },
  slow_resolved:    { label: "Speed restored",          color: "text-emerald-400", icon: "✅" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `0h ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function causeBadge(cause: string, errorMsg: string | null) {
  const label = errorMsg ?? cause.replace(/_/g, " ");
  const map: Record<string, string> = {
    bad_status_code:  "bg-red-500/20 text-red-300 border-red-500/30",
    timeout:          "bg-orange-500/20 text-orange-300 border-orange-500/30",
    connection_error: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    slow_response:    "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  const cls = map[cause] ?? "bg-zinc-700/50 text-zinc-300 border-zinc-600";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-sm font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Live Timer ───────────────────────────────────────────────────────────────

function LiveDuration({ startedAt, resolvedAt }: { startedAt: string; resolvedAt: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (resolvedAt) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [resolvedAt]);
  const endMs  = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const sec    = Math.floor((endMs - new Date(startedAt).getTime()) / 1000);
  return <>{formatDuration(Math.max(0, sec))}</>;
}

// ─── Response Panel ───────────────────────────────────────────────────────────

type PanelTab = "headers";

function ResponsePanel({ url, method, headers }: {
  url: string;
  method: string;
  headers: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(headers, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Request card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="mb-3 text-sm font-bold text-zinc-200">Request.</h3>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono">
          <span className="shrink-0 rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-300">
            {method}
          </span>
          <span className="truncate text-zinc-300" title={url}>{url}</span>
          <button onClick={() => navigator.clipboard.writeText(url)}
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-zinc-700 transition">
            <Copy className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>

      {/* Response card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">Response Headers.</h3>
          <button onClick={copy}
            className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 transition">
            <Copy className="h-3 w-3" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        {Object.keys(headers).length === 0 ? (
          <p className="text-xs text-zinc-600 italic">No response headers captured yet.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-700/60 bg-zinc-950 p-3">
            <pre className="text-[11px] leading-5 text-zinc-300 whitespace-pre-wrap break-all">
              {JSON.stringify(headers, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = params.incidentId as string;

  const [data, setData]       = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetch_ = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`${API}/incidents/${incidentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Incident not found");
      setData(await res.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load incident");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetch_(); }, [incidentId]);

  // Auto-refresh if ongoing
  useEffect(() => {
    if (!data || data.incident.resolved_at) return;
    const id = setInterval(() => fetch_(true), 30_000);
    return () => clearInterval(id);
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-500">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="text-sm">{error ?? "Incident not found"}</p>
        <Link href="/dashboard/uptime-cron/incidents"
          className="text-xs text-indigo-400 hover:underline">← Back to incidents</Link>
      </div>
    );
  }

  const { incident, activity, response_headers } = data;
  const isOngoing = incident.status === "ongoing";

  return (
    <main className="min-h-screen bg-zinc-950 pb-20 text-white">
      {/* ── Hero header ── */}
      <div className={`border-b px-8 py-8 ${isOngoing ? "border-red-900/30 bg-red-950/10" : "border-emerald-900/20 bg-emerald-950/5"}`}>
        <div className="mx-auto max-w-7xl">
          <Link href="/dashboard/uptime-cron/incidents"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to incidents
          </Link>

          <div className="flex items-start gap-4">
            {/* Status dot */}
            <div className={`mt-1 h-5 w-5 shrink-0 rounded-full ${isOngoing ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-snug">
                {isOngoing ? "Ongoing" : "Resolved"} incident on{" "}
                <span className="text-indigo-300 break-all">{incident.monitor_url}</span>
              </h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
                <span className="font-mono text-xs bg-zinc-800 rounded px-1.5 py-0.5">{incident.http_method}</span>
                monitor for
                <a href={incident.monitor_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-zinc-400 hover:text-indigo-400 transition">
                  {incident.monitor_url}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button onClick={() => fetch_(true)} disabled={refreshing}
                className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <Link href={`/dashboard/uptime-cron/monitoring/${incident.monitor_id}`}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition">
                Go to monitor
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="mx-auto max-w-7xl px-8 pt-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Root cause card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">Root cause</p>
              <div className="flex items-center gap-3">
                {causeBadge(incident.cause, incident.first_error_message)}
                <span className="text-sm text-zinc-400">in Default Region</span>
              </div>
            </div>

            {/* Status + Duration row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">Status</p>
                {isOngoing ? (
                  <>
                    <p className="text-lg font-bold text-red-400">Ongoing</p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Started at {formatDateTime(incident.started_at)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-emerald-400">Resolved</p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Started at {formatDateTime(incident.started_at)}
                    </p>
                    <p className="text-xs text-zinc-600">
                      Resolved at {formatDateTime(incident.resolved_at!)}
                    </p>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">Duration</p>
                <p className="text-2xl font-bold tabular-nums text-white">
                  <LiveDuration startedAt={incident.started_at} resolvedAt={incident.resolved_at} />
                </p>
                {incident.affected_checks > 0 && (
                  <p className="mt-1 text-xs text-zinc-600">{incident.affected_checks} failed check{incident.affected_checks !== 1 ? "s" : ""}</p>
                )}
              </div>
            </div>

            {/* Region card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">Regions</p>
              <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold
                ${isOngoing ? "border-red-800/40 bg-red-900/10 text-red-300" : "border-emerald-800/40 bg-emerald-900/10 text-emerald-300"}`}>
                {isOngoing
                  ? <AlertCircle className="h-4 w-4 text-red-400" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                Default Region
              </div>
            </div>

            {/* Activity log */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30">
              <div className="border-b border-zinc-800 px-6 py-4">
                <h2 className="text-base font-bold text-white">Activity log.</h2>
              </div>
              {activity.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-sm text-zinc-600">
                  No activity yet
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/50 px-6">
                  {activity.map(entry => {
                    const meta = EVENT_META[entry.event_type] ?? { label: entry.event_type, color: "text-zinc-400", icon: "•" };
                    return (
                      <div key={entry.id} className="flex items-start gap-4 py-3.5">
                        <span className="mt-0.5 text-base shrink-0">{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                            {entry.status_code && (
                              <span className="inline-block rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-bold font-mono text-zinc-300">
                                {entry.status_code}
                              </span>
                            )}
                            {entry.response_time_ms && (
                              <span className="text-xs text-zinc-600">{entry.response_time_ms}ms</span>
                            )}
                          </div>
                          {entry.message && (
                            <p className="mt-0.5 text-xs text-zinc-500 truncate" title={entry.message}>
                              {entry.message}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right text-xs text-zinc-600">
                          {formatDateTime(entry.occurred_at)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right column — Request + Response */}
          <div className="space-y-4">
            <ResponsePanel
              url={incident.monitor_url}
              method={incident.http_method}
              headers={response_headers}
            />

            {/* Affected checks */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">Stats</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Failed checks</span>
                  <span className="font-bold text-red-400">{incident.affected_checks}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Check interval</span>
                  <span className="font-mono text-zinc-300">
                    {incident.interval_seconds < 60
                      ? `${incident.interval_seconds}s`
                      : `${incident.interval_seconds / 60}m`}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Activity entries</span>
                  <span className="font-mono text-zinc-300">{activity.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
