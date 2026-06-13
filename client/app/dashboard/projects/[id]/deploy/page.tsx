"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Link2, Loader2, ExternalLink } from "lucide-react";

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

  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<any>(null);
  const [deploymentsHistory, setDeploymentsHistory] = useState<any[]>([]);
  const [deploying, setDeploying] = useState(false);

  const [domainSetups, setDomainSetups] = useState<any[]>([]);
  const [rootDomainInput, setRootDomainInput] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
  const [cloudflareKey, setCloudflareKey] = useState("");
  const [savingCloudflareKey, setSavingCloudflareKey] = useState(false);
  const [applyingDns, setApplyingDns] = useState<string | null>(null);
  const [dnsPreview, setDnsPreview] = useState<any[]>([]);

  const [monitors, setMonitors] = useState<any[]>([]);
  const [checkingMonitorId, setCheckingMonitorId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchDeploymentsHistory();
    fetchDomains();
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
        fetch(`http://localhost:5000/api/projects/${projectId}`, { credentials: "include" }),
        fetch(`http://localhost:5000/api/integrations/status`, { credentials: "include" })
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
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/deployments`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDeploymentsHistory(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchDomains = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/domains`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDomainSetups(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchMonitors = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/monitors`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.monitors || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    let interval: any;
    if (activeDeploymentId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://localhost:5000/api/deployments/${activeDeploymentId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setDeploymentLogs(data);
            if (data.status === 'success' || data.status === 'failed') {
               clearInterval(interval);
               fetchDeploymentsHistory();
               if (data.status === 'success') {
                 fetchMonitors();
               }
            }
          }
        } catch (e) { console.error(e); }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [activeDeploymentId]);

  const triggerDeployment = async (type: 'frontend' | 'backend' | 'full') => {
    try {
      setDeploying(true);
      const res = await fetch(`http://localhost:5000/api/deployments/${projectId}/${type}`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.deploymentId) {
        setActiveDeploymentId(data.deploymentId);
      } else {
        alert(data.error || "Failed to start deployment");
      }
    } catch (e) {
      console.error(e);
      alert("Error starting deployment");
    } finally {
      setDeploying(false);
    }
  };

  const handleOAuthConnect = (provider: string) => {
    const returnTo = encodeURIComponent(`${window.location.origin}/dashboard/projects/${projectId}/deploy`);
    window.location.href = `http://localhost:5000/api/integrations/${provider}/connect?returnTo=${returnTo}`;
  };

  const handleApiKeySubmit = async () => {
    try {
      setSavingKey(true);
      const res = await fetch(`http://localhost:5000/api/integrations/${activeModalProvider}/connect-api-key`, {
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

  const handleAddDomain = async () => {
    try {
      setAddingDomain(true);
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rootDomain: rootDomainInput })
      });
      const data = await res.json();
      if (res.ok) {
        setRootDomainInput("");
        fetchDomains();
      } else {
        alert(data.error || "Failed to add domain");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingDomain(false);
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    try {
      setVerifyingDomain(domainId);
      const res = await fetch(`http://localhost:5000/api/domains/${domainId}/verify`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        fetchDomains();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVerifyingDomain(null);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    if (!confirm("Are you sure you want to delete this domain?")) return;
    try {
      const res = await fetch(`http://localhost:5000/api/domains/${domainId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        fetchDomains();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisconnect = async () => {
    if (!activeDisconnectProvider) return;
    try {
      setDisconnecting(true);
      const res = await fetch(`http://localhost:5000/api/integrations/${activeDisconnectProvider}/disconnect`, {
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
      const res = await fetch(`http://localhost:5000/api/monitors/${monitorId}/check-now`, {
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

  const handleConnectCloudflare = async () => {
    try {
      setSavingCloudflareKey(true);
      const res = await fetch(`http://localhost:5000/api/integrations/cloudflare/connect-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({ apiKey: cloudflareKey })
      });
      if (res.ok) {
        setCloudflareKey("");
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to connect Cloudflare");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingCloudflareKey(false);
    }
  };

  const handleApplyCloudflareDns = async (domainId: string, dryRun: boolean = false) => {
    try {
      setApplyingDns(domainId);
      const res = await fetch(`http://localhost:5000/api/domains/${domainId}/apply-cloudflare-dns?dryRun=${dryRun}`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok) {
        if (dryRun) {
          setDnsPreview(data.preview || []);
        } else {
          setDnsPreview([]);
          fetchDomains();
        }
      } else {
        alert(data.error || "Failed to apply DNS");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setApplyingDns(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  const frontendPlatform = project?.configuration?.frontendPlatform || "vercel";
  const backendPlatform = project?.configuration?.backendPlatform || "railway";
  
  const isFrontendConnected = integrations?.[frontendPlatform]?.connected;
  const isBackendConnected = integrations?.[backendPlatform]?.connected;
  const isCloudflareConnected = integrations?.cloudflare?.connected;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black px-4 sm:px-6 lg:px-8 py-10">
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

        <div className="grid gap-8 lg:grid-cols-2">
          
          {/* Section 1: Connections */}
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">1. Deployment Connections</h2>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
              
              <ConnectionRow 
                name="GitHub" 
                status={integrations?.github?.connected} 
                subtext={integrations?.github?.accountName}
                action={null}
              />
              <ConnectionRow 
                name="Vercel" 
                status={integrations?.vercel?.connected} 
                action={() => setActiveModalProvider('vercel')}
                customActionText="Connect Token"
                onDisconnect={() => setActiveDisconnectProvider('vercel')}
              />
              <ConnectionRow 
                name="Netlify" 
                status={integrations?.netlify?.connected} 
                action={() => handleOAuthConnect('netlify')}
                onDisconnect={() => setActiveDisconnectProvider('netlify')}
              />
              <ConnectionRow 
                name="Railway" 
                status={integrations?.railway?.connected} 
                action={() => setActiveModalProvider('railway')}
                customActionText="Connect Token"
                onDisconnect={() => setActiveDisconnectProvider('railway')}
              />
              <ConnectionRow 
                name="Render" 
                status={integrations?.render?.connected} 
                action={() => setActiveModalProvider('render')}
                customActionText="Connect API Key"
                onDisconnect={() => setActiveDisconnectProvider('render')}
              />
              <ConnectionRow 
                name="Cloudflare" 
                status={false} 
                subtext="Coming soon"
                action={null}
              />
            </div>
          </div>

          {/* Section 2: Actions */}
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">2. Deployment Actions</h2>
            
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
              
              {/* Frontend Action */}
              {frontendPlatform !== "none" && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2 capitalize">Frontend ({frontendPlatform})</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${isFrontendConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm text-white">{isFrontendConnected ? 'Ready to Deploy' : `Requires ${frontendPlatform} connection`}</span>
                    </div>
                    <button 
                      onClick={() => triggerDeployment('frontend')}
                      disabled={!isFrontendConnected || deploying}
                      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deploying && !activeDeploymentId ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
                      Deploy Frontend
                    </button>
                  </div>
                </div>
              )}

              {frontendPlatform !== "none" && backendPlatform !== "none" && (
                <div className="border-t border-zinc-800"></div>
              )}

              {/* Backend Action */}
              {backendPlatform !== "none" && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2 capitalize">Backend ({backendPlatform})</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${isBackendConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm text-white">{isBackendConnected ? 'Ready to Deploy' : `Requires ${backendPlatform} connection`}</span>
                    </div>
                    <button 
                      onClick={() => triggerDeployment('backend')}
                      disabled={!isBackendConnected || deploying}
                      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deploying && !activeDeploymentId ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
                      Deploy Backend
                    </button>
                  </div>
                </div>
              )}

              {/* Full Stack Action */}
              {frontendPlatform !== "none" && backendPlatform !== "none" && (
                <>
                  <div className="border-t border-zinc-800"></div>
                  <div>
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Full Stack Orchestration</h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${isFrontendConnected && isBackendConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm text-white">{isFrontendConnected && isBackendConnected ? 'Ready for Full Pipeline' : 'Requires both connections'}</span>
                      </div>
                      <button 
                        onClick={() => triggerDeployment('full')}
                        disabled={!isFrontendConnected || !isBackendConnected || deploying}
                        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deploying && !activeDeploymentId ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
                        Deploy Full Stack
                      </button>
                    </div>
                  </div>
                </>
              )}

              {frontendPlatform === "none" && backendPlatform === "none" && (
                <div className="text-sm text-zinc-500 text-center py-4">
                  No deployment platforms configured. Go back to Configuration to select platforms.
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Monitoring Section */}
        {monitors && monitors.length > 0 && (
          <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-black/40 px-6 py-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Monitoring</h3>
                <p className="text-xs text-zinc-500 mt-1">Status of your deployed services.</p>
              </div>
              <button
                onClick={() => router.push(`/dashboard/projects/${projectId}/monitoring`)}
                className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                View Dashboard <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {monitors.map((monitor: any, index: number) => (
                  <div key={index} className="rounded-lg border border-zinc-800 bg-black/50 p-4 relative">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-sm font-medium text-white capitalize">{monitor.type}</h4>
                        <a href={monitor.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline">
                          {monitor.url.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${monitor.status === 'online' ? 'text-emerald-400' : monitor.status === 'degraded' ? 'text-yellow-400' : monitor.status === 'offline' ? 'text-red-400' : 'text-zinc-500'}`}>
                          <span className={`h-2 w-2 rounded-full ${monitor.status === 'online' ? 'bg-emerald-400' : monitor.status === 'degraded' ? 'bg-yellow-400' : monitor.status === 'offline' ? 'bg-red-400' : 'bg-zinc-500'}`}></span>
                          {monitor.status === 'unknown' ? 'Not checked' : monitor.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/50">
                      <div className="text-xs text-zinc-500 flex gap-4">
                        <span>{monitor.lastResponseTimeMs ? `${monitor.lastResponseTimeMs}ms` : '-'}</span>
                        <span title={monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleString() : 'Never'}>
                          Checked {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleCheckMonitor(monitor._id)}
                        disabled={checkingMonitorId === monitor._id}
                        className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {checkingMonitorId === monitor._id ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Checking...</>
                        ) : 'Check Now'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Logs Panel */}
        {activeDeploymentId && deploymentLogs && (
          <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">Deployment Logs</h2>
              {deploymentLogs.logs.length > 0 && (
                 <span className="text-sm font-medium text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 capitalize">
                    Current Step: {deploymentLogs.logs[deploymentLogs.logs.length - 1].step.replace(/_/g, ' ')}
                 </span>
              )}
            </div>
            <div className="flex justify-between items-center mb-4 text-sm">
              <span className="text-zinc-400 capitalize">{deploymentLogs.type} deployment • {deploymentLogs.platform}</span>
              <div className="flex items-center gap-4">
                {deploymentLogs.finalSummary?.frontendUrl ? (
                  <a href={deploymentLogs.finalSummary.frontendUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" /> Visit App
                  </a>
                ) : (
                  deploymentLogs.deploymentUrl && (
                    <a href={deploymentLogs.deploymentUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                      <ExternalLink className="h-3 w-3" /> Visit App
                    </a>
                  )
                )}
                {deploymentLogs.finalSummary?.backendUrl && (
                  <a href={deploymentLogs.finalSummary.backendUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" /> Backend API
                  </a>
                )}
                {deploymentLogs.finalSummary?.frontendDashboardUrl && (
                  <a href={deploymentLogs.finalSummary.frontendDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" /> Frontend Dashboard
                  </a>
                )}
                {deploymentLogs.finalSummary?.backendDashboardUrl ? (
                  <a href={deploymentLogs.finalSummary.backendDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" /> Backend Dashboard
                  </a>
                ) : (
                  deploymentLogs.providerDashboardUrl && (
                    <a href={deploymentLogs.providerDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                      <ExternalLink className="h-3 w-3" /> Dashboard
                    </a>
                  )
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider
                  ${deploymentLogs.status === 'success' || deploymentLogs.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    deploymentLogs.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                    'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse'}`}>
                  {deploymentLogs.status}
                </span>
              </div>
            </div>
            <div className="bg-black border border-zinc-800 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm space-y-2">
              {deploymentLogs.logs.map((log: any, idx: number) => (
                <div key={idx} className="flex gap-3">
                  <span className="text-zinc-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warning' ? 'text-yellow-400' :
                    log.level === 'success' ? 'text-emerald-400' : 'text-zinc-300'
                  }>{log.message}</span>
                </div>
              ))}
              {(deploymentLogs.status === 'running' || deploymentLogs.status === 'queued') && (
                 <div className="flex gap-3 text-zinc-500 animate-pulse mt-4">
                   <span>[{new Date().toLocaleTimeString()}]</span>
                   <span>Waiting for next log entry...</span>
                 </div>
              )}
            </div>
          </div>
        )}

        {/* Final Deployment Summary Card */}
        {activeDeploymentId && deploymentLogs && (deploymentLogs.status === 'success' || deploymentLogs.status === 'failed') && deploymentLogs.finalSummary && (
          <div className={`mt-8 rounded-xl border p-6 ${deploymentLogs.status === 'success' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
            <h2 className={`text-xl font-bold mb-6 flex items-center gap-2 ${deploymentLogs.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
              {deploymentLogs.status === 'success' ? <CheckCircle2 className="h-6 w-6" /> : null}
              {deploymentLogs.status === 'success' ? 'Deployment Complete' : 'Deployment Failed'}
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-zinc-500">Frontend URL</p>
                  <a href={deploymentLogs.finalSummary.frontendUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1">
                    {deploymentLogs.finalSummary.frontendUrl} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Backend URL</p>
                  <a href={deploymentLogs.finalSummary.backendUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1">
                    {deploymentLogs.finalSummary.backendUrl} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Duration</p>
                  <p className="text-sm text-white">{Math.round(deploymentLogs.finalSummary.durationMs / 1000)} seconds</p>
                </div>
              </div>
              
              <div className="space-y-3 bg-black/40 p-4 rounded-lg border border-zinc-800">
                <p className="text-sm font-medium text-zinc-400 border-b border-zinc-800 pb-2">Health Checks</p>
                <HealthStatusRow label="Backend" data={deploymentLogs.healthCheck?.backend} />
                <HealthStatusRow label="Frontend" data={deploymentLogs.healthCheck?.frontend} />
                <HealthStatusRow label="CORS" data={deploymentLogs.healthCheck?.cors} />
                <HealthStatusRow label="Database" data={deploymentLogs.healthCheck?.database} />
              </div>
            </div>

            {deploymentLogs.status === 'failed' && deploymentLogs.finalSummary.failedStep && (
              <div className="mt-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm font-bold text-red-400 mb-1">Failed Step: {deploymentLogs.finalSummary.failedStep}</p>
                <p className="text-sm text-red-300 mb-3">{deploymentLogs.finalSummary.failureReason}</p>
                <div className="p-3 bg-red-950/50 rounded border border-red-500/10">
                  <p className="text-xs font-semibold text-zinc-400 mb-1">Suggested Fix</p>
                  <p className="text-sm text-white">{deploymentLogs.finalSummary.suggestedFix}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Deployments */}
        <div className="mt-8 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Recent Deployments</h2>
            <button 
              onClick={() => router.push(`/dashboard/projects/${projectId}/deployments`)}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              View Deployment History <ExternalLink className="h-3 w-3" />
            </button>
          </div>
          {deploymentsHistory.length === 0 ? (
            <div className="text-sm text-zinc-500 text-center py-8 rounded-xl border border-zinc-800 border-dashed">No deployments yet</div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
              {deploymentsHistory.map(dep => (
                <div key={dep._id} className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors" onClick={() => {setActiveDeploymentId(dep._id); setDeploymentLogs(dep);}}>
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${dep.status === 'success' ? 'bg-emerald-500' : dep.status === 'failed' ? 'bg-red-500' : dep.status === 'queued' ? 'bg-zinc-500' : 'bg-indigo-500 animate-pulse'}`}></div>
                    <div>
                      <h4 className="text-sm font-medium text-white capitalize">{dep.type} Deployment</h4>
                      <p className="text-xs text-zinc-500 mt-0.5 capitalize">Platform: {dep.platform}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                     {(dep.status === 'success' || dep.status === 'completed') && dep.deploymentUrl && (
                       <a href={dep.deploymentUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                         <ExternalLink className="h-3 w-3" /> Live URL
                       </a>
                     )}
                     <div className="text-right">
                       <span className={`text-xs font-medium px-2 py-1 rounded-full uppercase tracking-wider ${dep.status === 'success' || dep.status === 'completed' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : dep.status === 'failed' ? 'text-red-400 bg-red-500/10 border border-red-500/20' : 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'}`}>
                         {dep.status}
                       </span>
                       <p className="text-xs text-zinc-500 mt-2">{new Date(dep.createdAt).toLocaleString()}</p>
                     </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom Domain Section */}
        <div className="mt-8 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Custom Domain</h2>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex gap-4 items-end mb-6">
              <div className="flex-1">
                <label className="block text-sm font-medium text-zinc-400 mb-2">Root Domain</label>
                <input 
                  type="text" 
                  placeholder="example.com"
                  value={rootDomainInput}
                  onChange={(e) => setRootDomainInput(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-black p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <button 
                onClick={handleAddDomain}
                disabled={!rootDomainInput || addingDomain}
                className="rounded-lg bg-indigo-500 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-2"
              >
                {addingDomain && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Domain
              </button>
            </div>
            
            {domainSetups.length > 0 && (
              <div className="space-y-6">
                {domainSetups.map(domain => (
                  <div key={domain._id} className="rounded-lg border border-zinc-800 bg-black/40 p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-md font-medium text-white">{domain.rootDomain}</h3>
                        <p className="text-xs text-zinc-500 mt-1">Status: <span className="uppercase text-indigo-400">{domain.status}</span></p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleVerifyDomain(domain._id)}
                          disabled={verifyingDomain === domain._id}
                          className="rounded bg-zinc-800 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          {verifyingDomain === domain._id && <Loader2 className="h-3 w-3 animate-spin" />}
                          Verify DNS
                        </button>
                        {domain.status !== 'active' && (
                          <button 
                            onClick={() => handleDeleteDomain(domain._id)}
                            className="rounded border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 flex items-center gap-2"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="p-3 bg-zinc-900 rounded border border-zinc-800">
                        <p className="text-xs text-zinc-500 mb-1">Frontend (Vercel)</p>
                        <p className="text-sm text-white">https://{domain.frontendDomain}</p>
                        <p className="text-sm text-white mt-1">https://{domain.wwwDomain}</p>
                        <p className="text-xs text-zinc-500 mt-2">Verification: {domain.frontendVerification}</p>
                      </div>
                      <div className="p-3 bg-zinc-900 rounded border border-zinc-800">
                        <p className="text-xs text-zinc-500 mb-1">Backend ({domain.backendProvider})</p>
                        <p className="text-sm text-white">https://{domain.backendDomain}</p>
                        <p className="text-xs text-zinc-500 mt-2">Verification: {domain.backendVerification}</p>
                        {domain.backendVerification === 'manual_setup_required' && (
                          <p className="text-xs text-amber-400 mt-1">Manual setup required in {domain.backendProvider} dashboard.</p>
                        )}
                      </div>
                    </div>
                    
                    {domain.dnsRecords && domain.dnsRecords.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-zinc-400 mb-2">DNS Records to Add:</p>
                        <div className="overflow-x-auto rounded border border-zinc-800">
                          <table className="w-full text-left text-sm text-zinc-400">
                            <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                              <tr>
                                <th className="px-4 py-2">Type</th>
                                <th className="px-4 py-2">Name</th>
                                <th className="px-4 py-2">Value</th>
                                <th className="px-4 py-2">Purpose</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800 bg-black/40">
                              {domain.dnsRecords.map((rec: any, i: number) => (
                                <tr key={i}>
                                  <td className="px-4 py-2 font-mono">{rec.type}</td>
                                  <td className="px-4 py-2 font-mono">{rec.name}</td>
                                  <td className="px-4 py-2 font-mono text-indigo-300">{rec.value}</td>
                                  <td className="px-4 py-2 capitalize">{rec.purpose}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {domain.status !== 'active' && (
                      <div className="mt-4 pt-4 border-t border-zinc-800">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-white">Cloudflare DNS Automation</h4>
                          {isCloudflareConnected ? (
                            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">Connected</span>
                          ) : (
                            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded">Not connected</span>
                          )}
                        </div>
                        
                        {!isCloudflareConnected ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2 items-center">
                              <input 
                                type="password"
                                placeholder="Cloudflare API Token..."
                                value={cloudflareKey}
                                onChange={(e) => setCloudflareKey(e.target.value)}
                                className="flex-1 rounded border border-zinc-800 bg-black p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                              />
                              <button
                                onClick={handleConnectCloudflare}
                                disabled={!cloudflareKey || savingCloudflareKey}
                                className="rounded bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                              >
                                {savingCloudflareKey && <Loader2 className="h-3 w-3 animate-spin" />}
                                Connect
                              </button>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-1">
                              Create a Custom Token in your <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Cloudflare Profile</a> with these Permissions:
                              <br />• <strong>Zone</strong> / <strong>Zone</strong> / <strong>Read</strong>
                              <br />• <strong>Zone</strong> / <strong>DNS</strong> / <strong>Edit</strong>
                              <br />Set Zone Resources to <strong>Include</strong> / <strong>All zones</strong> (or specific domain).
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApplyCloudflareDns(domain._id, true)}
                                disabled={applyingDns === domain._id}
                                className="rounded border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
                              >
                                {applyingDns === domain._id && <Loader2 className="h-3 w-3 animate-spin" />}
                                Preview Changes
                              </button>
                              
                              {dnsPreview.length > 0 && applyingDns !== domain._id && (
                                <button
                                  onClick={() => handleApplyCloudflareDns(domain._id, false)}
                                  className="rounded bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-600 flex items-center gap-2"
                                >
                                  Apply DNS Automatically
                                </button>
                              )}
                            </div>
                            
                            {dnsPreview.length > 0 && applyingDns !== domain._id && (
                              <div className="mt-3 space-y-1">
                                {dnsPreview.map((p, i) => (
                                  <div key={i} className="text-xs flex gap-2">
                                    <span className={`px-1.5 py-0.5 rounded capitalize ${p.action === 'create' ? 'bg-green-500/10 text-green-400' : p.action === 'skip' ? 'bg-zinc-800 text-zinc-400' : p.action === 'conflict' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                                      {p.action}
                                    </span>
                                    <span className="text-zinc-300 font-mono">{p.record}</span>
                                    <span className="text-zinc-500">- {p.reason}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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

    </div>
  );
}

function ConnectionRow({ name, status, subtext, action, customActionText = "Connect", onDisconnect }: any) {
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <h4 className="text-sm font-medium text-white">{name}</h4>
        {subtext && <p className="text-xs text-zinc-500 mt-0.5">{subtext}</p>}
      </div>
      <div>
        {status ? (
          <button 
            onClick={onDisconnect || (() => {})}
            className="flex items-center gap-1 text-sm text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 hover:text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/20 transition-colors"
            title="Click to disconnect"
          >
            <CheckCircle2 className="h-4 w-4" /> Connected
          </button>
        ) : action ? (
          <button 
            onClick={action}
            className="flex items-center gap-1 text-sm text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded-full transition-colors"
          >
            <Link2 className="h-4 w-4" /> {customActionText}
          </button>
        ) : (
          <span className="text-sm text-zinc-500 px-3 py-1">Not connected</span>
        )}
      </div>
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
