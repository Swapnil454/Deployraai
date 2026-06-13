"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, PlayCircle, PauseCircle, RefreshCw } from "lucide-react";

export default function MonitoringDashboard() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [monitors, setMonitors] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [selectedMonitor, setSelectedMonitor] = useState<any>(null);
  const [checks, setChecks] = useState<any[]>([]);
  const [checking, setChecking] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projRes, monRes] = await Promise.all([
        fetch(`http://localhost:5000/api/projects/${projectId}`, { credentials: "include" }),
        fetch(`http://localhost:5000/api/projects/${projectId}/monitor-summary`, { credentials: "include" })
      ]);
      
      if (projRes.ok) setProject(await projRes.json());
      if (monRes.ok) {
        const data = await monRes.json();
        setMonitors(data.monitors || []);
        if (data.monitors && data.monitors.length > 0 && !selectedMonitor) {
          fetchMonitorDetails(data.monitors[0]._id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonitorDetails = async (monitorId: string) => {
    try {
      const res = await fetch(`http://localhost:5000/api/monitors/${monitorId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSelectedMonitor(data.monitor);
        setChecks(data.checks);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckNow = async (monitorId: string) => {
    try {
      setChecking(monitorId);
      await fetch(`http://localhost:5000/api/monitors/${monitorId}/check-now`, { method: 'POST', credentials: "include" });
      fetchData();
      if (selectedMonitor && selectedMonitor._id === monitorId) {
        fetchMonitorDetails(monitorId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(null);
    }
  };

  const togglePause = async (monitorId: string, isPaused: boolean) => {
    try {
      const action = isPaused ? 'resume' : 'pause';
      await fetch(`http://localhost:5000/api/monitors/${monitorId}/${action}`, { method: 'PATCH', credentials: "include" });
      fetchData();
      if (selectedMonitor && selectedMonitor._id === monitorId) {
        fetchMonitorDetails(monitorId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  if (loading && !project) {
    return <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black px-4 sm:px-6 lg:px-8 py-10">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button onClick={() => router.push(`/dashboard/projects/${projectId}/deploy`)} className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Monitoring & Uptime</h1>
            <p className="text-sm text-zinc-400">Track response times, uptime, and health checks for {project?.name}.</p>
          </div>
        </div>

        {monitors.length === 0 && !loading && (
          <div className="text-center py-12 rounded-xl border border-zinc-800 bg-zinc-900/30">
            <h3 className="text-lg font-medium text-white mb-2">No Monitors Active</h3>
            <p className="text-zinc-400 text-sm mb-4">Deploy your application or connect a custom domain to automatically create monitors.</p>
            <button onClick={() => router.push(`/dashboard/projects/${projectId}/deploy`)} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">
              Go to Deployments
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Sidebar */}
          <div className="space-y-4">
            {monitors.map(mon => (
              <button
                key={mon._id}
                onClick={() => fetchMonitorDetails(mon._id)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${selectedMonitor?._id === mon._id ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-white capitalize">{mon.name}</h3>
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${mon.status === 'online' ? 'bg-green-500' : mon.status === 'offline' ? 'bg-red-500' : mon.status === 'degraded' ? 'bg-yellow-500' : 'bg-zinc-500'}`}></div>
                </div>
                <p className="text-xs text-zinc-400 truncate">{mon.url}</p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">{mon.uptimePercentage ? mon.uptimePercentage.toFixed(2) : 100}% Uptime</span>
                  <span className="text-zinc-500">{mon.lastResponseTimeMs || '--'} ms</span>
                </div>
              </button>
            ))}
          </div>

          {/* Details */}
          {selectedMonitor && (
            <div className="lg:col-span-2 space-y-6">
              <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white capitalize">{selectedMonitor.name} Monitor</h2>
                    <a href={selectedMonitor.url} target="_blank" rel="noreferrer" className="text-sm text-indigo-400 hover:underline">
                      {selectedMonitor.url}{selectedMonitor.healthPath !== '/' ? selectedMonitor.healthPath : ''}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCheckNow(selectedMonitor._id)}
                      disabled={checking === selectedMonitor._id}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                    >
                      {checking === selectedMonitor._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Check Now
                    </button>
                    <button
                      onClick={() => togglePause(selectedMonitor._id, selectedMonitor.status === 'paused')}
                      className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded text-sm border border-zinc-700"
                    >
                      {selectedMonitor.status === 'paused' ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                      {selectedMonitor.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-8">
                  <div className="p-4 rounded border border-zinc-800 bg-black/50">
                    <p className="text-xs text-zinc-500 mb-1">Status</p>
                    <p className={`text-lg font-semibold capitalize ${selectedMonitor.status === 'online' ? 'text-green-400' : selectedMonitor.status === 'offline' ? 'text-red-400' : selectedMonitor.status === 'degraded' ? 'text-yellow-400' : 'text-zinc-400'}`}>
                      {selectedMonitor.status}
                    </p>
                  </div>
                  <div className="p-4 rounded border border-zinc-800 bg-black/50">
                    <p className="text-xs text-zinc-500 mb-1">Uptime</p>
                    <p className="text-lg font-semibold text-white">
                      {selectedMonitor.uptimePercentage ? selectedMonitor.uptimePercentage.toFixed(2) : 100}%
                    </p>
                  </div>
                  <div className="p-4 rounded border border-zinc-800 bg-black/50">
                    <p className="text-xs text-zinc-500 mb-1">Avg Response</p>
                    <p className="text-lg font-semibold text-white">
                      {selectedMonitor.lastResponseTimeMs || '--'} ms
                    </p>
                  </div>
                  <div className="p-4 rounded border border-zinc-800 bg-black/50">
                    <p className="text-xs text-zinc-500 mb-1">Total Checks</p>
                    <p className="text-lg font-semibold text-white">
                      {selectedMonitor.totalChecks}
                    </p>
                  </div>
                </div>

                <h3 className="text-sm font-medium text-white mb-4">Recent Activity</h3>
                <div className="rounded border border-zinc-800 bg-black overflow-hidden">
                  <table className="w-full text-left text-sm text-zinc-400">
                    <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Response</th>
                        <th className="px-4 py-2">Code</th>
                        <th className="px-4 py-2">Time</th>
                        <th className="px-4 py-2">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {checks.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-4 text-center text-zinc-500">No checks recorded yet.</td></tr>
                      ) : (
                        checks.map((check) => (
                          <tr key={check._id}>
                            <td className="px-4 py-2">
                              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${check.status === 'online' ? 'bg-green-500' : check.status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                              <span className="capitalize">{check.status}</span>
                            </td>
                            <td className="px-4 py-2 font-mono">{check.responseTimeMs ? `${check.responseTimeMs}ms` : '--'}</td>
                            <td className="px-4 py-2">{check.statusCode || '--'}</td>
                            <td className="px-4 py-2">{new Date(check.checkedAt).toLocaleTimeString()}</td>
                            <td className="px-4 py-2 truncate max-w-[200px]" title={check.errorMessage}>{check.errorMessage || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
