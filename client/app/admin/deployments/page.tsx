"use client";

import { useEffect, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";

export default function AdminDeployments() {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");

  const fetchDeployments = async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (statusFilter) query.append("status", statusFilter);
      if (platformFilter) query.append("platform", platformFilter);
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/admin/deployments?${query.toString()}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();
  }, [statusFilter, platformFilter]);

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <h1 className="text-2xl font-bold text-white">Deployments</h1>
        
        <div className="flex gap-4">
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
          
          <select 
            value={platformFilter} 
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">All Platforms</option>
            <option value="vercel">Vercel</option>
            <option value="render">Render</option>
            <option value="railway">Railway</option>
          </select>
        </div>
      </div>
      
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">Project</th>
              <th className="px-6 py-4 font-medium">User</th>
              <th className="px-6 py-4 font-medium">Type</th>
              <th className="px-6 py-4 font-medium">Platform</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Duration</th>
              <th className="px-6 py-4 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 bg-black/40">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                </td>
              </tr>
            ) : deployments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                  No deployments found matching filters.
                </td>
              </tr>
            ) : deployments.map((dep: any) => (
              <tr key={dep._id} className="hover:bg-zinc-800/20 transition-colors">
                <td className="px-6 py-4 font-medium text-white">
                  {dep.projectId?.name || 'Unknown'}
                </td>
                <td className="px-6 py-4 text-xs">
                  {dep.userId?.email || 'Unknown'}
                </td>
                <td className="px-6 py-4 capitalize">
                  {dep.type}
                </td>
                <td className="px-6 py-4 capitalize">
                  {dep.platform}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs uppercase ${
                    dep.status === 'success' || dep.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    dep.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse'
                  }`}>
                    {dep.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {dep.finalSummary?.durationMs ? `${Math.round(dep.finalSummary.durationMs / 1000)}s` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-xs">
                  {new Date(dep.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
