"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, BarChart2, MousePointerClick, Globe, Monitor, Smartphone, Code, Wand2, GitBranch, ExternalLink, CheckCircle2, MoreHorizontal, Copy, Check, ChevronDown, Calendar } from "lucide-react";
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

  // New states for tabs
  const [chartTab, setChartTab] = useState("visitors"); // visitors, pageViews, bounceRate
  const [pagesTab, setPagesTab] = useState("pages"); // pages, routes, hostnames
  const [sourcesTab, setSourcesTab] = useState("referrers"); // referrers, utm
  const [devicesTab, setDevicesTab] = useState("devices"); // devices, browsers
  
  const [copied, setCopied] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (!openDropdown) return;
    const handleGlobalClick = () => setOpenDropdown(null);
    const timer = setTimeout(() => {
      document.addEventListener('click', handleGlobalClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [openDropdown]);

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

  const disableAnalytics = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/analytics/disable`, { 
        method: "POST",
        credentials: "include" 
      });
      if (res.ok) {
        await fetchProject();
      }
    } catch (err) {
      console.error(err);
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

  const getDomainStr = () => {
    return project.domains?.[0]?.domain 
      || project.domains?.[0] 
      || project.latestDeployment?.finalSummary?.frontendUrl 
      || project.latestDeployment?.deploymentUrl 
      || project.latestDeployment?.providerUrl 
      || (project.subdomain ? `${project.subdomain}.deployai.app` : null);
  };
  const rawDomain = getDomainStr();
  const domainUrl = rawDomain ? (rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}`) : '#';
  const domainDisplay = rawDomain ? rawDomain.replace(/^https?:\/\//, '') : 'Not Deployed Yet';
  const renderList = (data: any[], titleField: string = "_id", emptyMsg = "No data found") => {
    if (loadingSummary) {
      return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-600" /></div>;
    }
    if (!data || data.length === 0) {
      return <div className="flex-1 flex items-center justify-center p-8 text-center text-zinc-500 text-sm">{emptyMsg}</div>;
    }
    const maxCount = data[0].count;
    return data.map((item: any, idx: number) => {
      const percent = Math.max(2, (item.count / maxCount) * 100);
      return (
        <div key={idx} className="relative flex items-center justify-between p-2.5 px-4 hover:bg-zinc-900/50 group border-b border-zinc-800/30 last:border-0">
          <div className="absolute left-0 top-0 bottom-0 bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors" style={{ width: `${percent}%` }} />
          <span className="relative z-10 text-[13px] text-zinc-300 truncate max-w-[80%]">{item[titleField] || '/'}</span>
          <span className="relative z-10 text-[13px] text-zinc-400">{item.count}</span>
        </div>
      );
    });
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-black min-h-screen">
      <div className="max-w-[1440px] w-full mx-auto px-8 py-8 flex-1">
        {!isEnabled ? (
          <div className="flex flex-col mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start mb-16">
              <div>
                <h2 className="text-[32px] font-bold text-white mb-4">Web Analytics</h2>
                <p className="text-[15px] text-zinc-400 leading-relaxed mb-8">
                  Collect valuable insights on user behavior and site performance with detailed page view metrics. Gain knowledge on top pages. <a href="#" className="text-blue-400 hover:underline">Learn more</a>
                </p>
                <div className="flex items-center gap-6">
                  <button
                    onClick={enableAnalytics}
                    disabled={enabling}
                    className="bg-white text-black hover:bg-zinc-200 font-medium text-[14px] px-5 py-2 rounded-[6px] transition-colors flex items-center gap-2"
                  >
                    {enabling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {enabling ? "Enabling..." : "Enable"}
                  </button>
                  <a href="#" className="text-[13px] font-medium text-zinc-300 hover:text-white flex items-center gap-1 transition-colors">
                    Limits & Pricing <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                  <div className="text-zinc-400 mb-4">
                    <BarChart2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-white mb-2">Real-time insights into your traffic</h3>
                  <p className="text-[13px] text-zinc-400 leading-relaxed">Ensure smooth performance with real-time bandwidth analysis.</p>
                </div>
                <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                  <div className="text-zinc-400 mb-4">
                    <Code className="h-5 w-5" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-white mb-2">Deeper insights with custom events</h3>
                  <p className="text-[13px] text-zinc-400 leading-relaxed">Track whatever is relevant for your website.</p>
                </div>
              </div>
            </div>
            
            <div className="w-full border border-zinc-800 rounded-xl overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#000] via-[#000]/60 to-transparent z-10 pointer-events-none" />
              <div className="absolute top-4 right-4 bg-[#111] border border-zinc-800 text-zinc-500 px-3 py-1 rounded-full text-[12px] font-medium z-20">Demo Data</div>
              
              <div className="grid grid-cols-3 divide-x divide-zinc-800 bg-[#0a0a0a] border-b border-zinc-800 relative z-20">
                {['Visitors', 'Page Views', 'Bounce Rate'].map((t, idx) => (
                  <div key={t} className={`p-4 sm:p-6 opacity-30 ${idx === 0 ? 'border-b-2 border-b-zinc-400 -mb-[1px]' : ''}`}>
                    <div className="text-[12px] sm:text-sm text-zinc-500 mb-2">{t}</div>
                    <div className="text-xl sm:text-2xl font-semibold text-zinc-300">--</div>
                  </div>
                ))}
              </div>
              <div className="h-[300px] bg-[#0a0a0a] p-0 flex flex-col justify-end relative">
                <svg className="w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M0,80 L10,75 L20,85 L30,60 L40,65 L50,40 L60,50 L70,30 L80,35 L90,10 L100,20 L100,100 L0,100 Z" fill="rgba(59,130,246,0.1)" />
                  <path d="M0,80 L10,75 L20,85 L30,60 L40,65 L50,40 L60,50 L70,30 L80,35 L90,10 L100,20" fill="none" stroke="rgba(59,130,246,0.5)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
              {/* Left Side: Domain info */}
              <div className="flex items-center gap-3">
                {rawDomain ? (
                  <a href={domainUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[15px] text-zinc-300 hover:text-white transition-colors group">
                    <Globe className="h-5 w-5 text-zinc-500" />
                    <span className="font-semibold">{domainDisplay}</span>
                    <ExternalLink className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400" />
                  </a>
                ) : (
                  <span className="flex items-center gap-2 text-[15px] text-zinc-500">
                    <Globe className="h-5 w-5 text-zinc-600" />
                    <span className="font-semibold">{domainDisplay}</span>
                  </span>
                )}
              </div>

              {/* Right Side: Filters */}
              <div className="flex items-center gap-3">
                {/* Custom Environment Dropdown */}
                <div className="relative group/env">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'env' ? null : 'env'); }}
                    className="flex items-center gap-2 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 text-[13px] font-medium text-white h-9 px-3 rounded-md transition-colors"
                  >
                    {environment === 'all' ? 'All Environments' : environment === 'production' ? 'Production' : 'Preview'}
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  </button>
                  <div className={`absolute right-0 top-full mt-1 w-48 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-xl transition-all z-50 py-1 ${openDropdown === 'env' ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                    <button onClick={(e) => { e.stopPropagation(); setEnvironment('all'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${environment === 'all' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      All Environments
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEnvironment('production'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${environment === 'production' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Production
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEnvironment('preview'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${environment === 'preview' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Preview
                    </button>
                  </div>
                </div>
                
                {/* Custom Time Range Dropdown */}
                <div className="relative group/time">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'time' ? null : 'time'); }}
                    className="flex items-center gap-2 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 text-[13px] font-medium text-white h-9 px-3 rounded-md transition-colors"
                  >
                    <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                    {range === '24h' ? 'Last 24 hours' : range === '3d' ? 'Last 3 days' : range === '7d' ? 'Last 7 days' : 'Last 30 days'}
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  </button>
                  <div className={`absolute right-0 top-full mt-1 w-48 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-xl transition-all z-50 py-1 ${openDropdown === 'time' ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                    <button onClick={(e) => { e.stopPropagation(); setRange('24h'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '24h' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 24 hours
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRange('3d'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '3d' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 3 days
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRange('7d'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '7d' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 7 days
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRange('30d'); setOpenDropdown(null); }} className={`w-full text-left px-4 py-2 text-[13px] hover:bg-blue-600 transition-colors ${range === '30d' ? 'bg-blue-500 text-white' : 'text-zinc-300'}`}>
                      Last 30 days
                    </button>
                  </div>
                </div>

                {/* More Action Menu */}
                <div className="relative group/more">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'more' ? null : 'more'); }}
                    className="bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white h-9 w-9 flex items-center justify-center rounded-md transition-colors"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  <div className={`absolute right-0 top-full mt-1 w-56 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-xl transition-all z-50 py-1 ${openDropdown === 'more' ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                    <button disabled className="w-full text-left px-4 py-2 text-[13px] text-zinc-600 cursor-not-allowed transition-colors">Upgrade to Pro</button>
                    <button disabled className="w-full text-left px-4 py-2 text-[13px] text-zinc-600 cursor-not-allowed transition-colors">Go to Docs</button>
                    <div className="my-1 border-t border-zinc-800/50"></div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdown(null);
                        const isSetupVisible = (!hasData && !userDismissed) || showSetup;
                        if (isSetupVisible) {
                          setUserDismissed(true);
                          setShowSetup(false);
                        } else {
                          setShowSetup(true);
                          setUserDismissed(false);
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-[13px] text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                    >
                      {((!hasData && !userDismissed) || showSetup) ? "Hide Setup Instructions" : "View Setup Instructions"}
                    </button>
                    <button disabled className="w-full text-left px-4 py-2 text-[13px] text-zinc-600 cursor-not-allowed transition-colors">Add Drain</button>
                    <div className="my-1 border-t border-zinc-800/50"></div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdown(null);
                        disableAnalytics();
                      }}
                      className="w-full text-left px-4 py-2 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Disable Web Analytics
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Integration Section */}
            {((!hasData && !userDismissed) || showSetup) && (
              <div className="flex flex-col gap-6">
                <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 lg:p-8">
                  <h3 className="text-xl font-semibold text-white mb-2">Get Started</h3>
                  <p className="text-zinc-400 text-[14px] mb-8">To start counting visitors and page views, follow these steps.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-[#111] border border-zinc-800 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">1</div>
                        <h4 className="text-white font-medium">Copy our script</h4>
                      </div>
                      <p className="text-[13px] text-zinc-400 mb-4">Start by copying the DeployAI tracking script for your project.</p>
                      
                      <div className="bg-black border border-zinc-800 rounded-md overflow-hidden">
                        <div className="flex items-center bg-[#1a1a1a] px-3 py-2 border-b border-zinc-800">
                          <span className="text-[12px] text-zinc-400 font-medium bg-zinc-800/50 px-2 py-0.5 rounded">HTML</span>
                          <button onClick={() => {
                            navigator.clipboard.writeText(`<script defer src="${process.env.NEXT_PUBLIC_API_URL || "https://api.deployai.in"}/analytics.js" data-tracking-id="${project.analytics.trackingId}"></script>`);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }} className="ml-auto text-zinc-400 hover:text-white transition-colors">
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <div className="p-3 overflow-x-auto text-[12px] font-mono text-zinc-300 whitespace-nowrap">
                          {`<script defer src="..." data-tracking-id="${project.analytics.trackingId}"></script>`}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#111] border border-zinc-800 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">2</div>
                        <h4 className="text-white font-medium">Add to your layout</h4>
                      </div>
                      <p className="text-[13px] text-zinc-400 mb-4">Inject the script into the <code>&lt;head&gt;</code> of your app's layout file.</p>
                      
                      <div className="bg-black border border-zinc-800 rounded-md overflow-hidden">
                         <div className="p-3 text-[12px] font-mono text-zinc-300 leading-loose">
                           <span className="text-purple-400">Next.js:</span> app/layout.tsx<br/>
                           <span className="text-purple-400">React/Vite:</span> index.html
                         </div>
                      </div>
                    </div>

                    <div className="bg-[#111] border border-zinc-800 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">3</div>
                        <h4 className="text-white font-medium">Deploy & Visit your Site</h4>
                      </div>
                      <p className="text-[13px] text-zinc-400 leading-relaxed">
                        Deploy your changes and visit the deployment to collect your page views.<br/><br/>
                        If you don't see data after 30 seconds, please check for content blockers and try to navigate between pages on your site.
                      </p>
                    </div>
                  </div>

                  <div className="pt-8 mt-2 border-t border-zinc-800/50">
                    <div className="flex items-center gap-2 mb-4 text-zinc-500 text-[13px]">
                      Or, install automatically with AI Agent (free).
                    </div>

                    {/* Auto Inject Box */}
                    <div className="bg-[#111] border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
                      {injectResult?.success ? (
                        <div className="p-6 lg:p-8 flex flex-col">
                          <p className="text-white font-medium mb-6">Implemented Web Analytics for this project</p>
                          <h4 className="text-[14px] font-semibold text-white mb-3">Changes Made</h4>
                          <p className="text-[14px] text-zinc-400 mb-10">1. Injected tracking script into the HTML layout.</p>
                          <div className="flex items-center justify-between border-t border-zinc-800 pt-6 mt-auto">
                            <div className="flex items-center gap-2">
                              <Wand2 className="h-4 w-4 text-purple-500" />
                              <span className="text-sm font-medium text-white">Generation Complete</span>
                              <span className="bg-purple-500/20 text-purple-400 text-[10px] px-1.5 py-0.5 rounded font-medium ml-1">Beta</span>
                            </div>
                            <a 
                              href={injectResult.prUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-white text-black hover:bg-zinc-200 text-sm font-medium px-4 py-2 rounded-md transition-colors"
                            >
                              View Pull Request
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 flex flex-col items-center justify-center min-h-[250px]">
                          <button
                            onClick={handleAutoInject}
                            disabled={injecting}
                            className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-md transition-colors flex items-center gap-2"
                          >
                            {injecting ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <Wand2 className="h-4 w-4 text-zinc-400" />}
                            <span className="text-[13px]">Implement with AI Agent</span>
                          </button>
                          <p className="text-[13px] text-zinc-400 mt-6 max-w-md text-center">
                            Automatically generate a pull request with <strong>Web Analytics</strong> configured for your project — at no charge.
                          </p>
                          {injectResult?.error && (
                             <div className="mt-4 text-red-400 text-sm bg-red-500/10 p-2 px-4 rounded-md border border-red-500/20 text-center">
                               {injectResult.error}
                             </div>
                          )}
                        </div>
                      )}
                      {!injectResult?.success && (
                        <div className="bg-black border-t border-zinc-800 px-6 py-4 flex items-center gap-2">
                          <Wand2 className="h-4 w-4 text-zinc-400" />
                          <span className="text-sm font-medium text-zinc-400">AI Agent</span>
                          <span className="bg-zinc-800 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded font-medium ml-1">Beta</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Chart Area */}
            <div className="w-full border border-zinc-800 rounded-xl overflow-hidden relative mb-4">
              <div className="grid grid-cols-3 divide-x divide-zinc-800 bg-[#0a0a0a] border-b border-zinc-800 relative z-20">
                <button onClick={() => setChartTab('visitors')} className={`p-4 sm:p-6 text-left transition-colors hover:bg-zinc-900/30 ${chartTab === 'visitors' ? 'border-b-2 border-b-blue-500 bg-zinc-900/50 -mb-[1px]' : ''}`}>
                  <div className="text-[13px] sm:text-sm text-zinc-400 mb-2">Visitors</div>
                  <div className="text-xl sm:text-3xl font-semibold text-white">
                    {loadingSummary ? <Loader2 className="h-5 w-5 animate-spin text-zinc-600" /> : (summary?.visitors || 0)}
                  </div>
                </button>
                <button onClick={() => setChartTab('pageViews')} className={`p-4 sm:p-6 text-left transition-colors hover:bg-zinc-900/30 ${chartTab === 'pageViews' ? 'border-b-2 border-b-blue-500 bg-zinc-900/50 -mb-[1px]' : ''}`}>
                  <div className="text-[13px] sm:text-sm text-zinc-400 mb-2">Page Views</div>
                  <div className="text-xl sm:text-3xl font-semibold text-white">
                    {loadingSummary ? <Loader2 className="h-5 w-5 animate-spin text-zinc-600" /> : (summary?.pageViews || 0)}
                  </div>
                </button>
                <button onClick={() => setChartTab('bounceRate')} className={`p-4 sm:p-6 text-left transition-colors hover:bg-zinc-900/30 ${chartTab === 'bounceRate' ? 'border-b-2 border-b-blue-500 bg-zinc-900/50 -mb-[1px]' : ''}`}>
                  <div className="text-[13px] sm:text-sm text-zinc-400 mb-2">Bounce Rate</div>
                  <div className="text-xl sm:text-3xl font-semibold text-white">
                    {loadingSummary ? <Loader2 className="h-5 w-5 animate-spin text-zinc-600" /> : `${summary?.bounceRate || 0}%`}
                  </div>
                </button>
              </div>
              <div className="h-[300px] bg-[#0a0a0a] p-0 flex flex-col justify-end relative">
                 {summary?.timeseries?.length > 0 ? (
                   <svg className="w-full h-full opacity-60" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M0,80 L10,75 L20,85 L30,60 L40,65 L50,40 L60,50 L70,30 L80,35 L90,10 L100,20 L100,100 L0,100 Z" fill="rgba(59,130,246,0.1)" />
                      <path d="M0,80 L10,75 L20,85 L30,60 L40,65 L50,40 L60,50 L70,30 L80,35 L90,10 L100,20" fill="none" stroke="rgba(59,130,246,0.5)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                   </svg>
                 ) : (
                   <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <svg className="w-full h-full opacity-10 absolute" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path d="M0,80 L10,75 L20,85 L30,60 L40,65 L50,40 L60,50 L70,30 L80,35 L90,10 L100,20 L100,100 L0,100 Z" fill="rgba(255,255,255,0.1)" />
                        <path d="M0,80 L10,75 L20,85 L30,60 L40,65 L50,40 L60,50 L70,30 L80,35 L90,10 L100,20" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                     </svg>
                     <span className="text-sm text-zinc-500 relative z-10">No data found for selected period</span>
                   </div>
                 )}
              </div>
            </div>

            {/* Row 1: Pages & Referrers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <button onClick={() => setPagesTab('pages')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${pagesTab === 'pages' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Pages</button>
                    <button onClick={() => setPagesTab('routes')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${pagesTab === 'routes' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Routes</button>
                    <button onClick={() => setPagesTab('hostnames')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${pagesTab === 'hostnames' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Hostnames</button>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {pagesTab === 'pages' && renderList(summary?.topPages)}
                  {pagesTab === 'routes' && renderList(summary?.topPages)}
                  {pagesTab === 'hostnames' && renderList(summary?.topHostnames)}
                </div>
              </div>
              
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <button onClick={() => setSourcesTab('referrers')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${sourcesTab === 'referrers' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Referrers</button>
                    <button onClick={() => setSourcesTab('utm')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${sourcesTab === 'utm' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>UTM Parameters</button>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {sourcesTab === 'referrers' && renderList(summary?.topReferrers)}
                  {sourcesTab === 'utm' && renderList(summary?.topReferrers)}
                </div>
              </div>
            </div>

            {/* Row 2: Countries, Devices, OS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <div className="px-4 py-2 text-[13px] font-medium text-white border-b-2 border-white -mb-[1px]">Countries</div>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {renderList(summary?.topCountries)}
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <button onClick={() => setDevicesTab('devices')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${devicesTab === 'devices' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Devices</button>
                    <button onClick={() => setDevicesTab('browsers')} className={`px-4 py-2 text-[13px] font-medium transition-colors ${devicesTab === 'browsers' ? 'text-white border-b-2 border-white -mb-[1px]' : 'text-zinc-500 hover:text-zinc-300'}`}>Browsers</button>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {devicesTab === 'devices' && renderList(summary?.topDevices)}
                  {devicesTab === 'browsers' && renderList(summary?.topBrowsers)}
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                <div className="flex items-end justify-between border-b border-zinc-800 px-2 pt-2 bg-[#0a0a0a]">
                  <div className="flex gap-1">
                    <div className="px-4 py-2 text-[13px] font-medium text-white border-b-2 border-white -mb-[1px]">Operating Systems</div>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pb-3">Visitors</span>
                </div>
                <div className="flex flex-col flex-1 pb-2">
                  {renderList(summary?.topOS)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
