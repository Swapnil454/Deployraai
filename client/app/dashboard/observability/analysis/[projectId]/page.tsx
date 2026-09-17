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
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

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
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, projectRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/analysis/dashboard?projectId=${projectId}&window=${window}`, {
          credentials: 'include'
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" })
      ]);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(`Analytics API error: ${res.statusText}`);
      }
      if (projectRes.ok) {
        setProject(await projectRes.json());
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
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#050505] pb-20 font-sans">
        {/* HEADER SKELETON */}
        <div className="sticky top-0 z-20 bg-[#050505]/80 backdrop-blur-xl pt-6">
          <div className="max-w-[1400px] mx-auto px-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 bg-zinc-800/50 rounded-lg animate-pulse" />
                <div className="h-6 w-64 bg-zinc-800/50 rounded animate-pulse" />
              </div>
              <div className="h-8 w-48 bg-zinc-800/50 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>

        {/* CONTENT SKELETON */}
        <div className="max-w-[1400px] mx-auto w-full px-6 mt-8 grid grid-cols-3 gap-6">
          <div className="col-span-2 h-[380px] bg-[#0a0a0a] border border-white/5 rounded-xl animate-pulse" />
          <div className="col-span-1 h-[380px] bg-[#0a0a0a] border border-white/5 rounded-xl animate-pulse" />
          
          <div className="col-span-1 h-[300px] bg-[#0a0a0a] border border-white/5 rounded-xl animate-pulse" />
          <div className="col-span-1 h-[300px] bg-[#0a0a0a] border border-white/5 rounded-xl animate-pulse" />
          <div className="col-span-1 h-[300px] bg-[#0a0a0a] border border-white/5 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (project && !project.observability?.verified) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#050505] text-zinc-200 font-sans p-6 pt-12">
        <ObservabilitySetup project={project} onVerified={fetchAnalysis} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)] items-center justify-center bg-[#050505] text-zinc-400 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-500/50" />
        <p className="text-sm">Failed to load analysis data.</p>
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
      <div className="sticky top-0 z-20 bg-[#050505]/80 backdrop-blur-xl pt-6">
        <div className="max-w-[1400px] mx-auto px-8">
          <div className="flex items-center justify-between border-b border-white/15 pb-4">
            <div className="flex items-center gap-3">
              <LineChart className="h-5 w-5 text-white" />
              <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Advanced Telemetry Analysis</h1>
            </div>

            <div className="flex items-center gap-1 bg-[#0a0a0a] border border-white/5 p-1 rounded-lg shadow-sm">
            {['1h', '24h', '7d'].map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all duration-200 ${
                  window === w 
                    ? 'bg-zinc-200 text-zinc-900 shadow-sm' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                {w === '1h' ? 'Last Hour' : w === '24h' ? 'Last 24h' : 'Last 7 Days'}
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>

      <div className="max-w-[1400px] mx-auto w-full px-6 mt-8 grid grid-cols-3 gap-6">
        
        {/* EDGE VS NODE TRAFFIC CHART */}
        <div className="col-span-2 bg-[#0a0a0a] border border-white/5 shadow-xl rounded-xl p-6">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-400" />
              Traffic: Edge vs Node Runtime
            </h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEdge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNode" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.4} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#e4e4e7', fontSize: '13px' }}
                  labelStyle={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '6px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
                <Area type="monotone" dataKey="edge" name="Edge Requests" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorEdge)" />
                <Area type="monotone" dataKey="node" name="Node Requests" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorNode)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* STATUS CODE DISTRIBUTION */}
        <div className="col-span-1 bg-[#0a0a0a] border border-white/5 shadow-xl rounded-xl p-6 flex flex-col">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-8">
            <PieChartIcon className="h-4 w-4 text-emerald-400" />
            Response Codes
          </h3>
          <div className="flex-1 min-h-[300px] flex items-center justify-center">
            {data.status.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.status.map((s: any) => ({ ...s, count: parseInt(s.count, 10) }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={75}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="code"
                    stroke="none"
                  >
                    {data.status.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={(STATUS_COLORS as any)[entry.code.substring(0, 3)] || '#71717a'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#e4e4e7', fontSize: '13px', fontWeight: '500' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-zinc-500 text-sm italic">No status data available</div>
            )}
          </div>
        </div>

        {/* LATENCY PERCENTILES */}
        <div className="col-span-1 bg-[#0a0a0a] border border-white/5 shadow-xl rounded-xl p-6">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-6">
            <Clock className="h-4 w-4 text-blue-400" />
            Latency by Runtime (P90)
          </h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.latency} layout="vertical" margin={{ top: 0, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} opacity={0.4} />
                <XAxis type="number" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} unit="ms" />
                <YAxis dataKey="runtime" type="category" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.03)'}}
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                  itemStyle={{ fontSize: '13px' }}
                />
                <Bar dataKey="p90" name="P90 Latency" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                <Bar dataKey="p50" name="P50 Latency" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TOP SLOWEST ENDPOINTS */}
        <div className="col-span-1 bg-[#0a0a0a] border border-white/5 shadow-xl rounded-xl p-6">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-4">
            <BarChart2 className="h-4 w-4 text-orange-400" />
            Slowest Endpoints
          </h3>
          <div className="overflow-auto max-h-[220px] pr-2 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] text-zinc-500 uppercase font-semibold border-b border-white/5">
                  <th className="pb-3 px-2">Endpoint</th>
                  <th className="pb-3 px-2 text-right">P90 Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[13px]">
                {data.slowest.map((s: any, i: number) => (
                  <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-2 flex items-center gap-3">
                      <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-300 group-hover:bg-zinc-700/80 transition-colors">
                        {s.method}
                      </span>
                      <span className="truncate max-w-[150px] text-zinc-300 font-medium" title={s.endpoint}>{s.endpoint}</span>
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-orange-400/90 font-medium">
                      {Number(s.p90_latency).toFixed(1)}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOST ERRORED ENDPOINTS */}
        <div className="col-span-1 bg-[#0a0a0a] border border-white/5 shadow-xl rounded-xl p-6">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            Top Errored Endpoints
          </h3>
          <div className="overflow-auto max-h-[220px] pr-2 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] text-zinc-500 uppercase font-semibold border-b border-white/5">
                  <th className="pb-3 px-2">Endpoint</th>
                  <th className="pb-3 px-2 text-right">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[13px]">
                {data.errors.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-zinc-500 italic">No errors detected in this window</td>
                  </tr>
                ) : (
                  data.errors.map((e: any, i: number) => (
                    <tr key={i} className="group hover:bg-red-500/[0.03] transition-colors">
                      <td className="py-3 px-2 flex items-center gap-3">
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-300 group-hover:bg-red-500/10 group-hover:text-red-400 transition-colors">
                          {e.method}
                        </span>
                        <span className="truncate max-w-[150px] text-zinc-300 font-medium" title={e.endpoint}>{e.endpoint}</span>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-red-400/90 font-medium">
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
      
      {/* Spacer to ensure the page's own background color extends to the bottom */}
      <div className="h-24 shrink-0 w-full" />
    </div>
  );
}
