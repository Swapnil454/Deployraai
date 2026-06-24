"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, Route } from "lucide-react";

export default function RoutesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/observability` : "http://localhost:5000/api/observability";
        const res = await fetch(`${ANALYTICS_API_URL}/metrics/routes?projectId=${projectId}`, {
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          setRoutes(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRoutes();
  }, [projectId]);

  return (
    <div className="w-full flex flex-col min-h-full bg-black text-white p-8">
      <div className="max-w-[1440px] w-full mx-auto">
        <h1 className="text-2xl font-bold mb-6">API Routes Performance</h1>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
        ) : (
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-800 text-xs font-medium text-zinc-400 bg-black/50 uppercase tracking-wider">
              <div className="col-span-4">Route</div>
              <div className="col-span-2 text-right">Requests</div>
              <div className="col-span-2 text-right">Error Rate</div>
              <div className="col-span-2 text-right">Avg Latency</div>
              <div className="col-span-2 text-right">P99 Latency</div>
            </div>
            
            <div className="flex flex-col">
              {routes.length === 0 ? (
                 <div className="p-8 text-center text-zinc-500 flex flex-col items-center">
                   <Route className="h-8 w-8 mb-4 opacity-50" />
                   <p>No route data available yet</p>
                 </div>
              ) : (
                routes.map((route, i) => (
                  <div key={i} className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors items-center text-sm">
                    <div className="col-span-4 flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300`}>
                        {route.method}
                      </span>
                      <span className="font-mono text-zinc-200 truncate">{route.route}</span>
                    </div>
                    <div className="col-span-2 text-right text-zinc-300">
                      {parseInt(route.total_requests).toLocaleString()}
                    </div>
                    <div className="col-span-2 text-right">
                      <span className={parseFloat(route.error_rate) > 5 ? 'text-red-500' : 'text-zinc-300'}>
                        {parseFloat(route.error_rate).toFixed(2)}%
                      </span>
                    </div>
                    <div className="col-span-2 text-right text-zinc-300">
                      {route.avg_ms} ms
                    </div>
                    <div className="col-span-2 text-right text-amber-500 font-mono">
                      {route.p99_ms} ms
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
