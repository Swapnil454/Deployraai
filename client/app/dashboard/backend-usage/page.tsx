"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Server, Activity, Cpu, Network, ExternalLink, AlertCircle, ChevronDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const parseTimeSeries = (metrics: any, isBandwidth = false) => {
  if (!metrics) return [];
  const rawMetrics = metrics.data || metrics.usage || metrics;
  if (!Array.isArray(rawMetrics)) return [];
  
  const map = new Map<string, number>();
  
  rawMetrics.forEach((item: any) => {
    let multiplier = 1;
    if (isBandwidth && item.unit === 'mb') multiplier = 1024 * 1024;
    
    if (item.values && Array.isArray(item.values)) {
      item.values.forEach((v: any, idx: number) => {
        const date = v.date || v.timestamp || new Date(Date.now() - (item.values.length - idx) * 86400000).toISOString();
        const val = (v.value || 0) * multiplier;
        map.set(date, (map.get(date) || 0) + val);
      });
    } else if (item.value !== undefined) {
      const date = item.date || item.timestamp || new Date().toISOString();
      const val = item.value * multiplier;
      map.set(date, (map.get(date) || 0) + val);
    }
  });

  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const formatXAxis = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const CustomTooltip = ({ active, payload, label, unit }: any) => {
  if (active && payload && payload.length) {
    const d = new Date(label);
    const displayTime = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    let valueDisplay = payload[0].value;
    if (unit === 'bytes') valueDisplay = formatBytes(valueDisplay);
    else if (unit === 'core') valueDisplay = `${valueDisplay.toFixed(4)} Core-hrs`;
    else valueDisplay = valueDisplay.toLocaleString();

    return (
      <div className="bg-[#0a0a0a] border border-zinc-800 p-3 rounded-lg shadow-xl min-w-[150px]">
        <p className="text-zinc-400 text-xs mb-2 font-medium">{displayTime}</p>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ backgroundColor: '#ffffff', boxShadow: `0 0 8px #ffffff` }} />
            <span className="text-sm text-zinc-300 font-medium capitalize">Usage</span>
          </div>
          <span className="text-sm font-semibold text-white">{valueDisplay}</span>
        </div>
      </div>
    );
  }
  return null;
};

const CUSTOM_RANGES = [
  { label: "Current Billing Cycle", value: "current" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" }
];

const ProjectUsageDashboard = ({ project }: { project: any }) => {
  const platform = project.configuration?.backendPlatform || 'render';
  const isRender = platform === 'render';
  const isRailway = platform === 'railway';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usageData, setUsageData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'bandwidth' | 'cpu' | 'requests'>('bandwidth');
  const [timeRange, setTimeRange] = useState("current");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${project._id}/usage?range=${timeRange}`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setUsageData(json);
      } else {
        setError("Failed to fetch usage data.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [project._id, timeRange]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  if (loading) {
    return (
      <div className="w-full h-[400px] border border-zinc-800 bg-[#0a0a0a] rounded-xl flex items-center justify-center mb-8">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const hasError = error || (usageData && !usageData.success);
  
  if (isRailway) {
    return (
      <div className="w-full border border-zinc-800/80 bg-[#0a0a0a] rounded-xl overflow-hidden flex flex-col mb-8">
        <div className="p-5 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/10">
          <div className="flex items-center gap-4">
             <div className="h-10 w-10 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
               <Server className="h-5 w-5 text-zinc-400" />
             </div>
             <div>
               <h2 className="text-lg font-bold text-white">{project.repoName}</h2>
               <p className="text-sm text-zinc-500 capitalize">{platform} • {project.repoFullName}</p>
             </div>
          </div>
          <a href="https://railway.app/dashboard" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-md text-sm transition-colors border border-zinc-800">
            Dashboard <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="h-[200px] w-full flex flex-col items-center justify-center p-6 text-center bg-[#000]">
           <AlertCircle className="h-8 w-8 text-zinc-600 mb-3" />
           <p className="text-zinc-300 font-medium mb-1">Time-series data unavailable</p>
           <p className="text-zinc-500 text-sm max-w-md">{usageData?.usage?.message || 'Railway network usage metrics are primarily available via the Railway CLI or Dashboard.'}</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="w-full h-[200px] border border-zinc-800 bg-[#0a0a0a] rounded-xl flex flex-col items-center justify-center mb-8">
         <AlertCircle className="h-8 w-8 text-red-500/50 mb-3" />
         <span className="text-red-400/80 text-sm">{error || 'Error fetching metrics. Check Service ID.'}</span>
      </div>
    );
  }

  const bandwidthData = parseTimeSeries(usageData?.usage?.bandwidth, true);
  const cpuData = parseTimeSeries(usageData?.usage?.cpu, false);
  const requestsData = parseTimeSeries(usageData?.usage?.requests, false);

  const totalBandwidth = bandwidthData.reduce((acc, cur) => acc + cur.value, 0);
  const totalCpu = cpuData.reduce((acc, cur) => acc + cur.value, 0);
  const totalRequests = requestsData.reduce((acc, cur) => acc + cur.value, 0);

  let activeData = activeTab === 'bandwidth' ? bandwidthData : activeTab === 'cpu' ? cpuData : requestsData;
  const activeUnit = activeTab === 'bandwidth' ? 'bytes' : activeTab === 'cpu' ? 'core' : 'count';

  // Fix for Recharts: AreaChart requires at least 2 points to draw a line/area.
  // If there's only 1 point, prepend a 0-value point 24h earlier.
  if (activeData.length === 1) {
    const singlePoint = activeData[0];
    const prevDate = new Date(singlePoint.date || Date.now());
    if (!isNaN(prevDate.getTime())) {
      prevDate.setDate(prevDate.getDate() - 1);
      activeData = [
        { date: prevDate.toISOString(), value: 0 },
        singlePoint
      ];
    } else {
      activeData = [
        { date: new Date(Date.now() - 86400000).toISOString(), value: 0 },
        { date: new Date().toISOString(), value: singlePoint.value }
      ];
    }
  }

  return (
    <div className="w-full mb-10 border border-zinc-800/80 bg-[#0a0a0a] rounded-xl overflow-hidden flex flex-col shadow-2xl relative">
      <div className="p-5 border-b border-zinc-800/50 flex flex-col md:flex-row md:items-center justify-between bg-zinc-900/10 gap-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-[#111] border border-zinc-800 shadow-inner">
            <Server className="h-5 w-5 text-zinc-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">{project.repoName}</h2>
            <p className="text-sm text-zinc-500 capitalize flex items-center gap-2">
              {platform} <span className="text-zinc-700">•</span> {project.repoFullName}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="relative z-20">
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center justify-between w-48 bg-[#0a0a0a] border border-zinc-800 text-zinc-300 text-sm rounded-md px-4 py-2 hover:border-zinc-700 hover:bg-[#111] transition-colors"
            >
              {CUSTOM_RANGES.find(r => r.value === timeRange)?.label}
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-2xl z-50 py-1 flex flex-col overflow-hidden">
                  {CUSTOM_RANGES.map(r => (
                    <button
                      key={r.value}
                      onClick={() => {
                        setTimeRange(r.value);
                        setDropdownOpen(false);
                      }}
                      className={`text-left px-4 py-2.5 text-sm transition-colors hover:bg-zinc-800/50 ${timeRange === r.value ? 'text-white bg-zinc-800/30 font-medium' : 'text-zinc-400'}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <a href={isRender ? "https://dashboard.render.com" : "https://railway.app/dashboard"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2 bg-[#111] hover:bg-zinc-800 text-zinc-300 rounded-md text-sm transition-colors border border-zinc-800">
            Dashboard <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="flex border-b border-zinc-800/50 bg-[#050505]">
        <button 
          onClick={() => setActiveTab('bandwidth')} 
          className={`flex-1 p-4 text-left border-t-2 transition-all duration-300 ${activeTab === 'bandwidth' ? 'border-white bg-zinc-900/20' : 'border-transparent hover:bg-zinc-900/10'}`}
        >
          <div className="text-xs text-zinc-400 font-medium mb-1 uppercase tracking-wider">Bandwidth</div>
          <div className={`text-2xl font-bold transition-colors ${activeTab === 'bandwidth' ? 'text-white' : 'text-zinc-300'}`}>{formatBytes(totalBandwidth)}</div>
        </button>
        <div className="w-px bg-zinc-800/50" />
        <button 
          onClick={() => setActiveTab('cpu')} 
          className={`flex-1 p-4 text-left border-t-2 transition-all duration-300 ${activeTab === 'cpu' ? 'border-white bg-zinc-900/20' : 'border-transparent hover:bg-zinc-900/10'}`}
        >
          <div className="text-xs text-zinc-400 font-medium mb-1 uppercase tracking-wider">CPU Usage</div>
          <div className={`text-2xl font-bold transition-colors ${activeTab === 'cpu' ? 'text-white' : 'text-zinc-300'}`}>{totalCpu.toFixed(4)} <span className="text-sm font-normal text-zinc-500">Core-hrs</span></div>
        </button>
        <div className="w-px bg-zinc-800/50" />
        <button 
          onClick={() => setActiveTab('requests')} 
          className={`flex-1 p-4 text-left border-t-2 transition-all duration-300 ${activeTab === 'requests' ? 'border-white bg-zinc-900/20' : 'border-transparent hover:bg-zinc-900/10'}`}
        >
          <div className="text-xs text-zinc-400 font-medium mb-1 uppercase tracking-wider">Requests</div>
          <div className={`text-2xl font-bold transition-colors ${activeTab === 'requests' ? 'text-white' : 'text-zinc-300'}`}>{totalRequests.toLocaleString()}</div>
        </button>
      </div>

      <div className="h-[350px] w-full pt-8 pb-4 pr-4 bg-[#000]">
        {activeData.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <Activity className="h-8 w-8 text-zinc-700 mb-2" />
            <span className="text-zinc-500 text-sm">No data available for this timeframe</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activeData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${project._id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#111" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatXAxis}
                stroke="#444"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={10}
                minTickGap={40}
              />
              <YAxis 
                stroke="#444" 
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => activeUnit === 'bytes' ? formatBytes(val, 0) : val}
              />
              <Tooltip content={<CustomTooltip unit={activeUnit} />} cursor={{ stroke: '#333', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#ffffff" 
                strokeWidth={2}
                fillOpacity={1} 
                fill={`url(#grad-${project._id})`} 
                animationDuration={1000}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#ffffff', style: { filter: `drop-shadow(0px 0px 6px #ffffff)` } }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default function BackendUsagePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>}>
      <BackendUsageContent />
    </Suspense>
  );
}

function BackendUsageContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams?.get('projectId');
  
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        let supportedProjects = data.filter((p: any) => 
          ['render', 'railway'].includes(p.configuration?.backendPlatform)
        );
        if (projectId && projectId !== 'all') {
          supportedProjects = supportedProjects.filter((p: any) => p._id === projectId);
        }
        setProjects(supportedProjects);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="w-full flex flex-col min-h-full">
      <div className="p-8 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Backend Observability</h1>
              <p className="text-zinc-400 text-sm">Monitor network data transfer and compute usage for your deployed backend services.</p>
            </div>
          </div>

          <div className="w-full space-y-10">
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-20 border border-zinc-800/50 bg-[#0a0a0a] rounded-xl">
                <Activity className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-white mb-1">No Backend Usage Found</h3>
                <p className="text-zinc-500 text-sm max-w-md mx-auto">
                  You don't have any projects with supported backend platforms (Render or Railway) connected. Connect a backend deployment to start monitoring metrics.
                </p>
              </div>
            ) : (
              projects.map((project: any) => (
                <ProjectUsageDashboard 
                  key={project._id} 
                  project={project} 
                />
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
