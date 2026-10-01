"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Plus, Activity, Settings, Loader2 } from "lucide-react";

interface StatusPage {
  id: string;
  title: string;
  slug: string;
  is_public: boolean;
  monitors: any[];
}

export default function StatusPagesList() {
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

  useEffect(() => {
    let active = true;
    fetch(`${API}/status-pages`, { credentials: "include" })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Failed to load status pages")))
      .then(data => {
        if (active) {
          setPages(data.status_pages || []);
          setError(null);
        }
      })
      .catch(e => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-full bg-black px-6 py-8 text-zinc-100 lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="border-b border-zinc-800 pb-8 flex justify-between items-start">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.18em] text-emerald-400">UPTIME CRON JOB</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">Status pages</h1>
            <p className="mt-2 text-sm text-zinc-400">Share service availability with your customers.</p>
          </div>
          <Link href="/dashboard/uptime-cron/status-pages/new" 
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus className="w-4 h-4" />
            Create status page
          </Link>
        </header>

        <section className="mt-6">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex min-h-64 items-center justify-center text-red-400">
              {error}
            </div>
          ) : pages.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
              <Activity className="w-12 h-12 text-zinc-600 mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Status pages is ready when you are</h2>
              <p className="text-zinc-400 text-sm mb-6 max-w-sm">Create a public or private status page to keep your users informed during incidents and maintenance.</p>
              <Link href="/dashboard/uptime-cron/status-pages/new" 
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
                <Plus className="w-4 h-4" />
                Create status page
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pages.map((page) => (
                <div key={page.id} className="border border-zinc-800 rounded-xl bg-zinc-900/50 p-5 flex flex-col hover:border-zinc-700 transition">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg text-white truncate pr-2">{page.title}</h3>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${page.is_public ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-300"}`}>
                      {page.is_public ? "Public" : "Private"}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mb-6 flex-1">
                    {page.monitors.length} monitor{page.monitors.length !== 1 ? 's' : ''} connected
                  </p>
                  
                  <div className="flex items-center gap-2 mt-auto pt-4 border-t border-zinc-800">
                    <Link href={`/dashboard/uptime-cron/status-pages/${page.id}`} 
                      className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition">
                      <Settings className="w-3.5 h-3.5" />
                      Manage
                    </Link>
                    <Link href={`/status-page/${page.slug}`} target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-semibold transition">
                      View <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
