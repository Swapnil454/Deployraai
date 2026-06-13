"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function AdminBugReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || '${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}'}`}/api/admin/bug-reports`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setReports(data.bugReports);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/admin/bug-reports/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchReports();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-8">Platform Bug Reports</h1>
      
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Severity</th>
              <th className="px-6 py-4 font-medium">Error Message</th>
              <th className="px-6 py-4 font-medium">Failed Step</th>
              <th className="px-6 py-4 font-medium">Project</th>
              <th className="px-6 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 bg-black/40">
            {reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                  No bug reports found.
                </td>
              </tr>
            ) : reports.map((rep: any) => (
              <tr key={rep._id} className="hover:bg-zinc-800/20 transition-colors">
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs uppercase ${
                    rep.status === 'open' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    rep.status === 'investigating' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    rep.status === 'fixed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {rep.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs uppercase font-medium ${rep.severity === 'high' ? 'text-red-400' : 'text-zinc-400'}`}>
                    {rep.severity}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="max-w-[200px] truncate text-white" title={rep.errorMessage}>
                    {rep.errorMessage}
                  </div>
                </td>
                <td className="px-6 py-4 text-xs font-mono">
                  {rep.failedStep || '-'}
                </td>
                <td className="px-6 py-4">
                  {rep.projectId?.name || '-'}
                </td>
                <td className="px-6 py-4">
                  <select 
                    value={rep.status}
                    onChange={(e) => updateStatus(rep._id, e.target.value)}
                    className="rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="fixed">Fixed</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
