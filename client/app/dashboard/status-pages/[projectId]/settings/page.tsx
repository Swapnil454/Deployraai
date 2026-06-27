"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

import { Copy, ExternalLink, Loader2 } from "lucide-react";

import Link from "next/link";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

export default function StatusPageSettings() {
  const params = useParams();
  const projectId = params?.projectId;

  
  const [config, setConfig] = useState<any>({
    enabled: false,
    title: "",
    description: "",
    slug: "",
    show_uptime_history: true,
    show_incidents: true
  });
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    fetchConfig();
  }, [projectId]);

  async function fetchConfig() {
    try {
      setLoading(true);
      const [configRes, projectRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-page`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" })
      ]);
      
      if (configRes.ok) {
        setConfig(await configRes.json());
      }
      if (projectRes.ok) {
        setProject(await projectRes.json());
      }
    } catch (err) {
      console.error(err);
      alert("Failed to load status page settings.");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    try {
      setSaving(true);
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-page`, {
        method: 'PATCH',
        credentials: "include",
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      
      setConfig(data);
      alert("Status page settings saved.");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground flex items-center justify-center"><Loader2 className="animate-spin mr-2" /> Loading settings...</div>;
  }

  if (project && !project.analytics?.verified) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pt-8">
        <ObservabilitySetup project={project} onVerified={fetchConfig} />
      </div>
    );
  }

  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/status/${config.slug || projectId}`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Status Page Settings</h1>
        <p className="text-muted-foreground">Configure your public-facing status page.</p>
      </div>

      <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden mb-6">
        <div className="p-6 border-b border-zinc-800/60">
          <h3 className="text-lg font-semibold text-white mb-1">Visibility</h3>
          <p className="text-sm text-zinc-400">Control who can see your status page.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between border rounded-lg p-4 bg-muted/50">
            <div>
              <label className="text-base font-semibold text-zinc-200">Enable Public Status Page</label>
              <p className="text-sm text-muted-foreground">When enabled, anyone with the link can view your system status.</p>
            </div>
            <button
              type="button"
              role="switch"
              onClick={() => setConfig({...config, enabled: !config.enabled})}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white ${config.enabled ? 'bg-white' : 'bg-zinc-800'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-black transition-transform ${config.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>

          {config.enabled && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">Public URL</label>
              <div className="flex gap-2">
                <input className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors bg-muted font-mono" readOnly value={publicUrl} />
                <button className="h-10 w-10 flex items-center justify-center border border-zinc-800 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors" onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  alert("Copied to clipboard");
                }}>
                  <Copy className="w-4 h-4" />
                </button>
                <Link href={publicUrl} target="_blank">
                  <button className="h-10 w-10 flex items-center justify-center border border-zinc-800 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden mb-6">
        <div className="p-6 border-b border-zinc-800/60">
          <h3 className="text-lg font-semibold text-white mb-1">Page Details</h3>
          <p className="text-sm text-zinc-400">Customize the appearance and content.</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-200">Page Title</label>
            <input className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors" 
              placeholder="e.g. Acme Corp Status"
              value={config.title || ""}
              onChange={(e) => setConfig({...config, title: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-200">Description</label>
            <input className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors" 
              placeholder="Optional subtitle or contact info"
              value={config.description || ""}
              onChange={(e) => setConfig({...config, description: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-200">Custom Slug (Optional)</label>
            <input className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors" 
              placeholder="e.g. acme-corp"
              value={config.slug || ""}
              onChange={(e) => setConfig({...config, slug: e.target.value})}
            />
            <p className="text-xs text-muted-foreground">If left blank, the Project ID will be used in the URL.</p>
          </div>
        </div>
      </div>

      <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden mb-6">
        <div className="p-6 border-b border-zinc-800/60">
          <h3 className="text-lg font-semibold text-white mb-1">Features</h3>
          <p className="text-sm text-zinc-400">Toggle what information is displayed.</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-200">Show 90-Day Uptime History</label>
            <button
              type="button"
              role="switch"
              onClick={() => setConfig({...config, show_uptime_history: !config.show_uptime_history})}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white ${config.show_uptime_history ? 'bg-white' : 'bg-zinc-800'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-black transition-transform ${config.show_uptime_history ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-200">Show Recent Incidents (Future Feature)</label>
            <button
              type="button"
              role="switch"
              disabled
              onClick={() => setConfig({...config, show_incidents: !config.show_incidents})}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white disabled:opacity-50 disabled:cursor-not-allowed ${config.show_incidents ? 'bg-white' : 'bg-zinc-800'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-black transition-transform ${config.show_incidents ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <div className="p-6 bg-zinc-900/20 justify-end border-t pt-6 mt-6">
          <button className="h-10 px-4 flex items-center justify-center bg-white text-black hover:bg-zinc-200 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={saveConfig} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
