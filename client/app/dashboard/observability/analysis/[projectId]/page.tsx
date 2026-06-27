"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  LineChart, Activity, Clock, AlertTriangle, Zap,
  BarChart2, PieChart as PieChartIcon
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
const STATUS_COLORS = {
  '200': '#10b981',
  '300': '#3b82f6',
  '400': '#f59e0b',
  '500': '#ef4444',
  'ERROR': '#ef4444'
};

export default function AnalysisDashboard() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [window, setWindow] = useState('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/analysis/dashboard?projectId=${projectId}&window=${window}`, {
        credentials: 'include'
      });
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(`Analytics API error: ${res.statusText}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [projectId, window]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-[#050505]">
        <div className="animate-spin h-8 w-8 text-indigo-500 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)] items-center justify-center bg-[#050505] text-zinc-400 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-500/50" />
        <p className="text-sm">Database connection failed. Please ensure your PostgreSQL database is running.</p>
        {error && <p className="text-xs text-red-400/80 font-mono bg-red-500/10 px-3 py-1.5 rounded">{error}</p>}
      </div>
    );
  }

  // Transform Traffic Data for Recharts Stacked Area
  const trafficMap = new Map();
  data.traffic.forEach((t: any) => {
    if (!trafficMap.has(t.bucket)) {
      trafficMap.set(t.bucket, { time: new Date(t.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), edge: 0, node: 0 });
    }
    const item = trafficMap.get(t.bucket);
    item[t.runtime === 'edge' ? 'edge' : 'node'] = parseInt(t.volume, 10);
  });
  const trafficChartData = Array.from(trafficMap.values());

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#050505] text-zinc-200 pb-20 font-sans">
      
      {/* HEADER */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-zinc-800 px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LineChart className="h-5 w-5 text-indigo-400" />
            <h1 className="text-lg font-semibold text-white">Advanced Telemetry Analysis</h1>
          </div>

          <div className="flex items-center gap-2 bg-[#111] border border-zinc-800 p-1 rounded-md">
            {['1h', '24h', '7d'].map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`px-3 py-1 rounded text-[13px] font-medium transition-colors ${
                  window === w ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {w === '1h' ? 'Last Hour' : w === '24h' ? 'Last 24h' : 'Last 7 Days'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto w-full px-6 mt-6 grid grid-cols-3 gap-6">
        
        {/* EDGE VS NODE TRAFFIC CHART */}
        <div className="col-span-2 bg-[#0a0a0a] border border-zinc-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-400" />
              Traffic: Edge vs Node Runtime
            </h3>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEdge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNode" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend iconType="circle" />
                <Area type="monotone" dataKey="edge" name="Edge Requests" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorEdge)" />
                <Area type="monotone" dataKey="node" name="Node Requests" stroke="#10b981" fillOpacity={1} fill="url(#colorNode)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* STATUS CODE DISTRIBUTION */}
        <div className="col-span-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg p-5">
          <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-6">
            <PieChartIcon className="h-4 w-4 text-emerald-400" />
            Response Codes
          </h3>
          <div className="h-[280px] flex items-center justify-center">
            {data.status.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.status}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="code"
                  >
                    {data.status.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={(STATUS_COLORS as any)[entry.code.substring(0, 3)] || '#71717a'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-zinc-600 text-sm">No status data available</div>
            )}
          </div>
        </div>

        {/* LATENCY PERCENTILES */}
        <div className="col-span-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg p-5">
          <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-6">
            <Clock className="h-4 w-4 text-blue-400" />
            Latency by Runtime (P90)
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.latency} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" stroke="#52525b" fontSize={12} unit="ms" />
                <YAxis dataKey="runtime" type="category" stroke="#52525b" fontSize={12} />
                <Tooltip 
                  cursor={{fill: '#27272a', opacity: 0.4}}
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px' }}
                />
                <Bar dataKey="p90" name="P90 Latency" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="p50" name="P50 Latency" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TOP SLOWEST ENDPOINTS */}
        <div className="col-span-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg p-5">
          <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-4">
            <BarChart2 className="h-4 w-4 text-orange-400" />
            Slowest Endpoints
          </h3>
          <div className="overflow-auto max-h-[200px] pr-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] text-zinc-500 uppercase font-medium border-b border-zinc-800">
                  <th className="py-2 font-medium">Endpoint</th>
                  <th className="py-2 font-medium text-right">P90 Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-[13px]">
                {data.slowest.map((s: any, i: number) => (
                  <tr key={i}>
                    <td className="py-2.5 flex items-center gap-2">
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {s.method}
                      </span>
                      <span className="truncate max-w-[150px] text-zinc-300" title={s.endpoint}>{s.endpoint}</span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-orange-400">
                      {Number(s.p90_latency).toFixed(1)}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOST ERRORED ENDPOINTS */}
        <div className="col-span-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg p-5">
          <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            Top Errored Endpoints
          </h3>
          <div className="overflow-auto max-h-[200px] pr-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] text-zinc-500 uppercase font-medium border-b border-zinc-800">
                  <th className="py-2 font-medium">Endpoint</th>
                  <th className="py-2 font-medium text-right">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-[13px]">
                {data.errors.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-zinc-500">No errors detected in this window</td>
                  </tr>
                ) : (
                  data.errors.map((e: any, i: number) => (
                    <tr key={i}>
                      <td className="py-2.5 flex items-center gap-2">
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {e.method}
                        </span>
                        <span className="truncate max-w-[150px] text-zinc-300" title={e.endpoint}>{e.endpoint}</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-red-400">
                        {e.error_count}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
