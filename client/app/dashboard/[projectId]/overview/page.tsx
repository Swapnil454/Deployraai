"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, Activity, AlertTriangle, Clock, Server } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

export default function OverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [timeseries, setTimeseries] = useState<any[]>([]);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        // Note: Using hardcoded URL for demo, should be process.env.NEXT_PUBLIC_ANALYTICS_API_URL
        const ANALYTICS_API_URL = "http://localhost:4318";
        
        // Use a dummy token for now since we haven't wired up full auth
        const headers = { 'Authorization': 'Bearer demo-token' };

        const [overviewRes, timeseriesRes] = await Promise.all([
          fetch(`${ANALYTICS_API_URL}/metrics/overview?projectId=${projectId}`, { headers }),
          fetch(`${ANALYTICS_API_URL}/metrics/timeseries?projectId=${projectId}&interval=1h`, { headers })
        ]);

        if (overviewRes.ok) setMetrics(await overviewRes.json());
        if (timeseriesRes.ok) setTimeseries(await timeseriesRes.json());
      } catch (error) {
        console.error("Failed to fetch metrics", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const defaultMetrics = metrics || {
    totalRequests: 0,
    errorRate: 0,
    p99LatencyMs: 0,
    uptime: 100,
  };

  const hasData = timeseries && timeseries.length > 0;

  return (
    <div className="w-full flex flex-col min-h-full bg-black text-white p-8">
      <div className="max-w-[1440px] w-full mx-auto">
        <h1 className="text-2xl font-bold mb-6">Overview</h1>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-zinc-400">Total Requests</h3>
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-3xl font-bold">{defaultMetrics.totalRequests.toLocaleString()}</p>
            <p className="text-xs text-zinc-500 mt-2">Last 24 hours</p>
          </div>

          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-zinc-400">Error Rate</h3>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-3xl font-bold">{defaultMetrics.errorRate.toFixed(2)}%</p>
            <p className="text-xs text-zinc-500 mt-2">Last 24 hours</p>
          </div>

          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-zinc-400">P99 Latency</h3>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold">{defaultMetrics.p99LatencyMs} <span className="text-lg font-medium text-zinc-500">ms</span></p>
            <p className="text-xs text-zinc-500 mt-2">Across all routes</p>
          </div>

          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-zinc-400">Uptime</h3>
              <Server className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-3xl font-bold">{defaultMetrics.uptime}%</p>
            <p className="text-xs text-zinc-500 mt-2">Synthetic checks</p>
          </div>
        </div>

        {/* Timeseries Chart */}
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-6">Requests & Errors (24h)</h3>
          
          <div className="h-[400px] w-full">
            {!hasData ? (
              <div className="flex flex-col items-center justify-center h-full border border-zinc-800 rounded-lg border-dashed bg-black">
                <Activity className="h-8 w-8 text-zinc-600 mb-4" />
                <p className="text-zinc-400">No telemetry data available yet.</p>
                <p className="text-sm text-zinc-600 mt-1">Instrument your application to see metrics.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#52525b" 
                    tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                  />
                  <YAxis stroke="#52525b" />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', color: '#fff' }}
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                  />
                  <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} dot={false} name="Requests" />
                  <Line type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} dot={false} name="Errors" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
