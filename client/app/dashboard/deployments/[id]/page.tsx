"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  ArrowLeft, ExternalLink, Loader2, RefreshCw, Bot, AlertTriangle, 
  CheckCircle2, Share, List, ChevronDown, ChevronRight, Clock, 
  Globe, GitBranch, GitCommit, Copy, MoreHorizontal, ArrowUp, ArrowUpCircle, Zap, CircleDashed, Smartphone, RotateCcw
} from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";
import QRCode from "react-qr-code";

const TreeLine = ({ isLast }: { isLast?: boolean }) => (
  <svg width="16" height="24" viewBox="0 0 16 24" fill="none" className="absolute left-[-16px] top-[-12px] text-zinc-700">
    <path d={isLast ? "M0 0V12C0 14.2091 1.79086 16 4 16H16" : "M0 0V24M0 12C0 14.2091 1.79086 16 4 16H16"} stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

// Live monitor widget shown instead of screenshot for backend deployments
function LiveMonitorWidget({ deployment, primaryDomain }: { deployment: any, primaryDomain?: string }) {
  const [healthStatus, setHealthStatus] = useState<'checking' | 'up' | 'down' | 'unknown'>('checking');
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [pingHistory, setPingHistory] = useState<{ ok: boolean; time: number }[]>([]);
  const [checkCount, setCheckCount] = useState(0);

  const backendUrl = primaryDomain || deployment.finalSummary?.backendUrl || deployment.deploymentUrl || deployment.providerUrl || '';
  const isDeploymentSuccess = deployment.status === 'success' || deployment.status === 'completed';
  const platform = deployment.platform;

  const checkHealth = async () => {
    if (!backendUrl || !isDeploymentSuccess) {
      setHealthStatus('unknown');
      return;
    }
    const start = Date.now();
    try {
      // Proxy through our own API to avoid CORS; fall back to a basic fetch
      const healthUrl = backendUrl.startsWith('http') ? backendUrl : `https://${backendUrl}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/proxy-health?url=${encodeURIComponent(healthUrl + '/health')}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      const ok = res.ok;
      setHealthStatus(ok ? 'up' : 'down');
      setResponseTime(elapsed);
      setLastChecked(new Date());
      setPingHistory(prev => [...prev.slice(-11), { ok, time: elapsed }]);
    } catch {
      const elapsed = Date.now() - start;
      setHealthStatus('down');
      setResponseTime(null);
      setLastChecked(new Date());
      setPingHistory(prev => [...prev.slice(-11), { ok: false, time: elapsed }]);
    }
    setCheckCount(c => c + 1);
  };

  useEffect(() => {
    if (!isDeploymentSuccess) { setHealthStatus('unknown'); return; }
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [backendUrl, isDeploymentSuccess]);

  const platformColor = platform === 'railway' ? 'text-violet-400' : platform === 'render' ? 'text-emerald-400' : 'text-zinc-400';
  const platformLabel = platform === 'railway' ? 'Railway' : platform === 'render' ? 'Render' : platform || 'Backend';

  const statusColor = healthStatus === 'up' ? 'bg-emerald-500' : healthStatus === 'down' ? 'bg-red-500' : healthStatus === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-600';
  const statusText = healthStatus === 'up' ? 'Operational' : healthStatus === 'down' ? 'Down' : healthStatus === 'checking' ? 'Checking…' : 'Unknown';

  const avgResponseTime = pingHistory.length > 0
    ? Math.round(pingHistory.reduce((s, p) => s + p.time, 0) / pingHistory.length)
    : null;
  const uptimePct = pingHistory.length > 0
    ? Math.round((pingHistory.filter(p => p.ok).length / pingHistory.length) * 100)
    : null;

  return (
    <div className="w-full aspect-[16/10] rounded-lg border border-zinc-800 bg-[#0d0d0d] overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-[#111]">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${statusColor}`} />
          <span className="text-[13px] font-semibold text-white">Live Monitor</span>
          <span className={`text-[11px] font-medium ${platformColor}`}>{platformLabel}</span>
        </div>
        <button
          onClick={checkHealth}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Status row */}
      <div className="px-4 py-3 border-b border-zinc-800/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${statusColor}`} />
            <span className={`text-[15px] font-semibold ${healthStatus === 'up' ? 'text-emerald-400' : healthStatus === 'down' ? 'text-red-400' : 'text-zinc-400'}`}>
              {statusText}
            </span>
          </div>
          {responseTime !== null && (
            <span className="text-[13px] text-zinc-500 font-mono">{responseTime}ms</span>
          )}
        </div>
        {lastChecked && (
          <p className="text-[11px] text-zinc-600 mt-1">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 divide-x divide-zinc-800/60 border-b border-zinc-800/60">
        <div className="px-3 py-2.5 text-center">
          <div className="text-[11px] text-zinc-500 mb-0.5">Avg Response</div>
          <div className="text-[14px] font-mono text-zinc-200">{avgResponseTime !== null ? `${avgResponseTime}ms` : '—'}</div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <div className="text-[11px] text-zinc-500 mb-0.5">Uptime</div>
          <div className={`text-[14px] font-mono ${uptimePct === 100 ? 'text-emerald-400' : uptimePct !== null && uptimePct < 90 ? 'text-red-400' : 'text-zinc-200'}`}>
            {uptimePct !== null ? `${uptimePct}%` : '—'}
          </div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <div className="text-[11px] text-zinc-500 mb-0.5">Checks</div>
          <div className="text-[14px] font-mono text-zinc-200">{checkCount}</div>
        </div>
      </div>

      {/* Ping history sparkline */}
      <div className="flex-1 px-4 py-3 flex flex-col justify-between">
        <div className="text-[11px] text-zinc-600 mb-2">Response history (last 12 pings)</div>
        <div className="flex items-end gap-1 h-10">
          {pingHistory.length === 0 ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex-1 h-2 rounded-sm bg-zinc-800" />
            ))
          ) : (
            pingHistory.map((p, i) => {
              const maxTime = Math.max(...pingHistory.map(x => x.time), 1);
              const heightPct = Math.max(10, Math.round((p.time / maxTime) * 100));
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-sm transition-all ${p.ok ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
                  style={{ height: `${heightPct}%` }}
                  title={`${p.ok ? 'OK' : 'Error'} — ${p.time}ms`}
                />
              );
            })
          )}
        </div>

        {/* Backend URL */}
        {backendUrl && (
          <a
            href={backendUrl.startsWith('http') ? backendUrl : `https://${backendUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors truncate"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{backendUrl.replace('https://', '').replace('http://', '')}</span>
          </a>
        )}
      </div>
    </div>
  );
}


export default function DeploymentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const deploymentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [deployment, setDeployment] = useState<any>(null);
  
  const [explaining, setExplaining] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  
  const [retrying, setRetrying] = useState(false);
  const [creatingFix, setCreatingFix] = useState(false);
  const [fixPrData, setFixPrData] = useState<any>(null);

  // Accordion states
  const [openSettings, setOpenSettings] = useState(false);
  const [openLogs, setOpenLogs] = useState(true);
  const [openSummary, setOpenSummary] = useState(false);
  const [openChecks, setOpenChecks] = useState(false);
  const [openDomains, setOpenDomains] = useState(false);
  const [openQR, setOpenQR] = useState(false);
  const [openMore, setOpenMore] = useState(false);

  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const allDomainsToShow = useMemo(() => {
    if (!deployment) return [];
    const applicableCustomDomains = (deployment.customDomains || []).filter((d: any) => {
      if (d.status !== 'verified') return false;
      if (deployment.type === 'backend') return d.type === 'backend';
      if (deployment.type === 'frontend') return d.type === 'frontend' || d.type === 'www';
      return true;
    });

    const allDomains = new Set<string>();
    applicableCustomDomains.forEach((d: any) => allDomains.add(d.url));
    if (deployment.finalSummary?.frontendUrl) allDomains.add(deployment.finalSummary.frontendUrl);
    if (deployment.deploymentUrl) allDomains.add(deployment.deploymentUrl);
    if (deployment.providerUrl) allDomains.add(deployment.providerUrl);

    return Array.from(allDomains).filter((url: string) => 
      url && !url.includes('dashboard.render.com') && 
      !url.includes('railway.app/project/') && 
      !url.includes('vercel.com/')
    );
  }, [deployment]);

  const getVisitUrl = () => {
    if (allDomainsToShow.length > 0) return allDomainsToShow[0];
    return '#';
  };

  const handleShare = async () => {
    const url = getVisitUrl();
    if (url && url !== '#') {
      let finalUrl = url;
      if (!finalUrl.startsWith('http')) finalUrl = `https://${finalUrl}`;
      
      try {
        if (navigator.share) {
          await navigator.share({
            title: `Deployment - ${deployment?.projectId?.name || 'Application'}`,
            text: 'Check out this deployment preview!',
            url: finalUrl,
          });
        } else {
          // Fallback to clipboard if Web Share API is not supported
          await navigator.clipboard.writeText(finalUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } catch (err) {
        console.log("Share canceled or failed", err);
      }
    }
  };

  const handleCopyUrl = async () => {
    const url = getVisitUrl();
    if (url && url !== '#') {
      let finalUrl = url;
      if (!finalUrl.startsWith('http')) finalUrl = `https://${finalUrl}`;
      try {
        await navigator.clipboard.writeText(finalUrl);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      } catch (err) {
        console.error("Failed to copy", err);
      }
    }
  };

  const handleRedeploy = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}/retry`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.deploymentId) {
        setOpenMore(false);
        router.push(`/dashboard/deployments/${data.deploymentId}`);
      } else {
        console.error("Failed to redeploy:", data.error);
      }
    } catch (err) {
      console.error("Error triggering redeploy:", err);
    }
  };

  const handleInstantRollback = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}/rollback`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.deploymentId) {
        setOpenMore(false);
        router.push(`/dashboard/deployments/${data.deploymentId}`);
      } else {
        console.error("Failed to rollback:", data.error);
        alert(data.error || "Failed to instantly rollback deployment");
      }
    } catch (err) {
      console.error("Error triggering rollback:", err);
      alert("Error triggering rollback");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        if (deployment.type === 'frontend') {
          router.push('/dashboard/deployments/frontend');
        } else if (deployment.type === 'backend') {
          router.push('/dashboard/deployments/backend');
        } else if (deployment.type === 'fullstack') {
          router.push('/dashboard/deployments/fullstack');
        } else {
          router.push('/dashboard/deployments');
        }
      } else {
        const data = await res.json();
        alert(`Failed to delete: ${data.error}`);
        setIsDeleting(false);
        setShowDeleteModal(false);
      }
    } catch (err) {
      console.error("Error deleting deployment:", err);
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  useEffect(() => {
    fetchDeployment();
  }, [deploymentId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const isPending = !deployment || deployment.status === 'queued' || deployment.status === 'running' || 
      ((deployment.status === 'completed' || deployment.status === 'success') && !deployment.finalSummary?.screenshotUrl);

    if (isPending && deploymentId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setDeployment(data);
            if (data.aiAnalysis) setAiAnalysis(data.aiAnalysis);
          }
        } catch (err) {}
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [deployment?.status, deployment?.finalSummary?.screenshotUrl, deploymentId]);

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
        setOpenSummary(true); // Open summary to show the AI diagnosis
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
    return <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#0a0a0a]"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>;
  }

  const isFailed = deployment.status === 'failed' || deployment.status === 'warning';
  const isSuccess = deployment.status === 'success' || deployment.status === 'completed';
  const isRunning = deployment.status === 'running';
  
  const owner = deployment.source?.repoOwner || deployment.projectId?.repoFullName?.split('/')[0] || 'github';
  const isProd = deployment.source?.branch === 'main' || deployment.source?.branch === 'master';
  
  // Calculate relative time for header
  const diffMs = Date.now() - new Date(deployment.createdAt).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  let timeAgo = 'just now';
  if (diffDays > 0) timeAgo = `${diffDays}d ago`;
  else if (diffHrs > 0) timeAgo = `${diffHrs}h ago`;
  else if (diffMins > 0) timeAgo = `${diffMins}m ago`;

  const durationSec = deployment.durationMs 
    ? Math.round(deployment.durationMs / 1000)
    : deployment.startedAt && deployment.completedAt
      ? Math.round((new Date(deployment.completedAt).getTime() - new Date(deployment.startedAt).getTime()) / 1000)
      : null;

  const shortCommitSha = deployment.source?.commitSha ? deployment.source.commitSha.substring(0, 7) : 'Unknown';
  const shortId = deploymentId.substring(deploymentId.length - 9);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#0a0a0a] text-zinc-200 font-sans pb-20">
      
      {/* VERCEL HEADER */}
      <div className="border-b border-zinc-800 bg-[#0a0a0a] sticky top-0 z-10 px-6 pt-4">
        <div className="max-w-[1400px] mx-auto">

          {/* Action Row */}
          <div className="flex items-center justify-between mb-4">
            {/* Tabs */}
            <div className="flex items-center gap-6">
              <button className="text-white text-[14px] font-medium border-b-2 border-white pb-1.5 -mb-[18px]">Deployment</button>
              <button className="text-zinc-400 hover:text-zinc-200 text-[14px] font-medium pb-1.5 -mb-[18px] transition-colors" onClick={() => router.push(`/dashboard/logs/${deployment?.projectId?._id || deployment?.projectId}/${deploymentId}`)}>Logs</button>
              <button className="text-zinc-400 hover:text-zinc-200 text-[14px] font-medium pb-1.5 -mb-[18px] transition-colors">Resources</button>
              <button className="text-zinc-400 hover:text-zinc-200 text-[14px] font-medium pb-1.5 -mb-[18px] transition-colors">Source</button>
              <button className="text-zinc-400 hover:text-zinc-200 text-[14px] font-medium pb-1.5 -mb-[18px] transition-colors">Open Graph</button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Main Details Card */}
        <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] mb-6 relative">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between rounded-t-lg">
            <h2 className="text-[15px] font-semibold text-white">Deployment Details</h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleShare}
                disabled={!isSuccess}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-800 text-[13px] font-medium transition-colors ${!isSuccess ? 'text-zinc-600 cursor-not-allowed opacity-60' : 'hover:bg-zinc-900 text-zinc-300'}`}
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Share className="h-4 w-4" />} 
                {copied ? 'Copied' : 'Share'}
              </button>
              
              <button onClick={() => router.push(`/dashboard/logs/${deployment?.projectId?._id || deployment?.projectId}/${deploymentId}`)} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-800 hover:bg-zinc-900 text-[13px] font-medium text-zinc-300 transition-colors">
                <List className="h-4 w-4" /> Logs
              </button>

              <div className="relative flex rounded-md border border-zinc-800 divide-x divide-zinc-800 overflow-visible">
                <button 
                  disabled={!isSuccess}
                  onClick={() => {
                    const url = getVisitUrl();
                    if (url !== '#') window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium transition-colors rounded-l-[5px] ${!isSuccess ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60' : 'bg-white hover:bg-zinc-200 text-black'}`}
                >
                  Visit
                </button>
                <button 
                  disabled={!isSuccess}
                  onClick={() => setOpenQR(!openQR)}
                  className={`flex items-center px-2 py-1.5 transition-colors rounded-r-[5px] ${!isSuccess ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60' : 'bg-white hover:bg-zinc-200 text-black'}`}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>

                {openQR && (
                  <div className="absolute top-[calc(100%+8px)] right-0 w-[280px] bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                       <Smartphone className="h-4 w-4 text-zinc-400" />
                       <span className="text-[13px] font-medium text-white">Visit with Toolbar</span>
                    </div>
                    <div className="p-4">
                       <p className="text-[12px] text-zinc-400 mb-4 leading-relaxed">
                          Scan this QR code to open with the toolbar on a different device:
                       </p>
                       <div className="bg-white p-3 rounded-lg flex justify-center items-center mb-5 mx-2">
                          <QRCode value={getVisitUrl() !== '#' ? (getVisitUrl().startsWith('http') ? getVisitUrl() : `https://${getVisitUrl()}`) : 'https://vercel.com'} size={160} />
                       </div>
                       <div className="pt-4 border-t border-zinc-800">
                          <p className="text-[12px] text-zinc-500 mb-3 leading-relaxed">
                            Get easy access to the toolbar on your production deployments:
                          </p>
                          {/* <button className="w-full py-2 bg-white text-black text-[13px] font-medium rounded-md hover:bg-zinc-200 transition-colors">
                            Install Extension
                          </button> */}
                       </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative ml-1">
                <button 
                  onClick={() => setOpenMore(!openMore)}
                  className="flex items-center px-2 py-1.5 rounded-md border border-zinc-800 hover:bg-zinc-900 text-zinc-300 transition-colors"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                
                {openMore && (
                  <div className="absolute top-[calc(100%+8px)] right-0 w-[240px] bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl z-50 py-1.5">
                    {isSuccess && isProd && !deployment.isLatest ? (
                      <button 
                        onClick={handleInstantRollback}
                        className="w-full px-4 py-2 text-left text-[13px] text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center justify-between"
                      >
                        Instant Rollback <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button className="w-full px-4 py-2 text-left text-[13px] text-zinc-500 flex items-center justify-between cursor-not-allowed">
                        Instant Rollback <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {isSuccess && !isProd && !deployment.isLatest ? (
                      <button 
                        onClick={handleInstantRollback}
                        className="w-full px-4 py-2 text-left text-[13px] text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center justify-between"
                      >
                        Promote to Production <ArrowUpCircle className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button className="w-full px-4 py-2 text-left text-[13px] text-zinc-500 flex items-center justify-between cursor-not-allowed">
                        Promote to Production <ArrowUpCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button 
                      onClick={handleRedeploy}
                      className="w-full px-4 py-2 text-left text-[13px] text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      Redeploy
                    </button>

                    <button 
                      disabled={!isSuccess}
                      onClick={() => {
                        handleCopyUrl();
                        setOpenMore(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-[13px] transition-colors ${!isSuccess ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-300 hover:bg-zinc-800'}`}
                    >
                      Copy URL
                    </button>
                    <button 
                      onClick={() => {
                        const type = deployment?.type || 'frontend';
                        const branch = deployment?.source?.branch || 'main';
                        const repoFullName = deployment.projectId?.repoFullName || 'unknown';
                        const projectName = deployment.projectId?.repoName || 'unknown';
                        router.push(`/dashboard/deployments/${type}?branch=${branch}&repoFullName=${repoFullName}&projectName=${projectName}`);
                      }}
                      className="w-full px-4 py-2 text-left text-[13px] text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      View All Branch Deployments
                    </button>
                    <div className="h-[1px] bg-zinc-800 my-1"></div>
                    <button 
                      onClick={() => {
                        setOpenMore(false);
                        setShowDeleteModal(true);
                      }}
                      className="w-full px-4 py-2 text-left text-[13px] text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row p-6 gap-8">
            {/* Left Panel: Screenshot for frontend, Live Monitor for backend */}
            <div className="w-full lg:w-[45%] xl:w-[40%] flex-shrink-0">
              {deployment.type === 'backend' ? (
                <LiveMonitorWidget deployment={deployment} primaryDomain={allDomainsToShow[0]} />
              ) : deployment.finalSummary?.screenshotUrl ? (
                <div className="w-full aspect-[16/10] relative rounded-lg border border-zinc-800 overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-4 bg-[#111] flex items-center px-2 gap-1 z-10 border-b border-zinc-800">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                  </div>
                  <img 
                    src={deployment.finalSummary.screenshotUrl.startsWith('http') ? deployment.finalSummary.screenshotUrl : `${process.env.NEXT_PUBLIC_API_URL}${deployment.finalSummary.screenshotUrl}`} 
                    alt="Application Preview" 
                    className="w-full h-full object-cover object-top pt-4"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      disabled={!isSuccess}
                      onClick={() => {
                        const url = getVisitUrl();
                        if (url !== '#') window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
                      }}
                      className={`px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 ${!isSuccess ? 'bg-zinc-600/80 text-zinc-400 cursor-not-allowed' : 'bg-white text-black'}`}
                    >
                      Visit Site <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full aspect-[16/10] bg-gradient-to-br from-indigo-600 to-purple-800 rounded-lg p-6 flex flex-col justify-center shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-4 bg-white/10 flex items-center px-2 gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30"></div>
                  </div>
                  {isSuccess ? (
                    <>
                      <div className="flex items-center justify-center mb-2">
                         <Loader2 className="h-6 w-6 text-white/50 animate-spin" />
                      </div>
                      <h3 className="text-xl font-bold text-white text-center mt-2">
                        Capturing Preview...
                      </h3>
                      <p className="text-white/70 text-xs text-center mt-1 px-4">
                        We are currently capturing a live snapshot of your deployment.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold text-white text-center mt-2">
                        {deployment.projectId?.name || "Application Preview"}
                      </h3>
                      <p className="text-white/70 text-xs text-center mt-1 px-4">
                        Preview snapshot will be generated upon successful complete build.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right Info Grid */}
            <div className="flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 mb-8">
                
                {/* Created */}
                <div>
                  <div className="text-[13px] text-zinc-500 mb-2">Created</div>
                  <div className="flex items-center gap-2 text-[14px]">
                    <img 
                      src={`https://github.com/${owner}.png`} 
                      alt={owner} 
                      className="w-5 h-5 rounded-full border border-zinc-800 object-cover"
                      onError={(e: any) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="text-zinc-200">{owner}</span>
                    <span className="text-zinc-500 ml-1">{timeAgo}</span>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <div className="text-[13px] text-zinc-500 mb-2">Status</div>
                  <div className="flex items-center gap-2 text-[14px]">
                    {isSuccess ? (
                      <div className="h-2 w-2 rounded-full bg-[#55c786]"></div>
                    ) : isFailed ? (
                      <div className="h-2 w-2 rounded-full bg-[#f85149]"></div>
                    ) : isRunning ? (
                      <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                    ) : (
                      <CircleDashed className="h-3 w-3 text-zinc-500" />
                    )}
                    <span className="text-zinc-200 font-medium capitalize">{deployment.status === 'success' ? 'Ready' : deployment.status}</span>
                    {deployment.isLatest && <span className="text-zinc-500 ml-1 text-[13px]">Latest</span>}
                    {!deployment.isLatest && deployment.isLatestFrontend && <span className="text-zinc-500 ml-1 text-[13px]">Latest Frontend</span>}
                    {!deployment.isLatest && deployment.isLatestBackend && <span className="text-zinc-500 ml-1 text-[13px]">Latest Backend</span>}
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <div className="text-[13px] text-zinc-500 mb-2">Duration</div>
                  <div className="flex items-center gap-1.5 text-[14px]">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-zinc-200 font-mono">{durationSec !== null ? `${durationSec}s` : '—'}</span>
                    <span className="text-zinc-500 ml-1">{timeAgo}</span>
                  </div>
                </div>

                {/* Environment */}
                <div>
                  <div className="text-[13px] text-zinc-500 mb-2">Environment</div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-[14px] ${isProd ? 'text-zinc-200' : 'text-zinc-300'}`}>
                      <ArrowUpCircle className="h-4 w-4 text-zinc-400" />
                      {isProd ? 'Production' : 'Preview'}
                    </span>
                    {isProd && deployment.isLatest && (
                      <span className="bg-[#1f3a5f] text-blue-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">CURRENT</span>
                    )}
                    {isProd && !deployment.isLatest && deployment.isLatestFrontend && (
                      <span className="bg-[#1f3a5f] text-blue-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">CURRENT FRONTEND</span>
                    )}
                    {isProd && !deployment.isLatest && deployment.isLatestBackend && (
                      <span className="bg-[#1f3a5f] text-blue-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">CURRENT BACKEND</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Domains */}
              <div className="mb-6">
                <div className="text-[13px] text-zinc-500 mb-2">Domains</div>
                <div className="text-[14px] ml-1">
                  {allDomainsToShow.length > 0 ? (
                    <>
                      {/* Parent Domain */}
                      <div className="flex items-center gap-2 group relative z-10 bg-[#0a0a0a] py-0.5">
                        <Globe className="h-4 w-4 text-zinc-500" />
                        <a href={allDomainsToShow[0].startsWith('http') ? allDomainsToShow[0] : `https://${allDomainsToShow[0]}`} target="_blank" rel="noopener noreferrer" className="text-zinc-200 hover:underline font-medium">
                          {allDomainsToShow[0].replace('https://', '').replace('http://', '')}
                        </a>
                        {allDomainsToShow.length > 1 && (
                          <span className="bg-zinc-800 text-zinc-300 text-[11px] font-medium px-1.5 py-0.5 rounded ml-1">+{allDomainsToShow.length - 1}</span>
                        )}
                        <ExternalLink className="h-3.5 w-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      
                      {/* Children Domains */}
                      {allDomainsToShow.length > 1 && (
                        <div className="pl-6 mt-1 flex flex-col">
                          {allDomainsToShow.slice(1).map((domainStr: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 relative py-1">
                              <TreeLine isLast={idx === allDomainsToShow.length - 2} />
                              <a href={domainStr.startsWith('http') ? domainStr : `https://${domainStr}`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-200 hover:underline truncate max-w-[300px] text-[13px] z-10">
                                {domainStr.replace('https://', '').replace('http://', '')}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-500 text-sm">No domains assigned yet</span>
                  )}
                </div>
              </div>

              {/* Source */}
              <div>
                <div className="text-[13px] text-zinc-500 mb-2">Source</div>
                <div className="text-[14px] ml-1">
                  <div className="flex items-center gap-2 group relative z-10 bg-[#0a0a0a] py-0.5">
                    <GitBranch className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-200 font-mono text-[13px] font-medium">{deployment.source?.branch || 'main'}</span>
                  </div>
                  <div className="pl-6 mt-1">
                    <div className="flex items-center gap-2 text-zinc-400 relative py-1">
                      <TreeLine isLast={true} />
                      <GitCommit className="h-4 w-4 text-zinc-500 z-10" />
                      <span className="font-mono text-zinc-300 text-[13px] z-10">{shortCommitSha}</span>
                      <span className="truncate max-w-[300px] text-[13px] text-zinc-400 z-10">{deployment.source?.commitMessage || 'Manual deployment'}</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Accordions */}
        <div className="space-y-3">
          
          {/* Settings */}
          <AccordionItem 
            title="Deployment Settings" 
            badge="3 Recommendations" badgeColor="bg-blue-500/20 text-blue-400"
            isOpen={openSettings} 
            toggle={() => setOpenSettings(!openSettings)}
          >
            <div className="p-4 text-[14px] text-zinc-400">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium text-zinc-300">Build Command: </span> 
                  <code className="bg-zinc-900 px-1.5 py-0.5 rounded font-mono text-xs">{deployment.configSnapshot?.buildCommand || 'npm run build'}</code>
                </div>
                <div>
                  <span className="font-medium text-zinc-300">Install Command: </span> 
                  <code className="bg-zinc-900 px-1.5 py-0.5 rounded font-mono text-xs">{deployment.configSnapshot?.installCommand || 'npm install'}</code>
                </div>
                <div>
                  <span className="font-medium text-zinc-300">Output Directory: </span> 
                  <code className="bg-zinc-900 px-1.5 py-0.5 rounded font-mono text-xs">{deployment.configSnapshot?.outputDirectory || 'dist'}</code>
                </div>
                <div>
                  <span className="font-medium text-zinc-300">Node Version: </span> 
                  <span className="text-zinc-400">18.x</span>
                </div>
              </div>
            </div>
          </AccordionItem>

          {/* Logs */}
          <AccordionItem 
            title="Deploy Logs" 
            rightContent={
              <div className="flex items-center gap-4">
                {isFailed && <span className="flex items-center gap-1.5 text-red-400 text-[13px] font-medium"><AlertTriangle className="h-4 w-4" /> 1</span>}
                <span className="text-zinc-400 text-[14px] font-mono">{durationSec ? `${durationSec}s` : ''}</span>
                {isSuccess ? <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center"><CheckCircle2 className="h-3 w-3 text-white" /></div> : 
                 isFailed ? <div className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center"><AlertTriangle className="h-3 w-3 text-white" /></div> :
                 <Loader2 className="h-4 w-4 text-zinc-500 animate-spin" />}
              </div>
            }
            isOpen={openLogs} 
            toggle={() => setOpenLogs(!openLogs)}
          >
            <div className="p-4 bg-[#050505]">
              <div className="bg-[#050505] rounded-lg p-2 max-h-[400px] overflow-y-auto font-mono text-[13px] space-y-1.5">
                {deployment.logs && deployment.logs.length > 0 ? deployment.logs.map((log: any, idx: number) => (
                  <div key={idx} className="flex gap-4 group">
                    <span className="text-zinc-600 select-none w-16 shrink-0">{new Date(log.timestamp).toLocaleTimeString([], {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                    <span className={
                      log.level === 'error' ? 'text-red-400 break-words' :
                      log.level === 'warning' ? 'text-yellow-400 break-words' :
                      log.level === 'success' ? 'text-emerald-400 break-words' : 'text-zinc-300 break-words'
                    }>{log.message}</span>
                  </div>
                )) : (
                  <div className="text-zinc-500 py-4 text-center">No logs available for this deployment.</div>
                )}
              </div>
            </div>
          </AccordionItem>

          {/* Summary / AI Diagnosis */}
          <AccordionItem 
            title="Deployment Summary" 
            rightContent={
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 text-zinc-400 text-[13px]"><List className="h-4 w-4" /> Resources</span>
                {isSuccess ? <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center"><CheckCircle2 className="h-3 w-3 text-white" /></div> :
                 isFailed ? <div className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center"><AlertTriangle className="h-3 w-3 text-white" /></div> : null}
              </div>
            }
            isOpen={openSummary} 
            toggle={() => setOpenSummary(!openSummary)}
          >
            <div className="p-6 text-[14px]">
              
              {isSuccess && (
                <div className="flex flex-col items-center justify-center py-8 text-center bg-emerald-950/20 rounded-lg border border-emerald-500/20">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-emerald-400 mb-2">Deployment Successful</h3>
                  <p className="text-zinc-300 max-w-md mx-auto leading-relaxed">
                    {deployment.finalSummary?.message || "This deployment completed successfully and is ready to serve traffic without any detected issues."}
                  </p>
                </div>
              )}

              {isFailed && (!aiAnalysis || !aiAnalysis.summary) && (
                <div className="flex flex-col items-center justify-center py-8 text-center bg-zinc-900/30 rounded-lg border border-zinc-800 border-dashed">
                  <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
                  <p className="text-zinc-300 font-medium mb-1">Deployment Failed</p>
                  <p className="text-zinc-500 mb-4 max-w-sm">We can use AI to analyze the logs and pinpoint the exact issue.</p>
                  <button 
                    onClick={handleExplainError}
                    disabled={explaining}
                    className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    {explaining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                    Explain Error with AI
                  </button>
                </div>
              )}

              {/* AI Diagnosis Block inside Summary */}
              {isFailed && aiAnalysis && aiAnalysis.summary && (
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-6 shadow-lg shadow-indigo-500/5">
                  <div className="flex items-center gap-3 mb-6 border-b border-indigo-500/10 pb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
                      <Bot className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">AI Diagnosis</h3>
                      <p className="text-xs text-indigo-400/80">Generated {new Date(aiAnalysis.generatedAt || Date.now()).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Problem Summary</p>
                      <p className="text-white text-[14px] bg-black/40 p-4 rounded-lg border border-zinc-800/50 leading-relaxed">{aiAnalysis.summary}</p>
                    </div>
                    
                    {aiAnalysis.likelyCause && (
                      <div>
                        <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Likely Cause</p>
                        <p className="text-zinc-300 text-[14px] bg-black/40 p-4 rounded-lg border border-zinc-800/50 leading-relaxed">{aiAnalysis.likelyCause}</p>
                      </div>
                    )}

                    {aiAnalysis.suggestedFixes && aiAnalysis.suggestedFixes.length > 0 && (
                      <div>
                        <p className="text-[12px] font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Suggested Fixes
                        </p>
                        <ul className="space-y-2">
                          {aiAnalysis.suggestedFixes.map((fix: string, idx: number) => (
                            <li key={idx} className="flex gap-3 text-[14px] text-zinc-300 bg-black/40 p-3 rounded-lg border border-zinc-800/50">
                              <span className="text-indigo-400 font-bold">{idx + 1}.</span> {fix}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* PR Result Card */}
                    {(fixPrData || aiAnalysis.fixStatus === 'pr_created') && (
                      <div className="mt-6 p-5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold mb-3 text-lg">
                          <CheckCircle2 className="h-5 w-5" /> Fix PR Created Successfully!
                        </div>
                        <p className="text-[14px] text-zinc-300 mb-5 leading-relaxed">
                          DeployAI has created a new GitHub branch and opened a pull request with the fix. Review and merge it, then retry your deployment.
                        </p>
                        
                        {fixPrData?.pullRequestUrl ? (
                          <a 
                            href={fixPrData.pullRequestUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            Review PR on GitHub <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <p className="text-[13px] text-zinc-500 italic">Refresh to view PR link or check your GitHub repo.</p>
                        )}
                        
                        <div className="mt-5 pt-5 border-t border-emerald-500/10 flex items-center gap-3">
                          <button 
                            onClick={handleRetryDeployment}
                            disabled={retrying}
                            className="flex items-center gap-2 rounded-md bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                          >
                            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Retry After Merge
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-4 pt-4 border-t border-indigo-500/10 items-center justify-between">
                      <div className="flex gap-6">
                        {aiAnalysis.severity && (
                          <div className="flex flex-col gap-1">
                            <span className="text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">Severity</span>
                            <span className={`capitalize font-medium text-[13px] ${aiAnalysis.severity === 'high' ? 'text-red-400' : aiAnalysis.severity === 'medium' ? 'text-yellow-400' : 'text-indigo-400'}`}>
                              {aiAnalysis.severity}
                            </span>
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <span className="text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">Auto-fix</span>
                          <span className={`font-medium text-[13px] ${aiAnalysis.canAutoFix ? 'text-emerald-400' : 'text-zinc-400'}`}>
                            {aiAnalysis.canAutoFix ? 'Possible' : 'Not Available'}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      {aiAnalysis.userAction === 'create_fix_pr' && aiAnalysis.canAutoFix && aiAnalysis.fixStatus !== 'pr_created' && !fixPrData && (
                        <button 
                          onClick={handleCreateFixPr}
                          disabled={creatingFix}
                          className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
                        >
                          {creatingFix ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <>Create Fix PR</>}
                        </button>
                      )}
                      {(aiAnalysis.userAction === 'retry' || !aiAnalysis.userAction) && !aiAnalysis.canAutoFix && aiAnalysis.failureCategory !== 'platform_internal_bug' && (
                        <button 
                          onClick={handleRetryDeployment}
                          disabled={retrying}
                          className="flex items-center gap-2 rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
                        >
                          {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          Retry Deployment
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AccordionItem>

          {/* Checks */}
          <AccordionItem 
            title="Deployment Checks" 
            rightContent={isRunning ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin" /> : 
                          isSuccess ? <CheckCircle2 className="h-4 w-4 text-blue-500" /> : 
                          isFailed ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <Clock className="h-4 w-4 text-zinc-500" />}
            isOpen={openChecks} 
            toggle={() => setOpenChecks(!openChecks)}
          >
            <div className="p-4 space-y-4">
              <HealthStatusRow 
                label="Backend Service Validation" 
                data={deployment.healthCheck?.backend || (deployment.type === 'frontend' ? { status: 'skipped', message: 'Not a backend deployment' } : { status: isSuccess ? 'passed' : isFailed ? 'failed' : 'pending' })} 
              />
              <HealthStatusRow 
                label="Frontend Verification" 
                data={deployment.healthCheck?.frontend || (deployment.type === 'backend' ? { status: 'skipped', message: 'Not a frontend deployment' } : { status: isSuccess ? 'passed' : isFailed ? 'failed' : 'pending' })} 
              />
              <HealthStatusRow 
                label="CORS Policy Check" 
                data={deployment.healthCheck?.cors || (deployment.type !== 'full' ? { status: 'skipped', message: 'N/A for partial deployments' } : { status: isSuccess ? 'passed' : isFailed ? 'failed' : 'pending' })} 
              />
              <HealthStatusRow 
                label="Database Connectivity" 
                data={deployment.healthCheck?.database || (deployment.type === 'frontend' ? { status: 'skipped', message: 'N/A for frontend' } : { status: isSuccess ? 'passed' : isFailed ? 'failed' : 'pending' })} 
              />
            </div>
          </AccordionItem>

          {/* Domains */}
          <AccordionItem 
            title="Assigning Custom Domains" 
            rightContent={isRunning ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin" /> : 
                          isSuccess ? <CheckCircle2 className="h-4 w-4 text-blue-500" /> : 
                          isFailed ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <Clock className="h-4 w-4 text-zinc-500" />}
            isOpen={openDomains} 
            toggle={() => setOpenDomains(!openDomains)}
          >
            <div className="p-4 text-[14px] text-zinc-400">
              <p className="mb-4">Domains are automatically assigned upon successful deployment.</p>
              <div className="space-y-2">
                {allDomainsToShow.length > 0 ? allDomainsToShow.map((domainStr: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                    <Globe className="h-4 w-4 text-emerald-400" />
                    <span className="text-zinc-200">{domainStr}</span>
                    <span className="ml-auto text-[12px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">Assigned</span>
                  </div>
                )) : (
                  isSuccess && <span className="text-zinc-500 italic">No domains configured.</span>
                )}
              </div>
            </div>
          </AccordionItem>

        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-[#0a0a0a] border border-zinc-800 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-[13px] font-medium">Link copied to clipboard</span>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-[500px] bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h2 className="text-[18px] font-semibold text-white mb-6">Delete Deployment</h2>
              <div className="text-[14px] text-zinc-400 space-y-4 leading-relaxed">
                <p>
                  <strong className="text-zinc-200">NOTE:</strong> Deployments that are not actively receiving any traffic do not generate any costs nor count towards any limits.
                </p>
                <p>
                  Deleting this deployment will prevent you from instantly reverting and might break links used in integrations, such as the ones in the pull requests of your Git provider.
                </p>
                <p className="text-white font-medium">Are you sure you want to continue?</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 bg-[#0f0f0f] flex items-center justify-between">
              <button 
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-[14px] font-medium text-zinc-300 hover:text-white transition-colors disabled:opacity-50 border border-zinc-700 hover:bg-zinc-800 rounded-md"
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-[14px] font-medium bg-white hover:bg-zinc-200 text-black rounded-md flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccordionItem({ title, badge, badgeColor, rightContent, children, isOpen, toggle }: any) {
  return (
    <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] overflow-hidden">
      <button 
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 bg-[#0f0f0f] hover:bg-zinc-900/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <ChevronRight className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
          <span className="text-[15px] font-medium text-white">{title}</span>
          {badge && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        {rightContent && <div>{rightContent}</div>}
      </button>
      {isOpen && (
        <div className="border-t border-zinc-800">
          {children}
        </div>
      )}
    </div>
  );
}

function HealthStatusRow({ label, data }: any) {
  const isPending = !data || data.status === 'pending';
  const isSkipped = data?.status === 'skipped';
  const isSuccess = data?.status === 'passed' || data?.status === 'success';
  const isWarning = data?.status === 'warning';
  const isFailed = data?.status === 'failed';
  
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0 text-[14px]">
      <div className="flex items-center gap-3">
        {isPending ? <CircleDashed className="h-4 w-4 text-zinc-600 animate-spin-slow" /> :
         isSkipped ? <CircleDashed className="h-4 w-4 text-zinc-600" /> :
         isSuccess ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
         isWarning ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
         <AlertTriangle className="h-4 w-4 text-red-500" />}
        <span className={isPending || isSkipped ? "text-zinc-500" : "text-zinc-300"}>{label}</span>
      </div>
      <div className="text-zinc-500 text-[13px]">
        {isPending ? 'Pending' : 
         isSkipped ? data.message || 'Skipped' :
         isSuccess ? data?.message || 'Passed' : 
         data?.message || data?.status}
      </div>
    </div>
  );
}
