"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, MoreHorizontal, Loader2, Globe, Server, AlertTriangle, CornerDownRight , Clock, ChevronDown, X, ArrowUpCircle } from "lucide-react";

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

  const editEnvDropdownRef = useRef<HTMLDivElement>(null);
  const editStatusDropdownRef = useRef<HTMLDivElement>(null);
  const editTargetDropdownRef = useRef<HTMLDivElement>(null);
  const editServiceDropdownRef = useRef<HTMLDivElement>(null);

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
        const projectRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" });
        if (projectRes.ok) {
          const projectData = await projectRes.json();
          setProject(projectData);
        }
      }
    } catch (err) {
      console.error("Error fetching domains:", err);
    } finally {
      setLoading(false);
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
    setEditTargetService(domain.isBackend ? 'backend' : 'frontend');
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
        showToast(errorData.error || "Failed to remove domain.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while removing the domain.", "error");
    } finally {
      setIsRemovingDomain(false);
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

  const renderDomainRow = (d: any) => {
    if (editingDomainId === d.id) {
      return renderExpandedDomainRow(d);
    }
    const isValid = d.status === 'active' || d.domain.includes('.vercel.app') || d.domain.includes('.deployai.app');
    const isRedirect = d.isRedirect === true;
    const redirectTarget = d.redirectTarget || `www.${d.domain}`;
    
    return (
      <div key={d.id} className="flex items-center justify-between p-4 border-b border-zinc-800 hover:bg-zinc-900/30 transition-colors group">
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
            <span className="font-semibold text-white text-[14px] mb-1">{d.domain}</span>
            <div className="flex items-center gap-2">
              {!isValid ? (
                <>
                  <span className="inline-flex items-center bg-red-500/10 text-red-500 text-[11px] px-2 py-0.5 rounded-full font-medium tracking-wide">
                    Invalid Configuration
                  </span>
                  <button className="text-zinc-400 hover:text-white text-[12px] flex items-center transition-colors">
                    Learn more <ChevronDown className="h-3 w-3 ml-0.5" />
                  </button>
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
          <button className="px-3 py-1.5 bg-black border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-sm">
            Refresh
          </button>
          <button onClick={() => handleEditClick(d)} className="px-3 py-1.5 bg-black border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-sm">
            Edit
          </button>
        </div>
      </div>
    );
  };

  const renderExpandedDomainRow = (d: any) => {
    const isRedirect = editDomainOption === 'redirect';
    const isValid = d.status === 'active' || d.domain.includes('.vercel.app') || d.domain.includes('.deployai.app');
    const originalIsRedirect = d.isRedirect === true;
    const originalRedirectTarget = d.redirectTarget || `www.${d.domain}`;

    return (
      <div key={d.id} className="flex flex-col p-4 border-b border-zinc-800 bg-[#0a0a0a] transition-all">
        {/* Top Header matching original row (without Edit/Refresh buttons) */}
        <div className="flex items-center justify-between w-full mb-6">
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
              <span className="font-semibold text-white text-[14px] mb-1">{d.domain}</span>
              <div className="flex items-center gap-2">
                {!isValid ? (
                  <span className="inline-flex items-center bg-red-500/10 text-red-500 text-[11px] px-2 py-0.5 rounded-full font-medium tracking-wide">
                    Invalid Configuration
                  </span>
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
            {originalIsRedirect ? (
              <div className="flex items-center gap-2">
                <CornerDownRight className="h-4 w-4 text-zinc-500" />
                <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-[12px] text-zinc-300 font-medium">{d.redirectStatus ? d.redirectStatus.split(' ')[0] : '308'}</span>
                <span>{originalRedirectTarget}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="h-[15px] w-[15px] text-zinc-500" />
                <span>Production</span>
              </div>
            )}
          </div>
          
          {/* Right Section Placeholder (to maintain flex alignment) */}
          <div className="flex-1 min-w-[150px]"></div>
        </div>

        {/* Form Content */}
        <div className="pl-10 pr-4">
          {/* Readonly Domain Input */}
          <div className="mb-4">
            <label className="block text-[13px] text-zinc-400 mb-2">Domain</label>
            <div className="w-full px-3 h-11 bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-300 transition-colors rounded-lg text-sm text-zinc-300 outline-none flex items-center justify-between cursor-default">
              <span>{d.domain}</span>
            </div>
          </div>

          {/* Configuration Options */}
          <div className="space-y-4 mb-4">
            {/* Environment Option */}
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => setEditDomainOption('environment')}>
              <button
                type="button"
                onClick={() => setEditDomainOption('environment')}
                className="focus:outline-none"
              >
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${editDomainOption === 'environment' ? 'border-[4px] border-[#0a0a0a] bg-white ring-1 ring-white' : 'border border-zinc-600 bg-transparent'}`}></div>
              </button>
              <div className="flex items-center gap-4 flex-1">
                <span className={`text-[14px] w-[220px] flex-shrink-0 ${editDomainOption === 'environment' ? 'text-zinc-200' : 'text-zinc-500'}`}>Connect to an environment</span>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      disabled={editDomainOption !== 'environment'}
                      className={`flex items-center justify-between w-[300px] px-3 h-11 rounded-lg transition-colors ${editDomainOption !== 'environment' ? 'bg-transparent border border-zinc-800/80 text-zinc-600 cursor-not-allowed' : 'bg-[#0a0a0a] border border-zinc-800 text-zinc-200 hover:border-zinc-700'}`}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowUpCircle className={`h-[14px] w-[14px] ${editDomainOption === 'environment' ? 'text-zinc-400' : 'text-zinc-700'}`} />
                        <span className="text-[13px]">Production</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 ${editDomainOption === 'environment' ? 'text-zinc-500' : 'text-zinc-700'}`} />
                    </button>
                  </div>

                  {/* Target Service (Frontend/Backend) */}
                  <div className="relative">
                    <button
                      disabled
                      className={`flex items-center justify-between w-[300px] px-3 h-11 rounded-lg transition-colors cursor-not-allowed ${editDomainOption === 'environment' ? 'bg-[#0a0a0a] border border-zinc-800/80 text-zinc-500' : 'bg-transparent border border-zinc-800/80 text-zinc-600'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Globe className={`h-[14px] w-[14px] ${editDomainOption === 'environment' ? 'text-zinc-600' : 'text-zinc-700'}`} />
                        <span className="text-[13px] capitalize">{editTargetService}</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 ${editDomainOption === 'environment' ? 'text-zinc-700' : 'text-zinc-800'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Redirect Option */}
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => setEditDomainOption('redirect')}>
              <button
                type="button"
                onClick={() => setEditDomainOption('redirect')}
                className="focus:outline-none"
              >
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${editDomainOption === 'redirect' ? 'border-[4px] border-[#0a0a0a] bg-white ring-1 ring-white' : 'border border-zinc-600 bg-transparent'}`}></div>
              </button>
              <div className="flex items-center gap-4 flex-1">
                <span className={`text-[14px] w-[220px] flex-shrink-0 ${editDomainOption === 'redirect' ? 'text-zinc-200' : 'text-zinc-500'}`}>Redirect to Another Domain</span>
                <div className="flex items-center gap-2">
                  <div className="relative" ref={editStatusDropdownRef}>
                    <button
                      disabled={editDomainOption !== 'redirect'}
                      onClick={() => setIsEditStatusDropdownOpen(!isEditStatusDropdownOpen)}
                      className={`flex items-center justify-between w-[300px] px-3 h-11 rounded-lg transition-colors ${editDomainOption !== 'redirect' ? 'bg-transparent border border-zinc-800/80 text-zinc-600 cursor-not-allowed' : 'bg-[#0a0a0a] border border-zinc-800 text-zinc-200 hover:border-zinc-700'}`}
                    >
                      <span className="text-[13px] truncate pr-2">{editRedirectStatus}</span>
                      <ChevronDown className={`h-4 w-4 flex-shrink-0 ${editDomainOption === 'redirect' ? 'text-zinc-500' : 'text-zinc-700'}`} />
                    </button>
                    {isEditStatusDropdownOpen && editDomainOption === 'redirect' && (
                      <div className="absolute top-full left-0 mt-1 w-full bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-20 p-1">
                        {['301 Moved Permanently', '302 Found', '307 Temporary Redirect', '308 Permanent Redirect'].map(status => (
                          <button key={status} className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${editRedirectStatus === status ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800'}`} onClick={() => { setEditRedirectStatus(status); setIsEditStatusDropdownOpen(false); }}>
                            {status}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Target Domain */}
                  <div className="relative" ref={editTargetDropdownRef}>
                    <button
                      disabled={editDomainOption !== 'redirect'}
                      onClick={() => setIsEditTargetDropdownOpen(!isEditTargetDropdownOpen)}
                      className={`flex items-center justify-between w-[300px] px-3 h-11 rounded-lg transition-colors ${editDomainOption !== 'redirect' ? 'bg-transparent border border-zinc-800/80 text-zinc-600 cursor-not-allowed' : 'bg-[#0a0a0a] border border-zinc-800 text-zinc-200 hover:border-zinc-700'}`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Search className={`h-[14px] w-[14px] flex-shrink-0 ${editDomainOption === 'redirect' ? 'text-zinc-400' : 'text-zinc-700'}`} />
                        <span className="text-[13px] truncate">{editRedirectTarget}</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 flex-shrink-0 ${editDomainOption === 'redirect' ? 'text-zinc-500' : 'text-zinc-700'}`} />
                    </button>
                    {isEditTargetDropdownOpen && editDomainOption === 'redirect' && (
                      <div className="absolute top-full left-0 mt-1 w-full max-h-[140px] overflow-y-auto bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-20 p-1">
                        <button className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md flex items-center gap-2 transition-colors ${editRedirectTarget === 'No Redirect' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800'}`} onClick={() => { setEditRedirectTarget('No Redirect'); setIsEditTargetDropdownOpen(false); }}>
                          <Search className={`h-3.5 w-3.5 ${editRedirectTarget === 'No Redirect' ? 'text-white' : 'text-zinc-400'}`} /> No Redirect
                        </button>
                        {activeDomainTargets.filter(t => t !== d.domain).map(domainStr => (
                          <button key={domainStr} className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md truncate transition-colors ${editRedirectTarget === domainStr ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800'}`} onClick={() => { setEditRedirectTarget(domainStr); setIsEditTargetDropdownOpen(false); }}>
                            {domainStr}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions (Remove, Cancel, Save) */}
          <div className="flex items-center justify-between mt-8">
            <button onClick={() => handleRemoveClick(d)} className="px-4 py-2 bg-[#ff0000] text-white hover:bg-[#cc0000] rounded-lg text-[13px] font-medium transition-colors shadow-sm">
              Remove
            </button>
            
            <div className="flex items-center gap-2">
              <button onClick={handleCancelEdit} disabled={isSavingDomain} className="px-4 py-2 bg-transparent text-zinc-300 border border-zinc-800 hover:bg-zinc-900 rounded-lg text-[13px] font-medium transition-colors shadow-sm">
                Cancel
              </button>
              <button 
                onClick={() => handleSaveEdit(d)} 
                disabled={isSavingDomain || (editDomainOption === 'redirect' && editRedirectTarget === 'No Redirect')}
                className="px-4 py-2 bg-[#ededed] text-black hover:bg-white rounded-lg text-[13px] font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingDomain ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save'}
              </button>
            </div>
          </div>
        </div>
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
            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-black shadow-xl">
              {/* Frontend Section */}
              <div className="bg-[#050505] px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
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

            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-black shadow-xl">
              {/* Backend Section */}
              <div className="bg-[#050505] px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
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
                         <button 
                           className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors flex items-center gap-2 ${targetService === 'backend' ? 'bg-[#0070f3] text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                           onClick={() => { setTargetService('backend'); setIsServiceDropdownOpen(false); }}
                         >
                           <Server className="h-[12px] w-[12px]" /> Backend
                         </button>
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
    </div>
  );
}
