"use client";

import { useEffect, useState } from "react";
import { Loader2, ServerCrash } from "lucide-react";

export default function AdminProviders() {
  const [failures, setFailures] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || '${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}'}`}/api/admin/providers/summary`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setFailures(data.failures);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchProviders();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const providers = [
    { key: 'vercel', name: 'Vercel' },
    { key: 'render', name: 'Render' },
    { key: 'railway', name: 'Railway' },
    { key: 'netlify', name: 'Netlify' },
    { key: 'github', name: 'GitHub' },
    { key: 'cloudflare', name: 'Cloudflare' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-8">Provider Integration Health</h1>
      
      <p className="text-zinc-400 mb-8 max-w-2xl">
        This dashboard tracks deployment failures attributed to specific providers. 
        A sudden spike in failures for a specific provider might indicate a platform-wide outage or API change.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {providers.map((p) => {
          const failureCount = failures?.[p.key] || 0;
          return (
            <div key={p.key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-white mb-1">{p.name}</h3>
                <p className="text-sm text-zinc-400">Total failures recorded</p>
              </div>
              <div className="flex flex-col items-center">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  failureCount > 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                }`}>
                  {failureCount > 0 ? <ServerCrash className="h-6 w-6" /> : <span className="text-xl font-bold">0</span>}
                </div>
                {failureCount > 0 && (
                  <span className="mt-2 text-xl font-bold text-red-500">{failureCount}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
