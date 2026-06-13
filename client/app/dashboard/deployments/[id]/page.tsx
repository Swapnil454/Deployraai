"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Bot, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function DeploymentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const deploymentId = params.id;

  const [loading, setLoading] = useState(true);
  const [deployment, setDeployment] = useState<any>(null);
  
  const [explaining, setExplaining] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  
  const [retrying, setRetrying] = useState(false);
  const [creatingFix, setCreatingFix] = useState(false);
  const [fixPrData, setFixPrData] = useState<any>(null);

  useEffect(() => {
    fetchDeployment();
  }, [deploymentId]);

  const fetchDeployment = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDeployment(data);
        if (data.aiAnalysis) setAiAnalysis(data.aiAnalysis);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExplainError = async () => {
    try {
      setExplaining(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}/explain-error`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.aiAnalysis) {
        setAiAnalysis(data.aiAnalysis);
      } else {
        alert(data.error || "Failed to generate explanation");
      }
    } catch (err) {
      console.error(err);
      alert("Error generating explanation");
    } finally {
      setExplaining(false);
    }
  };

  const handleRetryDeployment = async () => {
    try {
      setRetrying(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}/retry`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.deploymentId) {
        // Navigate to the new deployment details page
        window.location.href = `/dashboard/deployments/${data.deploymentId}`;
      } else {
        alert(data.error || "Failed to retry deployment");
        setRetrying(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error retrying deployment");
      setRetrying(false);
    }
  };

  const handleCreateFixPr = async () => {
    try {
      setCreatingFix(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}/create-fix-pr`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.pr) {
        setFixPrData(data.pr);
        setAiAnalysis({...aiAnalysis, fixStatus: 'pr_created'});
      } else {
        alert(data.error || "Failed to create Fix PR");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating Fix PR");
    } finally {
      setCreatingFix(false);
    }
  };

  if (loading || !deployment) {
    return <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  const isFailed = deployment.status === 'failed' || deployment.status === 'warning';

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black px-4 sm:px-6 lg:px-8 py-10">
      <div className="mx-auto w-full max-w-5xl">
        
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push(`/dashboard/projects/${deployment.projectId}/deployments`)} className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                Deployment Details
                <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider
                  ${deployment.status === 'success' || deployment.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    deployment.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                    'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                  {deployment.status}
                </span>
              </h1>
              <p className="text-sm text-zinc-400 capitalize mt-1">{deployment.type} Stack • {new Date(deployment.createdAt).toLocaleString()}</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            {isFailed && (
               <button 
                 onClick={handleExplainError}
                 disabled={explaining}
                 className="flex items-center gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
               >
                 {explaining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                 {aiAnalysis ? 'Regenerate Analysis' : 'Explain Error with AI'}
               </button>
            )}
            <button 
              onClick={handleRetryDeployment}
              disabled={retrying}
              className="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Retry Deployment
            </button>
          </div>
        </div>

        {/* AI Diagnosis Card */}
        {aiAnalysis && (
          <div className="mb-8 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-6 shadow-lg shadow-indigo-500/5">
            <div className="flex items-center gap-3 mb-6 border-b border-indigo-500/10 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">AI Diagnosis</h2>
                <p className="text-xs text-indigo-400/80">Generated {new Date(aiAnalysis.generatedAt).toLocaleString()}</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Problem Summary</p>
                <p className="text-white text-sm bg-black/40 p-4 rounded-lg border border-zinc-800/50 leading-relaxed">{aiAnalysis.summary}</p>
              </div>
              
              <div>
                <p className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Likely Cause</p>
                <p className="text-zinc-300 text-sm bg-black/40 p-4 rounded-lg border border-zinc-800/50 leading-relaxed">{aiAnalysis.likelyCause}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Suggested Fixes
                </p>
                <ul className="space-y-2">
                  {aiAnalysis.suggestedFixes?.map((fix: string, idx: number) => (
                    <li key={idx} className="flex gap-3 text-sm text-zinc-300 bg-black/40 p-3 rounded-lg border border-zinc-800/50">
                      <span className="text-indigo-400 font-bold">{idx + 1}.</span> {fix}
                    </li>
                  ))}
                </ul>
              </div>

                <div className="flex gap-4 pt-4 border-t border-indigo-500/10 items-center justify-between">
                <div className="flex gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500">Severity:</span>
                    <span className={`capitalize font-medium ${aiAnalysis.severity === 'high' ? 'text-red-400' : aiAnalysis.severity === 'medium' ? 'text-yellow-400' : 'text-indigo-400'}`}>
                      {aiAnalysis.severity}
                    </span>
                  </div>
                  {aiAnalysis.failureCategory && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500">Category:</span>
                      <span className={`capitalize font-medium ${
                        aiAnalysis.failureCategory === 'platform_internal_bug' ? 'text-red-400' : 
                        aiAnalysis.failureCategory === 'config_issue' ? 'text-orange-400' : 
                        aiAnalysis.failureCategory === 'provider_issue' ? 'text-yellow-400' : 'text-indigo-400'
                      }`}>
                        {aiAnalysis.failureCategory.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500">Auto-fix Possible:</span>
                    <span className={`font-medium ${aiAnalysis.canAutoFix ? 'text-emerald-400' : 'text-zinc-400'}`}>
                      {aiAnalysis.canAutoFix ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>

                {/* Conditional Actions Based on UserAction */}
                {aiAnalysis.userAction === 'create_fix_pr' && aiAnalysis.canAutoFix && aiAnalysis.fixStatus !== 'pr_created' && !fixPrData && (
                  <button 
                    onClick={handleCreateFixPr}
                    disabled={creatingFix}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    {creatingFix ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generating Fix...</>
                    ) : (
                      <>🚀 Create Fix PR</>
                    )}
                  </button>
                )}

                {aiAnalysis.userAction === 'update_config' && (
                  <button 
                    onClick={() => router.push(`/dashboard/projects/${deployment?.projectId}/configure?deploymentId=${deploymentId}&fix=config`)}
                    className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500 transition-colors shadow-lg shadow-orange-500/20"
                  >
                    ⚙️ Fix Configuration
                  </button>
                )}

                {aiAnalysis.userAction === 'reconnect_provider' && (
                  <button 
                    onClick={() => router.push('/dashboard')}
                    className="flex items-center gap-2 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-bold text-white hover:bg-yellow-500 transition-colors shadow-lg shadow-yellow-500/20"
                  >
                    🔌 Reconnect Provider
                  </button>
                )}
                
                {(aiAnalysis.userAction === 'retry' || !aiAnalysis.userAction) && !aiAnalysis.canAutoFix && aiAnalysis.failureCategory !== 'platform_internal_bug' && (
                   <button 
                    onClick={handleRetryDeployment}
                    disabled={retrying}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Retry
                  </button>
                )}
              </div>
              
              {/* Note before creating PR */}
              {aiAnalysis.canAutoFix && aiAnalysis.fixStatus !== 'pr_created' && !fixPrData && (
                <div className="text-xs text-indigo-300/60 mt-2 italic text-right">
                  DeployAI will create a new GitHub branch and open a pull request. It will not push to main.
                </div>
              )}

              {/* Internal Bug Report Banner */}
              {aiAnalysis.failureCategory === 'platform_internal_bug' && (
                <div className="mt-6 p-5 rounded-lg bg-red-950/30 border border-red-500/30 flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-red-400 font-bold mb-1">DeployAI Internal Issue</h3>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      This looks like a DeployAI internal issue, not a problem with your repository.
                      A bug report has been automatically created. Our engineering team has been notified.
                    </p>
                  </div>
                </div>
              )}

              {/* PR Result Card */}
              {(fixPrData || aiAnalysis.fixStatus === 'pr_created') && (
                <div className="mt-6 p-5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold mb-3 text-lg">
                    <CheckCircle2 className="h-6 w-6" /> Fix PR Created Successfully!
                  </div>
                  <p className="text-sm text-zinc-300 mb-5 leading-relaxed">
                    DeployAI has created a new GitHub branch and opened a pull request with the fix. Review and merge it, then retry your deployment.
                  </p>
                  
                  {fixPrData?.pullRequestUrl ? (
                    <a 
                      href={fixPrData.pullRequestUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-5 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      Review PR on GitHub <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <p className="text-sm text-zinc-500 italic">Refresh to view PR link or check your GitHub repo.</p>
                  )}
                  
                  <div className="mt-5 pt-5 border-t border-emerald-500/10 flex items-center gap-3">
                    <button 
                      onClick={handleRetryDeployment}
                      disabled={retrying}
                      className="flex items-center gap-2 rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                    >
                      {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Retry After Merge
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Logs Viewer */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Deployment Logs</h2>
              <div className="bg-black border border-zinc-800 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm space-y-2">
                {deployment.logs?.map((log: any, idx: number) => (
                  <div key={idx} className="flex gap-3">
                    <span className="text-zinc-500 whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={
                      log.level === 'error' ? 'text-red-400 break-words' :
                      log.level === 'warning' ? 'text-yellow-400 break-words' :
                      log.level === 'success' ? 'text-emerald-400 break-words' : 'text-zinc-300 break-words'
                    }>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            
            {/* Details Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h2 className="text-lg font-semibold text-white mb-6 border-b border-zinc-800 pb-2">Overview</h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Duration</p>
                  <p className="text-sm text-zinc-300">{deployment.durationMs ? `${Math.round(deployment.durationMs / 1000)}s` : '-'}</p>
                </div>
                
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Failed Step</p>
                  <p className="text-sm text-red-400">{deployment.finalSummary?.failedStep || '-'}</p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Frontend URL</p>
                  {deployment.finalSummary?.frontendUrl ? (
                    <a href={deployment.finalSummary.frontendUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 break-all">
                      {deployment.finalSummary.frontendUrl} <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : <span className="text-sm text-zinc-500">-</span>}
                </div>

                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Backend URL</p>
                  {deployment.finalSummary?.backendUrl ? (
                    <a href={deployment.finalSummary.backendUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 break-all">
                      {deployment.finalSummary.backendUrl} <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : <span className="text-sm text-zinc-500">-</span>}
                </div>
              </div>
            </div>

            {/* Health Checks Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h2 className="text-lg font-semibold text-white mb-6 border-b border-zinc-800 pb-2">Health Checks</h2>
              
              <div className="space-y-4">
                <HealthStatusRow label="Backend" data={deployment.healthCheck?.backend} />
                <HealthStatusRow label="Frontend" data={deployment.healthCheck?.frontend} />
                <HealthStatusRow label="CORS" data={deployment.healthCheck?.cors} />
                <HealthStatusRow label="Database" data={deployment.healthCheck?.database} />
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

function HealthStatusRow({ label, data }: any) {
  if (!data) return <div className="flex justify-between items-center text-sm"><span className="text-zinc-400">{label}</span><span className="text-zinc-600">Pending</span></div>;
  const colors = {
    passed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    warning: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    failed: 'text-red-400 bg-red-500/10 border-red-500/20',
    skipped: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    unknown: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  };
  const colorClass = (colors as any)[data.status] || colors.unknown;

  return (
    <div className="flex justify-between items-start text-sm">
      <span className="text-zinc-300">{label}</span>
      <div className="text-right flex flex-col items-end max-w-[150px]">
        <span className={`px-2 py-0.5 rounded text-[10px] border ${colorClass} uppercase tracking-wider font-bold`}>{data.status}</span>
      </div>
    </div>
  );
}
