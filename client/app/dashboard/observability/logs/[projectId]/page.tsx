"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity, Search, Play, Pause, ChevronDown, 
  Terminal, Globe, Server, AlertCircle, Clock,
  ChevronRight, BarChart2
} from "lucide-react";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Line, ComposedChart, Area 
} from "recharts";

// Utility to format duration
const formatDuration = (ms: number) => {
  if (ms < 1) return "< 1ms";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

// Map status code
const getStatusColor = (code?: number) => {
  if (!code) return "text-zinc-500 bg-zinc-500/10";
  if (code >= 200 && code < 300) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
  if (code >= 300 && code < 400) return "text-blue-400 bg-blue-400/10 border-blue-400/20";
  if (code >= 400 && code < 500) return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  if (code >= 500) return "text-red-400 bg-red-400/10 border-red-400/20";
  return "text-zinc-400 bg-zinc-800 border-zinc-700";
};

// Expandable trace details component
function TraceDetails({ trace }: { trace: any }) {
  const isError = trace.status_code === 2 || (trace.attributes?.['http.status_code'] && trace.attributes['http.status_code'] >= 500);
  
  return (
    <div className="bg-[#0a0a0a] border-t border-zinc-800 p-6 shadow-inner text-[13px]">
      <div className="grid grid-cols-3 gap-8">
        
        {/* Basic Attributes */}
        <div className="col-span-1 flex flex-col gap-4">
          <h4 className="text-zinc-300 font-medium mb-1 flex items-center gap-2">
            <Server className="h-4 w-4 text-zinc-500" />
            Request Details
          </h4>
          <div className="space-y-2 text-zinc-400">
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Method</span>
              <span className="text-zinc-200 font-mono">{trace.attributes?.['http.method'] || '-'}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Status</span>
              <span className={`font-mono ${isError ? 'text-red-400' : 'text-emerald-400'}`}>
                {trace.attributes?.['http.status_code'] || (trace.status_code === 2 ? 'ERROR' : 'OK')}
              </span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>URL</span>
              <span className="text-zinc-200 truncate ml-4" title={trace.attributes?.['http.url']}>{trace.attributes?.['http.url'] || '-'}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Duration</span>
              <span className="text-zinc-200 font-mono">{trace.duration_ms ? `${trace.duration_ms}ms` : '-'}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Client IP</span>
              <span className="text-zinc-200 font-mono">{trace.attributes?.['net.peer.ip'] || '-'}</span>
            </div>
          </div>
        </div>

        {/* JSON Payload Inspector */}
        <div className="col-span-2 flex flex-col gap-4">
          <h4 className="text-zinc-300 font-medium mb-1 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-500" />
            OpenTelemetry Attributes
          </h4>
          <div className="bg-[#050505] border border-zinc-800 rounded-md p-3 overflow-x-auto max-h-[300px] overflow-y-auto font-mono text-[11px] text-zinc-300">
            <pre>{JSON.stringify(trace.attributes, null, 2)}</pre>
          </div>
          
          {isError && trace.attributes?.['exception.stacktrace'] && (
            <>
              <h4 className="text-red-400 font-medium mt-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Exception Stack Trace
              </h4>
              <div className="bg-[#1a0505] border border-red-900/50 rounded-md p-3 overflow-x-auto max-h-[300px] overflow-y-auto font-mono text-[11px] text-red-300">
                <pre>{trace.attributes['exception.deobfuscated_stacktrace'] || trace.attributes['exception.stacktrace']}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ObservabilityTracesDashboard() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [traces, setTraces] = useState<any[]>([]);
  const [histogramData, setHistogramData] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [liveTail, setLiveTail] = useState(true);
  
  // Filters
  const [method, setMethod] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  
  // SSE EventSource ref
  const eventSourceRef = useRef<EventSource | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch initial traces & histogram
  const fetchInitialData = useCallback(async () => {
    try {
      const qParams = new URLSearchParams();
      qParams.append('projectId', projectId);
      if (method) qParams.append('method', method);
      if (statusCode) qParams.append('statusCode', statusCode);
      
      const [tracesRes, histRes, projectRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/traces?${qParams.toString()}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/traces/histogram?projectId=${projectId}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" })
      ]);

      if (tracesRes.ok) {
        const data = await tracesRes.json();
        setTraces(data.traces || []);
      }
      if (histRes.ok) {
        const hData = await histRes.json();
        setHistogramData(hData.histogram || []);
      }
      if (projectRes.ok) {
        setProject(await projectRes.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, method, statusCode]);

  useEffect(() => {
    setLoading(true);
    fetchInitialData();
  }, [fetchInitialData]);

  // Setup Live Tail SSE
  useEffect(() => {
    if (!liveTail) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const startSSE = () => {
      const url = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/traces/stream?projectId=${projectId}`;
      const es = new EventSource(url, { withCredentials: true });
      
      es.onmessage = (event) => {
        try {
          const newTraces = JSON.parse(event.data);
          if (Array.isArray(newTraces) && newTraces.length > 0) {
            setTraces((prev) => {
              // Prepend new traces and keep max 500 in memory
              const combined = [...newTraces, ...prev];
              // De-duplicate by trace_id and span_id
              const unique = Array.from(new Map(combined.map(t => [t.span_id, t])).values());
              return unique.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()).slice(0, 500);
            });
            // Update histogram dummy logic (ideally we refetch histogram or augment it locally)
            fetchInitialData(); // Lazy update for now
          }
        } catch (e) {
          console.error("SSE parse error", e);
        }
      };

      es.onerror = (err) => {
        console.error("SSE error", err);
        es.close();
        // Reconnect after 3s
        setTimeout(startSSE, 3000);
      };

      eventSourceRef.current = es;
    };

    startSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [liveTail, projectId, fetchInitialData]);

  const toggleTrace = (id: string) => {
    setExpandedTraceId(expandedTraceId === id ? null : id);
  };

  const filteredTraces = useMemo(() => {
    if (!debouncedSearch) return traces;
    const lowerSearch = debouncedSearch.toLowerCase();
    return traces.filter(t => 
      t.attributes?.['http.url']?.toLowerCase().includes(lowerSearch) ||
      t.attributes?.['http.method']?.toLowerCase().includes(lowerSearch) ||
      t.name?.toLowerCase().includes(lowerSearch) ||
      t.trace_id?.toLowerCase().includes(lowerSearch)
    );
  }, [traces, debouncedSearch]);

  if (project && !project.observability?.verified) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#050505] text-zinc-200 pb-20 font-sans p-6 pt-12">
        <ObservabilitySetup project={project} onVerified={fetchInitialData} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 p-6 pt-6 w-full flex-1">
          <div className="max-w-[1440px] w-full mx-auto">
            
            {/* SKELETON HEADER */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 border-b border-zinc-800/60 pb-4">
              <div className="flex items-center gap-4">
                <div className="h-8 w-40 bg-zinc-800/50 rounded-lg animate-pulse" />
                <div className="h-8 w-32 bg-zinc-800/30 rounded-full animate-pulse" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-[130px] bg-zinc-800/50 rounded-lg animate-pulse" />
                <div className="h-9 w-[150px] bg-zinc-800/50 rounded-lg animate-pulse" />
                <div className="h-9 w-[260px] bg-zinc-800/50 rounded-lg animate-pulse" />
              </div>
            </div>

            {/* SKELETON CHART */}
            <div className="w-full relative rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <div className="h-6 w-56 bg-zinc-800/50 rounded-md animate-pulse" />
                <div className="h-7 w-28 bg-zinc-800/40 rounded-full animate-pulse" />
              </div>
              <div className="h-[220px] w-full bg-zinc-800/20 rounded-lg animate-pulse" />
            </div>

            {/* SKELETON TABLE */}
            <div className="w-full rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden shadow-lg">
              <div className="px-5 py-4 border-b border-zinc-800/60 bg-zinc-900/80">
                <div className="flex gap-4">
                  <div className="w-32"><div className="h-4 w-12 bg-zinc-800/50 rounded animate-pulse" /></div>
                  <div className="w-24"><div className="h-4 w-16 bg-zinc-800/50 rounded animate-pulse" /></div>
                  <div className="flex-1"><div className="h-4 w-24 bg-zinc-800/50 rounded animate-pulse" /></div>
                  <div className="w-28 text-right"><div className="h-4 w-20 bg-zinc-800/50 rounded animate-pulse ml-auto" /></div>
                  <div className="w-32 text-right"><div className="h-4 w-24 bg-zinc-800/50 rounded animate-pulse ml-auto" /></div>
                  <div className="w-10"></div>
                </div>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-4">
                    <div className="w-32"><div className="h-4 w-20 bg-zinc-800/30 rounded animate-pulse" /></div>
                    <div className="w-24"><div className="h-4 w-12 bg-zinc-800/30 rounded animate-pulse" /></div>
                    <div className="flex-1"><div className="h-4 w-64 bg-zinc-800/30 rounded animate-pulse" /></div>
                    <div className="w-28 text-right"><div className="h-4 w-10 bg-zinc-800/30 rounded animate-pulse ml-auto" /></div>
                    <div className="w-32 text-right"><div className="h-6 w-16 bg-zinc-800/30 rounded-md animate-pulse ml-auto" /></div>
                    <div className="w-10 flex justify-end"><div className="h-4 w-4 bg-zinc-800/30 rounded animate-pulse" /></div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0">
      {/* Page Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 p-6 pt-6 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          
          {/* HEADER & CONTROLS */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 border-b border-zinc-800/60 pb-4">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <Activity className="h-6 w-6 text-white" />
                Live Traces
              </h1>
              
              {/* Live Tail Toggle */}
              <button 
                onClick={() => setLiveTail(!liveTail)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border shadow-sm ${
                  liveTail 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                    : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50 hover:text-zinc-200'
                }`}
              >
                {liveTail ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                {liveTail ? 'Live Tail Active' : 'Live Tail Paused'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              {/* Method Filter */}
              <div className="w-full sm:w-[130px]">
                <CustomSelect
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: "", label: "All Methods" },
                    { value: "GET", label: "GET" },
                    { value: "POST", label: "POST" },
                    { value: "PUT", label: "PUT" },
                    { value: "DELETE", label: "DELETE" }
                  ]}
                />
              </div>

              {/* Status Filter */}
              <div className="w-full sm:w-[150px]">
                <CustomSelect
                  value={statusCode}
                  onChange={setStatusCode}
                  options={[
                    { value: "", label: "All Statuses" },
                    { value: "200", label: "200 OK" },
                    { value: "400", label: "400 Bad Request" },
                    { value: "404", label: "404 Not Found" },
                    { value: "500", label: "500 Server Error" },
                    { value: "ERROR", label: "Any Error (OTLP)" }
                  ]}
                />
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-[260px] group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search URL, trace ID..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-zinc-900/80 border border-zinc-800/80 text-zinc-200 text-[13px] rounded-lg pl-9 pr-3 h-9 w-full focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-sm placeholder:text-zinc-600 hover:bg-zinc-800/50"
                />
              </div>

            </div>
          </div>


        {/* HISTOGRAM CHART */}
        <div className="w-full h-[220px] rounded-xl border border-zinc-800/80 bg-zinc-950/50 backdrop-blur-sm overflow-hidden shadow-2xl shadow-indigo-900/5 p-5 mb-6 flex flex-col relative group">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[14px] font-bold text-zinc-200 flex items-center gap-2.5">
              <BarChart2 className="h-4 w-4 text-indigo-400" />
              Request Volume & Latency
            </div>
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider bg-zinc-900/80 px-3 py-1.5 rounded-full border border-zinc-800/80 shadow-inner">
              Last 1 Hour
            </div>
          </div>
          
          <div className="flex-1 w-full min-h-0 mt-2">
            {histogramData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={histogramData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.9}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.2}/>
                    </linearGradient>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(63, 63, 70, 0.5)', borderRadius: '12px', fontSize: '12px', color: '#fff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ color: '#e4e4e7', fontWeight: 600, padding: '4px 0', textTransform: 'capitalize' }}
                    labelStyle={{ color: '#a1a1aa', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}
                    labelFormatter={(lbl) => new Date(lbl).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  
                  <XAxis dataKey="bucket" hide />
                  <YAxis yAxisId="left" hide domain={['auto', 'auto']} />
                  <YAxis yAxisId="right" orientation="right" hide domain={['auto', 'auto']} />
                  
                  <Bar yAxisId="left" dataKey="volume" fill="url(#colorVolume)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  
                  <Area type="monotone" yAxisId="right" dataKey="p90" name="P90 Latency (ms)" stroke="#34d399" strokeWidth={3} fill="url(#colorLatency)" activeDot={{ r: 5, fill: '#34d399', stroke: '#050505', strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 text-[13px] gap-3">
                <Clock className="h-6 w-6 opacity-20 animate-pulse" />
                Waiting for trace data...
              </div>
            )}
          </div>
        </div>

        {/* TRACES TABLE */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 backdrop-blur-sm overflow-hidden shadow-2xl shadow-indigo-900/5">
          <div className="flex items-center gap-4 px-6 py-3.5 border-b border-zinc-800/80 bg-zinc-900/40 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
            <div className="w-[100px] shrink-0">Time</div>
            <div className="w-[80px] shrink-0">Method</div>
            <div className="flex-1 min-w-0">URL / Name</div>
            <div className="w-[100px] shrink-0 text-right">Duration</div>
            <div className="w-[120px] shrink-0 text-right">Status / Code</div>
          </div>

          <div className="divide-y divide-zinc-800/60 flex flex-col">
            {filteredTraces.length === 0 ? (
              <div className="py-20 text-center text-zinc-500 text-[14px]">
                {loading ? 'Loading traces...' : 'No traces found matching your criteria.'}
              </div>
            ) : (
              filteredTraces.map((trace) => {
                const isError = trace.status_code === 2 || (trace.attributes?.['http.status_code'] && trace.attributes['http.status_code'] >= 500);
                const isExpanded = expandedTraceId === trace.trace_id;
                const method = trace.attributes?.['http.method'] || '-';
                const url = trace.attributes?.['http.url'] || trace.name || 'Unknown Trace';
                const code = trace.attributes?.['http.status_code'];
                const statusColor = getStatusColor(code);

                return (
                  <React.Fragment key={trace.span_id}>
                    {/* Main Row */}
                    <div 
                      onClick={() => toggleTrace(trace.trace_id)}
                      className={`flex items-center gap-4 px-6 py-3.5 text-[13px] hover:bg-zinc-800/40 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-zinc-800/30' : ''
                      } ${isError ? 'bg-red-500/5 hover:bg-red-500/10' : ''}`}
                    >
                      {/* Time */}
                      <div className="w-[100px] shrink-0 text-zinc-500 font-mono text-[12px]">
                        {new Date(trace.start_time).toLocaleTimeString()}
                      </div>
                      
                      {/* Method */}
                      <div className="w-[80px] shrink-0 font-mono text-zinc-300 font-semibold">
                        {method}
                      </div>

                      {/* URL / Name */}
                      <div className="flex-1 min-w-0 flex items-center gap-2.5">
                        {isError && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                        <span className={`truncate ${isError ? 'text-red-300 font-medium' : 'text-zinc-200'}`} title={url}>
                          {url}
                        </span>
                      </div>

                      {/* Duration */}
                      <div className="w-[100px] shrink-0 text-right font-mono text-zinc-400">
                        {formatDuration(trace.duration_ms)}
                      </div>

                      {/* Status */}
                      <div className="w-[120px] shrink-0 flex items-center justify-end gap-3">
                        <span className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-bold border ${statusColor}`}>
                          {code || (isError ? 'ERROR' : 'OK')}
                        </span>
                        <ChevronRight className={`h-4 w-4 text-zinc-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    {/* Details Panel */}
                    {isExpanded && <TraceDetails trace={trace} />}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
