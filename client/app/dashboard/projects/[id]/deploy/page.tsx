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

  useEffect(() => {
    fetchData();
    fetchDeploymentsHistory();
    
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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  const frontendPlatform = project?.configuration?.frontendPlatform || "vercel";
  const backendPlatform = project?.configuration?.backendPlatform || "railway";
  
  const isFrontendConnected = integrations?.[frontendPlatform]?.connected;
  const isBackendConnected = integrations?.[backendPlatform]?.connected;

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

              {frontendPlatform === "none" && backendPlatform === "none" && (
                <div className="text-sm text-zinc-500 text-center py-4">
                  No deployment platforms configured. Go back to Configuration to select platforms.
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Logs Panel */}
        {activeDeploymentId && deploymentLogs && (
          <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Deployment Logs</h2>
            <div className="flex justify-between items-center mb-4 text-sm">
              <span className="text-zinc-400 capitalize">{deploymentLogs.type} deployment • {deploymentLogs.platform}</span>
              <div className="flex items-center gap-4">
                {deploymentLogs.deploymentUrl && (
                  <a href={deploymentLogs.deploymentUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" /> Visit App
                  </a>
                )}
                {deploymentLogs.providerDashboardUrl && (
                  <a href={deploymentLogs.providerDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-300 flex items-center gap-1 text-xs transition-colors" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" /> Dashboard
                  </a>
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

        {/* Recent Deployments */}
        <div className="mt-8 space-y-6">
          <h2 className="text-lg font-semibold text-white">Recent Deployments</h2>
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
