"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, MoreHorizontal, Loader2, Globe, Server, AlertTriangle, CornerDownRight , Clock, ChevronDown, X, ArrowUpCircle, Check, Copy, Activity } from "lucide-react";

export default function DomainsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const router = useRouter();

  const [domains, setDomains] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDomainModalOpen, setIsAddDomainModalOpen] = useState(false);
  const [newDomainInput, setNewDomainInput] = useState("");
  
  // Advanced Modal States
  const [addDomainOption, setAddDomainOption] = useState<'environment' | 'redirect'>('environment');
  const [selectedEnv, setSelectedEnv] = useState('Production');
  const [redirectStatus, setRedirectStatus] = useState('307 Temporary Redirect');
  const [redirectTarget, setRedirectTarget] = useState('No Redirect');
  const [isEnvDropdownOpen, setIsEnvDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isTargetDropdownOpen, setIsTargetDropdownOpen] = useState(false);
  const [targetService, setTargetService] = useState<'frontend' | 'backend'>('frontend');
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  
  // Edit Domain States
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editDomainOption, setEditDomainOption] = useState<'environment' | 'redirect'>('environment');
  const [editRedirectStatus, setEditRedirectStatus] = useState('307 Temporary Redirect');
  const [editRedirectTarget, setEditRedirectTarget] = useState('No Redirect');
  const [editTargetService, setEditTargetService] = useState<'frontend' | 'backend'>('frontend');
  const [isEditEnvDropdownOpen, setIsEditEnvDropdownOpen] = useState(false);
  const [isEditStatusDropdownOpen, setIsEditStatusDropdownOpen] = useState(false);
  const [isEditTargetDropdownOpen, setIsEditTargetDropdownOpen] = useState(false);
  const [isEditServiceDropdownOpen, setIsEditServiceDropdownOpen] = useState(false);
  const [isSavingDomain, setIsSavingDomain] = useState(false);

  // Remove Domain States
  const [domainToRemove, setDomainToRemove] = useState<any | null>(null);
  const [isRemovingDomain, setIsRemovingDomain] = useState(false);

  // Make Primary States
  const [domainToMakePrimary, setDomainToMakePrimary] = useState<any | null>(null);
  const [isMakingPrimary, setIsMakingPrimary] = useState(false);
  const [domainToRedirect, setDomainToRedirect] = useState<any | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [domainToDisableRedirect, setDomainToDisableRedirect] = useState<any | null>(null);
  const [isDisablingRedirect, setIsDisablingRedirect] = useState(false);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [checkingDomainId, setCheckingDomainId] = useState<string | null>(null);

  // Advanced View States
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<any>(null);
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
  const [cloudflareKey, setCloudflareKey] = useState("");
  const [savingCloudflareKey, setSavingCloudflareKey] = useState(false);
  const [applyingDns, setApplyingDns] = useState<string | null>(null);
  const [dnsPreview, setDnsPreview] = useState<any[]>([]);
  const [copiedRecord, setCopiedRecord] = useState<string | null>(null);

  const [domainLogs, setDomainLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [monitorSummary, setMonitorSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  type ActiveDeployment = { id: string; type: "frontend" | "backend"; status: string; triggerReason: string; };
  const [activeDeployments, setActiveDeployments] = useState<Record<string, ActiveDeployment[]>>({});
  const autoPollingRef = useRef(false);
  const pollingAttemptsRef = useRef<Record<string, number>>({});

  const fetchDomainActivity = async (domainId: string, silent = false) => {
    if (!silent) setLoadingLogs(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainId}/activity`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setDomainLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch domain logs:", err);
    } finally {
      if (!silent) setLoadingLogs(false);
    }
  };

  const fetchMonitorSummary = async (targetProjectId: string, silent = false) => {
    if (!silent) setLoadingSummary(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${targetProjectId}/monitor-summary`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
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
    if (!expandedDomainId) {
      setDomainLogs([]);
      setMonitorSummary(null);
      return;
    }

    fetchDomainActivity(expandedDomainId);
    
    const expandedDomain = domains.find(d => d.id === expandedDomainId);
    const targetProjectId = expandedDomain?.projectId || projectId;
    if (targetProjectId) {
      fetchMonitorSummary(targetProjectId);
    }

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchDomainActivity(expandedDomainId, true);
      if (targetProjectId) {
        fetchMonitorSummary(targetProjectId, true);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [expandedDomainId, domains, projectId]);


  // Polling for active deployments
  useEffect(() => {
    const domainIdsWithDeployments = Object.keys(activeDeployments).filter(
      id => activeDeployments[id].some(d => !['success', 'completed', 'failed', 'error', 'cancelled'].includes(d.status))
    );

    if (domainIdsWithDeployments.length === 0) return;

    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      
      let allUpdated = { ...activeDeployments };
      let anyChanged = false;

      for (const domainId of domainIdsWithDeployments) {
        const deps = allUpdated[domainId];
        const updatedDeps = [...deps];
        
        for (let i = 0; i < updatedDeps.length; i++) {
          const dep = updatedDeps[i];
          if (['success', 'completed', 'failed', 'cancelled', 'error'].includes(dep.status)) continue;
          
          try {
             const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/deployments/${dep.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }});
             if (res.ok) {
                const data = await res.json();
                if (data.deployment && data.deployment.status !== dep.status) {
                   updatedDeps[i] = { ...dep, status: data.deployment.status };
                   anyChanged = true;
                }
             }
          } catch (e) {}
        }
        
        allUpdated[domainId] = updatedDeps;
        
        // If all deployments for this domain are finished
        if (updatedDeps.every(d => ['success', 'completed', 'failed', 'cancelled', 'error'].includes(d.status))) {
           fetchDomains();
           if (expandedDomainId === domainId) fetchDomainActivity(domainId, true);
           
           if (updatedDeps.some(d => ['failed', 'error', 'cancelled'].includes(d.status))) {
              showToast("Domain was updated, but redeployment failed. Check deployment logs.", "error");
           } else {
              showToast("Domain update completed successfully.", "success");
           }
           
           // Remove from active list
           delete allUpdated[domainId];
           anyChanged = true;
        }
      }
      
      if (anyChanged) {
         setActiveDeployments(allUpdated);
      }
      
    }, 10000);

    return () => clearInterval(interval);
  }, [activeDeployments, expandedDomainId]);

  // DNS Verification Auto-Polling
  useEffect(() => {
    // Clear out terminal domains and deleted domains from attempts tracker
    const activeIds = new Set(domains.map((d) => d.id));
    Object.keys(pollingAttemptsRef.current).forEach((id) => {
      if (!activeIds.has(id)) {
        delete pollingAttemptsRef.current[id];
      }
    });

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      if (autoPollingRef.current) return;
      
      const autoPollableDomains = domains.filter((d) => 
        ["pending_dns", "verifying", "partially_active"].includes(d.status)
      );
      
      if (autoPollableDomains.length === 0) return;

      autoPollingRef.current = true;
      try {
        const toPoll = autoPollableDomains.slice(0, 5);
        let anyVerified = false;
        for (const domain of toPoll) {
          const attempts = pollingAttemptsRef.current[domain.id] || 0;
          if (attempts >= 20) continue; // max 10 minutes (20 * 30s)
          
          pollingAttemptsRef.current[domain.id] = attempts + 1;
          const verified = await handleVerifyDomain(domain.id, true);
          if (verified) anyVerified = true;
        }
        if (anyVerified) {
          fetchDomains();
        }
      } finally {
        autoPollingRef.current = false;
      }
    };

    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [domains]);

  const handleCopyRecord = async (text: string, rowKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRecord(rowKey);
      setTimeout(() => setCopiedRecord(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const inferProvider = (record: any, domain: any) => {
    const value = String(record.value || record.target || "").toLowerCase();

    if (domain.targetService === "frontend") return "Vercel";

    if (value.includes("onrender.com")) return "Render";
    if (value.includes("railway.app") || value.includes("up.railway.app")) return "Railway";
    if (value.includes("vercel-dns.com")) return "Vercel";

    return domain.platform || "Provider";
  };

  const formatDomain = (record: any, domain: any) => {
    if (record.name === '@') return domain.domain;
    return `${record.name}.${domain.domain.replace(/^www\./, '')}`;
  };

  const renderExpandedDomainRow = (d: any) => {
    const isCloudflareConnected = !!cloudflareKey;

    return (
      <div key={`expanded-${d.id}`} className="bg-[#0a0a0a] border-t border-zinc-800 p-6 animate-in slide-in-from-top-2 duration-200">
        
        {/* Verification Status Banner */}
        {d.status !== 'active' && !d.domain.includes('.vercel.app') && !d.domain.includes('.deployai.app') && (
          <div className="mb-6 bg-red-500/5 border border-red-500/10 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-[14px] font-medium text-red-500 mb-1">Invalid Configuration</h4>
              <p className="text-[13px] text-zinc-400 leading-relaxed">
                Your DNS records appear to have been removed. Re-add all the records in the table below to your DNS provider, then click <strong>Check DNS</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-[15px] font-semibold text-white mb-2">DNS Configuration</h3>
            <p className="text-[13px] text-zinc-400 max-w-xl">
              Add these DNS records in your domain registrar or DNS provider. DNS changes can take a few minutes to several hours to propagate. After adding the records, click Check DNS.
              <br /><br />
              <strong>For apex domains:</strong> Use @ as the host/name for the root domain.<br />
              <strong>For subdomains:</strong> Use only the subdomain part as the host/name, such as www or api.
            </p>
          </div>
        </div>

        {/* DNS Records Table */}
        {d.dnsRecords && d.dnsRecords.length > 0 ? (
          <div className="mb-8 border border-zinc-800 rounded-lg overflow-hidden bg-black overflow-x-auto">
            <table className="w-full text-left text-[13px] text-zinc-400 min-w-[900px]">
              <thead className="bg-[#050505] border-b border-zinc-800 tracking-wider text-[12px] text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Domain</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Name / Host</th>
                  <th className="px-4 py-3 font-medium">Value / Target</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {d.dnsRecords.map((rec: any, i: number) => {
                  const rowKey = `${d.id}-${i}`;
                  const isCopied = copiedRecord === rowKey;
                  const fqdn = formatDomain(rec, d);
                  const providerName = inferProvider(rec, d);

                  return (
                    <tr key={i} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-zinc-300">{fqdn}</td>
                      <td className="px-4 py-3 text-zinc-300">{providerName}</td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{rec.type}</td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{rec.name}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-zinc-300 max-w-[260px] truncate" title={rec.value || rec.target}>
                        {rec.value || rec.target}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2 items-start">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${
                            d.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                            d.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                            'bg-amber-500/10 text-amber-400'
                          }`}>
                            {d.status}
                          </span>
                          
                          {activeDeployments[d.id]?.map(dep => {
                            if (['success', 'completed', 'failed', 'error', 'cancelled'].includes(dep.status)) return null;
                            const isBackend = dep.type === 'backend';
                            let label = isBackend ? 'Updating backend...' : 'Rebuilding frontend...';
                            if (dep.triggerReason === 'domain_redirect_enabled' || dep.triggerReason === 'domain_redirect_disabled') {
                               label = isBackend ? 'Updating CORS...' : label;
                            }
                            return (
                              <span key={`${dep.id}-${dep.type}`} className="text-[10px] text-zinc-400 animate-pulse border border-zinc-800 bg-zinc-900/50 px-1.5 py-0.5 rounded flex items-center gap-1.5 whitespace-nowrap">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCopyRecord(rec.value, rowKey)}
                            className={`rounded px-2 py-1 text-[12px] font-medium border transition-colors flex items-center gap-1 ${
                              isCopied
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-zinc-700 bg-black text-zinc-300 hover:text-white hover:border-zinc-500'
                            }`}
                            title={isCopied ? 'Copied!' : 'Copy value'}
                          >
                            {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            Copy
                          </button>
                          
                          <button 
                            onClick={() => handleVerifyDomain(d.id)}
                            disabled={verifyingDomain === d.id}
                            className="rounded px-2 py-1 text-[12px] font-medium border border-zinc-700 bg-black text-zinc-300 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors flex items-center gap-1"
                          >
                            {verifyingDomain === d.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            Check DNS
                          </button>
                          
                          {d.status === 'active' ? (
                            <button 
                              onClick={() => handleCheckHealth(d.id)}
                              disabled={checkingDomainId === d.id}
                              className="rounded px-2 py-1 text-[12px] font-medium border border-zinc-700 bg-black text-zinc-300 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors flex items-center gap-1"
                            >
                              {checkingDomainId === d.id && <Loader2 className="h-3 w-3 animate-spin" />}
                              Check Health
                            </button>
                          ) : (
                            <button 
                              disabled
                              title="Verify DNS first before running health checks."
                              className="rounded px-2 py-1 text-[12px] font-medium border border-zinc-800 bg-zinc-900 text-zinc-600 cursor-not-allowed flex items-center gap-1"
                            >
                              Check Health
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mb-8 p-6 text-center text-[13px] text-zinc-500 border border-zinc-800 border-dashed rounded-lg">
            No DNS records required.
          </div>
        )}

        {/* Cloudflare Automation */}
        <div className="border-t border-zinc-800 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold text-white">Cloudflare DNS Automation</h4>
            {isCloudflareConnected ? (
              <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Connected</span>
            ) : (
              <span className="text-[11px] font-medium text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Not connected</span>
            )}
          </div>
          
          {!isCloudflareConnected ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 items-center max-w-md">
                <input 
                  type="password"
                  placeholder="Cloudflare API Token..."
                  value={cloudflareKey}
                  onChange={(e) => setCloudflareKey(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-800 bg-black p-2 text-[13px] text-white focus:border-zinc-700 focus:outline-none transition-colors"
                />
                <button
                  onClick={handleConnectCloudflare}
                  disabled={!cloudflareKey || savingCloudflareKey}
                  className="rounded-md bg-white text-black px-4 py-2 text-[13px] font-medium hover:bg-zinc-200 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap transition-colors"
                >
                  {savingCloudflareKey && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Connect
                </button>
              </div>
              <p className="text-[12px] text-zinc-500 leading-relaxed max-w-2xl">
                Create a Custom Token in your <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white underline underline-offset-2 transition-colors">Cloudflare Profile</a> with these Permissions:
                <br />• <strong>Zone</strong> / <strong>Zone</strong> / <strong>Read</strong>
                <br />• <strong>Zone</strong> / <strong>DNS</strong> / <strong>Edit</strong>
                <br />Set Zone Resources to <strong>Include</strong> / <strong>All zones</strong>.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleApplyCloudflareDns(d.id, true)}
                  disabled={applyingDns === d.id}
                  className="rounded-md border border-zinc-700 bg-transparent px-4 py-2 text-[13px] font-medium text-zinc-300 hover:text-white hover:border-zinc-600 disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                  {applyingDns === d.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Preview Changes
                </button>
                
                {dnsPreview.length > 0 && applyingDns !== d.id && (
                  <button
                    onClick={() => handleApplyCloudflareDns(d.id, false)}
                    className="rounded-md bg-white text-black px-4 py-2 text-[13px] font-medium hover:bg-zinc-200 flex items-center gap-2 transition-colors"
                  >
                    Apply DNS Automatically
                  </button>
                )}
              </div>
              
              {dnsPreview.length > 0 && applyingDns !== d.id && (
                <div className="mt-4 space-y-1.5 bg-black border border-zinc-800 rounded-lg p-3">
                  {dnsPreview.map((p, i) => (
                    <div key={i} className="text-[12px] flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${p.action === 'create' ? 'bg-emerald-500/10 text-emerald-400' : p.action === 'skip' ? 'bg-zinc-800 text-zinc-400' : p.action === 'conflict' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                        {p.action}
                      </span>
                      <span className="font-mono text-zinc-300">{p.type}</span>
                      <span className="font-mono text-zinc-400">{p.name}</span>
                      <span className="text-zinc-600">→</span>
                      <span className="font-mono text-zinc-400 truncate max-w-[200px]">{p.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Uptime Analytics */}
          <div className="mt-8 border-t border-zinc-800 pt-8">
            <h4 className="text-[13px] font-medium text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Uptime & Analytics
            </h4>
            
            {loadingSummary && !monitorSummary ? (
              <div className="flex items-center gap-2 text-zinc-500 text-[13px] mb-8">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading analytics...
              </div>
            ) : monitorSummary && (monitorSummary.frontendUptime > 0 || monitorSummary.backendUptime > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {/* Uptime Card */}
                <div className="bg-[#111] border border-zinc-800 rounded-lg p-4 flex flex-col justify-between">
                  <div>
                    <h5 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Service Uptime</h5>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-semibold text-white">
                        {Math.max(monitorSummary.frontendUptime || 0, monitorSummary.backendUptime || 0).toFixed(2)}%
                      </span>
                      <span className="text-[13px] text-zinc-500">last 30 days</span>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-4 text-[12px]">
                    {monitorSummary.frontendUptime > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${monitorSummary.frontendUptime >= 99 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span className="text-zinc-300">Frontend: {monitorSummary.frontendUptime.toFixed(2)}%</span>
                      </div>
                    )}
                    {monitorSummary.backendUptime > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${monitorSummary.backendUptime >= 99 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span className="text-zinc-300">Backend: {monitorSummary.backendUptime.toFixed(2)}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Latency Card */}
                <div className="bg-[#111] border border-zinc-800 rounded-lg p-4 flex flex-col justify-between">
                  <h5 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Recent Latency</h5>
                  <div className="flex-1 flex items-end gap-1 h-12">
                    {monitorSummary.recentChecks?.slice(0, 20).reverse().map((check: any, idx: number) => {
                      // max height representation
                      const heightPct = Math.min(100, Math.max(10, (check.responseTimeMs / 1000) * 100));
                      const isOffline = check.status === 'offline';
                      return (
                        <div 
                          key={check._id || idx}
                          className={`w-full rounded-t-sm ${isOffline ? 'bg-red-500' : check.responseTimeMs > 800 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ height: `${isOffline ? 10 : heightPct}%` }}
                          title={`${check.responseTimeMs}ms - ${new Date(check.checkedAt).toLocaleTimeString()}`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-4 text-[12px] text-zinc-500 flex justify-between">
                    <span>{monitorSummary.recentChecks?.[monitorSummary.recentChecks.length - 1]?.responseTimeMs || 0}ms average</span>
                    <span>Live</span>
                  </div>
                </div>
              </div>
            ) : (
               <div className="text-[13px] text-zinc-500 bg-zinc-900/30 p-4 rounded-lg border border-zinc-800 border-dashed mb-8">
                 Analytics are being gathered. Check back soon.
               </div>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="mt-8 border-t border-zinc-800 pt-8">
            <h4 className="text-[13px] font-medium text-white mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              Activity Timeline
            </h4>
            
            {loadingLogs ? (
              <div className="flex items-center gap-2 text-zinc-500 text-[13px]">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading timeline...
              </div>
            ) : domainLogs.length === 0 ? (
              <div className="text-[13px] text-zinc-500 bg-zinc-900/30 p-4 rounded-lg border border-zinc-800 border-dashed">
                No activity recorded yet.
              </div>
            ) : (
              <div className="space-y-5 pl-2">
                {domainLogs.map((log, i) => (
                  <div key={log._id || i} className="relative pl-6">
                    {/* Vertical line connecting timeline dots */}
                    {i !== domainLogs.length - 1 && (
                      <div className="absolute left-[5px] top-6 bottom-[-20px] w-[2px] bg-zinc-800"></div>
                    )}
                    
                    {/* Timeline dot */}
                    <div className={`absolute left-0 top-1.5 w-3 h-3 rounded-full border-2 border-[#0a0a0a] z-10 ${
                      log.status === 'success' ? 'bg-emerald-500' :
                      log.status === 'error' ? 'bg-red-500' :
                      log.status === 'warning' ? 'bg-amber-500' :
                      'bg-blue-500'
                    }`}></div>
                    
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[13px] text-zinc-200 leading-relaxed">{log.message}</div>
                        
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-1.5 text-[11px] font-mono text-zinc-400 bg-black/60 border border-zinc-800/50 px-2 py-1.5 rounded inline-block">
                            {Object.entries(log.metadata).map(([k, v]) => (
                              <span key={k} className="mr-3 last:mr-0"><span className="text-zinc-600">{k}:</span> {String(v)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 flex flex-col items-end whitespace-nowrap mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider mb-1 ${
                          log.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                          log.status === 'error' ? 'bg-red-500/10 text-red-400' :
                          log.status === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-blue-500/10 text-blue-400'
                        }`}>
                          {log.status}
                        </span>
                        {new Date(log.createdAt).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    );
  };


  
  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Refs for click outside
  const envDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const targetDropdownRef = useRef<HTMLDivElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const editEnvDropdownRef = useRef<HTMLDivElement>(null);
  const editStatusDropdownRef = useRef<HTMLDivElement>(null);
  const editTargetDropdownRef = useRef<HTMLDivElement>(null);
  const editServiceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (envDropdownRef.current && !envDropdownRef.current.contains(event.target as Node)) {
        setIsEnvDropdownOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(event.target as Node)) {
        setIsTargetDropdownOpen(false);
      }
      if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(event.target as Node)) {
        setIsServiceDropdownOpen(false);
      }
      if (editEnvDropdownRef.current && !editEnvDropdownRef.current.contains(event.target as Node)) {
        setIsEditEnvDropdownOpen(false);
      }
      if (editStatusDropdownRef.current && !editStatusDropdownRef.current.contains(event.target as Node)) {
        setIsEditStatusDropdownOpen(false);
      }
      if (editTargetDropdownRef.current && !editTargetDropdownRef.current.contains(event.target as Node)) {
        setIsEditTargetDropdownOpen(false);
      }
      if (editServiceDropdownRef.current && !editServiceDropdownRef.current.contains(event.target as Node)) {
        setIsEditServiceDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);





  const fetchDomains = async () => {
    setLoading(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains`;
      if (projectId) {
        url += `?projectId=${projectId}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDomains(data);
      }
      
      if (projectId) {
        const [projectRes, intRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/integrations/status`, { credentials: "include" })
        ]);
        
        if (projectRes.ok) {
          const projectData = await projectRes.json();
          setProject(projectData);
        }
        if (intRes.ok) {
          const intData = await intRes.json();
          setIntegrations(intData);
        }
      }
    } catch (err) {
      console.error("Error fetching domains:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMakePrimary = async () => {
    if (!domainToMakePrimary) return;
    setIsMakingPrimary(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainToMakePrimary.id}/make-primary`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Domain promoted to primary successfully. Deployments triggered.", "success");
        await fetchDomains();
        setDomainToMakePrimary(null);
      } else {
        showToast(data.message || data.error || "Failed to make primary", "error");
      }
    } catch (err: any) {
      showToast(err.message || "An error occurred", "error");
    } finally {
      setIsMakingPrimary(false);
    }
  };

  const handleRedirectToPrimary = async () => {
    if (!domainToRedirect) return;
    setIsRedirecting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainToRedirect.id}/redirect-to-primary`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Domain redirected to primary successfully. Backend redeploying.", "success");
        await fetchDomains();
        setDomainToRedirect(null);
      } else {
        showToast(data.message || data.error || "Failed to redirect to primary", "error");
      }
    } catch (err: any) {
      showToast(err.message || "An error occurred", "error");
    } finally {
      setIsRedirecting(false);
    }
  };

  const handleDisableRedirect = async () => {
    if (!domainToDisableRedirect) return;
    setIsDisablingRedirect(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainToDisableRedirect.id}/disable-redirect`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Redirect disabled successfully. Backend redeploying.", "success");
        await fetchDomains();
        setDomainToDisableRedirect(null);
      } else {
        showToast(data.message || data.error || "Failed to disable redirect", "error");
      }
    } catch (err: any) {
      showToast(err.message || "An error occurred", "error");
    } finally {
      setIsDisablingRedirect(false);
    }
  };

  const handleCheckHealth = async (domainId: string) => {
    setCheckingDomainId(domainId);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainId}/health-check`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Health check completed", "success");
        setDomains(prev => prev.map(d => d.id === domainId ? { ...d, healthCheck: data.health } : d));
      } else {
        showToast(data.message || data.error || "Failed to check health", "error");
      }
    } catch (err: any) {
      showToast(err.message || "An error occurred", "error");
    } finally {
      setCheckingDomainId(null);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomainInput.trim() || !projectId || isAddingDomain) return;
    
    // Check if redirect is selected but no target is set
    if (addDomainOption === 'redirect' && redirectTarget === 'No Redirect') return;

    setIsAddingDomain(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootDomain: newDomainInput.trim(),
          targetService: targetService,
          addDomainOption: addDomainOption,
          redirectStatus: redirectStatus,
          redirectTarget: redirectTarget
        }),
        credentials: "include"
      });

      if (res.ok) {
        setIsAddDomainModalOpen(false);
        setNewDomainInput("");
        fetchDomains(); // Refresh list to show newly added domain
        showToast("Domain added successfully.", "success");
      } else {
        const errorData = await res.json();
        showToast(errorData.error || "Failed to add domain.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while adding the domain.", "error");
    } finally {
      setIsAddingDomain(false);
    }
  };

  const handleEditClick = (domain: any) => {
    setEditingDomainId(domain.id);
    setEditDomainOption(domain.isRedirect ? 'redirect' : 'environment');
    setEditRedirectStatus(domain.redirectStatus || '307 Temporary Redirect');
    setEditRedirectTarget(domain.redirectTarget || 'No Redirect');
    // Use actual targetService from the domain object; fall back to isBackend for compatibility
    const ts = domain.targetService || (domain.isBackend ? 'backend' : 'frontend');
    setEditTargetService(ts === 'both' ? (domain.isBackend ? 'backend' : 'frontend') : ts);
  };

  const handleCancelEdit = () => {
    setEditingDomainId(null);
  };

  const handleSaveEdit = async (domain: any) => {
    setIsSavingDomain(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domain.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addDomainOption: editDomainOption,
          redirectStatus: editRedirectStatus,
          redirectTarget: editRedirectTarget,
          targetService: editTargetService
        }),
        credentials: "include"
      });

      if (res.ok) {
        showToast("Domain updated successfully.", "success");
        setEditingDomainId(null);
        fetchDomains();
      } else {
        const errorData = await res.json();
        showToast(errorData.error || "Failed to update domain.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while updating the domain.", "error");
    } finally {
      setIsSavingDomain(false);
    }
  };

  const handleRemoveClick = (domain: any) => {
    setDomainToRemove(domain);
  };

  const handleCancelRemove = () => {
    setDomainToRemove(null);
  };

  const handleConfirmRemove = async () => {
    if (!domainToRemove) return;
    setIsRemovingDomain(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainToRemove.id}`, {
        method: 'DELETE',
        credentials: "include"
      });

      if (res.ok) {
        showToast("Domain removed successfully.", "success");
        setDomainToRemove(null);
        if (editingDomainId === domainToRemove.id) setEditingDomainId(null);
        fetchDomains();
      } else {
        const errorData = await res.json();
        showToast(errorData.message || errorData.error || "Failed to remove domain.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while removing the domain.", "error");
    } finally {
      setIsRemovingDomain(false);
    }
  };
  const handleVerifyDomain = async (domainId: string, isAutoPoll = false) => {
    try {
      if (!isAutoPoll) setVerifyingDomain(domainId);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainId}/verify`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok) {
        const isBackend = domainId.endsWith('_api');
        const ds = data.domainSetup;
        const isVerified = isBackend ? ds?.backendVerification === 'verified' : ds?.frontendVerification === 'verified';
        
        if (isVerified || ds?.status === 'failed') {
          delete pollingAttemptsRef.current[domainId];
        }
        
        if (!isAutoPoll) {
          if (isVerified) {
            showToast("Domain verified successfully!", "success");
          } else {
            showToast("Verification failed. Please ensure you have added the DNS records to your provider.", "error");
          }
          fetchDomains();
        }
        return isVerified;
      } else {
        if (!isAutoPoll) showToast(data.error || "Failed to verify domain", "error");
        return false;
      }
    } catch (err) {
      console.error(err);
      if (!isAutoPoll) showToast("An error occurred while verifying the domain.", "error");
      return false;
    } finally {
      if (!isAutoPoll) setVerifyingDomain(null);
    }
  };

  const handleConnectCloudflare = async () => {
    try {
      setSavingCloudflareKey(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/integrations/cloudflare/connect-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({ apiKey: cloudflareKey })
      });
      if (res.ok) {
        setCloudflareKey("");
        showToast("Cloudflare connected successfully.", "success");
        fetchDomains();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to connect Cloudflare", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while connecting Cloudflare.", "error");
    } finally {
      setSavingCloudflareKey(false);
    }
  };

  const handleApplyCloudflareDns = async (domainId: string, dryRun: boolean = false) => {
    try {
      setApplyingDns(domainId);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/domains/${domainId}/apply-cloudflare-dns?dryRun=${dryRun}`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok) {
        if (dryRun) {
          setDnsPreview(data.preview || []);
        } else {
          setDnsPreview([]);
          showToast("DNS applied automatically.", "success");
          fetchDomains();
        }
      } else {
        showToast(data.error || "Failed to apply DNS", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while applying DNS.", "error");
    } finally {
      setApplyingDns(null);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, [projectId]);

  const defaultProjectDomain = project?.latestDeployment?.deploymentUrl?.replace(/^https?:\/\//, '') || 
                               project?.latestDeployment?.finalSummary?.frontendUrl?.replace(/^https?:\/\//, '') || 
                               (project?.repoName ? `${project.repoName}.vercel.app` : 'example.vercel.app');

  const activeDomainTargets = useMemo(() => {
    const targets = new Set<string>();
    if (defaultProjectDomain) targets.add(defaultProjectDomain);
    
    domains.forEach(d => {
      if (d.domain) {
        const isValid = d.status === 'active' || d.domain.includes('.vercel.app') || d.domain.includes('.deployai.app');
        if (isValid) {
          targets.add(d.domain);
        }
      }
    });
    
    return Array.from(targets);
  }, [domains, defaultProjectDomain]);

  const filteredDomains = useMemo(() => {
    return domains.filter(d => d.domain.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [domains, searchQuery]);

  const frontendDomains = useMemo(() => filteredDomains.filter(d => !d.isBackend), [filteredDomains]);
  const backendDomains = useMemo(() => filteredDomains.filter(d => d.isBackend), [filteredDomains]);

  const renderAdvancedView = (d: any) => {
    const isCloudflareConnected = integrations?.cloudflare?.connected;
    return (
      <div className="p-6 bg-[#0a0a0a] border-t border-zinc-800 animate-in slide-in-from-top-2 duration-200">
        {/* Verification Status Banner */}
        {d.status === 'degraded' && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <span className="mt-0.5 text-amber-400 text-base">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-400">Domain Degraded — DNS Records Missing</p>
              <p className="text-[13px] text-amber-300/80 mt-1">
                Your DNS records appear to have been removed. Re-add all the records in the table below to your DNS provider, then click <strong>Verify Again</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-[15px] font-semibold text-white mb-2">DNS Configuration</h3>
            <p className="text-[13px] text-zinc-400 max-w-xl">
              The DNS records at your provider must match the following records to verify and connect your domain.
            </p>
          </div>
          <button 
            onClick={() => handleVerifyDomain(d.id)}
            disabled={verifyingDomain === d.id}
            className={`rounded px-3 py-1.5 text-[13px] font-medium disabled:opacity-50 flex items-center gap-2 ${
              d.status === 'degraded'
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
                : 'bg-zinc-800 text-white hover:bg-zinc-700'
            }`}
          >
            {verifyingDomain === d.id && <Loader2 className="h-3 w-3 animate-spin" />}
            {d.status === 'degraded' ? 'Verify Again' : 'Verify DNS'}
          </button>
        </div>

        {/* DNS Records Table */}
        {d.dnsRecords && d.dnsRecords.length > 0 ? (
          <div className="mb-8 border border-zinc-800 rounded-lg overflow-hidden bg-black">
            <table className="w-full text-left text-[13px] text-zinc-400">
              <thead className="bg-[#050505] border-b border-zinc-800 uppercase tracking-wider text-[11px] text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {d.dnsRecords.map((rec: any, i: number) => {
                  const rowKey = `${d.id}-${i}`;
                  const isCopied = copiedRecord === rowKey;
                  return (
                    <tr key={i} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-zinc-300">{rec.type}</td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{rec.name}</td>
                      <td className="px-4 py-3 font-mono text-zinc-300">
                        <div className="flex items-center gap-2">
                          <span className="break-all">{rec.value}</span>
                          <button
                            onClick={() => handleCopyRecord(rec.value, rowKey)}
                            className={`shrink-0 rounded p-1 transition-colors ${
                              isCopied
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
                            }`}
                            title={isCopied ? 'Copied!' : 'Copy value'}
                          >
                            {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-500">{rec.purpose?.replace('_', ' ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mb-8 p-6 text-center text-[13px] text-zinc-500 border border-zinc-800 border-dashed rounded-lg">
            No DNS records required.
          </div>
        )}

        {/* Cloudflare Automation */}
        <div className="border-t border-zinc-800 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold text-white">Cloudflare DNS Automation</h4>
            {isCloudflareConnected ? (
              <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Connected</span>
            ) : (
              <span className="text-[11px] font-medium text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Not connected</span>
            )}
          </div>
          
          {!isCloudflareConnected ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 items-center max-w-md">
                <input 
                  type="password"
                  placeholder="Cloudflare API Token..."
                  value={cloudflareKey}
                  onChange={(e) => setCloudflareKey(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-800 bg-black p-2 text-[13px] text-white focus:border-zinc-700 focus:outline-none transition-colors"
                />
                <button
                  onClick={handleConnectCloudflare}
                  disabled={!cloudflareKey || savingCloudflareKey}
                  className="rounded-md bg-white text-black px-4 py-2 text-[13px] font-medium hover:bg-zinc-200 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap transition-colors"
                >
                  {savingCloudflareKey && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Connect
                </button>
              </div>
              <p className="text-[12px] text-zinc-500 leading-relaxed max-w-2xl">
                Create a Custom Token in your <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white underline underline-offset-2 transition-colors">Cloudflare Profile</a> with these Permissions:
                <br />• <strong>Zone</strong> / <strong>Zone</strong> / <strong>Read</strong>
                <br />• <strong>Zone</strong> / <strong>DNS</strong> / <strong>Edit</strong>
                <br />Set Zone Resources to <strong>Include</strong> / <strong>All zones</strong>.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleApplyCloudflareDns(d.id, true)}
                  disabled={applyingDns === d.id}
                  className="rounded-md border border-zinc-700 bg-transparent px-4 py-2 text-[13px] font-medium text-zinc-300 hover:text-white hover:border-zinc-600 disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                  {applyingDns === d.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Preview Changes
                </button>
                
                {dnsPreview.length > 0 && applyingDns !== d.id && (
                  <button
                    onClick={() => handleApplyCloudflareDns(d.id, false)}
                    className="rounded-md bg-white text-black px-4 py-2 text-[13px] font-medium hover:bg-zinc-200 flex items-center gap-2 transition-colors"
                  >
                    Apply DNS Automatically
                  </button>
                )}
              </div>
              
              {dnsPreview.length > 0 && applyingDns !== d.id && (
                <div className="mt-4 space-y-1.5 bg-black border border-zinc-800 rounded-lg p-3">
                  {dnsPreview.map((p, i) => (
                    <div key={i} className="text-[12px] flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${p.action === 'create' ? 'bg-emerald-500/10 text-emerald-400' : p.action === 'skip' ? 'bg-zinc-800 text-zinc-400' : p.action === 'conflict' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
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
      </div>
    );
  };

  
  const renderEditDomainRow = (d: any) => {
    return (
      <div key={`edit-${d.id}`} className="border-b border-zinc-800 bg-[#0a0a0a]">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[15px] font-semibold text-white">Edit Domain Settings: {d.domain}</h3>
            <button onClick={handleCancelEdit} className="text-zinc-500 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="border border-zinc-800 rounded-lg mb-2 bg-black">
            <div className="p-4 border-b border-zinc-800 transition-colors">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="radio" 
                  name={`editDomainOption-${d.id}`}
                  value="environment"
                  checked={editDomainOption === 'environment'}
                  onChange={() => setEditDomainOption('environment')}
                  className="h-3.5 w-3.5 rounded-full border-zinc-600 bg-black text-white focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-[14px] text-zinc-200">Connect to an environment</span>
              </label>
              
              <div className={`mt-3 ml-[26px] flex flex-wrap items-center gap-3 transition-opacity duration-200 ${editDomainOption !== 'environment' ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="relative">
                  <button 
                    disabled
                    className="flex items-center justify-between w-[200px] px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 rounded-lg transition-colors opacity-70 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2">
                       <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                       <span className="text-[13px] text-zinc-200">Production</span>
                    </div>
                  </button>
                </div>
                
                <div className="relative transition-colors duration-200">
                  <button 
                    disabled
                    className="flex items-center justify-between w-[160px] px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 rounded-lg transition-colors opacity-70 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2">
                       {editTargetService === 'frontend' ? <Globe className="h-[14px] w-[14px] text-zinc-400" /> : <Server className="h-[14px] w-[14px] text-zinc-400" />}
                       <span className="text-[13px] text-zinc-200">{editTargetService === 'frontend' ? 'Frontend' : 'Backend'}</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 transition-colors">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="radio" 
                  name={`editDomainOption-${d.id}`}
                  value="redirect"
                  checked={editDomainOption === 'redirect'}
                  onChange={() => setEditDomainOption('redirect')}
                  className="h-3.5 w-3.5 rounded-full border-zinc-600 bg-black text-white focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-[14px] text-zinc-200">Redirect to Another Domain</span>
              </label>
              
              <div className={`mt-3 ml-[26px] flex flex-wrap items-center gap-3 transition-opacity duration-200 ${editDomainOption !== 'redirect' ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="relative" ref={editStatusDropdownRef}>
                  <button 
                    onClick={() => setIsEditStatusDropdownOpen(!isEditStatusDropdownOpen)}
                    className="flex items-center justify-between w-[220px] px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors"
                  >
                    <span className="text-[13px] text-zinc-200 truncate">{editRedirectStatus}</span>
                    <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                  </button>
                  {isEditStatusDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-[220px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-20 p-1">
                       <div className="px-2 py-1.5 text-[12px] font-semibold text-white">Temporary</div>
                       <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${editRedirectStatus === '307 Temporary Redirect' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setEditRedirectStatus('307 Temporary Redirect'); setIsEditStatusDropdownOpen(false); }}>307 Temporary Redirect</button>
                       <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${editRedirectStatus === '302 Found' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setEditRedirectStatus('302 Found'); setIsEditStatusDropdownOpen(false); }}>302 Found</button>
                       <div className="px-2 py-1.5 mt-1 text-[12px] font-semibold text-white">Permanent</div>
                       <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${editRedirectStatus === '308 Permanent Redirect' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setEditRedirectStatus('308 Permanent Redirect'); setIsEditStatusDropdownOpen(false); }}>308 Permanent Redirect</button>
                       <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${editRedirectStatus === '301 Moved Permanently' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setEditRedirectStatus('301 Moved Permanently'); setIsEditStatusDropdownOpen(false); }}>301 Moved Permanently</button>
                    </div>
                  )}
                </div>

                <div className="relative" ref={editTargetDropdownRef}>
                  <button 
                    onClick={() => setIsEditTargetDropdownOpen(!isEditTargetDropdownOpen)}
                    className="flex items-center justify-between w-[200px] px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Search className="h-[14px] w-[14px] text-zinc-500 flex-shrink-0" />
                      <span className="text-[13px] text-zinc-200 truncate">{editRedirectTarget}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                  </button>
                  {isEditTargetDropdownOpen && (
                    <div className="absolute top-full right-0 mt-1 w-[240px] max-h-[140px] overflow-y-auto bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-20 p-1">
                       <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md flex items-center gap-2 transition-colors ${editRedirectTarget === 'No Redirect' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setEditRedirectTarget('No Redirect'); setIsEditTargetDropdownOpen(false); }}>
                          <Search className={`h-3.5 w-3.5 ${editRedirectTarget === 'No Redirect' ? 'text-white' : 'text-zinc-400'}`} /> No Redirect
                       </button>
                       {activeDomainTargets.map((domainStr) => (
                         <button key={domainStr} className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md truncate transition-colors ${editRedirectTarget === domainStr ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setEditRedirectTarget(domainStr); setIsEditTargetDropdownOpen(false); }}>
                            {domainStr}
                         </button>
                       ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={handleCancelEdit} className="px-4 py-1.5 border border-zinc-700 rounded-md text-[13px] font-medium text-zinc-300 hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button 
              onClick={() => handleSaveEdit(d)} 
              disabled={isSavingDomain || (editDomainOption === 'redirect' && editRedirectTarget === 'No Redirect')} 
              className="px-4 py-1.5 bg-white text-black rounded-md text-[13px] font-medium hover:bg-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSavingDomain && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDomainRow = (d: any) => {
    if (editingDomainId === d.id) {
      return renderEditDomainRow(d);
    }
    const isProvider = d.domain.includes('.vercel.app') || d.domain.includes('.deployai.app');
    const isValid = ['active', 'partially_active', 'verifying'].includes(d.status) || isProvider;
    const isRedirect = d.domainRole === 'redirect';
    const redirectTarget = d.redirectTo || `www.${d.domain}`;
    
    const renderHealthBadge = (healthCheck: any) => {
      const checkedAgo = healthCheck?.checkedAt ? Math.round((Date.now() - new Date(healthCheck.checkedAt).getTime()) / 60000) : null;
      const checkedText = checkedAgo !== null ? (checkedAgo === 0 ? 'just now' : `${checkedAgo}m ago`) : '';

      if (!healthCheck || healthCheck.status === 'unknown') {
        return (
          <div className="flex items-center gap-2">
            <span className="bg-zinc-800 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide" title="Health not checked yet">Not Checked</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2">
          {healthCheck.status === 'healthy' && <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide" title={healthCheck.message}>Healthy</span>}
          {healthCheck.status === 'warning' && <span className="bg-yellow-500/10 text-yellow-500 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide" title={healthCheck.message}>Warning</span>}
          {healthCheck.status === 'failed' && <span className="bg-red-500/10 text-red-500 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide" title={healthCheck.message}>Failed</span>}
          <span className="text-[10px] text-zinc-500">checked {checkedText}</span>
        </div>
      );
    };
    
    return (
      <div key={d.id} className="border-b border-zinc-800 group">
        <div className="flex items-center justify-between p-4 hover:bg-zinc-900/30 transition-colors">
          {/* Left Section: Status & Domain */}
          <div className="flex items-start gap-3 flex-1 min-w-[200px]">
            <div className="mt-0.5">
              {isValid ? (
                <div className="h-[18px] w-[18px] rounded-full bg-[#0070f3] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3 text-white"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
              ) : (
                <AlertTriangle className="h-[18px] w-[18px] text-red-500 fill-red-500/10" />
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-white text-[14px]">{d.domain}</span>
                {d.domainRole === 'primary' && (
                  <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide">Primary</span>
                )}
                {d.domainRole === 'alias' && (
                  <span className="bg-zinc-800 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide">Alias</span>
                )}
                {d.domainRole === 'redirect' && (
                  <span className="bg-blue-500/10 text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide">Redirect</span>
                )}
                {!isProvider && renderHealthBadge(d.healthCheck)}
                {checkingDomainId === d.id && (
                  <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/> Checking...</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isValid ? (
                  <>
                    <span className="inline-flex items-center bg-red-500/10 text-red-500 text-[11px] px-2 py-0.5 rounded-full font-medium tracking-wide">
                      Invalid Configuration
                    </span>
                    
                  </>
                ) : (
                  <span className="text-zinc-400 text-[13px]">
                    Valid Configuration
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Middle Section: Environment / Redirect */}
          <div className="flex items-center text-[13px] text-zinc-400 flex-1 px-4 min-w-[200px]">
            {isRedirect ? (
              <div className="flex items-center gap-2">
                <CornerDownRight className="h-4 w-4 text-zinc-500" />
                <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-[12px] text-zinc-300 font-medium">{d.redirectStatus ? d.redirectStatus.split(' ')[0] : '308'}</span>
                <span>{redirectTarget}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="h-[15px] w-[15px] text-zinc-500" />
                <span>Production</span>
              </div>
            )}
          </div>

          {/* Right Section: Buttons */}
          <div className="flex items-center justify-end gap-2 flex-1 min-w-[150px]">
            {['active', 'partially_active', 'degraded'].includes(d.status) && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleCheckHealth(d.id); }}
                disabled={checkingDomainId === d.id}
                className="px-3 py-1.5 bg-black border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {checkingDomainId === d.id && <Loader2 className="h-3 w-3 animate-spin" />}
                Check Health
              </button>
            )}
            <button onClick={() => setExpandedDomainId(expandedDomainId === d.id ? null : d.id)} className="px-3 py-1.5 bg-black border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-sm">
              {expandedDomainId === d.id ? 'Hide Details' : 'View Details'}
            </button>
            {d.provider === 'third_party' && (
              <button onClick={() => handleEditClick(d)} className="px-3 py-1.5 bg-black border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-sm">
                Edit
              </button>
            )}


            <div className="relative">
              <button 
                onClick={() => setActiveDropdownId(activeDropdownId === d.id ? null : d.id)}
                className="p-1.5 bg-black border border-zinc-800 rounded-md text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors shadow-sm"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              
              {activeDropdownId === d.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setActiveDropdownId(null)} />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-lg overflow-hidden z-50 py-1">
                  {isValid && d.domainRole === 'alias' && !d.isRedirect ? (
                    <button
                      onClick={() => {
                        setDomainToMakePrimary(d);
                        setActiveDropdownId(null);
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-900 transition-colors"
                    >
                      Make Primary
                    </button>
                  ) : (
                    <div className="px-3 py-2 text-[13px] text-zinc-500 cursor-not-allowed">
                      Make Primary
                      <span className="block text-[11px] text-zinc-600 mt-0.5">
                        {!isValid ? "Domain must be active" : d.domainRole === 'primary' ? "Already primary" : "Cannot promote redirect"}
                      </span>
                    </div>
                  )}

                  {isValid && d.domainRole === 'alias' && !d.isRedirect && d.targetService === 'frontend' ? (
                    <button
                      onClick={() => {
                        setDomainToRedirect(d);
                        setActiveDropdownId(null);
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-900 transition-colors"
                    >
                      Redirect to Primary
                    </button>
                  ) : null}

                  {isValid && d.domainRole === 'redirect' && d.targetService === 'frontend' ? (
                    <button
                      onClick={() => {
                        setDomainToDisableRedirect(d);
                        setActiveDropdownId(null);
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-900 transition-colors"
                    >
                      Disable Redirect
                    </button>
                  ) : null}

                  <div className="h-px bg-zinc-800 my-1"></div>
                  {d.provider === 'third_party' ? (
                    <button
                      onClick={() => {
                        setDomainToRemove(d);
                        setActiveDropdownId(null);
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      Remove Domain
                    </button>
                  ) : (
                    <div className="px-3 py-2 text-[13px] text-zinc-600 cursor-not-allowed">
                      Remove Domain
                      <span className="block text-[11px] text-zinc-700 mt-0.5">Provider-managed domain</span>
                    </div>
                  )}
                </div>
                </>
              )}
            </div>
          </div>
        </div>
        
        {expandedDomainId === d.id && renderAdvancedView(d)}
      </div>
    );
  };


  return (
    <div className="p-8 w-full mx-auto min-h-screen relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-16 z-[100] px-4 py-3 rounded-md shadow-2xl flex items-center gap-3 transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-[#e5484d] text-white' : 'bg-[#30a46c] text-white'}`}>
           {toast.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-4 w-4"><polyline points="20 6 9 17 4 12"></polyline></svg>}
           <span className="text-[14px] font-medium">{toast.message}</span>
        </div>
      )}
      <div className="max-w-[1200px] w-full mx-auto">
        {/* Header Actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative flex-1 max-w-[400px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-zinc-500" />
            <input 
              type="text"
              placeholder="Search any domain"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#050505] border border-zinc-800 rounded-md pl-9 pr-8 py-2 text-[14px] text-white focus:outline-none focus:border-zinc-700 transition-colors placeholder:text-zinc-600 shadow-sm"
            />
            {searchQuery.length > 0 && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {projectId && (
              <button 
                onClick={() => setIsAddDomainModalOpen(true)}
                className="px-3.5 py-1.5 bg-[#0a0a0a] border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                Add Existing 
              </button>
            )}
            {/* <button className="px-4 py-1.5 bg-white text-black rounded-md text-[14px] font-medium hover:bg-zinc-200 transition-colors shadow-sm">
              Buy
            </button> */}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
             <Loader2 className="h-5 w-5 text-zinc-500 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="border border-zinc-800 rounded-lg bg-black shadow-xl">
              {/* Frontend Section */}
              <div className="bg-[#050505] px-4 py-3 border-b border-zinc-800 flex items-center gap-2 rounded-t-lg">
                 <Globe className="h-4 w-4 text-zinc-400" />
                 <h3 className="text-[12px] font-semibold text-zinc-300 uppercase tracking-wider">Frontend Domains</h3>
              </div>
              <div className="flex flex-col">
                {frontendDomains.length > 0 ? (
                  frontendDomains.map(renderDomainRow)
                ) : (
                  <div className="p-6 text-center text-zinc-600 text-[13px]">No frontend domains attached.</div>
                )}
              </div>
            </div>

            <div className="border border-zinc-800 rounded-lg bg-black shadow-xl">
              {/* Backend Section */}
              <div className="bg-[#050505] px-4 py-3 border-b border-zinc-800 flex items-center gap-2 rounded-t-lg">
                 <Server className="h-4 w-4 text-zinc-400" />
                 <h3 className="text-[12px] font-semibold text-zinc-300 uppercase tracking-wider">Backend Domains</h3>
              </div>
              <div className="flex flex-col">
                {backendDomains.length > 0 ? (
                  backendDomains.map(renderDomainRow)
                ) : (
                  <div className="p-6 text-center text-zinc-600 text-[13px]">No backend domains attached.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Domains Modal */}
      {isAddDomainModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl w-full max-w-[560px] shadow-2xl relative animate-in fade-in zoom-in duration-200 p-6 my-auto">
            <h2 className="text-[20px] font-semibold text-white mb-2">Add Domains</h2>
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-6">
              Add one or more domains to this project and choose one destination for all of them. Domains connected to an environment are aliased to the most recent deployment in that environment.
            </p>
            
            <div className="flex flex-col mb-6">
              <div className="relative flex items-center border border-zinc-800 rounded-lg bg-black focus-within:border-zinc-300 transition-colors px-3 py-2.5">
                <Search className="h-[15px] w-[15px] text-zinc-500 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="example.com"
                  value={newDomainInput}
                  onChange={(e) => setNewDomainInput(e.target.value)}
                  className="flex-1 bg-transparent text-[14px] text-white focus:outline-none placeholder:text-zinc-600"
                  autoFocus
                />
                {newDomainInput.length > 0 && (
                  <button 
                    onClick={() => setNewDomainInput("")}
                    className="flex items-center justify-center text-zinc-500 hover:text-white transition-colors ml-2 flex-shrink-0 cursor-pointer"
                    title="Clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-[13px] text-zinc-400 mt-2">Or paste multiple domains, one per line.</p>
            </div>

            <div className="border border-zinc-800 rounded-lg mb-8 bg-black">
              <div className="p-4 border-b border-zinc-800 transition-colors">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="radio" 
                    name="addDomainOption"
                    value="environment"
                    checked={addDomainOption === 'environment'}
                    onChange={() => setAddDomainOption('environment')}
                    className="h-3.5 w-3.5 rounded-full border-zinc-600 bg-black text-white focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-[14px] text-zinc-200">Connect to an environment</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <div 
                    ref={envDropdownRef}
                    className={`mt-3 ml-[26px] w-max relative transition-opacity duration-200 ${addDomainOption !== 'environment' ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <button 
                      onClick={() => setIsEnvDropdownOpen(!isEnvDropdownOpen)}
                      className="flex items-center justify-between w-[240px] px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                         <ArrowUpCircle className="h-[14px] w-[14px] text-zinc-400" />
                         <span className="text-[13px] text-zinc-200">{selectedEnv}</span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-zinc-500" />
                    </button>
                    
                    {isEnvDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-[240px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-20 p-1">
                         <div className="px-2 py-1.5 text-[12px] font-medium text-zinc-500">System Environments</div>
                         <button 
                           className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${selectedEnv === 'Production' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                           onClick={() => { setSelectedEnv('Production'); setIsEnvDropdownOpen(false); }}
                         >
                           Production
                         </button>
                         <button 
                           className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${selectedEnv === 'Preview' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                           onClick={() => { setSelectedEnv('Preview'); setIsEnvDropdownOpen(false); }}
                         >
                           Preview
                         </button>
                         <div className="px-2 py-1.5 mt-1 text-[12px] font-medium text-zinc-500 border-t border-zinc-800 mx-1">Custom Environments</div>
                         <div className="px-2 py-2 text-[13px] text-zinc-500">Your project has no custom environments</div>
                      </div>
                    )}
                  </div>
                  
                  <div 
                    ref={serviceDropdownRef}
                    className={`mt-3 relative transition-opacity duration-200 ${addDomainOption !== 'environment' ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <button 
                      onClick={() => setIsServiceDropdownOpen(!isServiceDropdownOpen)}
                      className="flex items-center justify-between w-[160px] px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                         {targetService === 'frontend' ? <Globe className="h-[14px] w-[14px] text-zinc-400" /> : <Server className="h-[14px] w-[14px] text-zinc-400" />}
                         <span className="text-[13px] text-zinc-200">{targetService === 'frontend' ? 'Frontend' : 'Backend'}</span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-zinc-500" />
                    </button>
                    
                    {isServiceDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-[160px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-20 p-1">
                         <button 
                           className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors flex items-center gap-2 ${targetService === 'frontend' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                           onClick={() => { setTargetService('frontend'); setIsServiceDropdownOpen(false); }}
                         >
                           <Globe className="h-[12px] w-[12px]" /> Frontend
                         </button>
                        {project?.configuration?.backendPlatform && project.configuration.backendPlatform !== 'none' && (
                         <button 
                           className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors flex items-center gap-2 ${targetService === 'backend' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                           onClick={() => { setTargetService('backend'); setIsServiceDropdownOpen(false); }}
                         >
                           <Server className="h-[12px] w-[12px]" /> Backend
                         </button>
                         )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 transition-colors">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="radio" 
                    name="addDomainOption"
                    value="redirect"
                    checked={addDomainOption === 'redirect'}
                    onChange={() => setAddDomainOption('redirect')}
                    className="h-3.5 w-3.5 rounded-full border-zinc-600 bg-black text-white focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-[14px] text-zinc-200">Redirect to Another Domain</span>
                </label>
                <div className={`mt-3 ml-[26px] flex flex-wrap items-center gap-3 transition-opacity duration-200 ${addDomainOption !== 'redirect' ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="relative" ref={statusDropdownRef}>
                    <button 
                      onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                      className="flex items-center justify-between w-[220px] px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors"
                    >
                      <span className="text-[13px] text-zinc-200 truncate">{redirectStatus}</span>
                      <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                    </button>
                    {isStatusDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-[220px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-20 p-1">
                         <div className="px-2 py-1.5 text-[12px] font-semibold text-white">Temporary</div>
                         <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${redirectStatus === '307 Temporary Redirect' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setRedirectStatus('307 Temporary Redirect'); setIsStatusDropdownOpen(false); }}>307 Temporary Redirect</button>
                         <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${redirectStatus === '302 Found' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setRedirectStatus('302 Found'); setIsStatusDropdownOpen(false); }}>302 Found</button>
                         <div className="px-2 py-1.5 mt-1 text-[12px] font-semibold text-white">Permanent</div>
                         <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${redirectStatus === '308 Permanent Redirect' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setRedirectStatus('308 Permanent Redirect'); setIsStatusDropdownOpen(false); }}>308 Permanent Redirect</button>
                         <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${redirectStatus === '301 Moved Permanently' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setRedirectStatus('301 Moved Permanently'); setIsStatusDropdownOpen(false); }}>301 Moved Permanently</button>
                      </div>
                    )}
                  </div>

                  <div className="relative" ref={targetDropdownRef}>
                    <button 
                      onClick={() => setIsTargetDropdownOpen(!isTargetDropdownOpen)}
                      className="flex items-center justify-between w-[200px] px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Search className="h-[14px] w-[14px] text-zinc-500 flex-shrink-0" />
                        <span className="text-[13px] text-zinc-200 truncate">{redirectTarget}</span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                    </button>
                    {isTargetDropdownOpen && (
                      <div className="absolute top-full right-0 mt-1 w-[240px] max-h-[140px] overflow-y-auto bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-20 p-1">
                         <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md flex items-center gap-2 transition-colors ${redirectTarget === 'No Redirect' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setRedirectTarget('No Redirect'); setIsTargetDropdownOpen(false); }}>
                            <Search className={`h-3.5 w-3.5 ${redirectTarget === 'No Redirect' ? 'text-white' : 'text-zinc-400'}`} /> No Redirect
                         </button>
                         {activeDomainTargets.map((domainStr) => (
                           <button key={domainStr} className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md truncate transition-colors ${redirectTarget === domainStr ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} onClick={() => { setRedirectTarget(domainStr); setIsTargetDropdownOpen(false); }}>
                              {domainStr}
                           </button>
                         ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <button 
                onClick={() => {
                  setIsAddDomainModalOpen(false);
                  setNewDomainInput("");
                }}
                className="px-4 py-2 border border-zinc-800 rounded-lg bg-transparent text-[13px] font-medium text-white hover:bg-zinc-900 transition-colors"
                disabled={isAddingDomain}
              >
                Cancel
              </button>
              <button 
                onClick={handleAddDomain}
                className="px-4 py-2 bg-[#2e2e2e] text-zinc-400 rounded-lg text-[13px] font-medium shadow-sm flex items-center justify-center gap-2"
                style={{
                  backgroundColor: (!newDomainInput.trim() || (addDomainOption === 'redirect' && redirectTarget === 'No Redirect') || isAddingDomain) ? '#2e2e2e' : '#ededed',
                  color: (!newDomainInput.trim() || (addDomainOption === 'redirect' && redirectTarget === 'No Redirect') || isAddingDomain) ? '#888' : '#000',
                  pointerEvents: (!newDomainInput.trim() || (addDomainOption === 'redirect' && redirectTarget === 'No Redirect') || isAddingDomain) ? 'none' : 'auto',
                }}
                disabled={!newDomainInput.trim() || (addDomainOption === 'redirect' && redirectTarget === 'No Redirect') || isAddingDomain}
              >
                {isAddingDomain ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>Add {newDomainInput.trim() ? newDomainInput.split('\n').filter(d => d.trim()).length : 0} Domain{newDomainInput.trim() && newDomainInput.split('\n').filter(d => d.trim()).length === 1 ? '' : 's'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Domain Confirmation Modal */}
      {domainToRemove && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#000000] border border-zinc-800 rounded-xl w-[440px] max-w-full shadow-2xl relative animate-in fade-in zoom-in duration-200 my-auto ring-1 ring-white/5 overflow-hidden">
            <div className="p-6">
              <h2 className="text-[20px] font-semibold text-zinc-100 mb-3">Remove Domain from Project</h2>
              <p className="text-[15px] text-zinc-400 leading-[1.6]">
                Removing {domainToRemove.domain} will disconnect it from your project. This project will no longer be accessible from this domain, including in production.
              </p>
            </div>
            
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-[#050505]/50">
              <button 
                onClick={handleCancelRemove}
                disabled={isRemovingDomain}
                className="h-10 px-4 border border-zinc-700 rounded-md bg-transparent text-[14px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmRemove}
                disabled={isRemovingDomain}
                className="h-10 px-4 bg-[#e5484d] hover:bg-[#d63f43] text-white rounded-md text-[14px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRemovingDomain ? <><Loader2 className="h-4 w-4 animate-spin" /> Removing...</> : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Make Primary Confirmation Modal */}
      {domainToMakePrimary && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#000000] border border-zinc-800 rounded-xl w-[440px] max-w-full shadow-2xl relative animate-in fade-in zoom-in duration-200 my-auto ring-1 ring-white/5 overflow-hidden">
            <div className="p-6">
              <h2 className="text-[20px] font-semibold text-zinc-100 mb-3">Make {domainToMakePrimary.domain} Primary?</h2>
              <p className="text-[15px] text-zinc-400 leading-[1.6]">
                This will update environment variables and redeploy your frontend and backend services. The current primary domain will become an alias.
              </p>
            </div>
            
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-[#050505]/50">
              <button 
                onClick={() => setDomainToMakePrimary(null)}
                disabled={isMakingPrimary}
                className="h-10 px-4 border border-zinc-700 rounded-md bg-transparent text-[14px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleMakePrimary}
                disabled={isMakingPrimary}
                className="h-10 px-4 bg-[#EDEDED] hover:bg-[#D4D4D4] text-black rounded-md text-[14px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isMakingPrimary ? <><Loader2 className="h-4 w-4 animate-spin" /> Promoting...</> : 'Make Primary'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redirect to Primary Confirmation Modal */}
      {domainToRedirect && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#000000] border border-zinc-800 rounded-xl w-[480px] max-w-full shadow-2xl relative animate-in fade-in zoom-in duration-200 my-auto ring-1 ring-white/5 overflow-hidden">
            <div className="p-6">
              <h2 className="text-[20px] font-semibold text-zinc-100 mb-3">Redirect this domain to your primary domain?</h2>
              <div className="flex items-center gap-2 mb-4 p-3 bg-zinc-900 rounded-md border border-zinc-800">
                <span className="text-zinc-300 text-sm font-mono">{domainToRedirect.domain}</span>
                <CornerDownRight className="h-4 w-4 text-zinc-500" />
                <span className="text-zinc-300 text-sm font-mono">
                  {domains.find((d: any) => d.targetService === 'frontend' && d.domainRole === 'primary' && d.status === 'active')?.domain || 'Primary Domain'}
                </span>
              </div>
              <p className="text-[15px] text-zinc-400 leading-[1.6]">
                Visitors to this domain will be permanently redirected to your primary domain. This also removes the domain from backend CORS rules and starts a backend redeployment.
              </p>
            </div>
            
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-[#050505]/50">
              <button 
                onClick={() => setDomainToRedirect(null)}
                disabled={isRedirecting}
                className="h-10 px-4 border border-zinc-700 rounded-md bg-transparent text-[14px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleRedirectToPrimary}
                disabled={isRedirecting}
                className="h-10 px-4 bg-[#EDEDED] hover:bg-[#D4D4D4] text-black rounded-md text-[14px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRedirecting ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting...</> : 'Redirect to Primary'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable Redirect Confirmation Modal */}
      {domainToDisableRedirect && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#000000] border border-zinc-800 rounded-xl w-[480px] max-w-full shadow-2xl relative animate-in fade-in zoom-in duration-200 my-auto ring-1 ring-white/5 overflow-hidden">
            <div className="p-6">
              <h2 className="text-[20px] font-semibold text-zinc-100 mb-3">Convert Redirect to Alias?</h2>
              <p className="text-[15px] text-zinc-400 leading-[1.6]">
                This will remove the platform-level redirect for <span className="text-zinc-300 font-mono text-sm">{domainToDisableRedirect.domain}</span>. The domain will be added back into your backend's allowed CORS origins, and a backend redeployment will begin automatically.
              </p>
            </div>
            
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-[#050505]/50">
              <button 
                onClick={() => setDomainToDisableRedirect(null)}
                disabled={isDisablingRedirect}
                className="h-10 px-4 border border-zinc-700 rounded-md bg-transparent text-[14px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDisableRedirect}
                disabled={isDisablingRedirect}
                className="h-10 px-4 bg-[#EDEDED] hover:bg-[#D4D4D4] text-black rounded-md text-[14px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDisablingRedirect ? <><Loader2 className="h-4 w-4 animate-spin" /> Converting...</> : 'Convert to Alias'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
