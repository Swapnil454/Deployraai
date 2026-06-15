"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Activity, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export default function MonitoringPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetchSummary();
  }, [projectId]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/monitor-summary`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-5xl">
        <button 
          onClick={() => router.push(`/dashboard/projects/${projectId}/deploy`)}
          className="mb-8 flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Deployments
        </button>

        <h1 className="mb-2 text-2xl font-bold text-white flex items-center gap-3">
          <Activity className="h-6 w-6 text-indigo-400" />
          Monitoring Dashboard
        </h1>
        <p className="mb-8 text-zinc-400">Track uptime, response times, and health of your services.</p>

        {/* Uptime Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 flex flex-col justify-center">
            <h3 className="text-zinc-400 text-sm font-medium mb-1">Frontend Uptime</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-white">{summary?.frontendUptime ? summary.frontendUptime.toFixed(2) : '0.00'}%</span>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 flex flex-col justify-center">
            <h3 className="text-zinc-400 text-sm font-medium mb-1">Backend Uptime</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-white">{summary?.backendUptime ? summary.backendUptime.toFixed(2) : '0.00'}%</span>
            </div>
          </div>
        </div>

        {/* Recent Checks */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="border-b border-zinc-800 bg-black/40 px-6 py-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4" /> Recent Checks History
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Service</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Response</th>
                  <th className="px-6 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-black/20">
                {summary?.recentChecks && summary.recentChecks.length > 0 ? (
                  summary.recentChecks.map((check: any, i: number) => (
                    <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(check.checkedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 capitalize font-medium text-zinc-300">
                        {check.monitorId?.type || 'Unknown'}
                      </td>
                      <td className="px-6 py-4">
                        {check.status === 'online' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> Online
                          </span>
                        ) : check.status === 'degraded' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            <AlertCircle className="h-3 w-3" /> Degraded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="h-3 w-3" /> Offline
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono">
                        {check.responseTimeMs ? `${check.responseTimeMs}ms` : '-'}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {check.errorMessage || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                      No recent checks available. Click "Check Now" on the deploy page to trigger a check.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
