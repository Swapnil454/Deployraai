"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Activity, Bot, ChevronDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const RANGES = [
  { label: "24 hr", value: "24h" },
  { label: "3 day", value: "3d" },
  { label: "7 day", value: "7d" },
  { label: "15 day", value: "15d" },
  { label: "30 day", value: "30d" },
  { label: "60 day", value: "60d" },
  { label: "max", value: "max" }
];

function MetricChart({ title, feature, projectId, color }: { title: string, feature: string, projectId: string | null, color: string }) {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const projQuery = projectId ? `projectId=${projectId}&` : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/usage/ai?${projQuery}feature=${feature}&range=${range}`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json.chartData || []);
          setTotal(json.total || 0);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, feature, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatXAxis = (dateStr: string) => {
    const d = new Date(dateStr);
    if (range === "24h") {
      return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = new Date(label);
      const displayTime = range === "24h" ? d.toLocaleString() : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return (
        <div className="bg-[#0a0a0a] border border-zinc-800 p-3 rounded-lg shadow-xl min-w-[150px]">
          <p className="text-zinc-400 text-xs mb-2 font-medium">{displayTime}</p>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
              <span className="text-sm text-zinc-300 font-medium">Requests</span>
            </div>
            <span className="text-sm font-semibold text-white">{payload[0].value}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full border border-zinc-800/80 bg-zinc-950/50 backdrop-blur-xl rounded-xl flex flex-col shadow-2xl transition-all duration-300 hover:border-zinc-700/80 hover:shadow-[0_0_30px_rgba(255,255,255,0.03)] relative group">
      {/* Decorative gradient orb */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ backgroundImage: `radial-gradient(circle at top right, ${color}15, transparent 70%)` }} />
      
      <div className="p-5 border-b border-zinc-800/50 flex items-center justify-between relative z-20 rounded-t-xl">
        <div>
          <h3 className="text-zinc-400 font-medium text-sm mb-1">{title}</h3>
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-white tracking-tight">{loading ? <Loader2 className="h-6 w-6 animate-spin text-zinc-500" /> : total}</p>
          </div>
        </div>
        <div className="relative">
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 bg-[#0a0a0a] border border-zinc-800/80 text-zinc-300 text-xs rounded-md px-3 py-1.5 hover:border-zinc-700 hover:bg-[#111] transition-colors"
          >
            {RANGES.find(r => r.value === range)?.label}
            <ChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 mt-2 w-28 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-2xl z-50 py-1 flex flex-col overflow-hidden">
                {RANGES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => {
                      setRange(r.value);
                      setDropdownOpen(false);
                    }}
                    className={`text-left px-4 py-2 text-xs transition-colors hover:bg-zinc-800/50 ${range === r.value ? 'text-white bg-zinc-800/30 font-medium' : 'text-zinc-400'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      
      <div className="h-[250px] w-full pt-6 pb-2 pr-4 bg-[#000] rounded-b-xl relative z-10">
        {loading && data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-800" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`color-${feature}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
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
                minTickGap={30}
              />
              <YAxis 
                stroke="#444" 
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#333', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={color} 
                strokeWidth={2}
                fillOpacity={1} 
                fill={`url(#color-${feature})`} 
                animationDuration={1000}
                activeDot={{ r: 4, strokeWidth: 0, fill: color, style: { filter: `drop-shadow(0px 0px 4px ${color})` } }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function UsagesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>}>
      <UsagesContent />
    </Suspense>
  );
}

function UsagesContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams?.get('projectId');
  
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const fetchRecentActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const projQuery = projectId ? `projectId=${projectId}&` : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/usage/ai?${projQuery}feature=total&range=14d`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRecentActivity(data.recentActivity || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingActivity(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRecentActivity();
  }, [fetchRecentActivity]);

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getFeatureLabel = (feature: string) => {
    switch(feature) {
      case "auto_pr_fix": return "Auto PR Fix";
      case "deployment_analysis": return "Deployment Analysis";
      case "analytics_insight": return "Analytics Insight";
      default: return feature;
    }
  };

  return (
    <div className="w-full flex flex-col min-h-full">
      <div className="p-8 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">AI Observability</h1>
              <p className="text-zinc-400 text-sm">Monitor your automated AI workflows and track model usage over time.</p>
            </div>
          </div>

          <div className="w-full mb-12 grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
            {/* Background ambient glow for the grid */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />
            
            <MetricChart title="Total AI Requests" feature="total" projectId={projectId} color="#ffffff" />
            <MetricChart title="Auto PR Fixes" feature="auto_pr_fix" projectId={projectId} color="#22c55e" />
            <MetricChart title="Deployment Analysis" feature="deployment_analysis" projectId={projectId} color="#f97316" />
            <MetricChart title="Analytics Insights" feature="analytics_insight" projectId={projectId} color="#a855f7" />
          </div>

          <div className="w-full border border-zinc-800 bg-[#0a0a0a] rounded-xl overflow-hidden mb-12">
            <div className="p-5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-zinc-400" />
                <h3 className="text-lg font-semibold text-white tracking-tight">Recent AI Activity</h3>
              </div>
            </div>
            
            {loadingActivity ? (
               <div className="py-12 flex justify-center">
                 <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
               </div>
            ) : recentActivity.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800/50 bg-zinc-900/10">
                      <th className="py-3 px-5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Timestamp</th>
                      <th className="py-3 px-5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Project</th>
                      <th className="py-3 px-5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Action</th>
                      <th className="py-3 px-5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {recentActivity.map((activity: any) => (
                      <tr key={activity._id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3 px-5 text-sm text-zinc-300 whitespace-nowrap">
                          {formatDateTime(activity.createdAt)}
                        </td>
                        <td className="py-3 px-5">
                          {activity.projectId ? (
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-zinc-200">{activity.projectId.repoName}</span>
                              <span className="text-xs text-zinc-500">{activity.projectId.repoFullName}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-zinc-500 italic">Unknown Project</span>
                          )}
                        </td>
                        <td className="py-3 px-5">
                          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {getFeatureLabel(activity.feature)}
                          </div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="text-sm text-zinc-300">Completed</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Bot className="h-10 w-10 text-zinc-700 mb-3" />
                <p className="text-zinc-400 font-medium">No recent AI activity found</p>
                <p className="text-xs text-zinc-500 mt-1">Activities will appear here once you use AI features.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
