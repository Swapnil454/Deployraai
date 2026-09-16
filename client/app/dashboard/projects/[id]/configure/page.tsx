"use client";

import React, { useState, useEffect, useRef, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Save, Plus, Trash2, Upload, Eye, EyeOff, CheckCircle2, AlertCircle, Edit2, Server, Settings, Key, ChevronDown, Check } from "lucide-react";

function CustomDropdown({ value, onChange, options, label }: { value: string, onChange: (v: string) => void, options: {value: string, label: string, disabled?: boolean, rightElement?: React.ReactNode}[], label: string }) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 99999,
      });
    }
    setOpen(prev => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  return (
    <div className="relative">
      <label className="mb-2 block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</label>
      <div
        ref={triggerRef}
        onClick={handleOpen}
        className={`flex w-full items-center justify-between rounded-xl border bg-zinc-950 p-3 text-sm font-medium cursor-pointer select-none transition-all ${
          open ? "border-zinc-600 text-white" : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white"
        }`}
      >
        <span>{selected?.label || "None"}</span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>

      {open && typeof window !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden"
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={(e) => { 
                if (opt.disabled) return;
                onChange(opt.value); 
                setOpen(false); 
              }}
              className={`flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                opt.disabled
                  ? "cursor-default text-zinc-600"
                  : value === opt.value
                    ? "bg-zinc-800 text-white font-semibold cursor-pointer"
                    : "text-zinc-400 hover:bg-zinc-800/70 hover:text-white cursor-pointer"
              }`}
            >
              <span className={opt.disabled ? "opacity-50" : ""}>{opt.label}</span>
              <div className="flex items-center gap-2">
                {opt.rightElement}
                {!opt.disabled && value === opt.value && <Check className="h-3.5 w-3.5 text-zinc-300" />}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function ConfigureProjectPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const deploymentIdQuery = searchParams.get('deploymentId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [toast, setToast] = useState<{message: string, type: "success"|"error"} | null>(null);

  const [configFixSuggestion, setConfigFixSuggestion] = useState<any>(null);
  const [applyingFix, setApplyingFix] = useState(false);
  const [showSharedVars, setShowSharedVars] = useState(false);
  const [integrations, setIntegrations] = useState<any>(null);

  const [editingEnvs, setEditingEnvs] = useState<{frontend: boolean, backend: boolean, shared: boolean}>({
    frontend: false,
    backend: false,
    shared: false
  });

  const toggleEditingEnv = (group: "frontend" | "backend" | "shared", isEditing: boolean) => {
    setEditingEnvs(prev => ({ ...prev, [group]: isEditing }));
  };

  const showToast = (message: string, type: "success"|"error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fileInputRefs = {
    frontend: useRef<HTMLInputElement>(null),
    backend: useRef<HTMLInputElement>(null),
    shared: useRef<HTMLInputElement>(null)
  };

  const [config, setConfig] = useState<any>({
    frontendPlatform: "none",
    backendPlatform: "none",
    databasePlatform: "none",
    storagePlatform: "none",
    frontendRoot: "/",
    backendRoot: "/",
    frontendBuildCommand: "",
    backendBuildCommand: "",
    backendStartCommand: "",
    installCommand: "npm install",
    outputDirectory: "",
    envVariables: {
      frontend: [],
      backend: [],
      shared: []
    }
  });

  useEffect(() => {
    fetchProject();
    fetchIntegrations();
    if (deploymentIdQuery) {
      fetchDeploymentForFix();
    }
  }, [projectId, deploymentIdQuery]);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/status`, { credentials: "include" });
      if (res.ok) {
        setIntegrations(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch integrations", err);
    }
  };

  const fetchDeploymentForFix = async () => {
    try {
       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentIdQuery}`, { credentials: "include" });
       if (res.ok) {
          const data = await res.json();
          if (data.aiAnalysis?.configFixSuggestion) {
             setConfigFixSuggestion(data.aiAnalysis.configFixSuggestion);
          }
       }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApplyConfigFix = async () => {
   if (!configFixSuggestion) return;
   
   if (configFixSuggestion.fieldPath.includes('envVariables')) {
      const pathParts = configFixSuggestion.fieldPath.split('.');
      const group = pathParts[2]; // backend
      const key = pathParts[3]; // MONGO_URI
      
      const updated = { ...config };
      updated.envVariables[group].push({ key, value: "", isSecret: true });
      setConfig(updated);
      setConfigFixSuggestion(null);
      showToast(`Added ${key} to ${group} environment variables. Please enter the value and save.`, "success");
      return;
   }
   
   try {
     setApplyingFix(true);
     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deployments/${deploymentIdQuery}/apply-config-fix`, {
        method: "POST",
        credentials: "include"
     });
     if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to apply fix");
     }
     const data = await res.json();
     showToast("Configuration updated successfully. You can retry deployment now.", "success");
     
     const mappedConfig = { ...data.project.configuration };
     const mapEnvs = (envs: any[]) => envs.map(e => ({ ...e, showValue: false }));
     if (mappedConfig.envVariables) {
        mappedConfig.envVariables.frontend = mapEnvs(mappedConfig.envVariables.frontend || []);
        mappedConfig.envVariables.backend = mapEnvs(mappedConfig.envVariables.backend || []);
        mappedConfig.envVariables.shared = mapEnvs(mappedConfig.envVariables.shared || []);
     }
     setConfig(mappedConfig);
     setConfigFixSuggestion(null);
   } catch(err: any) {
     showToast(err.message || "Failed to apply fix", "error");
   } finally {
     setApplyingFix(false);
   }
  };

  const fetchProject = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      setProject(data);
      
      if (data.status === 'analyzed') {
        const newConfig = { ...config };
        
        if (data.analysis.frontend.detected) {
          newConfig.frontendPlatform = "vercel";
          newConfig.frontendRoot = data.analysis.frontend.path || "/";
          newConfig.frontendBuildCommand = data.analysis.frontend.buildCommand || "npm run build";
          if (data.analysis.frontend.framework === "React Vite") {
            newConfig.outputDirectory = "dist";
          }
        }
        
        if (data.analysis.backend.detected) {
          newConfig.backendPlatform = "render";
          newConfig.backendRoot = data.analysis.backend.path || "/";
          newConfig.backendBuildCommand = "npm install";
          newConfig.backendStartCommand = data.analysis.backend.startCommand || "npm start";
        }

        const isFront = data.analysis.frontend?.detected;
        const isBack = data.analysis.backend?.detected;
        const isFull = data.analysis.isMonorepo || (isFront && isBack);
        const sFront = isFull || isFront || (!isFront && !isBack);
        const sBack = isFull || (!isFull && isBack && !isFront);
        
        if (sFront && newConfig.frontendPlatform === "none") newConfig.frontendPlatform = "vercel";
        if (sBack && newConfig.backendPlatform === "none") newConfig.backendPlatform = "railway";

        // We no longer auto-suggest env variables here per user request
        
        setConfig(newConfig);
      } else if (data.configuration) {
        const mappedConfig = { ...data.configuration };
        const mapEnvs = (envs: any[]) => envs.map(e => ({ ...e, showValue: false }));
        if (mappedConfig.envVariables) {
           mappedConfig.envVariables.frontend = mapEnvs(mappedConfig.envVariables.frontend || []);
           mappedConfig.envVariables.backend = mapEnvs(mappedConfig.envVariables.backend || []);
           mappedConfig.envVariables.shared = mapEnvs(mappedConfig.envVariables.shared || []);
        }
        setConfig(mappedConfig);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const finalConfig = { ...config };
      const isFrontend = project?.analysis?.frontend?.detected;
      const isBackend = project?.analysis?.backend?.detected;
      const isFullstack = project?.analysis?.isMonorepo || (isFrontend && isBackend);
      const sFront = isFullstack || isFrontend || (!isFrontend && !isBackend);
      const sBack = isFullstack || (!isFullstack && isBackend && !isFrontend);
      
      if (!sFront) finalConfig.frontendPlatform = "none";
      if (!sBack) finalConfig.backendPlatform = "none";

      if (isFullstack) {
        const hasBackendTarget = finalConfig.envVariables.frontend?.some((e: any) => e.isBackendUrlTarget);
        const hasFrontendTarget = finalConfig.envVariables.backend?.some((e: any) => e.isFrontendUrlTarget);
        
        if (finalConfig.frontendPlatform !== "none" && finalConfig.backendPlatform !== "none") {
          if (!hasBackendTarget && finalConfig.envVariables.frontend?.length > 0) {
            showToast("Please mark exactly one Frontend variable to receive the Backend URL.", "error");
            setSaving(false);
            return;
          }
          if (!hasFrontendTarget && finalConfig.envVariables.backend?.length > 0) {
            showToast("Please mark exactly one Backend variable to receive the Frontend URL.", "error");
            setSaving(false);
            return;
          }
        }
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ configuration: finalConfig })
      });
      if (!res.ok) throw new Error("Failed to save configuration");
      
      showToast("Configuration saved successfully! Redirecting...", "success");
      fetchProject(true); 
      setTimeout(() => {
        router.push(`/dashboard/projects/${projectId}/deploy`);
      }, 800);
    } catch (err: any) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEnvChange = (group: string, index: number, field: string, val: string | boolean) => {
    const updated = { ...config };
    updated.envVariables[group][index][field] = val;
    setConfig(updated);
  };

  const addEnv = (group: string) => {
    const updated = { ...config };
    updated.envVariables[group].push({ key: "", value: "", isSecret: true, isBackendUrlTarget: false, isFrontendUrlTarget: false });
    setConfig(updated);
  };

  const removeEnv = (group: string, index: number) => {
    const updated = { ...config };
    updated.envVariables[group].splice(index, 1);
    setConfig(updated);
  };

  const handleFileUpload = (group: "frontend" | "backend" | "shared", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/);
      const newVars: any[] = [];

      for (let line of lines) {
        line = line.trim();
        // Ignore comments and empty lines
        if (!line || line.startsWith("#")) continue;
        
        const splitIdx = line.indexOf("=");
        if (splitIdx === -1) continue;

        const key = line.substring(0, splitIdx).trim();
        let value = line.substring(splitIdx + 1).trim();

        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }

        newVars.push({ key, value, isSecret: true, isBackendUrlTarget: false, isFrontendUrlTarget: false });
      }

      // Merge with existing variables
      const updated = { ...config };
      const currentVars = [...updated.envVariables[group]];

      for (const newVar of newVars) {
        const existingIdx = currentVars.findIndex(v => v.key === newVar.key);
        if (existingIdx !== -1) {
          // Update existing value
          currentVars[existingIdx].value = newVar.value;
          currentVars[existingIdx].hasValue = true;
        } else {
          // Add new variable
          currentVars.push(newVar);
        }
      }

      updated.envVariables[group] = currentVars;
      setConfig(updated);

      // Clear the input so the same file can be uploaded again if needed
      if (fileInputRefs[group]?.current) {
        fileInputRefs[group].current!.value = "";
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  if (!project) return null;

  const isFrontend = project.analysis?.frontend?.detected;
  const isBackend = project.analysis?.backend?.detected;
  const isFullstack = project.analysis?.isMonorepo || (isFrontend && isBackend);
  const showFrontend = isFullstack || isFrontend || (!isFrontend && !isBackend);
  const showBackend = isFullstack || (!isFullstack && isBackend && !isFrontend);

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col bg-black px-4 sm:px-6 lg:px-8 py-6 overflow-x-hidden">
      {/* Page Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium z-50 transition-all ${toast.type === "success" ? "bg-emerald-500/90 text-white border border-emerald-400" : "bg-red-500/90 text-white border border-red-400"}`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
      
      <div className="relative z-10 mx-auto w-full max-w-4xl">
        
        {configFixSuggestion && (
          <div className="mb-6 relative group rounded-3xl border border-orange-500/30 bg-orange-500/10 p-6 shadow-[0_0_40px_rgba(249,115,22,0.15)] overflow-hidden backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20 border border-orange-500/30">
                  <AlertCircle className="h-5 w-5 text-orange-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Suggested Configuration Fix</h2>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-zinc-300 bg-black/50 p-4 rounded-2xl border border-zinc-800/50 leading-relaxed shadow-inner">
                  <span className="font-bold text-white block mb-1 text-[13px]">Issue Detected:</span>
                  {configFixSuggestion.reason}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl shadow-inner">
                    <p className="text-[11px] text-red-500/70 font-bold mb-1.5 uppercase tracking-widest">Current Value</p>
                    <code className="text-red-400 text-xs font-mono">{configFixSuggestion.currentValue || 'None'}</code>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl shadow-inner">
                    <p className="text-[11px] text-emerald-500/70 font-bold mb-1.5 uppercase tracking-widest">Suggested Value</p>
                    <code className="text-emerald-400 text-xs font-mono">{configFixSuggestion.suggestedValue || 'None'}</code>
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    onClick={handleApplyConfigFix}
                    disabled={applyingFix}
                    className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-orange-400 hover:scale-105 active:scale-95 disabled:opacity-50 shadow-[0_0_20px_rgba(249,115,22,0.4)]"
                  >
                    {applyingFix ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
                    Apply Fix Automatically
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button 
            onClick={() => router.push('/dashboard')}
            className="group flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] active:scale-95"
          >
            <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Configure Deployment</h1>
            <p className="text-xs text-zinc-400 mt-1 font-medium flex items-center gap-2">
              <span className="text-zinc-300">{project.repoFullName}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-700"></span>
              <span className="text-white font-mono">{project.selectedBranch}</span>
            </p>
          </div>
        </div>

        {/* Stack Overview - 3D Cards */}
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Architecture", value: project.analysis?.isMonorepo ? "Monorepo" : "Single App" },
            { label: "Frontend", value: project.analysis?.frontend?.framework || "Not detected" },
            { label: "Backend", value: project.analysis?.backend?.framework || "Not detected" },
            { label: "Database", value: project.analysis?.database?.type || "Not detected" }
          ].map((stat, i) => (
            <div key={i} className="relative group rounded-2xl border-t border-t-zinc-700 border-x border-x-zinc-800/80 border-b border-b-black bg-gradient-to-b from-zinc-800/50 to-zinc-900/40 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-t-white/30 hover:from-zinc-700/40 hover:to-zinc-900/80 hover:shadow-[0_10px_30px_rgba(0,0,0,0.6)] shadow-[0_5px_15px_rgba(0,0,0,0.5)] overflow-hidden backdrop-blur-sm">
               <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
               <div className="relative">
                 <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">{stat.label}</p>
                 <p className="text-white font-semibold text-sm">{stat.value}</p>
               </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {/* Section 1: Platforms */}
          <section className="relative rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-xl backdrop-blur-sm">
            <div className="mb-6 flex items-center gap-3">
               <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-zinc-700 text-zinc-300">
                 <Server className="h-4 w-4" />
               </div>
               <h2 className="text-lg font-bold text-white tracking-tight">Platform Selection</h2>
            </div>
            <div className={`grid gap-6 ${showFrontend && showBackend ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
              {showFrontend && (
              <div className="flex flex-col gap-2">
                <CustomDropdown 
                  label="Frontend Hosting"
                  value={config.frontendPlatform}
                  onChange={(val: string) => setConfig({...config, frontendPlatform: val})}
                  options={[
                    { value: "none", label: "None" },
                    { 
                      value: "vercel", 
                      label: "Vercel (Recommended)",
                      disabled: integrations && !integrations.vercel?.connected,
                      rightElement: integrations && !integrations.vercel?.connected ? <button onClick={(e) => { e.stopPropagation(); router.push('/dashboard/settings'); }} className="text-[10px] bg-zinc-700/80 hover:bg-zinc-600 px-2.5 py-1 rounded text-white font-bold tracking-wide shadow-sm border border-zinc-600 cursor-pointer">Connect</button> : null
                    },
                    { 
                      value: "netlify", 
                      label: "Netlify",
                      disabled: integrations && !integrations.netlify?.connected,
                      rightElement: integrations && !integrations.netlify?.connected ? <button onClick={(e) => { e.stopPropagation(); router.push('/dashboard/settings'); }} className="text-[10px] bg-zinc-700/80 hover:bg-zinc-600 px-2.5 py-1 rounded text-white font-bold tracking-wide shadow-sm border border-zinc-600 cursor-pointer">Connect</button> : null
                    }
                  ]}
                />
                {config.frontendPlatform !== "none" && integrations && !integrations[config.frontendPlatform]?.connected && (
                  <div className="text-[11px] text-red-400 font-bold bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="capitalize">{config.frontendPlatform} is not connected.</span>
                    </div>
                    <button onClick={(e) => { e.preventDefault(); router.push('/dashboard/settings'); }} className="underline hover:text-red-300 whitespace-nowrap">Connect</button>
                  </div>
                )}
              </div>
              )}
              {showBackend && (
              <div className="flex flex-col gap-2">
                <CustomDropdown 
                  label="Backend Hosting"
                  value={config.backendPlatform}
                  onChange={(val: string) => setConfig({...config, backendPlatform: val})}
                  options={[
                    { value: "none", label: "None" },
                    { 
                      value: "render", 
                      label: "Render (Recommended)",
                      disabled: integrations && !integrations.render?.connected,
                      rightElement: integrations && !integrations.render?.connected ? <button onClick={(e) => { e.stopPropagation(); router.push('/dashboard/settings'); }} className="text-[10px] bg-zinc-700/80 hover:bg-zinc-600 px-2.5 py-1 rounded text-white font-bold tracking-wide shadow-sm border border-zinc-600 cursor-pointer">Connect</button> : null
                    },
                    { 
                      value: "railway", 
                      label: "Railway",
                      disabled: integrations && !integrations.railway?.connected,
                      rightElement: integrations && !integrations.railway?.connected ? <button onClick={(e) => { e.stopPropagation(); router.push('/dashboard/settings'); }} className="text-[10px] bg-zinc-700/80 hover:bg-zinc-600 px-2.5 py-1 rounded text-white font-bold tracking-wide shadow-sm border border-zinc-600 cursor-pointer">Connect</button> : null
                    }
                  ]}
                />
                {config.backendPlatform !== "none" && integrations && !integrations[config.backendPlatform]?.connected && (
                  <div className="text-[11px] text-red-400 font-bold bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="capitalize">{config.backendPlatform} is not connected.</span>
                    </div>
                    <button onClick={(e) => { e.preventDefault(); router.push('/dashboard/settings'); }} className="underline hover:text-red-300 whitespace-nowrap">Connect</button>
                  </div>
                )}
              </div>
              )}
            </div>
          </section>

          {/* Section 2: Build Settings */}
          <section className="relative rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-xl backdrop-blur-sm">
            <div className="mb-6 flex items-center gap-3">
               <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-zinc-700 text-zinc-300">
                 <Settings className="h-4 w-4" />
               </div>
               <h2 className="text-lg font-bold text-white tracking-tight">Build Settings</h2>
            </div>
            <div className={`grid gap-8 ${showFrontend && showBackend ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
              {showFrontend && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 border-b border-zinc-800/60 pb-2">Frontend Configuration</h3>
                <div className="group">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors ml-1">Root Directory</label>
                  <input type="text" placeholder="e.g. client or /" value={config.frontendRoot} onChange={e => setConfig({...config, frontendRoot: e.target.value})} className="w-full rounded-xl border border-zinc-800 bg-black/50 p-3 text-sm text-white font-mono transition-all focus:border-purple-500 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 hover:border-zinc-700 shadow-inner placeholder:text-zinc-600" />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors ml-1">Build Command</label>
                  <input type="text" placeholder="e.g. npm run build" value={config.frontendBuildCommand} onChange={e => setConfig({...config, frontendBuildCommand: e.target.value})} className="w-full rounded-xl border border-zinc-800 bg-black/50 p-3 text-sm text-white font-mono transition-all focus:border-purple-500 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 hover:border-zinc-700 shadow-inner placeholder:text-zinc-600" />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors ml-1">Output Directory</label>
                  <input type="text" placeholder="e.g. dist" value={config.outputDirectory} onChange={e => setConfig({...config, outputDirectory: e.target.value})} className="w-full rounded-xl border border-zinc-800 bg-black/50 p-3 text-sm text-white font-mono transition-all focus:border-purple-500 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 hover:border-zinc-700 shadow-inner placeholder:text-zinc-600" />
                </div>
              </div>
              )}

              {showBackend && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 border-b border-zinc-800/60 pb-2">Backend Configuration</h3>
                <div className="group">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors ml-1">Root Directory</label>
                  <input type="text" placeholder="e.g. server or /" value={config.backendRoot} onChange={e => setConfig({...config, backendRoot: e.target.value})} className="w-full rounded-xl border border-zinc-800 bg-black/50 p-3 text-sm text-white font-mono transition-all focus:border-purple-500 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 hover:border-zinc-700 shadow-inner placeholder:text-zinc-600" />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors ml-1">Build/Install Command</label>
                  <input type="text" placeholder="e.g. npm install" value={config.backendBuildCommand} onChange={e => setConfig({...config, backendBuildCommand: e.target.value})} className="w-full rounded-xl border border-zinc-800 bg-black/50 p-3 text-sm text-white font-mono transition-all focus:border-purple-500 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 hover:border-zinc-700 shadow-inner placeholder:text-zinc-600" />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors ml-1">Start Command</label>
                  <input type="text" placeholder="e.g. node app.js" value={config.backendStartCommand} onChange={e => setConfig({...config, backendStartCommand: e.target.value})} className="w-full rounded-xl border border-zinc-800 bg-black/50 p-3 text-sm text-white font-mono transition-all focus:border-purple-500 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 hover:border-zinc-700 shadow-inner placeholder:text-zinc-600" />
                </div>
              </div>
              )}
            </div>
          </section>          
          {/* Section 3: Environment Variables */}
          <section className="relative rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-xl backdrop-blur-sm">
            <div className="mb-6 flex items-center gap-3">
               <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-zinc-700 text-zinc-300">
                 <Key className="h-4 w-4" />
               </div>
               <h2 className="text-lg font-bold text-white tracking-tight">Environment Variables</h2>
            </div>
            
            {(["frontend", "backend", ...(showSharedVars ? ["shared"] : [])] as const).filter(g => (g === "frontend" && showFrontend) || (g === "backend" && showBackend) || g === "shared").map(g => {
              const group = g as "backend" | "frontend" | "shared";
              const isEditing = editingEnvs[group];
              return (
              <div key={group} className="mb-4 last:mb-0 rounded-2xl border border-zinc-800/60 bg-black/40 p-5 transition-all duration-300 hover:border-zinc-700/80">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[13px] font-bold text-zinc-300 capitalize tracking-wider">{group} Variables</h3>
                  </div>
                  
                  {!isEditing ? (
                    <button onClick={() => toggleEditingEnv(group, true)} className="flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-800/60 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-zinc-700 hover:scale-105 active:scale-95">
                      <Edit2 className="h-3 w-3" /> Edit Variables
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Hidden file input */}
                      <input 
                        type="file" 
                        accept=".env,text/plain"
                        className="hidden" 
                        ref={fileInputRefs[group]} 
                        onChange={(e) => handleFileUpload(group, e)} 
                      />
                      
                      <button 
                        onClick={() => fileInputRefs[group].current?.click()} 
                        className="text-[11px] font-bold flex items-center gap-1.5 rounded-xl bg-white/5 text-zinc-300 border border-zinc-700 px-3 py-1.5 transition-all hover:bg-white/10 hover:text-white active:scale-95"
                      >
                        <Upload className="h-3 w-3" /> Upload .env
                      </button>

                      <button onClick={() => addEnv(group)} className="text-[11px] font-bold flex items-center gap-1.5 rounded-xl bg-white/5 text-zinc-300 border border-zinc-700 px-3 py-1.5 transition-all hover:bg-white/10 hover:text-white active:scale-95">
                        <Plus className="h-3 w-3" /> Add Variable
                      </button>
                    </div>
                  )}
                </div>
                
                {config.envVariables[group]?.length === 0 ? (
                  <div className="text-center py-6 border border-zinc-800/60 border-dashed rounded-2xl bg-zinc-900/20 text-xs font-medium text-zinc-500">No variables configured for {group}</div>
                ) : (
                  <div className="space-y-2">
                    {config.envVariables[group].map((env: any, idx: number) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-zinc-900/30 p-2 sm:p-0 rounded-2xl sm:bg-transparent transition-all">
                        <input type="text" readOnly={!isEditing} placeholder="KEY_NAME" value={env.key} onChange={e => handleEnvChange(group, idx, "key", e.target.value)} className={`w-full sm:w-1/3 rounded-xl border p-2.5 text-xs text-white font-mono transition-all outline-none ${isEditing ? 'border-zinc-700 bg-black/60 focus:border-zinc-500' : 'border-transparent bg-transparent pl-0'}`} />
                        
                        <div className="relative w-full sm:w-1/2 flex items-center">
                          <input 
                            type={env.showValue ? "text" : "password"} 
                            readOnly={!isEditing}
                            placeholder="Value" 
                            value={env.value} 
                            onChange={e => handleEnvChange(group, idx, "value", e.target.value)} 
                            onFocus={() => {
                              if (isEditing) handleEnvChange(group, idx, "showValue", true);
                            }}
                            className={`w-full rounded-xl border p-2.5 pr-10 text-xs text-white font-mono transition-all outline-none ${isEditing ? 'border-zinc-700 bg-black/60 focus:border-zinc-500' : 'border-transparent bg-transparent pl-0'}`} 
                          />
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); // Prevents input from losing focus if clicked while editing
                              handleEnvChange(group, idx, "showValue", !env.showValue);
                            }}
                            className={`absolute right-2.5 text-zinc-500 transition-colors hover:text-zinc-300 focus:outline-none ${!isEditing && 'opacity-50 hover:opacity-100'}`}
                            tabIndex={-1}
                          >
                            {env.showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full sm:w-auto mt-2 sm:mt-0 pl-1 sm:pl-0 gap-2">
                           <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 cursor-pointer select-none">
                             <input type="checkbox" disabled={!isEditing} checked={env.isSecret} onChange={e => handleEnvChange(group, idx, "isSecret", e.target.checked)} className="rounded border-zinc-700 bg-black text-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-black disabled:opacity-50 h-3.5 w-3.5 transition-colors" />
                             Secret
                           </label>
                           
                           {group === "frontend" && (
                             <label className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 cursor-pointer select-none" title="This variable will be automatically updated with the deployed Backend URL">
                               <input type="checkbox" disabled={!isEditing} checked={env.isBackendUrlTarget} onChange={e => {
                                 // Uncheck others
                                 if (e.target.checked) {
                                   const updated = { ...config };
                                   updated.envVariables.frontend.forEach((v: any, i: number) => {
                                      if (i !== idx) v.isBackendUrlTarget = false;
                                   });
                                   setConfig(updated);
                                 }
                                 handleEnvChange(group, idx, "isBackendUrlTarget", e.target.checked);
                               }} className="rounded-full border-indigo-700 bg-black text-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-black disabled:opacity-50 h-3.5 w-3.5 transition-colors" />
                               Backend URL Target
                             </label>
                           )}

                           {group === "backend" && (
                             <label className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 cursor-pointer select-none" title="This variable will be automatically updated with the deployed Frontend URL">
                               <input type="checkbox" disabled={!isEditing} checked={env.isFrontendUrlTarget} onChange={e => {
                                 // Uncheck others
                                 if (e.target.checked) {
                                   const updated = { ...config };
                                   updated.envVariables.backend.forEach((v: any, i: number) => {
                                      if (i !== idx) v.isFrontendUrlTarget = false;
                                   });
                                   setConfig(updated);
                                 }
                                 handleEnvChange(group, idx, "isFrontendUrlTarget", e.target.checked);
                               }} className="rounded-full border-emerald-700 bg-black text-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-black disabled:opacity-50 h-3.5 w-3.5 transition-colors" />
                               Frontend URL Target
                             </label>
                           )}

                           {isEditing && (
                             <button onClick={() => removeEnv(group, idx)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all ml-1 active:scale-95">
                               <Trash2 className="h-3.5 w-3.5" />
                             </button>
                           )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {isEditing && (
                  <div className="mt-4 flex justify-end gap-2.5 border-t border-zinc-800/60 pt-4">
                    <button onClick={() => { toggleEditingEnv(group, false); fetchProject(true); }} className="px-4 py-2 text-[13px] font-bold text-zinc-400 transition-colors hover:text-white hover:bg-zinc-800 rounded-xl">Cancel</button>
                    <button onClick={async () => { await handleSave(); toggleEditingEnv(group, false); }} className="rounded-xl bg-blue-600 text-white px-5 py-2 text-[13px] font-bold transition-all hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.3)] flex items-center gap-1.5 active:scale-95">
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save {group} Variables
                    </button>
                  </div>
                )}
              </div>
              )
            })}

            {!showSharedVars && (
              <button
                onClick={() => setShowSharedVars(true)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-800/60 border-dashed py-4 text-sm font-bold text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-900/30 hover:text-white"
              >
                <Plus className="h-4 w-4" /> Add Shared Variables
              </button>
            )}
          </section>

          {/* Action Buttons at bottom */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-end gap-4 border-t border-zinc-800/60 pt-6">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white px-8 py-3 text-sm font-bold transition-all hover:bg-blue-500 active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Save Configuration
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
