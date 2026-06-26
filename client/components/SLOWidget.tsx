"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Target, AlertCircle } from "lucide-react";

interface SLO {
  id: string;
  metric: string;
  target: number;
  windowDays: number;
  currentPerformance: number;
  isMet: boolean;
  budget: {
    total: number;
    consumed: number;
    remaining: number;
    status: string;
  };
}

export default function SLOWidget({ projectId }: { projectId: string }) {
  const [slos, setSlos] = useState<SLO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSLOs = async () => {
      try {
        const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/observability";
        // Assuming the auth token is stored in localStorage
        const token = localStorage.getItem("token") || "demo-token";
        const res = await fetch(`${ANALYTICS_API_URL}/slo/${projectId}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setSlos(data.slos || []);
        }
      } catch (err) {
        console.error("Failed to fetch SLOs", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSLOs();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48 bg-[#0a0a0a] rounded-xl border border-zinc-800">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (slos.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-48 bg-[#0a0a0a] rounded-xl border border-zinc-800 p-6 text-center">
        <Target className="h-8 w-8 text-zinc-600 mb-2" />
        <h3 className="text-zinc-400 font-medium">No SLOs defined</h3>
        <p className="text-xs text-zinc-500 mt-1">Configure Service Level Objectives to track error budgets.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 h-full flex flex-col overflow-y-auto">
      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-zinc-400" />
        Service Level Objectives
      </h3>
      <div className="space-y-4">
        {slos.map(slo => {
          const budgetPercent = (slo.budget.remaining / slo.budget.total) * 100;
          return (
            <div key={slo.id} className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium capitalize text-sm">{slo.metric.replace('_', ' ')} (Last {slo.windowDays}d)</span>
                <span className={\`text-xs px-2 py-1 rounded-full \${slo.isMet ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}\`}>
                  {slo.currentPerformance}% / {slo.target}%
                </span>
              </div>
              
              <div className="mt-3">
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Error Budget Remaining</span>
                  <span>{Math.round(budgetPercent)}%</span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={\`h-full \${budgetPercent > 50 ? 'bg-emerald-500' : budgetPercent > 20 ? 'bg-yellow-500' : 'bg-red-500'}\`} 
                    style={{ width: \`\${budgetPercent}%\` }}
                  ></div>
                </div>
                {budgetPercent <= 20 && (
                  <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Error budget is nearly exhausted. Freeze deployments recommended.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
