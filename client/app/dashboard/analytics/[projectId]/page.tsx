"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, BarChart2, MousePointerClick, Globe, Monitor, Smartphone, Code, Wand2, GitBranch, ExternalLink, CheckCircle2 } from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";

export default function ProjectAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  
  const [range, setRange] = useState("7d");
  const [environment, setEnvironment] = useState("all");

  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<any>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);

  const hasData = summary?.visitors > 0 || summary?.pageViews > 0;

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
    if (!project?.analytics?.enabled) return;
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
  }, [projectId, range, environment, project?.analytics?.enabled]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleAutoInject = async () => {
    setInjecting(true);
    setInjectResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/analytics/auto-inject`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok) {
        setInjectResult({ success: true, ...data });
      } else {
        setInjectResult({ success: false, error: data.error || "Failed to auto inject." });
      }
    } catch (err: any) {
      setInjectResult({ success: false, error: err.message });
    } finally {
      setInjecting(false);
    }
  };

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

  const isEnabled = project.analytics?.enabled;

  return (
    <div className="w-full flex-1 flex flex-col bg-black min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black border-b border-zinc-800">
        <div className="max-w-[1440px] w-full mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/dashboard/analytics')}
              className="h-8 w-8 rounded-full border border-zinc-800 flex items-center justify-center hover:bg-zinc-900 transition-colors text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 overflow-hidden rounded-full">
                <ProjectAvatar project={project} />
              </div>
              <h1 className="text-[15px] font-semibold text-white">{project.repoName}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] w-full mx-auto px-8 py-8 flex-1">
        {!isEnabled ? (
          <div className="flex flex-col items-center justify-center mt-20">
            <div className="h-16 w-16 rounded-2xl border border-zinc-800 flex items-center justify-center mb-6 bg-zinc-900/50">
              <BarChart2 className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="text-3xl font-semibold text-white mb-4">Web Analytics</h2>
            <p className="text-zinc-400 max-w-lg text-center mb-8">
              Collect valuable insights on user behavior and site performance with detailed page view metrics. Gain knowledge on top pages, referrers, and more.
            </p>
            <button
              onClick={enableAnalytics}
              disabled={enabling}
              className="bg-white text-black hover:bg-zinc-200 font-medium px-6 py-2.5 rounded-md transition-colors flex items-center gap-2"
            >
              {enabling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {enabling ? "Enabling..." : "Enable"}
            </button>
            
            <div className="mt-16 w-full max-w-4xl border border-zinc-800 rounded-xl overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-10 flex items-center justify-center">
                <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-2 rounded-full text-sm font-medium">Demo Data</span>
              </div>
              {/* Fake Graph UI */}
              <div className="h-64 bg-[#0a0a0a] p-6 flex flex-col justify-end gap-2 border-b border-zinc-800">
                <div className="flex justify-between items-end h-full opacity-30">
                  {[40, 70, 45, 90, 65, 85, 120, 95, 110, 80, 130, 150].map((h, i) => (
                    <div key={i} className="w-[6%] bg-blue-500/50 rounded-t-sm" style={{ height: `${h}px` }} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-zinc-800 bg-[#0a0a0a]">
                {['Visitors', 'Page Views', 'Bounce Rate'].map(t => (
                  <div key={t} className="p-6 opacity-30">
                    <div className="text-sm text-zinc-500 mb-2">{t}</div>
                    <div className="text-2xl font-semibold text-zinc-300">--</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white">Analytics</h2>
              
              <div className="flex items-center gap-3">
                <select 
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="bg-[#0a0a0a] border border-zinc-800 text-sm font-medium text-white h-9 px-3 rounded-md focus:outline-none focus:border-zinc-700"
                >
                  <option value="all">All Environments</option>
                  <option value="production">Production</option>
                  <option value="preview">Preview</option>
                </select>
                
                <select 
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  className="bg-[#0a0a0a] border border-zinc-800 text-sm font-medium text-white h-9 px-3 rounded-md focus:outline-none focus:border-zinc-700"
                >
                  <option value="24h">Last 24 hours</option>
                  <option value="3d">Last 3 days</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
                <button
                  onClick={() => {
                    const isSetupVisible = (!hasData && !userDismissed) || showSetup;
                    if (isSetupVisible) {
                      setUserDismissed(true);
                      setShowSetup(false);
                    } else {
                      setShowSetup(true);
                      setUserDismissed(false);
                    }
                  }}
                  className="bg-[#0a0a0a] border border-zinc-800 text-sm font-medium text-zinc-400 hover:text-white h-9 px-3 rounded-md transition-colors"
                >
                  {((!hasData && !userDismissed) || showSetup) ? "Hide Setup" : "View Setup Instructions"}
                </button>
              </div>
            </div>

            {/* Integration Section */}
            {((!hasData && !userDismissed) || showSetup) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative">
                {!hasData && (
                  <div className="absolute -top-10 right-0 flex items-center gap-2 text-amber-500 text-sm font-medium bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20">
                    <Loader2 className="h-4 w-4 animate-spin" /> Waiting for first page view...
                  </div>
                )}
              {/* AI Auto Inject */}
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 flex flex-col">
                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-blue-400" /> Auto Inject via AI
                </h3>
                <p className="text-sm text-zinc-400 mb-6 flex-grow">
                  Let DeployAI automatically clone your repository, find the correct layout file, inject the tracking script, and create a GitHub Pull Request for you.
                </p>
                
                {injectResult?.success ? (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-md p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" /> Successfully created PR!
                    </div>
                    <a 
                      href={injectResult.prUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-green-500 text-black hover:bg-green-400 font-medium px-4 py-2 rounded-md transition-colors text-sm text-center flex justify-center items-center gap-2"
                    >
                      <GitBranch className="h-4 w-4" /> Review & Merge PR
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {injectResult?.error && (
                      <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded-md border border-red-500/20">
                        {injectResult.error}
                      </div>
                    )}
                    <button
                      onClick={handleAutoInject}
                      disabled={injecting}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                      {injecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      {injecting ? "Injecting & Creating PR..." : "Auto Inject Script"}
                    </button>
                  </div>
                )}
              </div>

              {/* Manual Setup Instruction */}
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-medium flex items-center gap-2">
                    <Code className="h-4 w-4 text-zinc-400" /> Manual Setup
                  </h3>
                  {project.repoFullName && (
                    <a 
                      href={`https://github.com/${project.repoFullName}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white transition-colors bg-zinc-900 border border-zinc-800 px-2 py-1 rounded"
                    >
                      <GitBranch className="h-3 w-3" /> Go to Repo <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-zinc-400 mb-4">
                  Or add this script manually to the <code>&lt;head&gt;</code> of your layout file (e.g., <code>app/layout.tsx</code>, <code>index.html</code>).
                </p>
                <div className="bg-black border border-zinc-800 rounded-md p-4 mb-4">
                  <code className="text-sm text-blue-400 font-mono break-all text-left block">
                    {`<script defer src="${process.env.NEXT_PUBLIC_API_URL || "https://api.deployai.in"}/analytics.js" data-tracking-id="${project.analytics.trackingId}"></script>`}
                  </code>
                </div>
                <p className="text-xs text-zinc-500 mt-auto">
                  <strong>Next.js:</strong> Add to <code>app/layout.tsx</code><br/>
                  <strong>React/Vite:</strong> Add to <code>index.html</code>
                </p>
              </div>
            </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6">
                <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium mb-3">
                  <Globe className="h-4 w-4" /> Visitors
                </div>
                <div className="text-3xl font-semibold text-white">
                  {loadingSummary ? <Loader2 className="h-6 w-6 animate-spin text-zinc-600" /> : (summary?.visitors || 0)}
                </div>
              </div>
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6">
                <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium mb-3">
                  <MousePointerClick className="h-4 w-4" /> Page Views
                </div>
                <div className="text-3xl font-semibold text-white">
                  {loadingSummary ? <Loader2 className="h-6 w-6 animate-spin text-zinc-600" /> : (summary?.pageViews || 0)}
                </div>
              </div>
            </div>

            {/* Top Pages */}
            <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-medium text-white">Top Pages</h3>
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Page Views</span>
              </div>
              <div className="flex flex-col">
                {loadingSummary ? (
                  <div className="p-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
                  </div>
                ) : summary?.topPages?.length > 0 ? (
                  summary.topPages.map((page: any, idx: number) => {
                    const maxCount = summary.topPages[0].count;
                    const percent = Math.max(2, (page.count / maxCount) * 100);
                    
                    return (
                      <div key={idx} className="relative flex items-center justify-between p-3 px-4 hover:bg-zinc-900/50 group">
                        <div 
                          className="absolute left-0 top-0 bottom-0 bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors" 
                          style={{ width: `${percent}%` }}
                        />
                        <span className="relative z-10 text-sm font-medium text-zinc-300 truncate max-w-[80%]">
                          {page._id || '/'}
                        </span>
                        <span className="relative z-10 text-sm text-zinc-400">
                          {page.count}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-zinc-500 text-sm">
                    No page views recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
