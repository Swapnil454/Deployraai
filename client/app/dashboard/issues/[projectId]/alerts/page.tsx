"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { Bell, ArrowLeft, AlertCircle } from "lucide-react";

export default function AlertHistoryPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    fetchHistory();
  }, [projectId]);

  async function fetchHistory() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/history`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    if (status === 'sent') return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Delivered</Badge>;
    if (status === 'queued') return <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">Queued</Badge>;
    if (status === 'suppressed') return <Badge variant="outline" className="text-zinc-500 border-zinc-700">Suppressed</Badge>;
    if (status === 'failed') return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">Failed</Badge>;
    return <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{status}</Badge>;
  }

  return (
    <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0 font-sans">
      {/* Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 p-6 pt-6 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          
          {/* HEADER & CONTROLS */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-zinc-800/60 pb-5">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <Bell className="h-6 w-6 text-white" />
                Alert History
              </h1>
              <p className="text-sm text-zinc-400 mt-1">Recent alerts triggered by your rules.</p>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="flex flex-col gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-full h-28 rounded-xl border border-zinc-800/60 bg-zinc-900/40 animate-pulse" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 border border-zinc-800/60 border-dashed rounded-xl bg-zinc-900/20">
                <AlertCircle className="h-10 w-10 text-zinc-600 mb-4" />
                <p className="text-zinc-400 font-medium text-lg">No alerts triggered yet</p>
                <p className="text-sm text-zinc-500 mt-1">When an alert rule triggers, its history will appear here.</p>
              </div>
            ) : (
              history.map((event: any) => (
                <div key={event.id} className="w-full rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-200">
                  <div className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-white truncate max-w-2xl">{event.title}</h3>
                        {getStatusBadge(event.status)}
                        <Badge variant="outline" className={`capitalize text-xs font-medium ${
                          event.severity === 'critical' ? 'border-red-500/30 text-red-400 bg-red-500/10' : 
                          event.severity === 'error' ? 'border-orange-500/30 text-orange-400 bg-orange-500/10' :
                          event.severity === 'warning' ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' :
                          'border-zinc-700 text-zinc-400 bg-zinc-800/50'
                        }`}>
                          {event.severity}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-[#bb3615] mb-2">Rule: {event.rule_name || 'Deleted Rule'}</p>
                      <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl">{event.message}</p>
                      
                      {event.fingerprint && (
                        <p className="text-[11px] text-zinc-500 font-mono mt-3 px-2 py-1 bg-zinc-900 rounded-md inline-block border border-zinc-800/50">
                          Fingerprint: {event.fingerprint}
                        </p>
                      )}
                      {event.error_message && (
                        <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Delivery Error: {event.error_message}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-end gap-1.5 shrink-0 pt-1">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-500/70" />
                        <p className="text-sm text-zinc-300 font-medium">{new Date(event.triggered_at).toLocaleString()}</p>
                      </div>
                      <p className="text-xs text-zinc-500 tracking-wide">via <span className="uppercase text-zinc-400">{event.route_type}</span></p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
