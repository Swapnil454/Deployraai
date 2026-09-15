"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Link2, Loader2, ExternalLink, Copy, Check, AlertCircle, Server, RefreshCw, Rocket, ChevronUp, ChevronDown, ChevronRight, Globe, Zap, Clock, ArrowUp, XCircle, AlertTriangle, Wrench } from "lucide-react";

export default function DeployPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any>(null);
  const [activeModalProvider, setActiveModalProvider] = useState<string | null>(null);
  const [activeDisconnectProvider, setActiveDisconnectProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copiedRecord, setCopiedRecord] = useState<string | null>(null);

  const handleCopyRecord = (value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopiedRecord(key);
    setTimeout(() => setCopiedRecord(null), 2000);
  };

  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<any>(null);
  const [showLogs, setShowLogs] = useState(true);
  const [deploymentsHistory, setDeploymentsHistory] = useState<any[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployingTarget, setDeployingTarget] = useState<string | null>(null);

  const [toast, setToast] = useState<{message: string, type: "success"|"error"} | null>(null);
  const showToast = (message: string, type: "success"|"error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [monitors, setMonitors] = useState<any[]>([]);
  const [checkingMonitorId, setCheckingMonitorId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchDeploymentsHistory();
    fetchMonitors();
    
    const errorParam = searchParams.get('error');
    if (errorParam) {
      alert(`Connection failed: ${errorParam}. Please check your credentials and try again.`);
      // Optional: remove error from URL
      router.replace(`/dashboard/projects/${projectId}/deploy`, { scroll: false });
    }
  }, [projectId, searchParams, router]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projRes, intRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/status`, { credentials: "include" })
      ]);
      
      if (!projRes.ok || !intRes.ok) throw new Error("Failed to load");
      
      const pData = await projRes.json();
      const iData = await intRes.json();
      
      setProject(pData);
      setIntegrations(iData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeploymentsHistory = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/deployments?t=${Date.now()}`, { 
        credentials: "include",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        setDeploymentsHistory(data);
      }
    } catch (e) { console.error(e); }
  };



  const fetchMonitors = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/monitors?t=${Date.now()}`, { 
        credentials: "include",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.monitors || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    let interval: any;
    
    const fetchActiveDeployment = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${activeDeploymentId}?t=${Date.now()}`, { 
          credentials: "include",
          cache: "no-store"
        });
        if (res.ok) {
          const data = await res.json();
          setDeploymentLogs(data);
          
          // Real-time update the history list item so it shows progress!
          setDeploymentsHistory(prev => {
            const exists = prev.find((d: any) => d._id === data._id);
            if (exists) {
              return prev.map((dep: any) => dep._id === data._id ? data : dep);
            } else {
              return [data, ...prev].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            }
          });

          if (data.status === 'success' || data.status === 'completed' || data.status === 'failed') {
             clearInterval(interval);
             fetchDeploymentsHistory();
             if (data.status === 'success' || data.status === 'completed') {
               fetchMonitors();
             }
          }
        }
      } catch (e) { console.error(e); }
    };

    if (activeDeploymentId) {
      fetchActiveDeployment(); // Fetch immediately on mount or ID change
      interval = setInterval(fetchActiveDeployment, 2000);
    }
    return () => clearInterval(interval);
  }, [activeDeploymentId]);

  const hasOngoingDeployment = deploymentsHistory.some((dep: any) => dep.status === 'queued' || dep.status === 'running');
  const hasFrontendDeployment = deploymentsHistory.some((dep: any) => dep.type === 'frontend');
  const hasBackendDeployment = deploymentsHistory.some((dep: any) => dep.type === 'backend');
  const hasFullStackDeployment = deploymentsHistory.some((dep: any) => dep.type === 'full');

  useEffect(() => {
    if (!activeDeploymentId && hasOngoingDeployment) {
      const ongoing = deploymentsHistory.find((dep: any) => dep.status === 'queued' || dep.status === 'running');
      if (ongoing) {
        setActiveDeploymentId(ongoing._id);
      }
    }
  }, [deploymentsHistory, activeDeploymentId, hasOngoingDeployment]);

  const triggerDeployment = async (type: 'frontend' | 'backend' | 'full') => {
    try {
      setDeployingTarget(type);
      setDeploying(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${projectId}/${type}`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.deploymentId) {
        // Optimistically show the deployment card instantly
        setDeploymentLogs({
          _id: data.deploymentId,
          type: type,
          status: 'queued',
          logs: [{ timestamp: new Date().toISOString(), message: `Initializing ${type} deployment...`, level: 'info', step: 'deploy_trigger' }]
        });
        setActiveDeploymentId(data.deploymentId);
        showToast("Deployment started successfully", "success");
        fetchDeploymentsHistory(); // Refresh history immediately so the new deployment shows up below
      } else {
        alert(data.error || "Failed to start deployment");
      }
    } catch (e) {
      console.error(e);
      alert("Error starting deployment");
    } finally {
      setDeployingTarget(null);
      setDeploying(false);
    }
  };

  const handleOAuthConnect = (provider: string) => {
    const returnTo = encodeURIComponent(`${window.location.origin}/dashboard/projects/${projectId}/deploy`);
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/integrations/${provider}/connect?returnTo=${returnTo}`;
  };

  const handleApiKeySubmit = async () => {
    try {
      setSavingKey(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/${activeModalProvider}/connect-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({ apiKey })
      });
      if (res.ok) {
        setActiveModalProvider(null);
        setApiKey("");
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingKey(false);
    }
  };



  const handleDisconnect = async () => {
    if (!activeDisconnectProvider) return;
    try {
      setDisconnecting(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/${activeDisconnectProvider}/disconnect`, {
        method: 'POST',
        credentials: "include"
      });
      if (res.ok) {
        setActiveDisconnectProvider(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCheckMonitor = async (monitorId: string) => {
    try {
      setCheckingMonitorId(monitorId);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/monitors/${monitorId}/check-now`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        fetchMonitors();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingMonitorId(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  const isFrontend = project?.analysis?.frontend?.detected;
  const isBackend = project?.analysis?.backend?.detected;
  const isFullstack = project?.analysis?.isMonorepo || (isFrontend && isBackend);
  const showFrontend = isFullstack || isFrontend || (!isFrontend && !isBackend);
  const showBackend = isFullstack || (!isFullstack && isBackend && !isFrontend);

  const frontendPlatform = (!project?.configuration?.frontendPlatform || project.configuration.frontendPlatform === "none") && showFrontend ? "vercel" : (project?.configuration?.frontendPlatform || "none");
  const backendPlatform = (!project?.configuration?.backendPlatform || project.configuration.backendPlatform === "none") && showBackend ? "railway" : (project?.configuration?.backendPlatform || "none");
  
  const isFrontendConnected = integrations?.[frontendPlatform]?.connected;
  const isBackendConnected = integrations?.[backendPlatform]?.connected;
  const isCloudflareConnected = integrations?.cloudflare?.connected;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black px-4 sm:px-6 lg:px-8 py-10 pb-32">
      <div className="mx-auto w-full max-w-4xl">
        
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button onClick={() => router.push(`/dashboard/projects/${projectId}/configure`)} className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Deployment Setup</h1>
            <p className="text-sm text-zinc-400">Connect required accounts and trigger deployment.</p>
          </div>
        </div>

          <div className="w-full">

          {/* Section: Actions */}
          <div className="space-y-6">
            <h2 className="text-[17px] font-bold text-white tracking-wide">Deployment Actions</h2>
            
            {/* Logic: if both are configured and the user wants to deploy them, show them as distinct cards with icons */}
            <div className="space-y-4">
              
              {/* Frontend Action */}
              {frontendPlatform !== "none" && showFrontend && (
                <div className="rounded-xl border border-emerald-900/30 bg-gradient-to-r from-emerald-950/20 to-[#0a0f16] p-4 relative overflow-hidden group shadow-[inset_0_0_20px_rgba(16,185,129,0.02)]">
                  <div className="absolute -left-32 -top-32 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none transition-opacity group-hover:opacity-100 opacity-60"></div>
                  
                  {/* Small sharp glowing circle ring centered vertically, shifted more right, with stronger glow */}
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-emerald-500/20 border-[2px] border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.8),inset_0_0_20px_rgba(52,211,153,0.5)] backdrop-blur-sm pointer-events-none"></div>

                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-7">
                    <div className="flex items-center gap-6">
                      <div className="relative shrink-0 flex items-center justify-center">
                         {frontendPlatform === 'vercel' ? (
                           <img src="/vercel.svg" alt="Vercel" className="w-14 h-14 relative z-10" />
                         ) : frontendPlatform === 'render' ? (
                           <img src="/render.svg" alt="Render" className="w-[84px] h-[84px] relative z-10" />
                         ) : frontendPlatform === 'railway' ? (
                           <img src="/railway-logo-clean.svg" alt="Railway" className="w-14 h-14 relative z-10" />
                         ) : frontendPlatform === 'netlify' ? (
                           <img src="/netlify-logo-rounded-sparks.svg" alt="Netlify" className="w-14 h-14 relative z-10" />
                         ) : (
                           <Globe className="w-14 h-14 text-zinc-300 relative z-10" />
                         )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <h3 className="text-[18px] font-bold text-white capitalize">Frontend ({frontendPlatform})</h3>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase border ${isFrontendConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${isFrontendConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></div>
                            {isFrontendConnected ? 'Ready to Deploy' : `Requires ${frontendPlatform}`}
                          </span>
                        </div>
                        <p className="text-[13px] text-zinc-400 mt-0.5">All configurations are set.</p>
                      </div>
                    </div>
                    {isFrontendConnected ? (
                      <button 
                        onClick={() => triggerDeployment('frontend')}
                        disabled={deploying || hasOngoingDeployment}
                        className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-2.5 text-[14px] font-bold text-white hover:from-blue-400 hover:to-indigo-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] border-none whitespace-nowrap"
                      >
                        {hasFrontendDeployment ? <><RefreshCw className="h-4 w-4" /> Redeploy Frontend</> : <><Rocket className="h-4 w-4" /> Deploy Frontend</>}
                      </button>
                    ) : (
                      <button 
                        onClick={() => router.push('/dashboard/settings')}
                        className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-6 py-2.5 text-[14px] font-bold text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all whitespace-nowrap"
                      >
                        Connect {frontendPlatform}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Backend Action */}
              {backendPlatform !== "none" && showBackend && (
                <div className="rounded-xl border border-indigo-900/30 bg-gradient-to-r from-indigo-950/20 to-[#0a0f16] p-4 relative overflow-hidden group mt-4">
                  <div className="absolute -left-32 -top-32 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none transition-opacity group-hover:opacity-100 opacity-60"></div>
                  
                  {/* Small sharp glowing circle ring centered vertically, shifted more right, with stronger glow */}
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-indigo-500/20 border-[2px] border-indigo-400 shadow-[0_0_30px_rgba(129,140,248,0.8),inset_0_0_20px_rgba(129,140,248,0.5)] backdrop-blur-sm pointer-events-none"></div>

                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-7">
                    <div className="flex items-center gap-6">
                      <div className="relative shrink-0 flex items-center justify-center">
                         {backendPlatform === 'vercel' ? (
                           <img src="/vercel.svg" alt="Vercel" className="w-14 h-14 relative z-10" />
                         ) : backendPlatform === 'render' ? (
                           <img src="/render.svg" alt="Render" className="w-[84px] h-[84px] relative z-10" />
                         ) : backendPlatform === 'railway' ? (
                           <img src="/railway-logo-clean.svg" alt="Railway" className="w-14 h-14 relative z-10" />
                         ) : backendPlatform === 'netlify' ? (
                           <img src="/netlify-logo-rounded-sparks.svg" alt="Netlify" className="w-14 h-14 relative z-10" />
                         ) : (
                           <Globe className="w-14 h-14 text-zinc-300 relative z-10" />
                         )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <h3 className="text-[18px] font-bold text-white capitalize">Backend ({backendPlatform})</h3>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase border ${isBackendConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${isBackendConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></div>
                            {isBackendConnected ? 'Ready to Deploy' : `Requires ${backendPlatform}`}
                          </span>
                        </div>
                        <p className="text-[13px] text-zinc-400 mt-0.5">All configurations are set.</p>
                      </div>
                    </div>
                    {isBackendConnected ? (
                      <button 
                        onClick={() => triggerDeployment('backend')}
                        disabled={deploying || hasOngoingDeployment}
                        className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-2.5 text-[14px] font-bold text-white hover:from-blue-400 hover:to-indigo-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] border-none whitespace-nowrap"
                      >
                        {hasBackendDeployment ? <><RefreshCw className="h-4 w-4" /> Redeploy Backend</> : <><Rocket className="h-4 w-4" /> Deploy Backend</>}
                      </button>
                    ) : (
                      <button 
                        onClick={() => router.push('/dashboard/settings')}
                        className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-6 py-2.5 text-[14px] font-bold text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all whitespace-nowrap"
                      >
                        Connect {backendPlatform}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Full Stack Action (Only if both are present) */}
              {frontendPlatform !== "none" && backendPlatform !== "none" && isFullstack && (
                <div className="rounded-xl border border-teal-900/30 bg-gradient-to-r from-teal-950/20 to-[#0a0f16] p-4 relative overflow-hidden group mt-4">
                  <div className="absolute -left-32 -top-32 w-64 h-64 bg-teal-500/5 blur-[100px] rounded-full pointer-events-none transition-opacity group-hover:opacity-100 opacity-60"></div>
                  
                  {/* Small sharp glowing circle ring centered vertically, shifted more right, with stronger glow */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-teal-500/20 border-[2px] border-teal-400 shadow-[0_0_30px_rgba(45,212,191,0.8),inset_0_0_20px_rgba(45,212,191,0.5)] backdrop-blur-sm pointer-events-none"></div>

                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-7">
                    <div className="flex items-center gap-6">
                      <div className="relative shrink-0 flex items-center justify-center gap-2">
                         {/* Frontend Icon */}
                         {frontendPlatform === 'vercel' ? (
                           <img src="/vercel.svg" alt="Vercel" className="w-10 h-10 relative z-10" />
                         ) : frontendPlatform === 'render' ? (
                           <img src="/render.svg" alt="Render" className="w-[60px] h-[60px] relative z-10" />
                         ) : frontendPlatform === 'railway' ? (
                           <img src="/railway-logo-clean.svg" alt="Railway" className="w-10 h-10 relative z-10" />
                         ) : frontendPlatform === 'netlify' ? (
                           <img src="/netlify-logo-rounded-sparks.svg" alt="Netlify" className="w-10 h-10 relative z-10" />
                         ) : (
                           <Globe className="w-10 h-10 text-zinc-300 relative z-10" />
                         )}
                         <span className="text-zinc-600 font-bold text-lg relative z-10">+</span>
                         {/* Backend Icon */}
                         {backendPlatform === 'vercel' ? (
                           <img src="/vercel.svg" alt="Vercel" className="w-10 h-10 relative z-10" />
                         ) : backendPlatform === 'render' ? (
                           <img src="/render.svg" alt="Render" className="w-[60px] h-[60px] relative z-10" />
                         ) : backendPlatform === 'railway' ? (
                           <img src="/railway-logo-clean.svg" alt="Railway" className="w-10 h-10 relative z-10" />
                         ) : backendPlatform === 'netlify' ? (
                           <img src="/netlify-logo-rounded-sparks.svg" alt="Netlify" className="w-10 h-10 relative z-10" />
                         ) : (
                           <Globe className="w-10 h-10 text-zinc-300 relative z-10" />
                         )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <h3 className="text-[18px] font-bold text-white capitalize">Full Stack Orchestration</h3>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase border ${isFrontendConnected && isBackendConnected ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${isFrontendConnected && isBackendConnected ? 'bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.8)]' : 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></div>
                            {isFrontendConnected && isBackendConnected ? 'Ready for Full Pipeline' : 'Requires both connections'}
                          </span>
                        </div>
                        <p className="text-[13px] text-zinc-400 mt-0.5">Deploy frontend and backend simultaneously.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => triggerDeployment('full')}
                      disabled={!isFrontendConnected || !isBackendConnected || deploying || hasOngoingDeployment}
                      className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 px-6 py-2.5 text-[14px] font-bold text-white hover:from-teal-400 hover:to-emerald-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] border-none whitespace-nowrap"
                    >
                      {hasFullStackDeployment ? <><RefreshCw className="h-4 w-4" /> Redeploy Full Stack</> : <><Rocket className="h-4 w-4" /> Deploy Full Stack</>}
                    </button>
                  </div>
                </div>
              )}

              {((!showFrontend || frontendPlatform === "none") && (!showBackend || backendPlatform === "none")) && (
                <div className="text-sm text-zinc-500 text-center py-8 rounded-xl border border-zinc-800 border-dashed bg-[#0a0a0a]">
                  No deployment platforms configured. Go back to Configuration to select platforms.
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Monitoring Section */}
        {/* Monitoring Section */}
        <div className="mt-8 rounded-xl border border-[#1e2329] bg-[#0a0a0a] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#1e2329] bg-[#111] px-5 py-3">
              <div>
                <h3 className="text-[16px] font-bold text-white tracking-wide">Monitoring</h3>
                <p className="text-[12px] text-zinc-500 mt-0.5">Status of your deployed services.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push(`/dashboard/projects/${projectId}/infrastructure`)}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-3 py-1.5 text-[12px] font-medium text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                >
                  <Server className="h-3.5 w-3.5" /> Infra Metrics
                </button>
                <button
                  onClick={() => router.push(`/dashboard/projects/${projectId}/logs/settings`)}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Log Rules
                </button>
                <button
                  onClick={() => router.push(`/dashboard/projects/${projectId}/monitoring`)}
                  className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-700 border border-[#1e2329] transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg> View Dashboard
                </button>
              </div>
            </div>
            
            <div className="p-5">
              {monitors && monitors.length > 0 ? (
                <div className="space-y-5">
                {monitors.map((monitor: any, index: number) => {
                  const uptimePct = 100; // Mock or calculate if we have history. 
                  
                  // Try to find a screenshot URL from a recent successful deployment
                  const latestFrontendDeploy = deploymentsHistory.find((dep: any) => 
                    dep.type === 'frontend' && (dep.status === 'success' || dep.status === 'completed') && dep.finalSummary?.screenshotUrl
                  );
                  const screenshotUrl = latestFrontendDeploy ? latestFrontendDeploy.finalSummary.screenshotUrl : null;
                  
                  return (
                  <div key={index} className="flex flex-col md:flex-row gap-5 md:items-center">
                    {/* Left side: Browser preview */}
                    <div className="w-full md:w-[220px] aspect-[4/3] relative flex-shrink-0 rounded-xl border border-[#1e2329] bg-[#0c1015] overflow-hidden group shadow-lg">
                      <div className="absolute top-0 left-0 w-full h-5 bg-[#161b22] flex items-center px-2.5 gap-1.5 z-10 border-b border-[#1e2329]">
                        <div className="w-2 h-2 rounded-full bg-[#ff5f56]"></div>
                        <div className="w-2 h-2 rounded-full bg-[#ffbd2e]"></div>
                        <div className="w-2 h-2 rounded-full bg-[#27c93f]"></div>
                      </div>
                      {screenshotUrl ? (
                        <img 
                          src={screenshotUrl.startsWith('http') ? screenshotUrl : `${process.env.NEXT_PUBLIC_API_URL}${screenshotUrl}`} 
                          alt="Preview" 
                          className="w-full h-full object-cover object-top pt-5"
                        />
                      ) : (
                        <div className="w-full h-full pt-5 relative overflow-hidden bg-[#111] flex items-center justify-center">
                           <Globe className="h-8 w-8 text-emerald-500/50" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                        <button 
                          onClick={() => {
                            const url = monitor.url;
                            window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
                          }}
                          className="px-4 py-2 rounded-lg font-medium text-[12px] flex items-center gap-1.5 bg-white text-black shadow-lg hover:scale-105 transition-transform"
                        >
                          Visit Site <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Right side: Inline Text & Metrics Blocks */}
                    <div className="flex-1 flex flex-col justify-center">
                       <div className="flex items-start justify-between mb-1">
                         <h4 className="text-[17px] font-bold text-white capitalize">{monitor.type}</h4>
                         <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${monitor.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : monitor.status === 'degraded' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : monitor.status === 'offline' ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                           <span className={`h-1.5 w-1.5 rounded-full ${monitor.status === 'online' ? 'bg-emerald-400' : monitor.status === 'degraded' ? 'bg-yellow-400' : monitor.status === 'offline' ? 'bg-red-400' : 'bg-zinc-500'}`}></span>
                           {monitor.status === 'unknown' ? 'Not checked' : monitor.status}
                         </span>
                       </div>
                       
                       <div className="flex items-center gap-2 mb-4">
                         <a href={monitor.url.startsWith('http') ? monitor.url : `https://${monitor.url}`} target="_blank" rel="noreferrer" className="text-[13px] text-indigo-400 hover:text-indigo-300 hover:underline">
                           {monitor.url.replace(/^https?:\/\//, '')}
                         </a>
                         <button 
                           onClick={() => handleCopyRecord(monitor.url, 'url')}
                           className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-zinc-800"
                           title="Copy URL"
                         >
                           {copiedRecord === 'url' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                         </button>
                       </div>
                       
                       <div className="flex items-center gap-4 mt-2 overflow-x-auto hide-scrollbar pb-1">
                         <div className="flex items-center gap-2">
                           <Zap className="h-3.5 w-3.5 text-indigo-400" />
                           <div className="flex flex-col">
                             <span className="text-[11px] text-zinc-500 font-medium whitespace-nowrap">Response Time</span>
                             <span className="text-[13px] font-semibold text-white">
                               {monitor.lastResponseTimeMs ? `${monitor.lastResponseTimeMs}ms` : '—'}
                             </span>
                           </div>
                         </div>

                         <div className="flex items-center gap-2">
                           <Clock className="h-3.5 w-3.5 text-zinc-400" />
                           <div className="flex flex-col">
                             <span className="text-[11px] text-zinc-500 font-medium whitespace-nowrap">Last Checked</span>
                             <span className="text-[13px] font-medium text-white whitespace-nowrap" title={monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleString() : 'Never'}>
                               {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                             </span>
                           </div>
                         </div>
                         
                         <div className="flex items-center gap-2">
                           <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                           <div className="flex flex-col">
                             <span className="text-[11px] text-zinc-500 font-medium whitespace-nowrap">Uptime (24h)</span>
                             <span className="text-[13px] font-semibold text-white">
                               {uptimePct}%
                             </span>
                           </div>
                         </div>
                         
                         <button
                           onClick={() => handleCheckMonitor(monitor._id)}
                           disabled={checkingMonitorId === monitor._id}
                           className="flex items-center gap-1.5 rounded-md bg-white px-3.5 py-1.5 text-[11px] font-semibold text-black hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all ml-auto shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                         >
                           {checkingMonitorId === monitor._id ? (
                             <Loader2 className="h-3 w-3 animate-spin text-black" />
                           ) : <RefreshCw className="h-3 w-3 text-black" />}
                           Check Now
                         </button>
                       </div>
                       
                       {monitor.status === 'offline' && monitor.lastErrorMessage && (
                          <div className="mt-4 text-[13px] text-red-400 bg-red-950/30 p-3 rounded-lg border border-red-900/50 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{monitor.lastErrorMessage}</span>
                          </div>
                       )}
                    </div>
                  </div>
                )})}
                </div>
              ) : (
                <div className="text-center py-8 text-[13px] text-zinc-500 border border-dashed border-[#1e2329] rounded-lg bg-[#0c1015]">
                  No active services deployed yet. Deploy your project to start monitoring uptime.
                </div>
              )}
            </div>
          </div>

        {/* Instant Loading Card while POST request is running */}
        {deploying && !activeDeploymentId && (
          <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 animate-pulse">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">Deployment Logs</h2>
              <span className="text-sm font-medium text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 capitalize">
                Current Step: Initializing
              </span>
            </div>
            <div className="flex justify-between items-center mb-4 text-sm">
              <span className="text-zinc-400 capitalize">{deployingTarget} deployment • Preparing...</span>
              <div className="flex items-center gap-4">
                <span className="px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse">
                  STARTING
                </span>
              </div>
            </div>
            <div className="bg-black border border-zinc-800 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm space-y-2">
               <div className="flex gap-3 text-zinc-500">
                 <span>[{new Date().toLocaleTimeString()}]</span>
                 <span className="text-indigo-400">Initiating {deployingTarget} deployment pipeline...</span>
               </div>
            </div>
          </div>
        )}

        {/* Logs Panel */}
        {activeDeploymentId && deploymentLogs && (
          <div className="mt-12 rounded-xl border border-zinc-800/60 bg-[#0c1015] shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
            
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-800/40 bg-[#111]">
              <div className="flex items-center gap-4">
                <h2 className="text-[17px] font-bold text-white tracking-wide">Deployment Logs</h2>
                {deploymentLogs.logs.length > 0 && deploymentLogs.logs[deploymentLogs.logs.length - 1].step && (
                   <span className="flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse"></div>
                      Current Step: {deploymentLogs.logs[deploymentLogs.logs.length - 1].step.replace(/_/g, ' ')}
                   </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {(deploymentLogs.status === 'running' || deploymentLogs.status === 'queued') && (
                  <button 
                    onClick={async () => {
                      try {
                        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${activeDeploymentId}/cancel`, {
                          method: 'POST',
                          credentials: 'include'
                        });
                        if (res.ok) {
                          setActiveDeploymentId(null);
                          setDeploying(false);
                          showToast("Deployment cancelled successfully", "success");
                          fetchDeploymentsHistory();
                        } else {
                          showToast("Failed to cancel deployment", "error");
                        }
                      } catch (err) {
                        showToast("Error cancelling deployment", "error");
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20 text-[11px] font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                  >
                    <AlertCircle className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
                <button onClick={() => setShowLogs(!showLogs)} className="p-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-zinc-700">
                  {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>
            
            {showLogs && (
              <div className="p-6">
                <div className="flex justify-between items-center mb-5 text-sm">
                  <div className="flex items-center gap-3 text-zinc-400 capitalize">
                    <span className="font-semibold text-zinc-300">{deploymentLogs.type} Deployment</span>
                    <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
                    <span>{deploymentLogs.platform}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {deploymentLogs.finalSummary?.frontendUrl ? (
                      <a href={deploymentLogs.finalSummary.frontendUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[13px] font-medium transition-colors" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="h-3.5 w-3.5" /> Visit App
                      </a>
                    ) : (
                      deploymentLogs.deploymentUrl && (
                        <a href={deploymentLogs.deploymentUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[13px] font-medium transition-colors" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="h-3.5 w-3.5" /> Visit App
                        </a>
                      )
                    )}
                    {deploymentLogs.finalSummary?.backendUrl && (
                      <a href={deploymentLogs.finalSummary.backendUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[13px] font-medium transition-colors" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="h-3.5 w-3.5" /> Backend API
                      </a>
                    )}
                    {deploymentLogs.finalSummary?.frontendDashboardUrl && (
                      <a href={deploymentLogs.finalSummary.frontendDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-300 flex items-center gap-1 text-[13px] transition-colors" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="h-3.5 w-3.5" /> Frontend Dashboard
                      </a>
                    )}
                    {deploymentLogs.finalSummary?.backendDashboardUrl ? (
                      <a href={deploymentLogs.finalSummary.backendDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-300 flex items-center gap-1 text-[13px] transition-colors" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="h-3.5 w-3.5" /> Backend Dashboard
                      </a>
                    ) : (
                      deploymentLogs.providerDashboardUrl && (
                        <a href={deploymentLogs.providerDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-300 flex items-center gap-1 text-[13px] transition-colors" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="h-3.5 w-3.5" /> Dashboard
                        </a>
                      )
                    )}
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border
                      ${deploymentLogs.status === 'success' || deploymentLogs.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 
                        deploymentLogs.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 
                        'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)] animate-pulse'}`}>
                      {deploymentLogs.status}
                    </span>
                  </div>
                </div>
                
                {/* Premium Terminal Window */}
                <div className="border border-zinc-800/60 rounded-xl overflow-hidden shadow-inner bg-black/40">
                  <div className="bg-[#161b22] px-4 py-2.5 border-b border-zinc-800/60 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
                    <span className="ml-3 text-[11px] font-mono text-zinc-500">terminal ~ deploy</span>
                  </div>
                  <div className="bg-[#050505] p-5 h-[320px] overflow-y-auto font-mono text-[13px] space-y-3 leading-relaxed">
                    {deploymentLogs.logs.map((log: any, idx: number) => (
                      <div key={idx} className="flex gap-4">
                        <span className="text-zinc-600 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={
                          log.level === 'error' ? 'text-red-400 font-medium' :
                          log.level === 'warning' ? 'text-yellow-400' :
                          log.level === 'success' ? 'text-emerald-400' : 'text-zinc-300'
                        }>{log.message}</span>
                      </div>
                    ))}
                    {(deploymentLogs.status === 'running' || deploymentLogs.status === 'queued') && (
                       <div className="flex gap-4 text-zinc-600 animate-pulse mt-6">
                         <span className="shrink-0 select-none">[{new Date().toLocaleTimeString()}]</span>
                         <span className="flex items-center gap-2">
                           <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
                           Waiting for next log entry...
                         </span>
                       </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Final Deployment Summary Card */}
        {activeDeploymentId && deploymentLogs && (deploymentLogs.status === 'success' || deploymentLogs.status === 'failed') && (
          <div className={`mt-12 rounded-xl border bg-[#0c1015] shadow-2xl overflow-hidden relative ${deploymentLogs.status === 'success' ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
             <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent ${deploymentLogs.status === 'success' ? 'via-emerald-500/80' : 'via-red-500/80'} to-transparent`}></div>
             
             <div className={`px-6 py-5 border-b bg-gradient-to-r ${deploymentLogs.status === 'success' ? 'border-emerald-500/20 from-emerald-500/10 to-transparent' : 'border-red-500/20 from-red-500/10 to-transparent'} flex items-center gap-4`}>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center border shadow-lg ${deploymentLogs.status === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-red-500/20 border-red-500/30 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]'}`}>
                   {deploymentLogs.status === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                </div>
                <div>
                   <h2 className="text-[19px] font-bold text-white tracking-wide">
                     {deploymentLogs.status === 'success' ? 'Deployment Completed Successfully' : 'Deployment Failed'}
                   </h2>
                   <p className="text-[13px] text-zinc-400 mt-0.5">
                     {deploymentLogs.status === 'success' ? 'All services are up and running.' : 'The deployment pipeline encountered an error.'}
                   </p>
                </div>
             </div>
             
             <div className="p-6">
                <div className="grid md:grid-cols-2 gap-8">
                   <div className="space-y-6">
                      <h3 className="text-[14px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Deployment Details</h3>
                      
                      <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                         {/* Duration */}
                         <div>
                            <p className="text-[12px] text-zinc-500 mb-1">Duration</p>
                            <div className="flex items-center gap-2">
                               <Clock className="h-4 w-4 text-zinc-400" />
                               <span className="text-[14px] font-semibold text-white">
                                  {deploymentLogs.finalSummary?.durationMs ? `${Math.round(deploymentLogs.finalSummary.durationMs / 1000)}s` : 'N/A'}
                               </span>
                            </div>
                         </div>
                         
                         {/* Environment */}
                         <div>
                            <p className="text-[12px] text-zinc-500 mb-1">Environment</p>
                            <div className="flex items-center gap-2">
                               <div className="h-1.5 w-1.5 rounded-full bg-indigo-400"></div>
                               <span className="text-[14px] font-semibold text-white capitalize">{deploymentLogs.type} Stack</span>
                            </div>
                         </div>
                         
                         {/* Frontend URL */}
                         <div className="col-span-2 border border-zinc-800/60 rounded-lg p-3 bg-black/30">
                            <p className="text-[12px] text-zinc-500 mb-1.5">Frontend Domain</p>
                            {deploymentLogs.finalSummary?.frontendUrl || deploymentLogs.deploymentUrl ? (
                               <a href={deploymentLogs.finalSummary?.frontendUrl || deploymentLogs.deploymentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[14px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors group">
                                  {(deploymentLogs.finalSummary?.frontendUrl || deploymentLogs.deploymentUrl).replace(/^https?:\/\//, '')} 
                                  <ExternalLink className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                               </a>
                            ) : (
                               <span className="text-[14px] font-semibold text-zinc-600">Not provisioned</span>
                            )}
                         </div>

                         {/* Backend URL */}
                         <div className="col-span-2 border border-zinc-800/60 rounded-lg p-3 bg-black/30">
                            <p className="text-[12px] text-zinc-500 mb-1.5">Backend API Domain</p>
                            {deploymentLogs.finalSummary?.backendUrl ? (
                               <a href={deploymentLogs.finalSummary?.backendUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[14px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors group">
                                  {deploymentLogs.finalSummary?.backendUrl.replace(/^https?:\/\//, '')} 
                                  <ExternalLink className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                               </a>
                            ) : (
                               <span className="text-[14px] font-semibold text-zinc-600">Not provisioned</span>
                            )}
                         </div>
                      </div>
                   </div>
                   
                   <div className="space-y-4">
                     <h3 className="text-[14px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Health Checks</h3>
                     <div className="bg-[#050505] p-5 rounded-xl border border-zinc-800/50 shadow-inner h-full flex flex-col justify-center gap-2">
                       <HealthStatusRow label="Backend Connection" data={deploymentLogs.healthCheck?.backend} />
                       <HealthStatusRow label="Frontend Resolution" data={deploymentLogs.healthCheck?.frontend} />
                       <HealthStatusRow label="CORS Policy" data={deploymentLogs.healthCheck?.cors} />
                       <HealthStatusRow label="Database Connectivity" data={deploymentLogs.healthCheck?.database} />
                     </div>
                   </div>
                </div>

                {deploymentLogs.status === 'failed' && (deploymentLogs.finalSummary?.failedStep || deploymentLogs.finalSummary?.failureReason) && (
                  <div className="mt-8 p-5 rounded-xl bg-red-950/20 border border-red-500/20 shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50"></div>
                    <div className="flex items-start gap-4">
                       <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20 text-red-400 shrink-0 mt-0.5">
                          <AlertTriangle className="h-5 w-5" />
                       </div>
                       <div className="flex-1">
                          <h4 className="text-[15px] font-bold text-red-400 mb-1">
                             Failed at Step: <span className="uppercase tracking-wider">{deploymentLogs.finalSummary?.failedStep || 'Unknown'}</span>
                          </h4>
                          <p className="text-[13px] text-red-300/80 mb-4">{deploymentLogs.finalSummary?.failureReason || 'No specific error reason provided.'}</p>
                          
                          {deploymentLogs.finalSummary?.suggestedFix && (
                             <div className="p-4 bg-[#0a0a0a] rounded-lg border border-zinc-800/60 shadow-inner">
                               <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5"><Wrench className="h-3 w-3" /> Suggested Fix</p>
                               <p className="text-[14px] text-zinc-300 font-medium leading-relaxed">{deploymentLogs.finalSummary.suggestedFix}</p>
                             </div>
                          )}
                       </div>
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}

        {/* Recent Deployments */}
        <div className="mt-12 space-y-6">
          <div className="flex flex-col px-1">
            <h2 className="text-2xl font-bold text-white tracking-wide">Recent Deployments</h2>
            <p className="text-[15px] text-zinc-400 mt-1">Track the history of your deployments.</p>
          </div>
          {deploymentsHistory.length === 0 ? (
            <div className="text-[14px] text-zinc-500 text-center py-10 rounded-xl border border-zinc-800 border-dashed bg-[#0a0a0a]">No deployments yet</div>
          ) : (
            <div className="rounded-xl border border-zinc-800/60 bg-[#111] p-2 overflow-hidden shadow-xl">
              <div className="border border-zinc-800/40 rounded-lg overflow-hidden bg-black/20">
                <div className="divide-y divide-zinc-800/50">
                  {deploymentsHistory.slice(0, 10).map(dep => (
                    <div key={dep._id} className="flex items-center justify-between p-4 px-6 cursor-pointer hover:bg-white/[0.03] transition-colors group" onClick={() => {setActiveDeploymentId(dep._id); setDeploymentLogs(dep);}}>
                      <div className="flex items-center gap-5">
                        <div className={`h-3 w-3 rounded-full ${dep.status === 'success' || dep.status === 'completed' ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]' : dep.status === 'failed' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : dep.status === 'queued' ? 'bg-zinc-500' : 'bg-indigo-400 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.8)]'}`}></div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <h4 className="text-[15px] font-semibold text-white capitalize group-hover:text-indigo-100 transition-colors">{dep.type} Deployment</h4>
                            {dep.isLatest && <span className="bg-zinc-800 text-zinc-300 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest">Latest</span>}
                          </div>
                          <p className="text-[13px] text-zinc-500 capitalize">Platform: {dep.platform}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-10">
                         <div className="flex items-center gap-2 text-zinc-400">
                           <Clock className="h-4 w-4 opacity-70" />
                           <span className="text-[13.5px] font-medium">{new Date(dep.createdAt).toLocaleString('en-US', { hour12: true })}</span>
                         </div>
                         <span className={`w-32 flex justify-center text-[11px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest border ${dep.status === 'success' || dep.status === 'completed' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : dep.status === 'failed' ? 'text-red-400 bg-red-500/10 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]'}`}>
                           {dep.status}
                         </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {deploymentsHistory.length > 10 && (
                <div className="mt-2 flex justify-center pb-1">
                  <button 
                    onClick={() => router.push(`/dashboard/projects/${projectId}/deployments`)}
                    className="text-[13px] text-zinc-400 hover:text-white font-medium flex items-center gap-1.5 transition-colors px-4 py-2 hover:bg-zinc-800/50 rounded-md"
                  >
                    Show More Deployments <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty block to provide extra space at the bottom of the page so it is properly scrollable */}
        <div className="h-32"></div>

      </div>

      {activeModalProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white capitalize">Connect {activeModalProvider}</h3>
            <p className="mb-4 text-sm text-zinc-400">
              {activeModalProvider} does not support standard OAuth connection for this automation flow. Paste your {activeModalProvider} API Key/Token. It will be encrypted and stored securely.
            </p>
            <input
              type="password"
              placeholder={`Enter ${activeModalProvider} token...`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mb-4 w-full rounded-lg border border-zinc-800 bg-black p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setActiveModalProvider(null)} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
              <button 
                onClick={handleApiKeySubmit} 
                disabled={!apiKey || savingKey}
                className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {savingKey && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDisconnectProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white capitalize">Disconnect {activeDisconnectProvider}</h3>
            <p className="mb-4 text-sm text-zinc-400">
              Are you sure you want to disconnect {activeDisconnectProvider}? This will remove your credentials and you will need to reconnect before deploying.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setActiveDisconnectProvider(null)} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
              <button 
                onClick={handleDisconnect} 
                disabled={disconnecting}
                className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                {disconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium z-50 transition-all ${toast.type === "success" ? "bg-emerald-500/90 text-white border border-emerald-400" : "bg-red-500/90 text-white border border-red-400"}`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

    </div>
  );
}



function HealthStatusRow({ label, data }: any) {
  if (!data) return null;
  const colors = {
    passed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    warning: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    failed: 'text-red-400 bg-red-500/10 border-red-500/20',
    skipped: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    unknown: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  };
  const colorClass = (colors as any)[data.status] || colors.unknown;

  return (
    <div className="flex justify-between items-center text-sm py-1 border-b border-zinc-800/50 last:border-0">
      <span className="text-zinc-300">{label}</span>
      <div className="text-right flex flex-col items-end">
        <span className={`px-2 py-0.5 rounded text-xs border ${colorClass} uppercase tracking-wider font-medium`}>{data.status}</span>
        {(data.status === 'warning' || data.status === 'failed') && data.message && (
          <p className="text-xs text-zinc-500 mt-1 max-w-[200px] truncate" title={data.message}>{data.message}</p>
        )}
      </div>
    </div>
  );
}
