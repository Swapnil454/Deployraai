"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, Plus, LayoutDashboard, Trash2 } from "lucide-react";
import Link from "next/link";

export default function DashboardsListPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const router = useRouter();

  const [dashboards, setDashboards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchDashboards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/custom-dashboards?projectId=${projectId}`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setDashboards(data.dashboards || []);
      }
    } catch (err) {
      console.error("Failed to fetch dashboards:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  const handleCreateDashboard = async () => {
    try {
      setCreating(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/custom-dashboards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          name: "Untitled Dashboard",
          layout_json: [],
          widgets_json: []
        })
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/observability/dashboards/${projectId}/${data.dashboard.id}`);
      }
    } catch (err) {
      console.error("Failed to create dashboard:", err);
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this dashboard?")) return;
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/custom-dashboards/${id}?projectId=${projectId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        setDashboards(prev => prev.filter(d => d.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete dashboard:", err);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-10 px-8">
      <div className="flex items-center justify-between border-b border-[#222] pb-8 mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">Custom Dashboards</h1>
          <p className="text-[15px] text-zinc-400 mt-2">Build drag-and-drop dashboards for your custom business metrics</p>
        </div>
        <button
          onClick={handleCreateDashboard}
          disabled={creating}
          className="flex items-center gap-2 bg-white hover:bg-zinc-200 text-black px-5 py-2.5 text-sm font-medium rounded-lg transition-all shadow-sm"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Dashboard
        </button>
      </div>

      {dashboards.length === 0 ? (
        <div className="border border-dashed border-[#333] bg-[#0a0a0a]/50 rounded-2xl py-24 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-[#111] border border-[#222] flex items-center justify-center mb-6 shadow-xl">
            <LayoutDashboard className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-3 tracking-tight">No dashboards yet</h3>
          <p className="text-[15px] text-zinc-400 max-w-md mb-8 leading-relaxed">
            Track user signups, revenue, or any custom business metric using <code className="bg-[#111] text-zinc-300 px-1.5 py-0.5 rounded text-sm border border-[#222] font-mono">tracepilot.track()</code> and visualize it here.
          </p>
          <button
            onClick={handleCreateDashboard}
            disabled={creating}
            className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-5 py-2.5 text-sm font-medium rounded-lg transition-all shadow-sm"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {dashboards.map(dashboard => (
            <Link
              key={dashboard.id}
              href={`/dashboard/observability/dashboards/${projectId}/${dashboard.id}`}
              className="bg-[#0a0a0a] border border-[#222] hover:border-zinc-600 rounded-2xl p-6 flex flex-col group transition-all hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="h-12 w-12 rounded-xl bg-[#111] border border-[#333] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <LayoutDashboard className="h-6 w-6 text-zinc-400 group-hover:text-white transition-colors" />
                </div>
                <button 
                  onClick={(e) => handleDelete(e, dashboard.id)}
                  className="text-zinc-600 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2 truncate group-hover:text-indigo-400 transition-colors tracking-tight">{dashboard.name}</h3>
              <p className="text-[13px] text-zinc-500 mt-auto font-medium">
                Updated {new Date(dashboard.updated_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
