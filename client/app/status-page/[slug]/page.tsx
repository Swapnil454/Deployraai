"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Check, AlertTriangle, XCircle, Globe, Calendar, ChevronDown, Link as LinkIcon, ExternalLink, TrendingUp, Clock, ShieldAlert, Activity } from "lucide-react";

interface StatusPage {
  id: string;
  title: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
}

interface StatusMonitor {
  id: string;
  target: string;
  monitor_type: string;
  status: string;
  history?: { date: string; uptime_percentage: string }[];
}

interface GlobalMetrics {
  uptime_30d: number;
  uptime_history: number[];
  avg_response_ms: number;
  response_history: number[];
  incidents_30d: number;
  incidents_history: number[];
}

export default function PublicStatusPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [pageData, setPageData] = useState<{ status_page: StatusPage; monitors: StatusMonitor[]; global_metrics?: GlobalMetrics } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterWindow, setFilterWindow] = useState("30d");

  const API = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

  const windowOptions = [
    { value: "1h", label: "Last 1 hour" },
    { value: "6h", label: "Last 6 hours" },
    { value: "12h", label: "Last 12 hours" },
    { value: "24h", label: "Last 24 hours" },
    { value: "7d", label: "Last 7 days" },
    { value: "15d", label: "Last 15 days" },
    { value: "30d", label: "Last 30 days" },
  ];

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/status/${slug}?window=${filterWindow}&t=${Date.now()}`, { credentials: "include", cache: "no-store" })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Status page not found")))
      .then(data => {
        setPageData(data);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug, API, filterWindow]);

  if (loading && !pageData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7F9]">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (error || !pageData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F4F7F9] text-center text-slate-300 p-6">
        <AlertTriangle className="w-12 h-12 text-slate-400 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Status Page Not Found</h1>
        <p className="text-slate-400">The status page you are looking for does not exist or is private.</p>
      </div>
    );
  }

  const { status_page, monitors, global_metrics } = pageData;
  const isAllUp = monitors.length === 0 || monitors.every(m => m.status === 'up' || m.status === 'paused');
  const isAllDown = monitors.length > 0 && monitors.every(m => m.status === 'down');
  const hasSomeDown = monitors.some(m => m.status === 'down');

  // Helper to generate a smooth SVG sparkline path from an array of numbers
  const generateSmoothPath = (data: number[], width = 100, height = 30) => {
    if (!data || data.length === 0) return `M0,${height/2} L${width},${height/2}`;
    if (data.length === 1) return `M0,${height/2} L${width},${height/2}`;
    const min = Math.min(...data);
    const max = Math.max(...data);
    
    if (min === max) {
      return `M0,${height/2} L${width},${height/2}`;
    }
    const range = max - min;
    
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3; // 3px padding top/bottom
      return {x, y};
    });

    let path = `M${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 === points.length ? i + 1 : i + 2];
      
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      
      path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
  };

  // Helper to construct exact chronological time buckets based on the selected window
  const createTimeBuckets = (history: {date: string, uptime_percentage: string}[] | undefined, windowStr: string) => {
    let windowMs = 30 * 24 * 60 * 60 * 1000;
    let numBars = 30;
    let formatLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    switch (windowStr) {
      case '1h': windowMs = 60 * 60 * 1000; numBars = 30; formatLabel = d => d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); break;
      case '6h': windowMs = 6 * 60 * 60 * 1000; numBars = 36; formatLabel = d => d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); break;
      case '12h': windowMs = 12 * 60 * 60 * 1000; numBars = 36; formatLabel = d => d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); break;
      case '24h': windowMs = 24 * 60 * 60 * 1000; numBars = 24; formatLabel = d => d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); break;
      case '7d': windowMs = 7 * 24 * 60 * 60 * 1000; numBars = 28; formatLabel = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); break;
      case '15d': windowMs = 15 * 24 * 60 * 60 * 1000; numBars = 30; break;
      case '30d': default: windowMs = 30 * 24 * 60 * 60 * 1000; numBars = 30; break;
    }

    const endTime = Date.now();
    const startTime = endTime - windowMs;
    const stepMs = windowMs / numBars;

    const buckets = Array.from({ length: numBars }, (_, i) => {
      const barStart = startTime + i * stepMs;
      return { label: formatLabel(new Date(barStart)), items: [] as number[] };
    });

    if (history) {
      history.forEach(h => {
        let dateStr = h.date;
        if (dateStr.length === 10) dateStr += "T00:00:00Z";
        else if (dateStr.length === 13) dateStr = dateStr.replace(' ', 'T') + ":00:00Z";
        else if (dateStr.length === 16) dateStr = dateStr.replace(' ', 'T') + ":00Z";
        else dateStr = dateStr.replace(' ', 'T') + "Z";
        
        const t = new Date(dateStr).getTime();
        const bucketIndex = Math.floor((t - startTime) / stepMs);
        
        if (bucketIndex >= 0 && bucketIndex < numBars) {
          buckets[bucketIndex].items.push(parseFloat(h.uptime_percentage));
        }
      });
    }

    let lastKnown: number | null = null;
    return buckets.map(b => {
      if (b.items.length === 0) {
        return { date: b.label, uptime_percentage: lastKnown !== null ? lastKnown.toFixed(2) : null };
      }
      const avg = b.items.reduce((sum, val) => sum + val, 0) / b.items.length;
      lastKnown = avg;
      return { date: b.label, uptime_percentage: avg.toFixed(2) };
    });
  };

  const uptimePath = generateSmoothPath(global_metrics?.uptime_history || [100, 100]);
  const responsePath = generateSmoothPath(global_metrics?.response_history || [0, 0]);
  const incidentsPath = generateSmoothPath(global_metrics?.incidents_history || [0, 0]);

  const globalStatus = isAllUp ? "All Systems Operational" : isAllDown ? "Major Outage" : "Partial Outage";
  const globalDesc = isAllUp 
    ? "All services are running smoothly. No known issues at this time."
    : "We are currently experiencing issues with some of our services.";
    
  const GlobalIcon = isAllUp ? Check : isAllDown ? XCircle : AlertTriangle;
  const globalBg = isAllUp ? "bg-emerald-500" : isAllDown ? "bg-red-500" : "bg-amber-500";
  const globalLightBg = isAllUp ? "bg-emerald-100" : isAllDown ? "bg-red-100" : "bg-amber-100";

  return (
    <div className="min-h-screen bg-[#131B2F] text-white font-sans selection:bg-emerald-100 selection:text-emerald-900 relative overflow-x-hidden pb-20">
      {/* Decorative Dark Top Section with Classy Tree Root Pattern */}
      <div className="absolute top-0 inset-x-0 h-[360px] bg-[#131B2F] z-0">
        
        {/* Left Side Tree Root / Topographic Lines (Classy, Subtle, Dark Mode) */}
        <svg className="absolute top-0 left-0 w-full h-[360px] opacity-[0.10] text-[#34D399]" viewBox="0 0 1440 360" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-100,50 C100,100 200,300 400,400 C600,500 700,600 700,800" strokeWidth="0.5" />
            <path d="M-100,70 C120,120 220,320 420,420 C620,520 720,620 720,800" strokeWidth="1" />
            <path d="M-100,90 C140,140 240,340 440,440 C640,540 740,640 740,800" strokeWidth="0.5" />
            <path d="M-100,110 C160,160 260,360 460,460 C660,560 760,660 760,800" strokeWidth="2" />
            
            <path d="M-100,-50 C150,0 350,150 450,300 C550,450 600,600 500,800" strokeWidth="1" />
            <path d="M-100,-30 C170,20 370,170 470,320 C570,470 620,620 520,800" strokeWidth="0.5" />
            <path d="M-100,-10 C190,40 390,190 490,340 C590,490 640,640 540,800" strokeWidth="1.5" />
          </g>
        </svg>

        {/* Soft radial glow on the left to highlight the roots classily */}
        <div className="absolute top-[-200px] -left-[100px] w-[600px] h-[600px] bg-[#10B981] rounded-full blur-[130px] opacity-[0.05]" />
        
        {/* Soft radial glow on the top right for a lighter ambient feel */}
        <div className="absolute top-[-150px] -right-[100px] w-[500px] h-[500px] bg-[#3B82F6] rounded-full blur-[120px] opacity-[0.04]" />
      </div>

      <main className="max-w-[1024px] mx-auto px-4 sm:px-6 w-full pt-8 relative z-10">
        
        {/* Status Page Name Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-white mb-6 px-2">
          <h1 className="text-3xl font-extrabold tracking-tight">{pageData.status_page.title || "Service Status"}</h1>
          <div className="text-left sm:text-right mt-2 sm:mt-0 opacity-90">
            <h2 className="text-lg font-bold">Service status</h2>
            <p className="text-[13px] text-slate-400 font-medium mt-0.5">
              Last updated {new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})} | Next update in 60 sec.
            </p>
          </div>
        </div>

        {/* Main Banner */}
        <div className="bg-white/95 backdrop-blur-sm rounded-[16px] shadow-lg border border-slate-200/80 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          
          <div className="flex items-center gap-5 relative z-10">
            <div className="shrink-0 h-[56px] w-[56px] bg-[#22C55E] rounded-full flex items-center justify-center relative ring-[4px] ring-emerald-50 shadow-inner">
              <Check className="w-6 h-6 text-white" strokeWidth={4} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase mb-1">System Status</p>
              <h2 className={`text-[32px] font-extrabold text-slate-900 tracking-tight leading-none mb-1 flex items-center gap-2`}>
                All systems <span className="text-[#22C55E]">Operational</span>
              </h2>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm relative z-10 shrink-0 w-full sm:w-auto">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#22C55E]"></span>
            </span>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-slate-800">Updated in real-time</span>
              <span className="text-[11px] text-slate-500 font-medium mt-0.5">{new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="mt-8 mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4 relative z-20">
          <div>
            <h3 className="text-[24px] font-extrabold text-white tracking-tight leading-none">Uptime</h3>
            <p className="text-sm text-slate-400 mt-2 font-medium">Real-time status and historical uptime for our services.</p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2.5 shadow-sm cursor-pointer hover:bg-slate-50 transition group relative">
            <Calendar className="w-[18px] h-[18px] text-slate-500" />
            <span className="text-sm font-bold text-slate-700">{windowOptions.find(o => o.value === filterWindow)?.label || "Last 30 days"}</span>
            {loading ? (
              <Loader2 className="w-[18px] h-[18px] text-emerald-500 animate-spin ml-1" />
            ) : (
              <ChevronDown className="w-[18px] h-[18px] text-slate-400 ml-1 group-hover:rotate-180 transition-transform" />
            )}
            
            {/* Functional dropdown menu */}
            <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden flex flex-col py-1">
              {windowOptions.map(opt => (
                <div 
                  key={opt.value}
                  onClick={() => setFilterWindow(opt.value)}
                  className={`px-4 py-2 cursor-pointer hover:bg-slate-50 text-sm flex items-center justify-between ${filterWindow === opt.value ? 'text-emerald-600 font-bold bg-emerald-50/50' : 'text-slate-600 font-semibold'}`}
                >
                  {opt.label}
                  {filterWindow === opt.value && <Check className="w-4 h-4" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monitors */}
        <div className="space-y-3">
          {monitors.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
              No services are currently being monitored.
            </div>
          ) : (
            monitors.map(m => {
              const buckets = createTimeBuckets(m.history, filterWindow);
              const overallUptime = global_metrics?.uptime_30d ? global_metrics.uptime_30d.toFixed(2) : "100.00";

              return (
                <div key={m.id} className="bg-white/95 backdrop-blur-sm rounded-[20px] shadow-lg border border-slate-200/80 p-5 sm:p-6 transition hover:shadow-xl">
                  {/* Monitor Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                    <div className="flex items-center gap-4">
                      <div className="h-[40px] w-[40px] bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center shrink-0">
                        <LinkIcon className="w-4 h-4 text-slate-400" strokeWidth={2.5} />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <h4 className="text-[19px] font-extrabold text-slate-900 truncate max-w-[200px] sm:max-w-md">{m.target}</h4>
                          <ExternalLink className="w-[18px] h-[18px] text-slate-400" />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="bg-slate-100 text-slate-500 text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">{m.monitor_type}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[12px] font-bold text-slate-400 tracking-wide">Production</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 self-start sm:self-auto w-full sm:w-auto justify-between sm:justify-end">
                      {m.status === 'up' ? (
                        <div className="bg-[#E6F7F1] text-[#059669] rounded-full px-4 py-1.5 text-[14px] font-bold flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#10B981]"></span>
                          Operational
                        </div>
                      ) : m.status === 'down' ? (
                        <div className="bg-red-50 text-red-600 rounded-full px-4 py-1.5 text-[14px] font-bold flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-red-500"></span>
                          Outage
                        </div>
                      ) : (
                        <div className="bg-slate-100 text-slate-500 rounded-full px-4 py-1.5 text-[14px] font-bold flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Pending
                        </div>
                      )}
                      
                      <div className="text-right border-l border-slate-200 pl-6">
                        <div className="text-[22px] font-extrabold text-slate-900 tracking-tight leading-none">{overallUptime}%</div>
                        <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">UPTIME ({filterWindow.toUpperCase()})</div>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic History Bars */}
                  <div className="flex flex-col">
                    <div className="flex items-end justify-between h-[36px] gap-1 sm:gap-1.5 relative">
                      {buckets.map((hist, i) => {
                        const pct = hist && hist.uptime_percentage !== null ? parseFloat(hist.uptime_percentage) : null;
                        
                        let bgClass = "bg-[#E5E7EB]";
                        if (pct !== null) {
                          if (pct >= 99.0) bgClass = "bg-[#10B981]";
                          else if (pct > 0) bgClass = "bg-[#F59E0B]";
                          else bgClass = "bg-[#EF4444]";
                        }

                        return (
                          <div 
                            key={i}
                            className={`flex-1 h-full rounded-[3px] ${bgClass} hover:opacity-75 transition-all cursor-crosshair relative group`}
                          >
                            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center bg-black px-3.5 py-2.5 rounded-lg shadow-2xl whitespace-nowrap z-20 pointer-events-none before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-[5px] before:border-transparent before:border-t-black">
                              {hist && hist.uptime_percentage !== null ? (
                                <>
                                  <span className="text-white text-[13px] font-bold mb-0.5">{hist.date}</span>
                                  <span className={`text-[12px] font-semibold ${pct! >= 99 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {pct! === 100 ? "No downtime recorded" : `${hist.uptime_percentage}% uptime`}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-white text-[13px] font-bold mb-0.5">{hist?.date || 'Unknown'}</span>
                                  <span className="text-slate-400 text-[12px] font-medium">No data</span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="flex justify-between items-center mt-3 text-[11px] font-bold text-slate-400 tracking-widest uppercase">
                      <span>{filterWindow.replace('d', ' DAYS AGO').replace('h', ' HOURS AGO')}</span>
                      <span className="text-[#10B981] font-bold lowercase tracking-normal text-[13px]">{overallUptime}% <span className="text-slate-400 font-semibold ml-1">overall uptime</span></span>
                      <span>Today</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Decorative Stats Row (Mocked UI for aesthetics as requested) */}
        {monitors.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
            
            {/* Stat 1: Uptime */}
            <div className="bg-white/95 backdrop-blur-sm rounded-[20px] shadow-lg border border-slate-200/80 p-4 flex flex-col h-[150px]">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-[34px] w-[34px] bg-[#E6F7F1] rounded-[10px] flex items-center justify-center">
                    <TrendingUp className="w-[18px] h-[18px] text-[#10B981]" strokeWidth={2.5} />
                  </div>
                  <div className="text-[13px] font-bold text-slate-600 uppercase">Uptime ({filterWindow})</div>
                </div>
                
              </div>
              <div className="flex items-end gap-2 mt-1">
                <h4 className="text-[28px] font-extrabold text-slate-900 leading-none">
                  {global_metrics?.uptime_30d ? global_metrics.uptime_30d.toFixed(2) : "100.00"}%
                </h4>
              </div>
              {/* Chart */}
              <div className="mt-auto h-16 w-[calc(100%+8px)] relative -mx-1">
                <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[9px] text-slate-400 font-bold -ml-2">
                  <span>100%</span>
                  <span>50%</span>
                  <span>0%</span>
                </div>
                <div className="absolute bottom-[-16px] left-6 right-0 flex justify-between text-[9px] text-slate-400 font-bold">
                  <span>Start</span>
                  <span>Mid</span>
                  <span>Now</span>
                </div>
                <div className="absolute left-5 bottom-0 top-0 border-l border-slate-200" />
                <div className="absolute left-5 bottom-0 right-0 border-b border-slate-200" />
                <div className="absolute left-5 right-0 top-0 bottom-0">
                  <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full text-[#10B981] overflow-visible">
                    <path d={uptimePath} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    <path d={`${uptimePath} L100,30 L0,30 Z`} fill="url(#green-grad)" opacity="0.3" />
                    <defs>
                      <linearGradient id="green-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

            {/* Stat 2: Response */}
            <div className="bg-white/95 backdrop-blur-sm rounded-[20px] shadow-lg border border-slate-200/80 p-4 flex flex-col h-[150px]">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-[34px] w-[34px] bg-[#EEF2FF] rounded-[10px] flex items-center justify-center">
                    <Clock className="w-[18px] h-[18px] text-[#4F46E5]" strokeWidth={2.5} />
                  </div>
                  <div className="text-[13px] font-bold text-slate-600">Avg. Response Time</div>
                </div>
                
              </div>
              <div className="flex items-end gap-2 mt-1">
                <h4 className="text-[28px] font-extrabold text-slate-900 leading-none">
                  {Math.round(global_metrics?.avg_response_ms || 0)} ms
                </h4>
              </div>
              {/* Chart */}
              <div className="mt-auto h-16 w-[calc(100%+8px)] relative -mx-1">
                <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[9px] text-slate-400 font-bold -ml-2">
                  <span>1.2s</span>
                  <span>600ms</span>
                  <span>0ms</span>
                </div>
                <div className="absolute bottom-[-16px] left-6 right-0 flex justify-between text-[9px] text-slate-400 font-bold">
                  <span>Start</span>
                  <span>Mid</span>
                  <span>Now</span>
                </div>
                <div className="absolute left-5 bottom-0 top-0 border-l border-slate-200" />
                <div className="absolute left-5 bottom-0 right-0 border-b border-slate-200" />
                <div className="absolute left-5 right-0 top-0 bottom-0">
                  <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full text-[#4F46E5] overflow-visible">
                    <path d={responsePath} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    <path d={`${responsePath} L100,30 L0,30 Z`} fill="url(#blue-grad)" opacity="0.15" />
                    <defs>
                      <linearGradient id="blue-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

            {/* Stat 3: Incidents */}
            <div className="bg-white/95 backdrop-blur-sm rounded-[20px] shadow-lg border border-slate-200/80 p-4 flex flex-col h-[150px]">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-[34px] w-[34px] bg-[#FFFBEB] rounded-[10px] flex items-center justify-center">
                    <ShieldAlert className="w-[18px] h-[18px] text-[#F59E0B]" strokeWidth={2.5} />
                  </div>
                  <div className="text-[13px] font-bold text-slate-600 uppercase">Incidents ({filterWindow})</div>
                </div>
              </div>
              <div className="flex items-end gap-2 mt-1">
                <h4 className="text-[28px] font-extrabold text-slate-900 leading-none">
                  {global_metrics?.incidents_30d || 0}
                </h4>
              </div>
              {/* Chart */}
              <div className="mt-auto h-16 w-[calc(100%+8px)] relative -mx-1">
                <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[9px] text-slate-400 font-bold -ml-2">
                  <span>5</span>
                  <span>2.5</span>
                  <span>0</span>
                </div>
                <div className="absolute bottom-[-16px] left-6 right-0 flex justify-between text-[9px] text-slate-400 font-bold">
                  <span>Start</span>
                  <span>Mid</span>
                  <span>Now</span>
                </div>
                <div className="absolute left-5 bottom-0 top-0 border-l border-slate-200" />
                <div className="absolute left-5 bottom-0 right-0 border-b border-slate-200" />
                <div className="absolute left-5 right-0 top-0 bottom-0">
                  <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full text-[#F59E0B] overflow-visible">
                    <path d={incidentsPath} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    <path d={`${incidentsPath} L100,30 L0,30 Z`} fill="url(#yellow-grad)" opacity="0.15" />
                    <defs>
                      <linearGradient id="yellow-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

             {/* Stat 4: Last Checked */}
             <div className="bg-white/95 backdrop-blur-sm rounded-[20px] shadow-lg border border-slate-200/80 p-4 flex flex-col h-[150px]">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-[34px] w-[34px] bg-[#F1F5F9] rounded-[10px] flex items-center justify-center">
                    <Calendar className="w-[18px] h-[18px] text-slate-400" strokeWidth={2.5} />
                  </div>
                  <div className="text-[13px] font-bold text-slate-600">Last Checked</div>
                </div>
              </div>
              <div className="flex items-end gap-2 mt-1">
                <h4 className="text-[28px] font-extrabold text-slate-900 leading-none">Just now</h4>
              </div>
              {/* Chart */}
              <div className="mt-auto h-16 w-[calc(100%+8px)] relative -mx-1">
                <div className="absolute bottom-[-16px] left-2 right-0 flex justify-between text-[9px] text-slate-400 font-bold">
                  <span>Start</span>
                  <span>Mid</span>
                  <span>Now</span>
                </div>
                <div className="absolute left-2 bottom-0 right-0 border-b border-slate-200" />
                <div className="absolute left-2 right-0 top-0 bottom-0">
                  <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full text-slate-400 overflow-visible">
                    <path d={uptimePath} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    <path d={`${uptimePath} L100,30 L0,30 Z`} fill="url(#slate-grad)" opacity="0.1" />
                    <defs>
                      <linearGradient id="slate-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-[1000px] mx-auto px-6 mt-16 pt-4 border-t border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             {status_page.logo_url ? (
               <img src={status_page.logo_url} alt="Logo" className="h-5 w-auto rounded" />
             ) : (
               <Globe className="w-4 h-4 text-emerald-500" />
             )}
             <span className="font-extrabold text-white">{status_page.title}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Reliable infrastructure for modern applications.</p>
        </div>
        
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-4 text-[13px] font-bold text-slate-400">
           <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
             <span className="h-2 w-2 rounded-full bg-emerald-500" /> All Systems Operational
           </div>
        </div>
      </footer>
    </div>
  );
}
