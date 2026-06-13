"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Save, Plus, Trash2, Upload, Eye, EyeOff, CheckCircle2, AlertCircle, Edit2 } from "lucide-react";

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
    if (deploymentIdQuery) {
      fetchDeploymentForFix();
    }
  }, [projectId, deploymentIdQuery]);

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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ configuration: config })
      });
      if (!res.ok) throw new Error("Failed to save configuration");
      
      showToast("Configuration saved successfully!", "success");
      fetchProject(true); 
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
    updated.envVariables[group].push({ key: "", value: "", isSecret: true });
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

        newVars.push({ key, value, isSecret: true });
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

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black px-4 sm:px-6 lg:px-8 py-10 relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium z-50 transition-all ${toast.type === "success" ? "bg-emerald-500/90 text-white border border-emerald-400" : "bg-red-500/90 text-white border border-red-400"}`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
      
      <div className="mx-auto w-full max-w-4xl">
        
        {configFixSuggestion && (
          <div className="mb-8 rounded-xl border border-orange-500/30 bg-orange-500/10 p-6 shadow-lg shadow-orange-500/5">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-orange-400" />
              <h2 className="text-lg font-bold text-white">Suggested Configuration Fix</h2>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-zinc-300 bg-black/40 p-4 rounded-lg border border-zinc-800/50">
                <span className="font-semibold text-white block mb-1">Issue:</span>
                {configFixSuggestion.reason}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-lg">
                  <p className="text-xs text-zinc-500 font-semibold mb-1 uppercase tracking-wider">Current Value</p>
                  <code className="text-red-400 text-sm">{configFixSuggestion.currentValue || 'None'}</code>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-lg">
                  <p className="text-xs text-zinc-500 font-semibold mb-1 uppercase tracking-wider">Suggested Value</p>
                  <code className="text-emerald-400 text-sm">{configFixSuggestion.suggestedValue || 'None'}</code>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleApplyConfigFix}
                  disabled={applyingFix}
                  className="flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-500 disabled:opacity-50 shadow-lg shadow-orange-500/20"
                >
                  {applyingFix ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
                  Apply Fix
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/dashboard')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Configure Deployment</h1>
              <p className="text-sm text-zinc-400">{project.repoFullName} • {project.selectedBranch}</p>
            </div>
          </div>
          <div className="flex gap-3">
             {project.status === "configured" && (
                <button 
                  onClick={() => router.push(`/dashboard/projects/${projectId}/deploy`)}
                  className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
                >
                  Continue to Deployment
                </button>
             )}
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Configuration
            </button>
          </div>
        </div>

        {/* Stack Overview */}
        <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 flex justify-between items-center">
          <div>
            <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-1">Architecture</p>
            <p className="text-white">{project.analysis?.isMonorepo ? "Monorepo" : "Single Application"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-1">Frontend</p>
            <p className="text-white">{project.analysis?.frontend?.framework || "Not detected"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-1">Backend</p>
            <p className="text-white">{project.analysis?.backend?.framework || "Not detected"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-1">Database</p>
            <p className="text-white">{project.analysis?.database?.type || "Not detected"}</p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Section 1: Platforms */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-6 text-lg font-semibold text-white">Platform Selection</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Frontend Hosting</label>
                <select 
                  value={config.frontendPlatform} 
                  onChange={e => setConfig({...config, frontendPlatform: e.target.value})}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="none">None</option>
                  <option value="vercel">Vercel (Recommended)</option>
                  <option value="netlify">Netlify</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Backend Hosting</label>
                <select 
                  value={config.backendPlatform} 
                  onChange={e => setConfig({...config, backendPlatform: e.target.value})}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="none">None</option>
                  <option value="render">Render (Recommended)</option>
                  <option value="railway">Railway</option>
                </select>
              </div>
            </div>
          </section>

          {/* Section 2: Build Settings */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-6 text-lg font-semibold text-white">Build Settings</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-300">Frontend</h3>
                <input type="text" placeholder="Root Directory (e.g. client or /)" value={config.frontendRoot} onChange={e => setConfig({...config, frontendRoot: e.target.value})} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-white focus:border-indigo-500" />
                <input type="text" placeholder="Build Command (e.g. npm run build)" value={config.frontendBuildCommand} onChange={e => setConfig({...config, frontendBuildCommand: e.target.value})} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-white focus:border-indigo-500" />
                <input type="text" placeholder="Output Directory (e.g. dist)" value={config.outputDirectory} onChange={e => setConfig({...config, outputDirectory: e.target.value})} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-white focus:border-indigo-500" />
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-300">Backend</h3>
                <input type="text" placeholder="Root Directory (e.g. server or /)" value={config.backendRoot} onChange={e => setConfig({...config, backendRoot: e.target.value})} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-white focus:border-indigo-500" />
                <input type="text" placeholder="Build/Install Command" value={config.backendBuildCommand} onChange={e => setConfig({...config, backendBuildCommand: e.target.value})} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-white focus:border-indigo-500" />
                <input type="text" placeholder="Start Command" value={config.backendStartCommand} onChange={e => setConfig({...config, backendStartCommand: e.target.value})} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-white focus:border-indigo-500" />
              </div>
            </div>
          </section>          
          {/* Section 3: Environment Variables */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Environment Variables</h2>
            
            {(["backend", "frontend", "shared"] as const).map(group => {
              const isEditing = editingEnvs[group];
              return (
              <div key={group} className="mb-8 last:mb-0 rounded-lg border border-zinc-800 bg-black p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-300 capitalize">{group} Variables</h3>
                  </div>
                  
                  {!isEditing ? (
                    <button onClick={() => toggleEditingEnv(group, true)} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
                      <Edit2 className="h-3 w-3" /> Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-4">
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
                        className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                      >
                        <Upload className="h-3 w-3" /> Upload .env
                      </button>

                      <button onClick={() => addEnv(group)} className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300">
                        <Plus className="h-3 w-3" /> Add Variable
                      </button>
                    </div>
                  )}
                </div>
                
                {config.envVariables[group]?.length === 0 ? (
                  <div className="text-center p-4 border border-zinc-800 border-dashed rounded-lg text-sm text-zinc-500">No variables configured</div>
                ) : (
                  <div className="space-y-3">
                    {config.envVariables[group].map((env: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3">
                        <input type="text" readOnly={!isEditing} placeholder="Key (e.g. MONGO_URI)" value={env.key} onChange={e => handleEnvChange(group, idx, "key", e.target.value)} className={`w-1/3 rounded-lg border p-2.5 text-sm text-white ${isEditing ? 'border-zinc-800 bg-zinc-900' : 'border-transparent bg-transparent'}`} />
                        
                        <div className="relative w-1/2 flex items-center">
                          <input 
                            type={env.showValue ? "text" : "password"} 
                            readOnly={!isEditing}
                            placeholder="Value" 
                            value={env.value} 
                            onChange={e => handleEnvChange(group, idx, "value", e.target.value)} 
                            onFocus={() => {
                              if (isEditing) handleEnvChange(group, idx, "showValue", true);
                            }}
                            className={`w-full rounded-lg border p-2.5 pr-10 text-sm text-white font-mono ${isEditing ? 'border-zinc-800 bg-zinc-900' : 'border-transparent bg-transparent'}`} 
                          />
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); // Prevents input from losing focus if clicked while editing
                              handleEnvChange(group, idx, "showValue", !env.showValue);
                            }}
                            className="absolute right-3 text-zinc-500 hover:text-zinc-300 focus:outline-none"
                            tabIndex={-1}
                          >
                            {env.showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-zinc-400">
                          <input type="checkbox" disabled={!isEditing} checked={env.isSecret} onChange={e => handleEnvChange(group, idx, "isSecret", e.target.checked)} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 disabled:opacity-50" />
                          Secret
                        </label>
                        
                        {isEditing && (
                          <button onClick={() => removeEnv(group, idx)} className="p-2 text-zinc-500 hover:text-red-400 ml-auto">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {isEditing && (
                  <div className="mt-4 flex justify-end gap-3 border-t border-zinc-800 pt-4">
                    <button onClick={() => { toggleEditingEnv(group, false); fetchProject(true); }} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
                    <button onClick={async () => { await handleSave(); toggleEditingEnv(group, false); }} className="rounded-lg bg-indigo-500 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-600 flex items-center gap-2">
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save {group} Variables
                    </button>
                  </div>
                )}
              </div>
              )
            })}
          </section>

        </div>
      </div>
    </div>
  );
}
