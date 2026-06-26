"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Activity, Network, Clock, ChevronRight } from "lucide-react";

export default function TracesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const [loading, setLoading] = useState(true);
  const [recentTraces, setRecentTraces] = useState<any[]>([]);

  useEffect(() => {
    // In a real app, this would fetch from /metrics/recent-traces or similar
    // Since we only built /traces/:traceId in the backend, we will mock a list
    // or just fetch raw spans and group by trace_id.
    const fetchRecentTraces = async () => {
      try {
        setLoading(true);
        // Mock data since the backend /traces endpoint expects a specific traceId
        // In production, we'd add an endpoint for GET /traces to list recent ones
        setTimeout(() => {
          setRecentTraces([
            { id: 't-12345', method: 'GET', route: '/api/users', duration: 145, status: 200, time: new Date(Date.now() - 5000) },
            { id: 't-12346', method: 'POST', route: '/api/checkout', duration: 890, status: 500, time: new Date(Date.now() - 45000) },
            { id: 't-12347', method: 'GET', route: '/', duration: 25, status: 200, time: new Date(Date.now() - 120000) },
            { id: 't-12348', method: 'GET', route: '/dashboard', duration: 320, status: 200, time: new Date(Date.now() - 300000) },
          ]);
          setLoading(false);
        }, 1000);
      } catch (e) {
        console.error(e);
      }
    };
    fetchRecentTraces();
  }, [projectId]);

  return (
    <div className="w-full flex flex-col min-h-full bg-black text-white p-8">
      <div className="max-w-[1440px] w-full mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Distributed Traces</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
        ) : (
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-800 text-sm font-medium text-zinc-400 bg-black/50">
              <div className="col-span-3">Trace ID</div>
              <div className="col-span-4">Endpoint</div>
              <div className="col-span-2 text-right">Duration</div>
              <div className="col-span-2 text-right">Time</div>
              <div className="col-span-1"></div>
            </div>
            
            <div className="flex flex-col">
              {recentTraces.map((trace) => (
                <div 
                  key={trace.id} 
                  onClick={() => router.push(`/dashboard/${projectId}/traces/${trace.id}`)}
                  className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors items-center text-sm"
                >
                  <div className="col-span-3 font-mono text-zinc-300">{trace.id}</div>
                  <div className="col-span-4 flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${trace.status >= 500 ? 'bg-red-500/20 text-red-500' : 'bg-zinc-800 text-zinc-300'}`}>
                      {trace.method}
                    </span>
                    <span className="font-mono">{trace.route}</span>
                  </div>
                  <div className="col-span-2 text-right text-zinc-300">
                    {trace.duration} ms
                  </div>
                  <div className="col-span-2 text-right text-zinc-500">
                    {trace.time.toLocaleTimeString()}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-zinc-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
