"use client";

import React, { useEffect, useState } from "react";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";

interface BillingData {
  currentSpans: number;
  tierLimit: number;
  usagePercent: number;
}

export default function BillingUsage({ projectId }: { projectId: string }) {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/observability";
        const token = localStorage.getItem("token") || "demo-token";
        const res = await fetch(`${ANALYTICS_API_URL}/billing/usage/${projectId}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch billing usage", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsage();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48 bg-[#0a0a0a] rounded-xl border border-zinc-800">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col justify-center items-center h-48 bg-[#0a0a0a] rounded-xl border border-zinc-800 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-zinc-600 mb-2" />
        <h3 className="text-zinc-400 font-medium">Failed to load billing usage</h3>
      </div>
    );
  }

  const { currentSpans, tierLimit, usagePercent } = data;
  const isWarning = usagePercent > 80;
  const isCritical = usagePercent >= 100;

  return (
    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 h-full flex flex-col">
      <h3 className="text-lg font-medium mb-1 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-zinc-400" />
        Current Month Usage
      </h3>
      <p className="text-sm text-zinc-500 mb-6">Track your observability tier limits.</p>
      
      <div className="flex justify-between items-end mb-2">
        <div>
          <span className="text-3xl font-bold">{currentSpans.toLocaleString()}</span>
          <span className="text-sm font-medium text-zinc-500 ml-2">spans ingested</span>
        </div>
        <span className="text-sm text-zinc-400">Limit: {tierLimit.toLocaleString()}</span>
      </div>
      
      <div className="h-3 w-full bg-zinc-800 rounded-full overflow-hidden mb-4">
        <div 
          className={`h-full ${isCritical ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-emerald-500'}`} 
          style={{ width: `${usagePercent}%` }}
        ></div>
      </div>

      {isCritical ? (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-500 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>You have exceeded your tier limit. Additional spans will be billed at $0.50 per 100,000 spans.</p>
        </div>
      ) : isWarning ? (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-500 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>You are approaching your tier limit. Consider upgrading your plan.</p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 text-center mt-2">
          Resets on the 1st of the next month.
        </p>
      )}
    </div>
  );
}
