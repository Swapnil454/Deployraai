"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function AdminMonitors() {
  const [monitors, setMonitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMonitors = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || '${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}'}`}/api/admin/monitors`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setMonitors(data.monitors);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchMonitors();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-8">System Monitors</h1>
      
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">URL</th>
              <th className="px-6 py-4 font-medium">Project</th>
              <th className="px-6 py-4 font-medium">Type</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Response Time</th>
              <th className="px-6 py-4 font-medium">Uptime</th>
              <th className="px-6 py-4 font-medium">Last Checked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 bg-black/40">
            {monitors.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                  No monitors found.
                </td>
              </tr>
            ) : monitors.map((mon: any) => (
              <tr key={mon._id} className="hover:bg-zinc-800/20 transition-colors">
                <td className="px-6 py-4 text-white truncate max-w-[200px]" title={mon.url}>
                  <a href={mon.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {mon.url}
                  </a>
                </td>
                <td className="px-6 py-4">
                  {mon.projectId?.name || '-'}
                </td>
                <td className="px-6 py-4 capitalize">
                  {mon.type}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs uppercase ${
                    mon.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    mon.status === 'offline' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {mon.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {mon.lastResponseTimeMs ? `${mon.lastResponseTimeMs}ms` : '-'}
                </td>
                <td className="px-6 py-4">
                  {mon.uptimePercentage ? `${mon.uptimePercentage}%` : '100%'}
                </td>
                <td className="px-6 py-4 text-xs">
                  {mon.lastCheckedAt ? new Date(mon.lastCheckedAt).toLocaleString() : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
