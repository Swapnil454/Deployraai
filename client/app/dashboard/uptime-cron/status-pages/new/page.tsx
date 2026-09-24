"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";

interface Monitor {
  id: string;
  url: string | null;
  target_host: string | null;
  dns_hostname: string | null;
  monitor_type: string;
  status: string;
}

export default function NewStatusPage() {
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [selectedMonitorIds, setSelectedMonitorIds] = useState<Set<string>>(new Set());

  const API = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

  useEffect(() => {
    let active = true;
    fetch(`${API}/monitors`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to load monitors")))
      .then(data => {
        if (active) {
          setMonitors(data.monitors || []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  // Auto-generate slug from title if user hasn't typed in slug manually
  const [slugModified, setSlugModified] = useState(false);
  useEffect(() => {
    if (!slugModified) {
      setSlug(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  }, [title, slugModified]);

  const toggleMonitor = (id: string) => {
    const next = new Set(selectedMonitorIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMonitorIds(next);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/status-pages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          is_public: isPublic,
          monitor_ids: Array.from(selectedMonitorIds)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create status page");
      router.push("/dashboard/uptime-cron/status-pages");
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-full bg-black px-6 py-8 text-zinc-100 lg:px-10">
      <div className="mx-auto w-full max-w-4xl">
        <Link href="/dashboard/uptime-cron/status-pages" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to status pages
        </Link>
        
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Create status page.</h1>
          <p className="mt-2 text-sm text-zinc-400">Configure your public-facing status page and select which monitors to display.</p>
        </header>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-zinc-800 pb-2">1. Global settings</h2>
            
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Status Page Name
                <input 
                  required
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. DeployAI Systems"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                />
              </label>

              <label className="block text-sm font-semibold">
                URL Slug
                <div className="mt-2 flex rounded-lg shadow-sm">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-400">
                    /status-page/
                  </span>
                  <input
                    required
                    type="text"
                    value={slug}
                    onChange={e => {
                      setSlug(e.target.value);
                      setSlugModified(true);
                    }}
                    placeholder="my-company"
                    className="w-full rounded-none rounded-r-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                  />
                </div>
              </label>
            </div>

            <label className="flex items-center gap-3">
              <input 
                type="checkbox" 
                checked={isPublic}
                onChange={e => setIsPublic(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900" 
              />
              <span className="text-sm font-semibold">Make this status page public (accessible to anyone)</span>
            </label>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h2 className="text-lg font-bold text-white mb-2 border-b border-zinc-800 pb-2 flex items-center justify-between">
              <span>2. Monitors on status page</span>
              <span className="text-xs font-normal text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">{selectedMonitorIds.size} selected</span>
            </h2>
            <p className="text-sm text-zinc-400 mb-4">Select the monitors you want to display on this status page.</p>

            {monitors.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-lg">
                You haven't created any monitors yet. <Link href="/dashboard/uptime-cron/monitoring/new" className="text-emerald-400 hover:underline">Create a monitor first</Link>.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {monitors.map(m => {
                  const target = m.url || m.target_host || m.dns_hostname || "Unknown target";
                  const isSelected = selectedMonitorIds.has(m.id);
                  return (
                    <label key={m.id} className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition ${isSelected ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"}`}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleMonitor(m.id)}
                        className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900" 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${m.status === 'up' ? 'bg-emerald-500' : m.status === 'down' ? 'bg-red-500' : m.status === 'paused' ? 'bg-zinc-500' : 'bg-amber-500'}`} />
                          <span className="font-semibold text-sm truncate">{target}</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 uppercase tracking-wider font-mono">{m.monitor_type}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={saving || !title || !slug}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-bold transition">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Creating..." : "Create status page"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
