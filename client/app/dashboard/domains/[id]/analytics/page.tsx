"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Activity, ArrowLeft, CornerDownRight, Check, AlertTriangle, X } from "lucide-react";

export default function AnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainId = params.id as string;
  const projectId = searchParams.get("projectId") || "";
  const domainUrl = searchParams.get("url") || "";
  const isBackendDomain = typeof domainId === 'string' && (domainId.endsWith('_api') || domainId.startsWith('provider_be_'));

  const [domain, setDomain] = useState<any>(null);
  const [loadingDomain, setLoadingDomain] = useState(true);
  
  const [domainLogs, setDomainLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [monitorSummary, setMonitorSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const fetchDomainDetails = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainId}`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setDomain(data.domainSetup || data.domain);
      }
    } catch (err) {
      console.error("Failed to fetch domain details", err);
    } finally {
      setLoadingDomain(false);
    }
  };

  const fetchDomainActivity = async (pageNum = 1, silent = false) => {
    if (!silent) setLoadingLogs(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainId}/activity?page=${pageNum}&limit=10`, {
        credentials: 'include'
      });
      if (!res.ok) return;
      const data = await res.json();
      const fetchedLogs = data.logs || [];
      if (pageNum === 1) {
        setDomainLogs(fetchedLogs);
      } else {
        // deduplicate and append
        setDomainLogs(prev => {
          const existingIds = new Set(prev.map(l => l._id));
          const newLogs = fetchedLogs.filter((l: any) => !existingIds.has(l._id));
          return [...prev, ...newLogs];
        });
      }
      setHasMoreLogs(!!data.hasMore);
    } catch (err) {
      console.error("Failed to fetch domain activity:", err);
    } finally {
      if (!silent) setLoadingLogs(false);
    }
  };

  const fetchMonitorSummary = async (targetProjectId: string, silent = false) => {
    if (!silent) setLoadingSummary(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${targetProjectId}/monitor-summary`, {
        credentials: 'include'
      });
      if (!res.ok) return;
      const data = await res.json();
      setMonitorSummary(data.summary || null);
    } catch (err) {
      console.error("Failed to fetch monitor summary:", err);
    } finally {
      if (!silent) setLoadingSummary(false);
    }
  };

  useEffect(() => {
    fetchDomainDetails();
    fetchDomainActivity(1);
    if (projectId) {
      fetchMonitorSummary(projectId);
    }

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setPage(1); // Reset to page 1 on background poll so we don't accidentally load page 2 into page 1
      fetchDomainActivity(1, true);
      if (projectId) {
        fetchMonitorSummary(projectId, true);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [domainId, projectId]);

  const frontendUptime = monitorSummary?.frontendUptime || monitorSummary?.frontend?.uptimePercentage || 0;
  const backendUptime = monitorSummary?.backendUptime || monitorSummary?.backend?.uptimePercentage || 0;
  const currentUptime = isBackendDomain ? backendUptime : frontendUptime;
  const filteredChecks = monitorSummary?.recentChecks?.filter((c: any) => c.monitorId?.type === (isBackendDomain ? 'backend' : 'frontend')) || [];

  return (
    <div className="p-8 w-full mx-auto min-h-screen relative">
      <div className="max-w-6xl mx-auto flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <div className="flex items-center gap-5 border-b border-zinc-800 pb-8 mb-2">
          <button 
            onClick={() => router.push(`/dashboard/domains?projectId=${projectId}`)}
            className="flex items-center justify-center w-11 h-11 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              {loadingDomain ? <div className="w-48 h-9 bg-zinc-800 animate-pulse rounded-md"></div> : domainUrl || domain?.rootDomain || "Analytics"}
            </h1>
            <p className="text-[14px] text-zinc-400 mt-1.5">Detailed uptime metrics and recent domain activity</p>
          </div>
        </div>

        {/* Uptime Analytics */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-500/10 rounded-md">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold text-white tracking-tight">Uptime & Analytics</h2>
          </div>
          
          {loadingSummary && !monitorSummary ? (
            <div className="flex items-center gap-2 text-zinc-500 text-[13px] mb-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading analytics...
            </div>
          ) : monitorSummary && (currentUptime > 0 || filteredChecks.length > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Uptime Card */}
              <div className="bg-[#111] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between shadow-sm">
                <div>
                  <h5 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Service Uptime</h5>
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-4xl font-bold text-white tracking-tight">
                      {currentUptime.toFixed(2)}%
                    </span>
                    <span className="text-[13px] text-zinc-500">last 30 days</span>
                  </div>
                </div>
                <div className="mt-6 flex gap-5 text-[13px] font-medium">
                  {currentUptime > 0 && (
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${currentUptime >= 99 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'}`} />
                      <span className="text-zinc-300">Uptime: {currentUptime.toFixed(2)}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Latency Card */}
              <div className="bg-[#111] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between shadow-sm">
                <h5 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Recent Latency</h5>
                <div className="flex-1 flex items-end gap-1.5 h-16 mt-2">
                  {filteredChecks.slice(0, 20).reverse().map((check: any, idx: number) => {
                    const heightPct = Math.min(100, Math.max(10, (check.responseTimeMs / 1000) * 100));
                    const isOffline = check.status === 'offline';
                    return (
                      <div 
                        key={check._id || idx}
                        className={`group relative w-full rounded-t-sm transition-all hover:opacity-80 ${isOffline ? 'bg-red-500' : check.responseTimeMs > 800 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ height: `${isOffline ? 10 : heightPct}%` }}
                      >
                        {/* Custom Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2.5 py-1.5 bg-[#1a1a1a] border border-zinc-800 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 flex flex-col items-center">
                          <span className="text-[13px] font-semibold text-zinc-200">{check.responseTimeMs}ms</span>
                          <span className="text-[10px] text-zinc-500">{new Date(check.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {/* Triangle pointer */}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800"></div>
                          <div className="absolute top-[calc(100%-1px)] left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a1a]"></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 text-[13px] font-medium text-zinc-400 flex justify-between items-center border-t border-zinc-800/50 pt-3">
                  <span>{filteredChecks[0]?.responseTimeMs || 0}ms average</span>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-500">Live</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
              <div className="text-[13px] text-zinc-500 bg-zinc-900/30 p-5 rounded-xl border border-zinc-800 border-dashed flex items-center justify-center min-h-[100px]">
                Analytics are being gathered. Check back soon.
              </div>
          )}
        </div>

        {/* Activity Timeline */}
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-zinc-800/50 rounded-md">
              <Activity className="w-5 h-5 text-zinc-400" />
            </div>
            <h2 className="text-xl font-semibold text-white tracking-tight">Activity Timeline</h2>
          </div>
          
          {loadingLogs && domainLogs.length === 0 ? (
            <div className="flex items-center gap-2 text-zinc-500 text-[13px]">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading timeline...
            </div>
          ) : domainLogs.length > 0 ? (
            <>
              <div className="flex flex-col gap-0 border-l-2 border-zinc-800/80 ml-3 mt-2">
                {domainLogs.map((log: any, idx: number) => (
                  <div key={log._id || idx} className="relative pl-8 pb-8 last:pb-0 group">
                    <div className={`absolute left-[-6px] top-1.5 w-[10px] h-[10px] rounded-full ring-4 ring-[#0a0a0a] transition-all group-hover:scale-110 ${
                      log.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                      log.status === 'error' ? 'bg-[#e5484d] shadow-[0_0_8px_rgba(229,72,77,0.5)]' :
                      'bg-[#0070f3] shadow-[0_0_8px_rgba(0,112,243,0.5)]'
                    }`} />
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 bg-[#111] border border-zinc-800/50 p-4 rounded-xl shadow-sm hover:border-zinc-700 transition-colors">
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[14px] font-medium text-zinc-200">{log.message || log.action}</p>
                        <span className="text-[12px] text-zinc-500">
                          {new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[11px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md border ${
                          log.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          log.status === 'error' ? 'bg-[#e5484d]/10 text-[#e5484d] border-[#e5484d]/20' :
                          'bg-[#0070f3]/10 text-[#0070f3] border-[#0070f3]/20'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {hasMoreLogs && (
                <div className="flex justify-center mt-3">
                  <button 
                    onClick={() => {
                      const nextPage = page + 1;
                      setPage(nextPage);
                      fetchDomainActivity(nextPage);
                    }}
                    disabled={loadingLogs}
                    className="px-5 py-2.5 bg-[#111] hover:bg-zinc-800 border border-zinc-800 rounded-lg text-[13px] font-medium text-zinc-300 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2 mb-10"
                  >
                    {loadingLogs && page > 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Load More
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-[13px] text-zinc-500 text-center py-10 bg-[#111] border border-zinc-800/50 rounded-xl">
              No recent activity found for this domain.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
