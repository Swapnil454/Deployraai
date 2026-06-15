"use client";

import { useEffect, useState } from "react";
import { Loader2, Users, Rocket, Target, Globe, Activity, Bug } from "lucide-react";

export default function AdminOverview() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || '${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}'}`}/api/admin/overview`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setMetrics(data.metrics);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!metrics) return <div>Failed to load metrics</div>;

  const cards = [
    { label: "Total Users", value: metrics.totalUsers, icon: Users, color: "text-blue-400" },
    { label: "Projects", value: metrics.totalProjects, icon: Target, color: "text-indigo-400" },
    { label: "Deployments", value: metrics.totalDeployments, icon: Rocket, color: "text-purple-400" },
    { label: "Success Rate", value: `${metrics.successRate}%`, icon: Target, color: "text-emerald-400" },
    { label: "Failed Deployments", value: metrics.failedDeployments, icon: Bug, color: "text-red-400" },
    { label: "Active Domains", value: metrics.activeDomains, icon: Globe, color: "text-cyan-400" },
    { label: "Active Monitors", value: metrics.activeMonitors, icon: Activity, color: "text-emerald-400" },
    { label: "Offline Monitors", value: metrics.offlineMonitors, icon: Activity, color: "text-red-400" },
    { label: "Open Bug Reports", value: metrics.openBugReports, icon: Bug, color: "text-amber-400" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-8">Platform Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg bg-zinc-800/50 ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-medium text-zinc-400">{card.label}</h3>
              </div>
              <p className={`text-3xl font-bold tracking-tight text-white`}>{card.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
