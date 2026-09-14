"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Activity, Clock, CheckCircle2, XCircle, AlertCircle, Sparkles, GitPullRequest, Calendar } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { Uptime3DLine } from "@/components/dashboard/Uptime3DLine";

export default function MonitoringPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [history, setHistory] = useState<any>({ frontend: [], backend: [] });
  const [timeRange, setTimeRange] = useState('1d');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [analyzingCheckId, setAnalyzingCheckId] = useState<string | null>(null);
  const [fixingCheckId, setFixingCheckId] = useState<string | null>(null);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [projectId, timeRange]);

  const fetchData = async () => {
    try {
      if (!summary) setLoading(true);
      const [summaryRes, historyRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/monitor-summary`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/monitor-checks/history?timeRange=${timeRange}`, { credentials: "include" })
      ]);
      
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data.summary);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.history);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (check: any) => {
    try {
      setAnalyzingCheckId(check._id);
      setExpandedCheckId(check._id);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/monitor-checks/${check._id}/analyze`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSummary((prev: any) => ({
          ...prev,
          recentChecks: prev.recentChecks.map((c: any) => c._id === check._id ? { ...c, aiAnalysis: data.aiAnalysis } : c)
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzingCheckId(null);
    }
  };

  const handleFix = async (check: any) => {
    try {
      setFixingCheckId(check._id);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/monitor-checks/${check._id}/create-pr`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSummary((prev: any) => ({
          ...prev,
          recentChecks: prev.recentChecks.map((c: any) => c._id === check._id ? { ...c, aiAnalysis: { ...c.aiAnalysis, fix_pr_url: data.pr_url } } : c)
        }));
      } else {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Auto-Fix Error: ${errData.error}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFixingCheckId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-white flex items-center gap-3">
              <Activity className="h-6 w-6 text-indigo-400" />
              Monitoring Dashboard
            </h1>
            <p className="text-zinc-400 text-sm md:text-base max-w-xl">Real-time uptime tracking, performance metrics, and automated AI health checks.</p>
          </div>

          <div className="relative">
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 shadow-xl text-sm text-zinc-300 font-medium hover:text-white hover:border-zinc-700 transition-colors"
            >
              <Calendar className="h-4 w-4 text-zinc-500" />
              {timeRange === '1d' ? 'Last 24 Hours' : timeRange === '7d' ? 'Last 7 Days' : timeRange === '15d' ? 'Last 15 Days' : timeRange === '1m' ? 'Last 30 Days' : 'Last Year'}
            </button>
            
            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-44 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden z-50 py-1">
                  {[
                    { value: '1d', label: 'Last 24 Hours' },
                    { value: '7d', label: 'Last 7 Days' },
                    { value: '15d', label: 'Last 15 Days' },
                    { value: '1m', label: 'Last 30 Days' },
                    { value: '1y', label: 'Last Year' },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => { setTimeRange(option.value); setIsDropdownOpen(false); }}
                      className={`block w-full text-left px-4 py-2 text-sm transition-colors ${timeRange === option.value ? 'bg-indigo-500/10 text-indigo-400 font-medium' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Uptime Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="rounded-xl border border-zinc-800/60 bg-gradient-to-b from-zinc-800/40 to-zinc-900/80 backdrop-blur-xl p-5 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-all duration-700 group-hover:bg-emerald-500/10"></div>
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3 flex justify-between items-center relative z-10">
              Frontend Uptime
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">Active</span>
            </h3>
            <div className="flex items-baseline gap-2 mb-6 relative z-10">
              <span className="text-4xl font-black text-white tracking-tight">{summary?.frontendUptime ? summary.frontendUptime.toFixed(2) : '0.00'}%</span>
            </div>
            <div className="relative z-10">
              <Uptime3DLine data={history.frontend} />
            </div>
          </div>
          
          <div className="rounded-xl border border-zinc-800/60 bg-gradient-to-b from-zinc-800/40 to-zinc-900/80 backdrop-blur-xl p-5 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-all duration-700 group-hover:bg-blue-500/10"></div>
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3 flex justify-between items-center relative z-10">
              Backend Uptime
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20">Active</span>
            </h3>
            <div className="flex items-baseline gap-2 mb-6 relative z-10">
              <span className="text-4xl font-black text-white tracking-tight">{summary?.backendUptime ? summary.backendUptime.toFixed(2) : '0.00'}%</span>
            </div>
            <div className="relative z-10">
              <Uptime3DLine data={history.backend} />
            </div>
          </div>
        </div>

        {/* Recent Checks */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="border-b border-zinc-800 bg-black/40 px-6 py-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4" /> Recent Checks History
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Service</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Response</th>
                  <th className="px-6 py-3">Error</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-black/20">
                {summary?.recentChecks && summary.recentChecks.length > 0 ? (
                  summary.recentChecks.map((check: any, i: number) => (
                  <React.Fragment key={i}>
                    <tr className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(check.checkedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 capitalize font-medium text-zinc-300">
                        {check.monitorId?.type || 'Unknown'}
                      </td>
                      <td className="px-6 py-4">
                        {check.status === 'online' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> Online
                          </span>
                        ) : check.status === 'degraded' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            <AlertCircle className="h-3 w-3" /> Degraded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="h-3 w-3" /> Offline
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono">
                        {check.responseTimeMs ? `${check.responseTimeMs}ms` : '-'}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {check.errorMessage || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(check.status === 'degraded' || check.status === 'offline') && (
                          <button
                            onClick={() => handleAnalyze(check)}
                            disabled={analyzingCheckId === check._id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md hover:bg-indigo-500/20 transition-colors"
                          >
                            {analyzingCheckId === check._id ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                            ) : (
                              <><img src="/ai-icon.svg" alt="AI" className="w-6 h-6 object-contain" /> Analyze Issue</>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedCheckId === check._id && (
                      <tr className="bg-indigo-950/20 border-b border-indigo-900/30">
                        <td colSpan={6} className="px-6 py-6">
                          <div className="flex flex-col gap-4">
                            <h4 className="text-indigo-400 font-medium flex items-center gap-2">
                              <img src="/ai-icon.svg" alt="AI" className="w-6 h-6 object-contain" /> AI Root Cause Analysis
                            </h4>
                            {analyzingCheckId === check._id ? (
                              <div className="flex items-center gap-3 text-zinc-400 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Analyzing recent stack traces and monitor logs...
                              </div>
                            ) : check.aiAnalysis ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                  <div>
                                    <div className="text-xs font-semibold text-zinc-500 uppercase mb-1">Summary</div>
                                    <div className="text-sm text-zinc-300">{check.aiAnalysis.summary}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold text-zinc-500 uppercase mb-1">Root Cause</div>
                                    <div className="text-sm text-zinc-300 prose prose-sm prose-invert max-w-none">
                                      <ReactMarkdown>{check.aiAnalysis.likelyCause}</ReactMarkdown>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-4 border-l border-indigo-900/50 pl-6">
                                  <div>
                                    <div className="text-xs font-semibold text-zinc-500 uppercase mb-1">Suggested Fix</div>
                                    <div className="text-sm text-zinc-300 prose prose-sm prose-invert max-w-none">
                                      <ReactMarkdown>{check.aiAnalysis.suggestedFix}</ReactMarkdown>
                                    </div>
                                  </div>
                                  {check.aiAnalysis.canAutoFix && (
                                    <div className="pt-2">
                                      {check.aiAnalysis.fix_pr_url ? (
                                        <a href={check.aiAnalysis.fix_pr_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-500/30 transition-colors text-sm font-medium">
                                          <GitPullRequest className="w-4 h-4" /> View Pull Request
                                        </a>
                                      ) : (
                                        <button
                                          onClick={() => handleFix(check)}
                                          disabled={fixingCheckId === check._id}
                                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
                                        >
                                          {fixingCheckId === check._id ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Rewriting Code & Creating PR...</>
                                          ) : (
                                            <><GitPullRequest className="w-4 h-4" /> Auto-Fix with AI</>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-zinc-500 text-sm">Analysis failed or not available.</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                      No recent checks available. Click "Check Now" on the deploy page to trigger a check.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
