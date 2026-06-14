"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Calendar, Users, Monitor, GitBranch, Activity, Search, ChevronDown, GitCommit, ArrowUp, ArrowUpCircle, MoreHorizontal } from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";
import { DeploymentFilterBar } from "@/components/dashboard/DeploymentFilters";

// Vercel-style tooltip showing "Since [date]" on hover
function EnvTagWithTooltip({ isProd, isLatestProd, createdAt, supersededAt }: {
  isProd: boolean;
  isLatestProd: boolean;
  createdAt?: string;
  supersededAt?: string;
}) {
  const [hovered, setHovered] = useState(false);

  const fmt = (d?: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tag */}
      {isProd ? (
        isLatestProd ? (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#0070F3]/20 text-[#3291FF] rounded-full font-medium text-[13px] cursor-default select-none border border-transparent">
            <div className="h-[15px] w-[15px] rounded-full bg-[#0070F3] flex items-center justify-center">
              <ArrowUp className="h-[11px] w-[11px] text-white" strokeWidth={3} />
            </div>
            Production
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1 border border-zinc-700 bg-transparent text-zinc-100 rounded-full font-medium text-[13px] cursor-default select-none">
            <ArrowUpCircle className="h-[16px] w-[16px] text-zinc-400" strokeWidth={2} />
            Production
          </div>
        )
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-1 border border-zinc-700 bg-transparent text-zinc-100 rounded-full font-medium text-[13px] cursor-default select-none">
          <ArrowUpCircle className="h-[16px] w-[16px] text-zinc-400" strokeWidth={2} />
          Preview
        </div>
      )}

      {/* Tooltip card */}
      {hovered && createdAt && (
        <div className="absolute z-50 bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-white text-zinc-900 rounded-lg shadow-2xl px-4 py-2.5 text-[13px] font-medium whitespace-nowrap text-center">
            {isLatestProd || !supersededAt ? (
              `Since ${fmt(createdAt)}`
            ) : (
              <>
                <div>{fmt(createdAt)} to</div>
                <div>{fmt(supersededAt)}</div>
              </>
            )}
          </div>
          {/* Triangle pointer */}
          <div className="flex justify-center -mt-px">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent border-t-white" />
          </div>
        </div>
      )}
    </div>
  );
}

function TimeAgoWithTooltip({ dateString }: { dateString: string }) {
  const [hovered, setHovered] = useState(false);

  const d = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Short relative time "1d ago"
  let displayTime = 'just now';
  if (diffDays > 0) {
    displayTime = `${diffDays}d ago`;
  } else if (diffHours > 0) {
    displayTime = `${diffHours}h ago`;
  } else if (diffMins > 0) {
    displayTime = `${diffMins}m ago`;
  } else if (diffSecs > 0) {
    displayTime = `${diffSecs}s ago`;
  }

  // Full relative time "1 day, 4 hours, 4 minutes ago"
  const parts = [];
  if (diffDays > 0) parts.push(`${diffDays} day${diffDays > 1 ? 's' : ''}`);
  if (diffHours % 24 > 0) parts.push(`${diffHours % 24} hour${diffHours % 24 > 1 ? 's' : ''}`);
  if (diffMins % 60 > 0) parts.push(`${diffMins % 60} minute${diffMins % 60 > 1 ? 's' : ''}`);
  
  const fullRelative = parts.length > 0 ? `${parts.join(', ')} ago` : 'just now';

  // Format UTC
  const utcDate = d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
  const utcTime = d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  // Format Local
  const localDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const localTime = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  
  // Get local timezone offset
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
          {/* Right pointing triangle */}
          <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-l-[6px] border-l-zinc-800">
            <div className="absolute right-[1px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[5px] border-y-transparent border-l-[5px] border-l-[#0a0a0a]" />
          </div>
        </div>
      )}
    </div>
  );
}

function FrontendDeploymentsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams?.get('projectId') || 'all';
  const initialBranch = searchParams?.get('branch') || 'all';
  const repoFullName = searchParams?.get('repoFullName') || '';
  const projectName = searchParams?.get('projectName') || '';

  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  const [environment, setEnvironment] = useState('all');
  const [branch, setBranch] = useState(initialBranch);
  const [author, setAuthor] = useState('all');
  const [status, setStatus] = useState<string[]>(['all']);

  const [authorsList, setAuthorsList] = useState<{value: string, label: string}[]>([]);
  const [branchesList, setBranchesList] = useState<{value: string, label: string}[]>([]);

  useEffect(() => {
    if (deployments.length > 0) {
      setAuthorsList(prev => {
        const newAuthors = new Set(prev.map(p => p.value));
        deployments.forEach(d => {
          const owner = d.source?.repoOwner || d.projectId?.repoFullName?.split('/')[0];
          if (owner) newAuthors.add(owner);
        });
        return Array.from(newAuthors).map(a => ({ value: a, label: a }));
      });
      setBranchesList(prev => {
        const newBranches = new Set(prev.map(p => p.value));
        deployments.forEach(d => d.source?.branch && newBranches.add(d.source.branch));
        return Array.from(newBranches).map(b => ({ value: b, label: b }));
      });
    }
  }, [deployments]);

  const clearFilters = () => {
    setDateRange('all');
    setCustomStart('');
    setCustomEnd('');
    setEnvironment('all');
    setBranch('all');
    setAuthor('all');
    setStatus(['all']);
  };

  const fetchDeployments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('type', 'frontend');
      if (projectId && projectId !== 'all') params.append('projectId', projectId);
      
      if (dateRange === 'custom' && customStart && customEnd) {
         params.append('startDate', customStart);
         params.append('endDate', customEnd);
      } else if (dateRange && dateRange !== 'all') {
         params.append('days', dateRange);
      }
      
      if (environment && environment !== 'all') params.append('environment', environment);
      if (branch && branch !== 'all') params.append('branch', branch);
      if (author && author !== 'all') params.append('author', author);
      
      if (!status.includes('all') && status.length > 0) {
         params.append('status', status.join(','));
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/deployments?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        setDeployments(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, dateRange, customStart, customEnd, environment, branch, author, status]);

  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  return (
    <div className="w-full flex flex-col min-h-full">
      {/* Filter Toolbar - flush at top, edge-to-edge like Vercel */}
      <div className="w-full">
        <div className="max-w-[1440px] w-full mx-auto px-8">
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
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="px-8 pt-0 pb-8 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          {branch !== 'all' && repoFullName && (
            <div className="mb-6 bg-[#0a0a0a] border border-zinc-800 rounded-lg p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-full">
                  <GitBranch className="h-5 w-5 text-zinc-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-[15px] flex items-center gap-2">
                    {projectName} <span className="h-4 w-4 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 font-bold ml-1 cursor-help" title="Branch Details">i</span>
                  </h2>
                  <p className="text-zinc-500 text-[13px] mt-0.5">Branch link for <span className="text-zinc-300 font-mono">{branch}</span></p>
                </div>
              </div>
              <a 
                href={`https://github.com/${repoFullName}/tree/${branch}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors rounded-md text-[13px] font-medium"
              >
                <GitBranch className="h-4 w-4" /> View Branch
              </a>
            </div>
          )}

          {/* Deployment Table */}
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
                {(() => {
                  const latestProdSet = new Set();
                  const projectLatestProdTime: Record<string, string> = {};
                  return deployments.map((dep: any) => {
                    const isProd = dep.source?.branch === 'main' || dep.source?.branch === 'master';

                    const isSuccess = dep.status === 'success' || dep.status === 'completed';
                    const isRunning = dep.status === 'running';
                    const owner = dep.source?.repoOwner || dep.projectId?.repoFullName?.split('/')[0] || 'github';
                    
                    let isLatestProd = false;
                    let supersededAt: string | undefined;
                    
                    if (isProd) {
                      const projId = dep.projectId?._id || 'unknown';
                      if (!latestProdSet.has(projId)) {
                        isLatestProd = true;
                        latestProdSet.add(projId);
                      } else {
                        supersededAt = projectLatestProdTime[projId];
                      }
                      // Track the end time of the *next* oldest production deployment
                      projectLatestProdTime[projId] = dep.createdAt;
                    }

                    // Calculate real duration in seconds
                    const durationSec = dep.durationMs
                      ? Math.round(dep.durationMs / 1000)
                      : dep.startedAt && dep.completedAt
                        ? Math.round((new Date(dep.completedAt).getTime() - new Date(dep.startedAt).getTime()) / 1000)
                        : null;

                    return (
                      <div 
                        key={dep._id} 
                        className="flex items-center gap-4 pl-4 pr-2 py-[14px] hover:bg-zinc-800/20 transition-colors min-w-0 border-b border-zinc-800/60 last:border-b-0"
                      >
                        {/* 1. Commit Message */}
                        <span 
                          onClick={() => router.push(`/dashboard/deployments/${dep._id}`)}
                          className="font-medium text-white text-[15px] truncate min-w-0 flex-1 cursor-pointer pr-4" 
                          style={{maxWidth: '600px'}}
                        >
                          {dep.source?.commitMessage 
                            ? dep.source.commitMessage 
                            : dep.source?.commitSha 
                              ? `Deploy ${dep.source.commitSha.substring(0, 7)}` 
                              : `Manual deploy via ${dep.platform}`}
                        </span>

                        {/* 2. Status dot + text + duration */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isSuccess ? (
                            <div className="h-2.5 w-2.5 rounded-full bg-[#55c786]"></div>
                          ) : isRunning ? (
                            <div className="h-2.5 w-2.5 rounded-full bg-[#0070F3] animate-pulse"></div>
                          ) : (
                            <div className="h-2.5 w-2.5 rounded-full bg-[#c34370]"></div>
                          )}
                          <span className="font-medium text-zinc-100 text-[15px]">
                            {isSuccess ? 'Ready' : isRunning ? 'Building' : 'Failed'}
                          </span>
                          <span className="text-zinc-500 text-[14px]">
                            {durationSec !== null ? `${durationSec}s` : '—'}
                          </span>
                        </div>

                        {/* 3. Environment tag with tooltip */}
                        <EnvTagWithTooltip
                          isProd={isProd}
                          isLatestProd={isLatestProd}
                          createdAt={dep.createdAt}
                          supersededAt={supersededAt}
                        />

                        {/* 4. Project icon + name */}
                        <div 
                          onClick={() => router.push(`/dashboard/projects/${dep.projectId?._id}`)}
                          className="flex items-center gap-2 shrink-0 w-[180px] min-w-0 cursor-pointer group/project"
                        >
                          <div className="h-5 w-5 shrink-0 flex items-center justify-center overflow-hidden rounded-[4px] border border-zinc-800">
                            <ProjectAvatar project={dep.projectId || { repoName: 'unknown' }} />
                          </div>
                          <span className="text-zinc-200 font-medium truncate text-[15px]">{dep.projectId?.repoName || 'unknown'}</span>
                        </div>

                        {/* 5. Commit SHA */}
                        <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[14px] shrink-0">
                          <GitCommit className="h-4 w-4 text-zinc-500" />
                          <a
                            href={dep.projectId?.repoFullName && dep.source?.commitSha
                              ? `https://github.com/${dep.projectId.repoFullName}/commit/${dep.source.commitSha}`
                              : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline hover:text-white transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {dep.source?.commitSha ? dep.source.commitSha.substring(0, 7) : '-------'}
                          </a>
                        </div>

                        {/* 6. Branch */}
                        <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[14px] shrink-0">
                          <GitBranch className="h-4 w-4 text-zinc-500" />
                          <span>{dep.source?.branch || 'main'}</span>
                        </div>

                        {/* 7. Time ago + GitHub avatar + Action Dots */}
                        <div className="flex items-center gap-3 shrink-0 ml-auto text-zinc-400 text-[14px] whitespace-nowrap">
                          <TimeAgoWithTooltip dateString={dep.createdAt} />
                          <img
                            src={`https://github.com/${owner}.png`}
                            alt={owner}
                            className="h-6 w-6 rounded-full border border-zinc-700 shrink-0 object-cover"
                            onError={(e: any) => { e.currentTarget.style.display = 'none'; }}
                          />
                          <button 
                            className="flex items-center justify-center h-8 w-8 rounded hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
                            onClick={(e) => { e.stopPropagation(); }}
                          >
                            <MoreHorizontal className="h-[18px] w-[18px]" />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default function FrontendDeploymentsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>}>
      <FrontendDeploymentsContent />
    </Suspense>
  );
}
