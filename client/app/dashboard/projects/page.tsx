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
    hasBackend = true;
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

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
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
    <div className="w-full flex flex-col min-h-full">
      <div className="p-8 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
            <div className="relative w-full flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-zinc-500" />
              <input
                type="text"
                placeholder="Search Projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0a0a0a] hover:bg-[#111] border border-zinc-800 rounded-lg h-11 pl-[42px] pr-4 text-base font-medium text-zinc-200 placeholder-zinc-500 placeholder:font-medium focus:outline-none focus:border-zinc-600 focus:bg-[#111] transition-all"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center p-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg h-11 shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
              <button 
                onClick={() => router.push('/dashboard/new-deployment')}
                className="h-11 px-4 bg-white hover:bg-zinc-200 text-black rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" /> Add New...
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="w-full">
            {loadingProjects ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-zinc-800 rounded-lg border-dashed">
                <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-zinc-500" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No projects found</h3>
                <p className="text-zinc-400 max-w-sm mb-6">
                  {searchQuery ? "We couldn't find any projects matching your search." : "You haven't created any projects yet."}
                </p>
                {!searchQuery && (
                  <button 
                    onClick={() => router.push('/dashboard/new-deployment')}
                    className="px-4 py-2 bg-white text-black rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors"
                  >
                    Create your first project
                  </button>
                )}
              </div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col rounded-lg border border-zinc-800 overflow-hidden"}>
                {projects.map((project: any) => (
                  viewMode === 'grid' ? (
                    <div 
                      key={project._id} 
                      className="group flex flex-col border border-zinc-800 bg-[#0a0a0a] rounded-xl hover:border-zinc-700 transition-all cursor-pointer overflow-hidden hover:shadow-lg hover:shadow-black/50 h-[220px]"
                      onClick={() => router.push(`/dashboard/projects/${project._id}/${project.status === 'configured' ? 'deploy' : 'overview'}`)}
                    >
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 shrink-0 flex items-center justify-center overflow-hidden rounded-full">
                              <ProjectAvatar project={project} />
                            </div>
                            <div>
                              <h3 className="font-semibold text-white text-[15px] group-hover:text-zinc-300 transition-colors leading-tight mb-1">{project.repoName}</h3>
                              <p className="text-[13px] text-zinc-500">{project.repoName}.deployai.app</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {(project.status === 'deployed' || ['success', 'completed'].includes(project.latestDeployment?.status)) ? (
                              <ProductionChecklistStatus project={project} />
                            ) : (project.status === 'deploying' || ['queued', 'running'].includes(project.latestDeployment?.status)) ? (
                              <div className="h-6 w-6 rounded-full border border-zinc-700 flex items-center justify-center bg-black" title="Deploying...">
                                <Loader2 className="h-3 w-3 text-zinc-400 animate-spin" />
                              </div>
                            ) : (
                              <div className="h-6 w-6 rounded-full border border-zinc-800 border-dashed flex items-center justify-center bg-black" title="Not deployed yet">
                              </div>
                            )}
                            <button className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-zinc-800 transition-colors text-zinc-400">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="mt-auto pt-4 border-t border-zinc-800/50">
                          <a 
                            href={`https://github.com/${project.repoFullName}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 px-3 py-1.5 rounded-full text-xs font-medium font-mono transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-white" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.45-1.15-1.1-1.46-1.1-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"></path></svg>
                            <span className="truncate max-w-[200px]">{project.repoFullName}</span>
                          </a>
                          
                          <div className="flex flex-col gap-1 mt-3">
                            {project.latestDeployment?.source?.commitMessage ? (
                              <a 
                                href={`https://github.com/${project.repoFullName}/commit/${project.latestDeployment.source.commitSha}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-sm font-medium text-zinc-200 hover:text-indigo-400 hover:underline transition-colors"
                                onClick={(e) => e.stopPropagation()}
                                title={project.latestDeployment.source.commitMessage}
                              >
                                {project.latestDeployment.source.commitMessage}
                              </a>
                            ) : (
                              <span className="truncate text-sm font-medium text-zinc-500 italic">No deployments yet</span>
                            )}
                            <div className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-400">
                              <span>{Math.max(1, Math.floor((Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24)))}d ago</span>
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
                      className="group flex items-center justify-between border-b border-zinc-800 bg-black p-4 hover:bg-zinc-900/40 transition-all cursor-pointer last:border-b-0"
                      onClick={() => router.push(`/dashboard/projects/${project._id}/${project.status === 'configured' ? 'deploy' : 'overview'}`)}
                    >
                      <div className="flex items-center gap-4 w-[30%] min-w-0">
                        <div className="h-8 w-8 shrink-0 flex items-center justify-center overflow-hidden rounded-full">
                          <ProjectAvatar project={project} />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-semibold text-white text-[15px] truncate group-hover:text-zinc-300 transition-colors">{project.repoName}</h3>
                          <p className="text-[13px] text-zinc-500 truncate">{project.repoName}.deployai.app</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-0.5 w-[35%] min-w-0 hidden md:flex">
                        {project.latestDeployment?.source?.commitMessage ? (
                          <a 
                            href={`https://github.com/${project.repoFullName}/commit/${project.latestDeployment.source.commitSha}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-[13px] font-medium text-zinc-200 hover:text-indigo-400 hover:underline transition-colors"
                            onClick={(e) => e.stopPropagation()}
                            title={project.latestDeployment.source.commitMessage}
                          >
                            {project.latestDeployment.source.commitMessage}
                          </a>
                        ) : (
                          <span className="truncate text-[13px] font-medium text-zinc-500 italic">No deployments yet</span>
                        )}
                        <div className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
                          <span>{Math.max(1, Math.floor((Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24)))}d ago</span>
                          <span>on</span>
                          <span className="flex items-center gap-1 text-zinc-400 font-medium">
                            <GitBranch className="h-3 w-3" /> {project.selectedBranch || 'main'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-6 w-[35%] shrink-0">
                        <a 
                          href={`https://github.com/${project.repoFullName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 bg-zinc-800/50 hover:bg-zinc-700/80 text-zinc-300 px-3 py-1 rounded-full text-xs font-medium font-mono transition-colors hidden xl:flex"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current text-white" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.45-1.15-1.1-1.46-1.1-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"></path></svg>
                          <span className="truncate max-w-[150px]">{project.repoFullName}</span>
                        </a>
                        
                        <div className="flex items-center gap-3">
                          {(project.status === 'deployed' || ['success', 'completed'].includes(project.latestDeployment?.status)) ? (
                            <ProductionChecklistStatus project={project} />
                          ) : (project.status === 'deploying' || ['queued', 'running'].includes(project.latestDeployment?.status)) ? (
                            <div className="h-6 w-6 rounded-full border border-zinc-700 flex items-center justify-center bg-black" title="Deploying...">
                              <Loader2 className="h-3 w-3 text-zinc-400 animate-spin" />
                            </div>
                          ) : (
                            <div className="h-6 w-6 rounded-full border border-zinc-800 border-dashed flex items-center justify-center bg-black" title="Not deployed yet">
                            </div>
                          )}
                          <button className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-zinc-800 transition-colors text-zinc-400">
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
