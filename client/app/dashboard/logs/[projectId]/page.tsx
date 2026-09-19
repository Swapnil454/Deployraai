"use client";

import React, { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, RefreshCw, Activity, GitBranch, GitCommit, CheckCircle2, RotateCcw, ArrowUpCircle, ExternalLink, MoreHorizontal, FileText } from "lucide-react";
import { DeploymentFilterBar } from "@/components/dashboard/DeploymentFilters";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";

function TimeAgoWithTooltip({ dateString }: { dateString: string }) {
  const [hovered, setHovered] = useState(false);

  const d = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let displayTime = 'just now';
  if (diffDays > 0) displayTime = `${diffDays}d ago`;
  else if (diffHours > 0) displayTime = `${diffHours}h ago`;
  else if (diffMins > 0) displayTime = `${diffMins}m ago`;
  else if (diffSecs > 0) displayTime = `${diffSecs}s ago`;

  const parts = [];
  if (diffDays > 0) parts.push(`${diffDays} day${diffDays > 1 ? 's' : ''}`);
  if (diffHours % 24 > 0) parts.push(`${diffHours % 24} hour${diffHours % 24 > 1 ? 's' : ''}`);
  if (diffMins % 60 > 0) parts.push(`${diffMins % 60} minute${diffMins % 60 > 1 ? 's' : ''}`);
  
  const fullRelative = parts.length > 0 ? `${parts.join(', ')} ago` : 'just now';

  const utcDate = d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
  const utcTime = d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const localDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const localTime = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  
  const offset = -d.getTimezoneOffset();
  const offsetSign = offset >= 0 ? '+' : '-';
  const offsetHours = Math.floor(Math.abs(offset) / 60);
  const offsetMins = Math.abs(offset) % 60;
  const tzString = `GMT${offsetSign}${offsetHours}:${offsetMins.toString().padStart(2, '0')}`;

  return (
    <div 
      className="relative flex items-center cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span>{displayTime}</span>

      {hovered && (
        <div className="absolute z-50 right-[calc(100%+12px)] top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-[#0a0a0a] border border-zinc-800 text-zinc-300 rounded-lg shadow-2xl p-3.5 text-[13px] whitespace-nowrap min-w-[320px]">
            <div className="text-zinc-400 mb-4">{fullRelative}</div>
            
            <div className="flex items-center justify-between mb-3 gap-4">
              <div className="flex items-center gap-3">
                <span className="bg-zinc-800/80 text-zinc-400 px-1.5 py-0.5 rounded text-[11px] font-medium tracking-wide w-[72px] text-center">UTC</span>
                <span className="text-zinc-200 font-medium">{utcDate}</span>
              </div>
              <span className="text-zinc-400 font-mono text-[12px]">{utcTime}</span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="bg-zinc-800/80 text-zinc-400 px-1.5 py-0.5 rounded text-[11px] font-medium tracking-wide w-[72px] text-center">{tzString}</span>
                <span className="text-zinc-200 font-medium">{localDate}</span>
              </div>
              <span className="text-zinc-400 font-mono text-[12px]">{localTime}</span>
            </div>
          </div>
          <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-l-[6px] border-l-zinc-800">
            <div className="absolute right-[1px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[5px] border-y-transparent border-l-[5px] border-l-[#0a0a0a]" />
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectLogsContent() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  
  const [project, setProject] = useState<any>(null);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  const [environment, setEnvironment] = useState('all');
  const [branch, setBranch] = useState('all');
  const [author, setAuthor] = useState('all');
  const [status, setStatus] = useState<string[]>(['all']);

  const [authorsList, setAuthorsList] = useState<{value: string, label: string}[]>([]);
  const [branchesList, setBranchesList] = useState<{value: string, label: string}[]>([]);

  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const prevFiltersRef = useRef('');

  useEffect(() => {
    if (!openActionId) return;
    const handleGlobalClick = () => setOpenActionId(null);
    const timer = setTimeout(() => {
      document.addEventListener('click', handleGlobalClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [openActionId]);

  useEffect(() => {
    if (deployments.length > 0) {
      setAuthorsList(prev => {
        const newAuthors = new Set(prev.map(p => p.value));
        deployments.forEach(d => {
          const owner = d.source?.repoOwner || d.projectId?.repoFullName?.split('/')[0] || project?.repoFullName?.split('/')[0];
          if (owner) newAuthors.add(owner);
        });
        return Array.from(newAuthors).map(a => ({ value: a as string, label: a as string }));
      });
      setBranchesList(prev => {
        const newBranches = new Set(prev.map(p => p.value));
        deployments.forEach(d => d.source?.branch && newBranches.add(d.source.branch));
        return Array.from(newBranches).map(b => ({ value: b as string, label: b as string }));
      });
    }
  }, [deployments, project]);

  const clearFilters = () => {
    setDateRange('all');
    setCustomStart('');
    setCustomEnd('');
    setEnvironment('all');
    setBranch('all');
    setAuthor('all');
    setStatus(['all']);
  };

  const fetchProjectInfo = useCallback(async () => {
    try {
      const projRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" });
      if (projRes.ok) setProject(await projRes.json());
    } catch (err) {
      console.error(err);
    }
  }, [projectId]);

  useEffect(() => { fetchProjectInfo(); }, [fetchProjectInfo]);

  const fetchDeployments = useCallback(async (currentPage: number, isLoadMore: boolean = false) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);
    
    try {
      const qParams = new URLSearchParams();
      qParams.append('page', currentPage.toString());
      qParams.append('limit', '20');
      qParams.append('projectId', projectId);
      
      if (dateRange === 'custom' && customStart && customEnd) {
         qParams.append('startDate', customStart);
         qParams.append('endDate', customEnd);
      } else if (dateRange && dateRange !== 'all') {
         qParams.append('days', dateRange);
      }
      
      if (environment && environment !== 'all') qParams.append('environment', environment);
      if (branch && branch !== 'all') qParams.append('branch', branch);
      if (author && author !== 'all') qParams.append('author', author);
      
      if (!status.includes('all') && status.length > 0) {
         qParams.append('status', status.join(','));
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/deployments?${qParams.toString()}`, { credentials: "include" });
      if (res.ok) {
        const hasMoreHeader = res.headers.get('X-Has-More');
        setHasMore(hasMoreHeader === 'true');
        const data = await res.json();
        
        if (isLoadMore) {
          setDeployments(prev => {
            const existingIds = new Set(prev.map(d => d._id));
            const newItems = data.filter((d: any) => !existingIds.has(d._id));
            return [...prev, ...newItems];
          });
        } else {
          setDeployments(data);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [projectId, dateRange, customStart, customEnd, environment, branch, author, status]);

  useEffect(() => {
    const currentFilters = JSON.stringify({ projectId, dateRange, customStart, customEnd, environment, branch, author, status });
    let targetPage = page;
    let isLoadMore = false;
    
    if (prevFiltersRef.current !== currentFilters) {
      setPage(1);
      targetPage = 1;
      isLoadMore = false;
      prevFiltersRef.current = currentFilters;
    } else {
      isLoadMore = page > 1;
    }
    
    fetchDeployments(targetPage, isLoadMore);
  }, [fetchDeployments, page]);

  return (
    <div className="w-full flex flex-col min-h-full bg-black text-white">
      {/* Filter Toolbar */}
      <div className="w-full mt-4">
        <div className="max-w-[1440px] w-full mx-auto px-8 mb-6">
          <DeploymentFilterBar 
            dateRange={dateRange} setDateRange={setDateRange}
            customStart={customStart} setCustomStart={setCustomStart}
            customEnd={customEnd} setCustomEnd={setCustomEnd}
            environment={environment} setEnvironment={setEnvironment}
            branch={branch} setBranch={setBranch}
            author={author} setAuthor={setAuthor}
            status={status} setStatus={setStatus}
            authorsList={authorsList} branchesList={branchesList}
            onClear={clearFilters}
            onRefresh={() => fetchDeployments(1, false)}
          />
        </div>
      </div>

      {/* Main Content List */}
      <div className="px-8 pb-8 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          <div className="w-full">
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
              </div>
            ) : deployments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-zinc-800 rounded-lg border-dashed bg-black">
                <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
                  <Activity className="h-6 w-6 text-zinc-500" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No deployments found</h3>
                <p className="text-zinc-400 max-w-sm">
                  Try adjusting your filters or triggering a new deployment.
                </p>
              </div>
            ) : (
              <div className="flex flex-col border border-zinc-800 rounded-xl overflow-visible bg-[#0a0a0a]">
                {deployments.map((dep: any) => {
                  const isSuccess = dep.status === 'success' || dep.status === 'completed';
                  const isRunning = dep.status === 'running';
                  const owner = dep.source?.repoOwner || dep.projectId?.repoFullName?.split('/')[0] || project?.repoFullName?.split('/')[0] || 'github';

                  return (
                    <div 
                      key={dep._id} 
                      onClick={() => router.push(`/dashboard/logs/${projectId}/${dep._id}`)}
                      className="flex items-center gap-4 pl-4 pr-2 py-[14px] hover:bg-zinc-800/20 transition-colors min-w-0 border-b border-zinc-800/60 last:border-b-0 cursor-pointer"
                    >
                      {/* Deployment / Type / Message */}
                      <div className="flex items-center gap-3 shrink-0 flex-1 min-w-0 pr-4">
                        <div className="h-8 w-8 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-zinc-500 transition-colors" />
                        </div>
                        <div className="min-w-0 w-full" style={{maxWidth: '500px'}}>
                          <p className="text-[14px] font-medium text-zinc-300 truncate mb-0.5">
                            <span className="capitalize">{dep.serviceName || dep.type || 'Deployment'}</span> · {dep._id.slice(-8)}
                          </p>
                          <div className="flex items-center gap-2 text-[12px] text-zinc-500 truncate w-full">
                            <span className="truncate flex-1">{dep.source?.commitMessage || dep.source?.commitSha || `Manual deploy`}</span>
                            <span className="text-zinc-600 shrink-0">•</span>
                            <span className="shrink-0">{dep.logs?.length || 0} log entries</span>
                          </div>
                        </div>
                      </div>

                      {/* Status dot + text */}
                      <div className="flex items-center gap-2 shrink-0 w-[100px]">
                        {isSuccess ? (
                          <div className="h-2.5 w-2.5 rounded-full bg-[#55c786]"></div>
                        ) : isRunning ? (
                          <div className="h-2.5 w-2.5 rounded-full bg-[#0070F3] animate-pulse"></div>
                        ) : (
                          <div className="h-2.5 w-2.5 rounded-full bg-[#c34370]"></div>
                        )}
                        <span className="font-medium text-zinc-100 text-[14px] capitalize">
                          {isSuccess ? 'Ready' : isRunning ? 'Building' : 'Failed'}
                        </span>
                      </div>

                      {/* Platform */}
                      <div className="flex items-center gap-2 shrink-0 w-[100px]">
                        <span className="text-[14px] text-zinc-400 capitalize">{dep.platform || 'Vercel'}</span>
                      </div>

                      {/* Branch */}
                      <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[14px] shrink-0 w-[100px]">
                        <GitBranch className="h-4 w-4 text-zinc-500" />
                        <span className="truncate">
                          {dep.source?.branch || 'main'}
                        </span>
                      </div>

                      {/* Time ago + Action Dots */}
                      <div className="flex items-center gap-3 shrink-0 ml-auto text-zinc-400 text-[14px] whitespace-nowrap w-[120px] justify-end">
                        <TimeAgoWithTooltip dateString={dep.createdAt} />
                        <div className="relative">
                          <button 
                            className="flex items-center justify-center h-8 w-8 rounded hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              e.nativeEvent.stopPropagation();
                              setOpenActionId(openActionId === dep._id ? null : dep._id);
                            }}
                          >
                            <MoreHorizontal className="h-[18px] w-[18px]" />
                          </button>

                          {openActionId === dep._id && (
                            <div 
                              className="absolute right-0 top-full mt-1 w-[160px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl py-1.5 z-50 text-[13px] font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button 
                                onClick={() => { setOpenActionId(null); router.push(`/dashboard/logs/${projectId}/${dep._id}`); }}
                                className="w-full flex items-center px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                              >
                                View Logs
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {hasMore && (
            <div className="mt-4">
              <button 
                onClick={() => setPage(p => p + 1)}
                disabled={loadingMore}
                className="w-full py-2.5 bg-[#0a0a0a] hover:bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg transition-colors text-[13px] font-medium flex justify-center items-center gap-2"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
                Load More
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function ProjectLogsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>}>
      <ProjectLogsContent />
    </Suspense>
  );
}
