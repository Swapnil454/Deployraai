"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, BarChart2, MousePointerClick, Globe, Monitor, Smartphone, Code, Wand2, GitBranch, ExternalLink, CheckCircle2, MoreHorizontal, Copy, Check, ChevronDown, Calendar } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

const chartConfig = {
  visitors: { label: "Visitors", key: "visitors", suffix: "" },
  pageViews: { label: "Page views", key: "pageViews", suffix: "" },
  bounceRate: { label: "Bounce rate", key: "bounceRate", suffix: "%" },
} as const;

const rowAccents = [
  { fill: "rgba(59, 130, 246, 0.14)", border: "#3b82f6" },
  { fill: "rgba(139, 92, 246, 0.14)", border: "#8b5cf6" },
  { fill: "rgba(20, 184, 166, 0.14)", border: "#14b8a6" },
  { fill: "rgba(245, 158, 11, 0.14)", border: "#f59e0b" },
  { fill: "rgba(244, 63, 94, 0.14)", border: "#f43f5e" },
  { fill: "rgba(6, 182, 212, 0.14)", border: "#06b6d4" },
  { fill: "rgba(132, 204, 22, 0.14)", border: "#84cc16" },
] as const;

function SegmentedBar({ x = 0, y = 0, width = 0, height = 0 }: { x?: number; y?: number; width?: number; height?: number }) {
  const cellHeight = 11;
  const gap = 1.5;
  const rows = Math.max(1, Math.floor(height / cellHeight));
  const cellWidth = Math.max(1, width - gap);
  const renderedHeight = rows * cellHeight;

  return (
    <g>
      {Array.from({ length: rows }, (_, index) => (
        <rect
          key={index}
          x={x + gap / 2}
          y={y + renderedHeight - (index + 1) * cellHeight + gap / 2}
          width={cellWidth}
          height={cellHeight - gap}
          fill={index > rows * 0.74 ? "#b7d978" : "#91cfae"}
        />
      ))}
    </g>
  );
}

export default function ProjectAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  
  const [range, setRange] = useState("25d");
  const [environment, setEnvironment] = useState("all");

  const [showSetup, setShowSetup] = useState(false);

  // New states for tabs
  const [chartTab, setChartTab] = useState("visitors"); // visitors, pageViews, bounceRate
  const [pagesTab, setPagesTab] = useState("pages"); // pages, routes, hostnames
  const [sourcesTab, setSourcesTab] = useState("referrers"); // referrers, utm
  const [devicesTab, setDevicesTab] = useState("devices"); // devices, browsers
  
  const [copied, setCopied] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const activeChart = chartConfig[chartTab as keyof typeof chartConfig];
  const chartData = useMemo(() => (summary?.timeseries || []).map((point: { date: string; visitors: number; pageViews: number; bounceRate?: number }) => ({
    ...point,
    value: point[activeChart.key],
    volume: Math.max(1, Math.round(Number(point.pageViews || 0) * 0.28)),
  })), [summary?.timeseries, activeChart.key]);
  const formatChartDate = (date: React.ReactNode) => {
    if (typeof date !== "string") return "";
    const value = new Date(date);
    if (range === "24h") return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
    if (range === "3d" || range === "7d") return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", hour12: false }).format(value);
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(value);
  };

  useEffect(() => {
    if (!openDropdown) return;
    const handleGlobalClick = () => setOpenDropdown(null);
    const timer = setTimeout(() => {
      document.addEventListener('click', handleGlobalClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [openDropdown]);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchSummary = useCallback(async () => {
    if (!project) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/analytics/summary?range=${range}&environment=${environment}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  }, [projectId, range, environment, project]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);



  const enableAnalytics = async () => {
    setEnabling(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/analytics/enable`, { 
        method: "POST",
        credentials: "include" 
      });
      if (res.ok) {
        await fetchProject();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEnabling(false);
    }
  };

  const disableAnalytics = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/analytics/disable`, { 
        method: "POST",
        credentials: "include" 
      });
      if (res.ok) {
        await fetchProject();
      }
    } catch (err) {
      console.error(err);
    }
  };




  if (loading) {
    return (
      <div className="w-full flex-1 flex items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return <div className="p-8 text-white">Project not found</div>;
  }

  const isVerified = project.analytics?.verified === true;

  const getDomainStr = () => {
    return project.domains?.[0]?.domain 
      || project.domains?.[0] 
      || project.latestDeployment?.finalSummary?.frontendUrl 
      || project.latestDeployment?.deploymentUrl 
      || project.latestDeployment?.providerUrl 
      || (project.subdomain ? `${project.subdomain}.deployai.app` : null);
  };
  const rawDomain = getDomainStr();
  const domainUrl = rawDomain ? (rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}`) : '#';
  const domainDisplay = rawDomain ? rawDomain.replace(/^https?:\/\//, '') : 'Not Deployed Yet';
  const renderList = (data: any[], titleField: string = "_id", emptyMsg = "No data found") => {
    if (loadingSummary) {
      return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-600" /></div>;
    }
    if (!data || data.length === 0) {
      return <div className="flex-1 flex items-center justify-center p-8 text-center text-zinc-500 text-sm">{emptyMsg}</div>;
    }
    const maxCount = data[0].count;
    return data.map((item: any, idx: number) => {
      const percent = Math.max(2, (item.count / maxCount) * 100);
      const colors = rowAccents[idx % rowAccents.length];
      return (
        <div key={idx} className="relative flex items-center justify-between p-2.5 px-4 hover:bg-zinc-900/50 group border-b border-zinc-800/50 last:border-0">
          <div className="absolute left-0 top-0 bottom-0 transition-[width] duration-300" style={{ width: `${percent}%`, backgroundColor: colors.fill, borderLeft: `2px solid ${colors.border}` }} />
          <span className="relative z-10 text-[13px] text-zinc-300 truncate max-w-[80%]">{item[titleField] || '/'}</span>
          <span className="relative z-10 text-[13px] tabular-nums text-white">{item.count}</span>
        </div>
      );
    });
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-black min-h-screen">
      <div className="max-w-[1440px] w-full mx-auto px-8 py-8 flex-1">
        {!isVerified ? (
          <div className="mt-8">
            <ObservabilitySetup 
              project={project}
              onVerified={fetchProject}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
              {/* Left Side: Domain info */}
              <div className="flex items-center gap-3">
                {rawDomain ? (
                  <a href={domainUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[15px] text-zinc-300 hover:text-white transition-colors group">
                    <Globe className="h-5 w-5 text-zinc-500" />
                    <span className="font-semibold">{domainDisplay}</span>
                    <ExternalLink className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400" />
                  </a>
                ) : (
                  <span className="flex items-center gap-2 text-[15px] text-zinc-500">
                    <Globe className="h-5 w-5 text-zinc-600" />
                    <span className="font-semibold">{domainDisplay}</span>
                  </span>
                )}
              </div>

              {/* Right Side: Filters */}
              <div className="flex items-center gap-3">
                {/* Custom Environment Dropdown */}
                <div className="relative group/env">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'env' ? null : 'env'); }}
                    className="flex items-center gap-2 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 text-[13px] font-medium text-white h-9 px-3 rounded-md transition-colors"
                  >
                    {environment === 'all' ? 'All Environments' : environment === 'production' ? 'Production' : 'Preview'}
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  </button>
                  <div className={`absolute right-0 top-full mt-1 w-48 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-xl transition-all z-50 py-1 ${openDropdown === 'env' ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                    <button onClick={(e) => { e.stopPropagation(); setEnvironment('all'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${environment === 'all' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      All Environments
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEnvironment('production'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${environment === 'production' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Production
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEnvironment('preview'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${environment === 'preview' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Preview
                    </button>
                  </div>
                </div>
                
                {/* Custom Time Range Dropdown */}
                <div className="relative group/time">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'time' ? null : 'time'); }}
                    className="flex items-center gap-2 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 text-[13px] font-medium text-white h-9 px-3 rounded-md transition-colors"
                  >
                    <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                    {range === '24h' ? 'Last 24 hours' : range === '3d' ? 'Last 3 days' : range === '7d' ? 'Last 7 days' : range === '25d' ? 'Last 25 days' : 'Last 30 days'}
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  </button>
                  <div className={`absolute right-0 top-full mt-1 w-48 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-xl transition-all z-50 py-1 ${openDropdown === 'time' ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                    <button onClick={(e) => { e.stopPropagation(); setRange('24h'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '24h' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 24 hours
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRange('3d'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '3d' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 3 days
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRange('7d'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '7d' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 7 days
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRange('25d'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '25d' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 25 days
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRange('30d'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '30d' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 30 days
                    </button>
                  </div>
                </div>

                {/* More Action Menu */}
                <div className="relative group/more">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'more' ? null : 'more'); }}
                    className="bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white h-9 w-9 flex items-center justify-center rounded-md transition-colors"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  <div className={`absolute right-0 top-full mt-1 w-56 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-xl transition-all z-50 py-1 ${openDropdown === 'more' ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                    <button disabled className="w-full text-left px-4 py-2 text-[13px] text-zinc-600 cursor-not-allowed transition-colors">Upgrade to Pro</button>
                    <button disabled className="w-full text-left px-4 py-2 text-[13px] text-zinc-600 cursor-not-allowed transition-colors">Go to Docs</button>
                    <div className="my-1 border-t border-zinc-800/50"></div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdown(null);
                        const isSetupVisible = showSetup;
                        if (isSetupVisible) {
                          setShowSetup(false);
                        } else {
                          setShowSetup(true);
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-[13px] text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                    >
                      {showSetup ? "Hide Setup Instructions" : "View Setup Instructions"}
                    </button>
                    <button disabled className="w-full text-left px-4 py-2 text-[13px] text-zinc-600 cursor-not-allowed transition-colors">Add Drain</button>
                    <div className="my-1 border-t border-zinc-800/50"></div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdown(null);
                        disableAnalytics();
                      }}
                      className="w-full text-left px-4 py-2 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Disable Web Analytics
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Integration Section */}
            {showSetup && (
              <div className="mb-4">
                <ObservabilitySetup 
                  project={project}
                  onVerified={fetchProject}
                />
              </div>
            )}

            {/* Main Chart Area */}
            <div className="w-full overflow-hidden relative mb-4 rounded-xl border border-zinc-800 bg-[#0a0a0a]">
              <div className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800">
                <button onClick={() => setChartTab('visitors')} className={`group relative p-4 sm:p-6 text-left transition-colors hover:bg-zinc-900/40 ${chartTab === 'visitors' ? 'bg-zinc-900/50 shadow-[inset_0_-2px_0_#3b82f6]' : ''}`}>
                  <div className={`text-[13px] sm:text-sm mb-2 transition-colors ${chartTab === 'visitors' ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`}>Visitors</div>
                  <div className="text-xl sm:text-3xl font-semibold text-white">
                    {loadingSummary ? <Loader2 className="h-5 w-5 animate-spin text-zinc-600" /> : (summary?.visitors || 0)}
                  </div>
                </button>
                <button onClick={() => setChartTab('pageViews')} className={`group relative p-4 sm:p-6 text-left transition-colors hover:bg-zinc-900/40 ${chartTab === 'pageViews' ? 'bg-zinc-900/50 shadow-[inset_0_-2px_0_#8b5cf6]' : ''}`}>
                  <div className={`text-[13px] sm:text-sm mb-2 transition-colors ${chartTab === 'pageViews' ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`}>Page Views</div>
                  <div className="text-xl sm:text-3xl font-semibold text-white">
                    {loadingSummary ? <Loader2 className="h-5 w-5 animate-spin text-zinc-600" /> : (summary?.pageViews || 0)}
                  </div>
                </button>
                <button onClick={() => setChartTab('bounceRate')} className={`group relative p-4 sm:p-6 text-left transition-colors hover:bg-zinc-900/40 ${chartTab === 'bounceRate' ? 'bg-zinc-900/50 shadow-[inset_0_-2px_0_#14b8a6]' : ''}`}>
                  <div className={`text-[13px] sm:text-sm mb-2 transition-colors ${chartTab === 'bounceRate' ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`}>Bounce Rate</div>
                  <div className="text-xl sm:text-3xl font-semibold text-white">
                    {loadingSummary ? <Loader2 className="h-5 w-5 animate-spin text-zinc-600" /> : `${summary?.bounceRate || 0}%`}
                  </div>
                </button>
              </div>
              <div className="h-[300px] px-3 pb-3 pt-5 relative">
                 {chartData.length > 0 ? (
                   <ResponsiveContainer width="100%" height="100%">
                     {chartTab === "visitors" ? <AreaChart data={chartData} margin={{ top: 14, right: 46, left: 4, bottom: 0 }}>
                       <defs>
                         <linearGradient id="analytics-area-fill" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="0%" stopColor="#d14f50" stopOpacity={0.38} />
                           <stop offset="72%" stopColor="#8c353b" stopOpacity={0.1} />
                           <stop offset="100%" stopColor="#251f25" stopOpacity={0} />
                         </linearGradient>
                       </defs>
                       <CartesianGrid vertical={false} stroke="#34313a" strokeOpacity={0.72} />
                       <XAxis dataKey="date" tickFormatter={formatChartDate} axisLine={{ stroke: "#3b3740" }} tickLine={false} tickMargin={15} interval={0} tick={{ fill: "#9b98a2", fontSize: 11 }} />
                       <YAxis orientation="right" axisLine={false} tickLine={false} tickMargin={12} width={34} domain={[0, "auto"]} tick={{ fill: "#9b98a2", fontSize: 12 }} />
                       <Tooltip cursor={{ stroke: "#d14f50", strokeWidth: 2 }} contentStyle={{ background: "#25232a", border: "1px solid #4c4752", borderRadius: "4px" }} labelStyle={{ color: "#e8e6ea", marginBottom: 4 }} itemStyle={{ color: "#ef7770" }} labelFormatter={formatChartDate} formatter={(value) => [`${Number(value).toLocaleString()}`, activeChart.label]} />
                       <Area type="linear" dataKey="value" stroke="#d14f50" strokeWidth={3} fill="url(#analytics-area-fill)" activeDot={{ r: 7, fill: "#f7f7f7", stroke: "#d14f50", strokeWidth: 4 }} />
                     </AreaChart> : chartTab === "pageViews" ? <ComposedChart data={chartData} margin={{ top: 14, right: 16, left: 4, bottom: 0 }}>
                       <defs><linearGradient id="pageview-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#83cd78" stopOpacity={0.2} /><stop offset="100%" stopColor="#83cd78" stopOpacity={0} /></linearGradient></defs>
                       <CartesianGrid vertical={false} stroke="#2f3231" strokeOpacity={0.36} /><XAxis dataKey="date" tickFormatter={formatChartDate} axisLine={false} tickLine={false} tickMargin={14} interval={0} tick={{ fill: "#8f9892", fontSize: 11 }} /><YAxis hide domain={[0, "auto"]} />
                       <Tooltip cursor={{ stroke: "#80c976", strokeOpacity: 0.45 }} contentStyle={{ background: "#1d211f", border: "1px solid #4c5a4e", borderRadius: "4px" }} labelStyle={{ color: "#e2e8df", marginBottom: 4 }} itemStyle={{ color: "#9ed68d" }} labelFormatter={formatChartDate} formatter={(value) => [`${Number(value).toLocaleString()}`, activeChart.label]} /><Bar dataKey="volume" fill="#526454" opacity={0.25} radius={[1, 1, 0, 0]} barSize={8} /><Area type="linear" dataKey="value" stroke="none" fill="url(#pageview-area)" /><Line type="linear" dataKey="value" stroke="#8bd17f" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#b5e69e", stroke: "#344d37", strokeWidth: 2 }} />
                     </ComposedChart> : <BarChart data={chartData} margin={{ top: 12, right: 14, left: 4, bottom: 0 }} barCategoryGap="7%">
                       <XAxis dataKey="date" tickFormatter={formatChartDate} axisLine={{ stroke: "#44484c" }} tickLine={false} tickMargin={14} interval={0} tick={{ fill: "#9ba4a2", fontSize: 11 }} /><YAxis hide domain={[0, 100]} />
                       <Tooltip cursor={{ fill: "rgba(167,207,150,.07)" }} contentStyle={{ background: "#222832", border: "1px solid #4e5d57", borderRadius: "4px" }} labelStyle={{ color: "#eef5e9", marginBottom: 4 }} itemStyle={{ color: "#b7d978" }} labelFormatter={formatChartDate} formatter={(value) => [`${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`, activeChart.label]} /><Bar dataKey="value" shape={<SegmentedBar />} />
                     </BarChart>}
                   </ResponsiveContainer>
                 ) : (
                   <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <span className="text-sm text-zinc-500">No {activeChart.label.toLowerCase()} data for the selected period</span>
                   </div>
                 )}
              </div>
            </div>

            {/* Row 1: Pages & Referrers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <button onClick={() => setPagesTab('pages')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${pagesTab === 'pages' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Pages</button>
                    <button onClick={() => setPagesTab('routes')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${pagesTab === 'routes' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Routes</button>
                    <button onClick={() => setPagesTab('hostnames')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${pagesTab === 'hostnames' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Hostnames</button>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {pagesTab === 'pages' && renderList(summary?.topPages, "_id", "No page data found")}
                  {pagesTab === 'routes' && renderList(summary?.topPages, "_id", "No route data found")}
                  {pagesTab === 'hostnames' && renderList(summary?.topHostnames, "_id", "No hostname data found")}
                </div>
              </div>
              
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <button onClick={() => setSourcesTab('referrers')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${sourcesTab === 'referrers' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Referrers</button>
                    <button onClick={() => setSourcesTab('utm')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${sourcesTab === 'utm' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>UTM Parameters</button>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {sourcesTab === 'referrers' && renderList(summary?.topReferrers, "_id", "No referrer data found")}
                  {sourcesTab === 'utm' && renderList(summary?.topReferrers, "_id", "No UTM data found")}
                </div>
              </div>
            </div>

            {/* Row 2: Countries, Devices, OS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <div className="px-4 py-2 text-[13px] font-medium text-white border-b-2 border-white -mb-[1px]">Countries</div>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {renderList(summary?.topCountries, "_id", "No country data found")}
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <button onClick={() => setDevicesTab('devices')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${devicesTab === 'devices' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Devices</button>
                    <button onClick={() => setDevicesTab('browsers')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${devicesTab === 'browsers' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Browsers</button>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {devicesTab === 'devices' && renderList(summary?.topDevices, "_id", "No device data found")}
                  {devicesTab === 'browsers' && renderList(summary?.topBrowsers, "_id", "No browser data found")}
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <div className="px-4 py-2 text-[13px] font-medium text-white border-b-2 border-white -mb-[1px]">Operating Systems</div>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {renderList(summary?.topOS, "_id", "No operating system data found")}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
