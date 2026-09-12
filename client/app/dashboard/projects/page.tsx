"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LayoutGrid, List, Search, GitBranch, CheckCircle2, MoreHorizontal, Plus, Check, CheckCheck } from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";

const ProductionChecklistStatus = ({ project }: { project: any }) => {
  let hasFrontend = project.configuration?.frontendPlatform && project.configuration.frontendPlatform !== 'none';
  let hasBackend = project.configuration?.backendPlatform && project.configuration.backendPlatform !== 'none';
  
  if (!project.configuration || (!hasFrontend && !hasBackend)) {
    hasFrontend = true;
    hasBackend = false;
  }
  
  const totalComponents = (hasFrontend ? 1 : 0) + (hasBackend ? 1 : 0);

  const frontendMonitor = project.monitors?.find((m: any) => m.type === 'frontend');
  const backendMonitor = project.monitors?.find((m: any) => m.type === 'backend');

  const isDeployed = project.status === 'deployed' || ['success', 'completed'].includes(project.latestDeployment?.status);
  const isMonitorOk = (monitor: any) => !monitor || monitor.status === 'online' || monitor.status === 'unknown';

  const frontendActive = hasFrontend && isDeployed && isMonitorOk(frontendMonitor);
  const backendActive = hasBackend && isDeployed && isMonitorOk(backendMonitor);

  const activeComponents = (frontendActive ? 1 : 0) + (backendActive ? 1 : 0);
  
  const circumference = 62.8318;
  const gap = 8;
  const segmentLength = (circumference - gap * 2) / 2;
  const offsetStart = gap / 2; 

  return (
    <div className="relative h-6 w-6 rounded-full flex items-center justify-center group/checklist cursor-help" title="Production Checklist">
      <svg className="absolute inset-0 h-6 w-6 -rotate-[60deg] transform" viewBox="0 0 24 24">
        {totalComponents === 2 ? (
          <circle cx="12" cy="12" r="10" stroke="#334155" strokeWidth="2.5" fill="none" strokeDasharray={`${segmentLength} ${gap}`} strokeDashoffset={-offsetStart} strokeLinecap="round" />
        ) : (
          <circle cx="12" cy="12" r="10" stroke="#334155" strokeWidth="2.5" fill="none" />
        )}
      </svg>
      
      {totalComponents === 2 ? (
        <svg className="absolute inset-0 h-6 w-6 -rotate-[60deg] transform transition-all duration-500" viewBox="0 0 24 24">
          <circle 
            cx="12" cy="12" r="10" 
            stroke={frontendActive ? "#3b82f6" : "transparent"} 
            strokeWidth="2.5" 
            fill="none" 
            strokeDasharray={`${segmentLength} ${circumference - segmentLength}`} 
            strokeDashoffset={-offsetStart}
            strokeLinecap="round"
          />
          <circle 
            cx="12" cy="12" r="10" 
            stroke={backendActive ? "#3b82f6" : "transparent"} 
            strokeWidth="2.5" 
            fill="none" 
            strokeDasharray={`${segmentLength} ${circumference - segmentLength}`} 
            strokeDashoffset={-(offsetStart + segmentLength + gap)}
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg className="absolute inset-0 h-6 w-6 -rotate-[60deg] transform transition-all duration-500" viewBox="0 0 24 24">
          <circle 
            cx="12" cy="12" r="10" 
            stroke={activeComponents === 1 ? "#3b82f6" : "transparent"} 
            strokeWidth="2.5" 
            fill="none" 
            strokeLinecap="round"
          />
        </svg>
      )}

      <div className="z-10 flex items-center justify-center">
        {totalComponents === 2 ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M18 6 7 17l-5-5" stroke={frontendActive ? "#3b82f6" : "#94a3b8"} />
            <path d="m22 10-7.5 7.5L13 16" stroke={backendActive ? "#3b82f6" : "#94a3b8"} />
          </svg>
        ) : (
          <Check className="h-3.5 w-3.5" color={activeComponents === 1 ? "#3b82f6" : "#94a3b8"} strokeWidth={2.5} />
        )}
      </div>
    </div>
  );
};

const formatRelativeTime = (dateString: string) => {
  if (!dateString) return 'just now';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return `just now`;
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  useEffect(() => {
    const savedMode = localStorage.getItem('deployai_projects_view_mode') as 'grid' | 'list';
    if (savedMode === 'grid' || savedMode === 'list') {
      setViewMode(savedMode);
    }
  }, []);

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('deployai_projects_view_mode', mode);
  };

  const lastUpdated = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const delay = 300;     // Debounce wait time
    const maxWait = 1000;  // Throttle limit (maximum wait time before forcing a search)

    if (now - lastUpdated.current >= maxWait) {
      // Throttle condition met: Force update if maxWait elapsed
      setDebouncedSearch(searchQuery);
      lastUpdated.current = now;
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      // Standard debounce
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
    <div className="relative w-full flex flex-col min-h-full overflow-hidden">
      {/* Page Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 p-8 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 border-b border-zinc-800/60 pb-8">
            <div className="relative w-full flex-1 max-w-xl">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none z-10">
                <Search className="h-5 w-5 text-zinc-400" />
              </div>
              <input
                type="text"
                placeholder="Search Projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-800/40 hover:bg-zinc-800/60 border border-zinc-700/50 rounded-xl h-12 pl-[44px] pr-4 text-[15px] text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500 focus:bg-zinc-800/80 focus:ring-1 focus:ring-zinc-500 transition-all backdrop-blur-md shadow-sm relative z-0"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center p-1 bg-zinc-800/40 backdrop-blur-md border border-zinc-700/50 rounded-xl h-12 shrink-0">
                <button
                  onClick={() => handleViewModeChange('grid')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'}`}
                >
                  <LayoutGrid className="h-[18px] w-[18px]" />
                </button>
                <button
                  onClick={() => handleViewModeChange('list')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'}`}
                >
                  <List className="h-[18px] w-[18px]" />
                </button>
              </div>
              <button 
                onClick={() => router.push('/dashboard/new-deployment')}
                className="h-12 px-5 bg-white hover:bg-zinc-200 text-black rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.3)] whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" /> Add New Project
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="w-full">
            {loadingProjects ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
              </div>
            ) : projects.length === 0 ? (
              <div className="w-full relative flex flex-col items-center justify-center py-24 px-4 text-center overflow-hidden bg-transparent">
                {/* Background Grid Pattern */}
                <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M0 40V0H40" fill="none" stroke="white" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid-pattern)"/>
                </svg>
                
                {/* Subtle Emerald Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />

                <div className="relative z-10 h-16 w-16 rounded-[1rem] bg-gradient-to-br from-zinc-700/80 to-zinc-900 border border-zinc-600/50 flex items-center justify-center mb-5 shadow-lg shadow-black/50">
                   {searchQuery ? (
                     <Search className="h-6 w-6 text-zinc-300" />
                   ) : (
                     <svg className="h-8 w-8 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                     </svg>
                   )}
                </div>
                
                <h3 className="relative z-10 text-xl md:text-2xl font-extrabold text-white mb-3 tracking-tight">
                  {searchQuery ? "No projects found" : "Ready to deploy?"}
                </h3>
                
                <p className="relative z-10 text-sm md:text-[15px] text-zinc-400 max-w-md mb-8 leading-relaxed">
                  {searchQuery 
                    ? `We couldn't find any projects matching "${searchQuery}". Please try a different search term.` 
                    : "You haven't created any projects yet. Connect a repository and deploy your first full-stack application in minutes."}
                </p>
                
                {!searchQuery && (
                  <button 
                    onClick={() => router.push('/dashboard/new-deployment')}
                    className="relative z-10 group px-6 py-2.5 bg-white text-black rounded-xl text-sm font-bold hover:bg-zinc-100 transition-all duration-300 active:scale-95 flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] border border-transparent"
                  >
                    <Plus className="h-4 w-4" />
                    Create New Project
                    <svg className="h-4 w-4 opacity-0 -ml-5 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "flex flex-col rounded-xl border border-zinc-700/50 bg-zinc-800/20 backdrop-blur-md overflow-hidden shadow-xl"}>
                {projects.map((project: any) => (
                  viewMode === 'grid' ? (
                    <div 
                      key={project._id} 
                      className="group flex flex-col border border-zinc-700/50 bg-gradient-to-b from-zinc-800/40 to-zinc-900/60 backdrop-blur-xl rounded-2xl hover:border-zinc-600/80 hover:from-zinc-700/40 hover:to-zinc-800/60 transition-all duration-300 cursor-pointer overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:-translate-y-1 h-[220px]"
                      onClick={() => router.push(`/dashboard/projects/${project._id}/${project.status === 'configured' ? 'deploy' : 'overview'}`)}
                    >
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 shrink-0 flex items-center justify-center overflow-hidden rounded-full shadow-inner border border-zinc-600/50 bg-zinc-800/50">
                              <ProjectAvatar project={project} />
                            </div>
                            <div>
                              <h3 className="font-bold text-white text-[16px] group-hover:text-blue-400 transition-colors leading-tight mb-1 drop-shadow-sm">{project.repoName}</h3>
                              <p className="text-[13px] text-zinc-400 font-medium">{project.repoName}.deployai.app</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {(project.status === 'deploying' || ['queued', 'running'].includes(project.latestDeployment?.status)) ? (
                              <div className="h-6 w-6 rounded-full border border-zinc-600 flex items-center justify-center bg-zinc-900" title="Deploying...">
                                <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                              </div>
                            ) : (
                              <ProductionChecklistStatus project={project} />
                            )}
                            <button className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-zinc-700/60 transition-colors text-zinc-400 group-hover:text-white">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="mt-auto pt-4 border-t border-zinc-700/50">
                          <a 
                            href={`https://github.com/${project.repoFullName}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-full text-xs font-medium font-mono transition-colors border border-zinc-600/50 shadow-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-white" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.45-1.15-1.1-1.46-1.1-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"></path></svg>
                            <span className="truncate max-w-[200px]">{project.repoFullName}</span>
                          </a>
                          
                          <div className="flex flex-col gap-1 mt-3.5">
                            {project.latestDeployment?.source?.commitMessage ? (
                              <a 
                                href={`https://github.com/${project.repoFullName}/commit/${project.latestDeployment.source.commitSha}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-sm font-medium text-zinc-200 hover:text-blue-400 hover:underline transition-colors"
                                onClick={(e) => e.stopPropagation()}
                                title={project.latestDeployment.source.commitMessage}
                              >
                                {project.latestDeployment.source.commitMessage}
                              </a>
                            ) : (
                              <span className="truncate text-sm font-medium text-zinc-500 italic">No deployments yet</span>
                            )}
                            <div className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-400">
                              <span>{formatRelativeTime(project.updatedAt)}</span>
                              <span>on</span>
                              <span className="flex items-center gap-1 text-zinc-300 font-medium">
                                <GitBranch className="h-3.5 w-3.5" /> {project.selectedBranch || 'main'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      key={project._id} 
                      className="group flex items-center justify-between border-b border-zinc-700/50 bg-transparent px-6 py-5 hover:bg-gradient-to-r hover:from-zinc-800/60 hover:to-transparent transition-all duration-300 cursor-pointer last:border-b-0 relative overflow-hidden"
                      onClick={() => router.push(`/dashboard/projects/${project._id}/${project.status === 'configured' ? 'deploy' : 'overview'}`)}
                    >
                      {/* Hover Highlight Bar */}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-500 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                      
                      <div className="flex items-center gap-4 w-[30%] min-w-0 transition-transform duration-300 group-hover:translate-x-1">
                        <div className="h-10 w-10 shrink-0 flex items-center justify-center overflow-hidden rounded-full shadow-inner border border-zinc-600/50 bg-zinc-800/50">
                          <ProjectAvatar project={project} />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-bold text-white text-[15px] truncate group-hover:text-blue-400 transition-colors drop-shadow-sm">{project.repoName}</h3>
                          <p className="text-[13px] text-zinc-400 truncate font-medium">{project.repoName}.deployai.app</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 w-[35%] min-w-0 hidden md:flex transition-transform duration-300 group-hover:translate-x-1">
                        {project.latestDeployment?.source?.commitMessage ? (
                          <a 
                            href={`https://github.com/${project.repoFullName}/commit/${project.latestDeployment.source.commitSha}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-[13.5px] font-medium text-zinc-200 hover:text-blue-400 hover:underline transition-colors"
                            onClick={(e) => e.stopPropagation()}
                            title={project.latestDeployment.source.commitMessage}
                          >
                            {project.latestDeployment.source.commitMessage}
                          </a>
                        ) : (
                          <span className="truncate text-[13.5px] font-medium text-zinc-500 italic">No deployments yet</span>
                        )}
                        <div className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-400">
                          <span>{formatRelativeTime(project.updatedAt)}</span>
                          <span>on</span>
                          <span className="flex items-center gap-1 text-zinc-300 font-medium">
                            <GitBranch className="h-3 w-3" /> {project.selectedBranch || 'main'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-6 w-[35%] shrink-0">
                        <a 
                          href={`https://github.com/${project.repoFullName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-full text-xs font-medium font-mono transition-colors hidden xl:flex border border-zinc-600/50 shadow-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-white" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.45-1.15-1.1-1.46-1.1-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"></path></svg>
                          <span className="truncate max-w-[150px]">{project.repoFullName}</span>
                        </a>
                        
                        <div className="flex items-center gap-3">
                          {(project.status === 'deploying' || ['queued', 'running'].includes(project.latestDeployment?.status)) ? (
                            <div className="h-6 w-6 rounded-full border border-zinc-700 flex items-center justify-center bg-black" title="Deploying...">
                              <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                            </div>
                          ) : (
                            <ProductionChecklistStatus project={project} />
                          )}
                          <button className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-zinc-800 transition-colors text-zinc-400 group-hover:text-white">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}