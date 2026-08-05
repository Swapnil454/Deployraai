"use client";

import React, { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Play, Search, MousePointerClick, Zap, CheckCircle2, XCircle, Clock, Mail, User, Activity, Moon, AlertCircle, Plus } from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'completed':
      return <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#22c55e]"><div className="w-2 h-2 rounded-full bg-[#22c55e]" /> Completed</span>;
    case 'sleeping':
      return <span className="flex items-center gap-1.5 text-[13px] font-bold text-indigo-400"><div className="w-2 h-2 rounded-full bg-indigo-400" /> Sleeping</span>;
    case 'failed':
      return <span className="flex items-center gap-1.5 text-[13px] font-bold text-red-500"><div className="w-2 h-2 rounded-full bg-red-500" /> Failed</span>;
    case 'cancelled':
      return <span className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-400"><div className="w-2 h-2 rounded-full bg-zinc-400" /> Cancelled</span>;
    default:
      return <span className="flex items-center gap-1.5 text-[13px] font-bold text-blue-500"><div className="w-2 h-2 rounded-full bg-blue-500" /> Running</span>;
  }
};

const getPathColor = (status: string) => {
  if (status === 'completed') return '#22c55e';
  if (status === 'sleeping') return '#6366f1';
  if (status === 'failed' || status === 'failed_retrying') return '#ef4444';
  if (status === 'cancelled') return '#52525b';
  return '#3b82f6';
};

const getStepIcon = (name: string, status: string) => {
  const n = (name || '').toLowerCase();
  
  if (status === 'sleeping') return <Moon className="w-7 h-7 text-indigo-400 drop-shadow-md" />;
  if (status === 'failed' || status === 'failed_retrying') return <AlertCircle className="w-7 h-7 text-red-500 drop-shadow-md" />;
  
  if (n.includes('email') || n.includes('mail')) return <Mail className="w-7 h-7 text-zinc-300 drop-shadow-md" />;
  if (n.includes('user') || n.includes('account')) return <User className="w-7 h-7 text-zinc-300 drop-shadow-md" />;
  if (n.includes('wait') || n.includes('sleep') || n.includes('delay')) return <Clock className="w-7 h-7 text-zinc-300 drop-shadow-md" />;
  
  return <Activity className="w-7 h-7 text-zinc-300 drop-shadow-md" />;
};

const InfographicTimelineNode = React.memo(({ event, index, isLast }: { event: any, index: number, isLast: boolean }) => {
  const isTop = index % 2 !== 0; // Odd index => Circle on Top
  const stepNumber = String(index + 1).padStart(2, '0');
  
  const pathColor = getPathColor(event.status);
  
  let textColorClass = 'text-blue-500';
  let badgeBgClass = 'bg-blue-500/20';
  let isPulsing = false;
  
  if (event.status === 'completed') {
    textColorClass = 'text-[#22c55e]';
    badgeBgClass = 'bg-[#22c55e]/20';
  } else if (event.status === 'sleeping') {
    textColorClass = 'text-indigo-400';
    badgeBgClass = 'bg-indigo-500/20';
    isPulsing = isLast;
  } else if (event.status === 'failed' || event.status === 'failed_retrying') {
    textColorClass = 'text-red-500';
    badgeBgClass = 'bg-red-500/20';
    isPulsing = isLast && event.status === 'failed_retrying';
  } else if (event.status === 'cancelled') {
    textColorClass = 'text-zinc-400';
    badgeBgClass = 'bg-zinc-600/20';
  } else {
    isPulsing = isLast;
  }

  const circleY = isTop ? 30 : 150;
  const infoY = isTop ? 120 : 50;

  const outerBg = isTop ? `radial-gradient(circle at bottom left, ${pathColor}, ${pathColor}80)` : `radial-gradient(circle at top left, ${pathColor}, ${pathColor}80)`;
  const outerShadow = isTop 
    ? `inset 0 -4px 6px rgba(255,255,255,0.4), inset 0 4px 8px rgba(0,0,0,0.5), 0 -15px 35px -5px ${pathColor}90` 
    : `inset 0 4px 6px rgba(255,255,255,0.4), inset 0 -4px 8px rgba(0,0,0,0.5), 0 15px 35px -5px ${pathColor}90`;
    
  const innerBg = isTop ? `radial-gradient(circle at bottom left, #3a3a3a 0%, #0a0a0a 100%)` : `radial-gradient(circle at top left, #3a3a3a 0%, #0a0a0a 100%)`;
  const innerShadow = isTop
    ? `inset 0 -2px 4px rgba(255,255,255,0.2), inset 0 4px 8px rgba(0,0,0,0.8), 0 -10px 20px rgba(0,0,0,0.9)`
    : `inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -4px 8px rgba(0,0,0,0.8), 0 10px 20px rgba(0,0,0,0.9)`;

  const Circle = (
    <div 
      className={`absolute w-20 h-20 rounded-full flex items-center justify-center shrink-0 ${isPulsing ? 'animate-pulse' : ''}`} 
      style={{ 
        background: outerBg,
        boxShadow: outerShadow,
        top: circleY,
        left: 50 // 180/2 - 40
      }}
    >
      <div 
        className="w-[64px] h-[64px] rounded-full flex flex-col items-center justify-center z-10"
        style={{
          background: innerBg,
          boxShadow: innerShadow,
          border: `1px solid rgba(255,255,255,0.05)`
        }}
      >
        {getStepIcon(event.label || event.stepName, event.status)}
      </div>
    </div>
  );

  const Info = (
    <div 
      className={`absolute flex flex-col items-center text-center w-[130px] px-1 ${!isTop ? 'justify-end' : ''}`} 
      style={{ 
        top: infoY,
        left: 25, // 180/2 - 130/2
        height: 90
      }}
    >
      <span className="text-[9px] leading-[1.2] font-bold text-zinc-200 uppercase mb-1 line-clamp-2 w-full break-all" title={event.label || event.stepName}>
        {event.label || event.stepName}
      </span>
      <span className={`text-[9px] font-bold px-2 py-[1px] rounded-full ${textColorClass} ${badgeBgClass}`}>
        {event.status.toUpperCase()}
      </span>
      {event.executedAt && (
        <span className="text-[9px] text-zinc-500 mt-1">
          {new Date(event.executedAt).toLocaleTimeString()}
        </span>
      )}
      {event.status === 'sleeping' && event.resumeAt && (
        <span className="text-[9px] text-indigo-300 mt-1 font-bold">
          Resumes: {new Date(event.resumeAt).toLocaleTimeString()}
        </span>
      )}
      {event.attempts > 1 && (
        <span className="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-[1px] rounded-sm mt-1">
          {event.attempts} attempts
        </span>
      )}
    </div>
  );

  return (
    <div className="absolute top-0 bottom-0" style={{ left: index * 180, width: 180 }}>
      {Circle}
      {Info}
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.index === nextProps.index &&
         prevProps.isLast === nextProps.isLast &&
         prevProps.event.status === nextProps.event.status &&
         prevProps.event.executedAt === nextProps.event.executedAt &&
         prevProps.event.attempts === nextProps.event.attempts &&
         prevProps.event.resumeAt === nextProps.event.resumeAt;
});

const InfographicTimeline = React.memo(({ events }: { events: any[] }) => {
  const stepWidth = 180;
  const containerWidth = Math.max(events.length * stepWidth, 200);

  return (
    <div className="relative h-[260px] overflow-visible mt-4 mb-2 shrink-0" style={{ width: containerWidth, minWidth: containerWidth }}>
      {/* Background SVG Snake */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none', filter: 'drop-shadow(0px 8px 6px rgba(0,0,0,0.3))' }}>
        {events.map((event, i) => {
          if (i === events.length - 1) return null; // no path from last element
          const nextEvent = events[i + 1];
          const isTop = i % 2 !== 0; // odd is top
          
          const x1 = i * stepWidth + (stepWidth / 2);
          const y1 = isTop ? 70 : 190;
          const x2 = (i + 1) * stepWidth + (stepWidth / 2);
          const y2 = isTop ? 190 : 70;
          const midX = (x1 + x2) / 2;
          
          const strokeColor = getPathColor(nextEvent.status);

          return (
            <g key={`path-group-${i}`}>
              {/* Outer dark bevel edge */}
              <path
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#000"
                strokeOpacity="0.4"
                strokeWidth="28"
                strokeLinecap="round"
              />
              {/* Main colored core */}
              <path
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth="22"
                strokeLinecap="round"
                className="transition-colors duration-500"
              />
              {/* Sharp center specular reflection */}
              <path
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#fff"
                strokeOpacity="0.3"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
      
      {/* Nodes */}
      {events.map((event, i) => (
        <InfographicTimelineNode key={`node-${i}`} event={event} index={i} isLast={i === events.length - 1} />
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.events.length !== nextProps.events.length) return false;
  for (let i = 0; i < prevProps.events.length; i++) {
    const p = prevProps.events[i];
    const n = nextProps.events[i];
    if (p.status !== n.status || p.executedAt !== n.executedAt || p.resumeAt !== n.resumeAt || p.attempts !== n.attempts) {
      return false;
    }
  }
  return true;
});

const getWorkflowTitle = (run: any) => {
  if (run.workflowName === 'project-deployment-pipeline') {
    const target = run.payload?.target || 'project';
    const reason = run.payload?.commitMessage || run.payload?.triggerReason || 'manual';
    const capitalizedTarget = target.charAt(0).toUpperCase() + target.slice(1);
    return `${capitalizedTarget} Deployment • ${reason}`;
  }
  return run.workflowName;
};

const ProjectSelector = () => {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  const lastUpdated = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const delay = 300;     
    const maxWait = 1000;  

    if (now - lastUpdated.current >= maxWait) {
      setDebouncedSearch(searchQuery);
      lastUpdated.current = now;
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDebouncedSearch(searchQuery);
        lastUpdated.current = Date.now();
      }, delay);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [searchQuery]);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjects(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div 
      className="w-full flex-1 flex flex-col items-center bg-black px-8" 
      style={{ paddingTop: '11vh' }}
    >
      <div className="max-w-sm w-full flex flex-col items-center">
        {/* Header Icon & Text */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-10 w-10 rounded-xl border border-zinc-800 flex items-center justify-center mb-4 bg-zinc-900/50">
            <Activity className="h-5 w-5 text-zinc-400" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-1">Continue to Workflows</h1>
          <p className="text-[14px] text-zinc-400">Choose a project to continue</p>
        </div>

        {/* Content Area */}
        <div className="w-full flex flex-col gap-0">
          {/* Search Bar */}
          <input
            type="text"
            placeholder="Find Project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-[14px] font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-all mb-2"
          />

          {/* Project List */}
          <div className="flex flex-col gap-1 w-full max-h-[300px] overflow-y-auto pr-1">
            {loadingProjects ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 text-zinc-500 animate-spin" />
              </div>
            ) : projects.length > 0 ? (
              projects.map((p: any) => (
                <button
                  key={p._id}
                  onClick={() => router.push(`/dashboard/workflows?projectId=${p._id}`)}
                  className="w-full flex items-center gap-3 py-1.5 px-3 rounded-md hover:bg-zinc-900 text-left transition-colors group bg-[#0a0a0a]/50"
                >
                  <div className="h-5 w-5 shrink-0 flex items-center justify-center overflow-hidden rounded-full">
                    <ProjectAvatar project={p} />
                  </div>
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white truncate">
                    {p.repoName}
                  </span>
                </button>
              ))
            ) : (
              <div className="text-center py-4 text-[13px] text-zinc-500">
                No projects found.
              </div>
            )}
          </div>

          {/* Create Project Link */}
          <button
            onClick={() => router.push('/dashboard/new-deployment')}
            className="w-full flex items-center gap-2 py-1.5 px-3 rounded-md hover:bg-zinc-900 text-left transition-colors text-zinc-400 hover:text-white"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Create Project</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const WorkflowsContent = () => {
  const searchParams = useSearchParams();
  const projectId = searchParams?.get('projectId');
  
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState([]);
  const [triggering, setTriggering] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [counts, setCounts] = useState({ all: 0, completed: 0, running: 0, failed: 0, cancelled: 0 });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchRuns = useCallback(async () => {
    if (!projectId || projectId === 'all') {
      setRuns([]);
      setCounts({ all: 0, completed: 0, running: 0, failed: 0, cancelled: 0 });
      setLoading(false);
      return;
    }
    try {
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/projects/${projectId}/workflows`);
      if (statusFilter !== 'all') url.searchParams.append('status', statusFilter);
      if (debouncedSearchQuery) url.searchParams.append('search', debouncedSearchQuery);

      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
        if (data.counts) setCounts(data.counts);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, debouncedSearchQuery]);

  useEffect(() => {
    setLoading(true);
    fetchRuns();
  }, [projectId, fetchRuns]);

  useEffect(() => {
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  const handleTrigger = async () => {
    if (!projectId || projectId === 'all') return;
    setTriggering(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/workflows/welcome-email-sequence/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `user_${Math.floor(Math.random()*1000)}@example.com` }),
        credentials: 'include'
      });
      if (res.ok) {
        await fetchRuns();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  const handleRetry = async (runId: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/workflows/${runId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) await fetchRuns();
    } catch (err) { console.error(err); }
  };

  const handleCancel = async (runId: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/workflows/${runId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) await fetchRuns();
    } catch (err) { console.error(err); }
  };

  const filters = [
    { id: 'all', label: 'All Runs', count: counts.all },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'running', label: 'Running', count: counts.running },
    { id: 'failed', label: 'Failed', count: counts.failed },
    { id: 'cancelled', label: 'Cancelled', count: counts.cancelled }
  ];

  // Using backend-filtered runs directly
  const filteredRuns = runs;

  if (!projectId || projectId === 'all') {
    return <ProjectSelector />;
  }

  return (
    <div className="w-full flex flex-col min-h-full">
      <div className="p-8 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Durable Workflows</h1>
              <p className="text-zinc-400 text-sm">Monitor and manage your long-running background tasks with deterministic replay.</p>
            </div>
            
            {projectId && projectId !== 'all' && (
              <button 
                onClick={handleTrigger}
                disabled={triggering}
                className="bg-[#5c6dff] hover:bg-[#4b5ae6] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Trigger Test Workflow
              </button>
            )}
          </div>

          {/* Filter Bar - Always visible if a project is selected */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar w-full md:w-auto">
                  {filters.map(filter => {
                    const isActive = filter.id === statusFilter;
                    return (
                      <button
                        key={filter.id}
                        onClick={() => setStatusFilter(filter.id)}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all whitespace-nowrap ${
                          isActive 
                            ? 'bg-zinc-100 text-black shadow-sm' 
                            : 'bg-zinc-800/40 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                      >
                        {filter.label}
                        <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
                          isActive ? 'bg-zinc-300 text-black' : 'bg-zinc-800/80 text-zinc-500'
                        }`}>
                          {filter.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                
                <div className="relative flex-1 md:max-w-md w-full">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search workflows by ID, name, or commit message..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-[#0a0a0a] border border-zinc-800 rounded-md pl-9 pr-4 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 w-full transition-all" 
                  />
                </div>
              </div>

              {loading && runs.length === 0 ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
                </div>
              ) : filteredRuns.length === 0 ? (
                <div className="text-center py-20 border border-zinc-800/50 bg-[#0a0a0a] rounded-xl">
                  <Zap className="h-10 w-10 text-zinc-800 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-white mb-1">No Workflows Found</h3>
                  <p className="text-zinc-500 text-sm max-w-md mx-auto mb-6">
                    {runs.length === 0 ? "Trigger a test workflow to see durable execution in action." : "No workflows match your search query."}
                  </p>
                  {runs.length === 0 && (
                    <button 
                      onClick={handleTrigger}
                      disabled={triggering}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
                    >
                      {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Trigger Now
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRuns.map((run: any) => (
                    <div key={run._id} className="border border-zinc-800/60 bg-[#0a0a0a] rounded-xl shadow-lg relative overflow-hidden flex flex-col">
                      
                      {/* Actions that appear on hover in top right corner */}
                      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity z-10">
                        {run.status === 'failed' && (
                          <button onClick={() => handleRetry(run._id)} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded transition-colors border border-zinc-700 shadow-sm">
                            Retry
                          </button>
                        )}
                        {['running', 'sleeping', 'failed_retrying'].includes(run.status) && (
                          <button onClick={() => handleCancel(run._id)} className="text-xs bg-[#1a1010] hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/20 text-red-500/80 px-3 py-1.5 rounded transition-colors border border-red-900/50 shadow-sm">
                            Cancel
                          </button>
                        )}
                      </div>

                      {/* Card Header */}
                      <div className="bg-[#141414] border-b border-zinc-800/80 px-6 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 group hover:[&>div]:opacity-100">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-white font-bold text-[16px] tracking-wide break-words max-w-full leading-tight" title={getWorkflowTitle(run)}>{getWorkflowTitle(run)}</h3>
                            <StatusBadge status={run.status} />
                          </div>
                          <p className="text-[11px] text-zinc-500 font-mono">ID: {run._id}</p>
                        </div>
                        
                        <div className="text-right text-xs pt-1 sm:pr-16 md:pr-0">
                          <div className="text-zinc-500">Started: <span className="text-zinc-200 font-bold">{new Date(run.createdAt).toLocaleString()}</span></div>
                          {run.status === 'sleeping' && run.resumeAt && (
                            <div className="text-indigo-400 mt-1 font-bold">Resumes: {new Date(run.resumeAt).toLocaleTimeString()}</div>
                          )}
                          {run.status === 'cancelled' && run.cancelledAt && (
                            <div className="text-zinc-500 mt-1 font-bold">Cancelled at {new Date(run.cancelledAt).toLocaleTimeString()}</div>
                          )}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-6">
                        <h4 className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest mb-6">Execution Flow</h4>
                        <div className="flex items-start overflow-x-auto pb-2 hide-scrollbar">
                          {(!run.events || run.events.length === 0) && Object.keys(run.ledger || {}).length === 0 ? (
                            <div className="text-sm text-zinc-600 italic">No steps executed yet.</div>
                          ) : (
                            <InfographicTimeline events={
                              run.events && run.events.length > 0 
                                ? run.events 
                                : Object.entries(run.ledger).map(([stepName, state]) => ({ stepName, ...(state as any) }))
                            } />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

        </div>
      </div>
    </div>
  );
};

export default function WorkflowsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>}>
      <WorkflowsContent />
    </Suspense>
  );
}
