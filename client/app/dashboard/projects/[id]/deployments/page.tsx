"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

export default function DeploymentsHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState<any[]>([]);

  useEffect(() => {
    fetchHistory();
  }, [projectId]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/deployments`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDeployments(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black px-4 sm:px-6 lg:px-8 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex items-center gap-4">
          <button onClick={() => router.push(`/dashboard/projects/${projectId}/deploy`)} className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Deployment History</h1>
            <p className="text-sm text-zinc-400">View all past deployments and their status.</p>
          </div>
        </div>

        {deployments.length === 0 ? (
          <div className="text-sm text-zinc-500 text-center py-16 rounded-xl border border-zinc-800 border-dashed">No deployments found for this project.</div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="bg-zinc-800/50 text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium text-white">Type</th>
                  <th className="px-6 py-4 font-medium text-white">Status</th>
                  <th className="px-6 py-4 font-medium text-white">Duration</th>
                  <th className="px-6 py-4 font-medium text-white">Details</th>
                  <th className="px-6 py-4 font-medium text-white text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {deployments.map((dep) => (
                  <tr key={dep._id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white capitalize">{dep.type}</div>
                      <div className="text-xs text-zinc-500 mt-1">{new Date(dep.createdAt).toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider
                        ${dep.status === 'success' || dep.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                          dep.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                          'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                        {dep.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {dep.durationMs ? `${Math.round(dep.durationMs / 1000)}s` : '-'}
                    </td>
                    <td className="px-6 py-4 max-w-[200px] truncate">
                      {dep.status === 'failed' ? (
                         <span className="text-red-400 text-xs">{dep.finalSummary?.failedStep || 'Unknown Failure'}</span>
                      ) : (
                         <span className="text-zinc-400 text-xs capitalize">{dep.platform}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => router.push(`/dashboard/deployments/${dep._id}`)}
                        className="text-indigo-400 hover:text-indigo-300 font-medium text-sm transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
