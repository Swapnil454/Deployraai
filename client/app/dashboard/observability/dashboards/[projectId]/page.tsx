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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Custom Dashboards</h1>
          <p className="text-sm text-zinc-400 mt-1">Build drag-and-drop dashboards for your custom business metrics</p>
        </div>
        <button
          onClick={handleCreateDashboard}
          disabled={creating}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-md transition-colors"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Dashboard
        </button>
      </div>

      {dashboards.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-lg py-16 flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
            <LayoutDashboard className="h-6 w-6 text-zinc-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No dashboards yet</h3>
          <p className="text-sm text-zinc-400 max-w-sm mb-6">
            Track user signups, revenue, or any custom business metric using tracepilot.track() and visualize it here.
          </p>
          <button
            onClick={handleCreateDashboard}
            disabled={creating}
            className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-4 py-2 text-sm font-medium rounded-md transition-colors"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map(dashboard => (
            <Link
              key={dashboard.id}
              href={`/dashboard/observability/dashboards/${projectId}/${dashboard.id}`}
              className="bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 rounded-lg p-5 flex flex-col group transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="h-10 w-10 rounded-md bg-zinc-800 flex items-center justify-center">
                  <LayoutDashboard className="h-5 w-5 text-indigo-400" />
                </div>
                <button 
                  onClick={(e) => handleDelete(e, dashboard.id)}
                  className="text-zinc-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <h3 className="text-base font-medium text-white mb-1 truncate">{dashboard.name}</h3>
              <p className="text-xs text-zinc-500 mt-auto">
                Updated {new Date(dashboard.updated_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
