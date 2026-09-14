"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleDot,
  Copy,
  ExternalLink,
  FileText,
  Globe2,
  Layers3,
  Link2,
  Loader2,
  Radio,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";

type StatusPageConfig = {
  enabled: boolean;
  title: string;
  description: string;
  slug: string;
  show_uptime_history: boolean;
  show_incidents: boolean;
};

type Project = { repoName?: string };

const emptyConfig: StatusPageConfig = {
  enabled: false,
  title: "",
  description: "",
  slug: "",
  show_uptime_history: true,
  show_incidents: true,
};

const inputClass = "h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 placeholder:text-zinc-600";

function normalizeConfig(value: Partial<StatusPageConfig>): StatusPageConfig {
  return { ...emptyConfig, ...value, slug: value.slug || "" };
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${checked ? "border-blue-400/40 bg-blue-500" : "border-zinc-700 bg-zinc-900"}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

function WorkflowStep({ active, complete, icon: Icon, title, detail, href }: { active?: boolean; complete?: boolean; icon: typeof Settings2; title: string; detail: string; href: string }) {
  return (
    <Link href={href} className={`group flex min-w-0 items-center gap-3 rounded-xl border p-3.5 transition ${active ? "border-blue-500/35 bg-blue-500/10" : "border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50"}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${active ? "border-blue-400/25 bg-blue-500/15 text-blue-300" : complete ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-400" : "border-zinc-800 bg-zinc-950 text-zinc-500"}`}>
        {complete && !active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0"><span className="block text-sm font-semibold text-zinc-100">{title}</span><span className="mt-0.5 block truncate text-xs text-zinc-500">{detail}</span></span>
      <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-zinc-300" />
    </Link>
  );
}

export default function StatusPageSettings() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const router = useRouter();
  const [config, setConfig] = useState<StatusPageConfig>(emptyConfig);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(emptyConfig));
  const [project, setProject] = useState<Project | null>(null);
  const [componentCount, setComponentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const publicUrl = `${typeof window === "undefined" ? "" : window.location.origin}/status/${config.slug || projectId}`;
  const isDirty = JSON.stringify(config) !== savedSnapshot;

  const loadSetup = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, projectRes, componentsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-page`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, { credentials: "include" }),
      ]);
      if (!configRes.ok) throw new Error("Unable to load status page settings.");

      const loadedConfig = normalizeConfig(await configRes.json() as Partial<StatusPageConfig>);
      setConfig(loadedConfig);
      setSavedSnapshot(JSON.stringify(loadedConfig));
      if (projectRes.ok) setProject(await projectRes.json() as Project);
      if (componentsRes.ok) setComponentCount((await componentsRes.json() as unknown[]).length);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load status page settings.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || projectId === "undefined") router.replace("/dashboard/status-pages");
  }, [projectId, router]);

  useEffect(() => {
    // This effect starts the asynchronous server synchronization for this route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (projectId && projectId !== "undefined") void loadSetup();
  }, [projectId, loadSetup]);

  const updateConfig = (updates: Partial<StatusPageConfig>) => setConfig((current) => ({ ...current, ...updates }));

  async function saveConfig() {
    if (!isDirty || saving) return;
    try {
      setSaving(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-page`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save status page settings.");

      const saved = normalizeConfig(data as Partial<StatusPageConfig>);
      setConfig(saved);
      setSavedSnapshot(JSON.stringify(saved));
      setLastSavedAt(new Date());
      toast.success("Status page saved and published configuration updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save status page settings.");
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public status URL copied.");
    } catch {
      toast.error("Could not copy the public URL.");
    }
  }

  const readiness = useMemo(() => [Boolean(config.title.trim()), Boolean(config.slug.trim()), componentCount > 0, config.enabled].filter(Boolean).length, [config, componentCount]);

  if (loading) {
    return <div className="flex h-[calc(100vh-48px)] items-center justify-center bg-[#050505]"><div className="flex items-center gap-3 text-sm text-zinc-400"><Loader2 className="h-5 w-5 animate-spin text-blue-400" />Loading status page workspace...</div></div>;
  }

  return (
    <main className="h-[calc(100vh-48px)] overflow-y-auto bg-[#050505] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent" />
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-12">
        <header className="sticky top-0 z-20 -mx-6 border-b border-zinc-800/70 bg-[#050505]/95 px-6 py-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500"><Settings2 className="h-3.5 w-3.5" />Status page workspace{project?.repoName && <span className="truncate normal-case tracking-normal text-zinc-600">/ {project.repoName}</span>}</div>
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10"><Globe2 className="h-5 w-5 text-blue-300" /></span><div><h1 className="text-2xl font-bold tracking-tight text-white">Status page setup</h1><p className="mt-0.5 text-sm text-zinc-400">Design the public reliability experience for your customers.</p></div></div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`hidden items-center gap-1.5 text-xs sm:flex ${isDirty ? "text-amber-300" : "text-emerald-400"}`}><span className={`h-1.5 w-1.5 rounded-full ${isDirty ? "bg-amber-400" : "bg-emerald-400"}`} />{isDirty ? "Unsaved changes" : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "All changes saved"}</span>
              {config.enabled && <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white">Preview <ExternalLink className="h-3.5 w-3.5" /></a>}
              <button onClick={saveConfig} disabled={!isDirty || saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving..." : isDirty ? "Save changes" : "Saved"}</button>
            </div>
          </div>
        </header>

        <section className="py-6">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-zinc-200">Configuration workflow</h2><p className="mt-1 text-sm text-zinc-500">Complete the stages below to create a customer-ready service-status experience.</p></div><span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs font-medium text-zinc-400">{readiness}/4 complete</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkflowStep active icon={Settings2} title="Page details" detail="Brand, URL, visibility" href={`/dashboard/status-pages/${projectId}/settings`} />
            <WorkflowStep complete={componentCount > 0} icon={Layers3} title="Components" detail={componentCount ? `${componentCount} monitored services` : "Define your services"} href={`/dashboard/status-pages/${projectId}/components`} />
            <WorkflowStep complete={false} icon={Activity} title="Incidents" detail="Publish customer updates" href={`/dashboard/incidents/${projectId}`} />
            <WorkflowStep complete={config.enabled} icon={Radio} title="Public page" detail={config.enabled ? "Live and shareable" : "Ready to publish"} href={config.enabled ? publicUrl : `/dashboard/status-pages/${projectId}/settings`} />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/25 shadow-[0_10px_32px_rgb(0,0,0,0.16)]">
              <div className="flex items-start gap-4 border-b border-zinc-800/70 p-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-500/10"><Globe2 className="h-4 w-4 text-emerald-400" /></span><div><h2 className="font-semibold text-white">Publishing controls</h2><p className="mt-1 text-sm text-zinc-400">Decide when customers can access this public source of truth.</p></div></div>
              <div className="space-y-5 p-5">
                <div className="flex items-center justify-between gap-6 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"><div><h3 className="text-sm font-medium text-zinc-100">Public status page</h3><p className="mt-1 max-w-xl text-sm leading-5 text-zinc-500">Publishing makes the page available to anyone with the URL. You can unpublish it at any time.</p></div><Toggle checked={config.enabled} label="Enable public status page" onChange={() => updateConfig({ enabled: !config.enabled })} /></div>
                <div className={!config.enabled ? "opacity-50" : ""}><label className="mb-2 block text-sm font-medium text-zinc-300">Public URL</label><div className="flex gap-2"><div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3"><Link2 className="h-4 w-4 shrink-0 text-zinc-600" /><span className="truncate font-mono text-xs text-zinc-400">{publicUrl}</span></div><button type="button" onClick={copyPublicUrl} disabled={!config.enabled} aria-label="Copy public URL" className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed"><Copy className="h-4 w-4" /></button><a href={publicUrl} target="_blank" rel="noreferrer" aria-disabled={!config.enabled} className={`grid h-10 w-10 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 transition hover:bg-zinc-800 hover:text-white ${config.enabled ? "" : "pointer-events-none"}`}><ExternalLink className="h-4 w-4" /></a></div></div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/25 shadow-[0_10px_32px_rgb(0,0,0,0.16)]">
              <div className="flex items-start gap-4 border-b border-zinc-800/70 p-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-400/15 bg-violet-500/10"><FileText className="h-4 w-4 text-violet-300" /></span><div><h2 className="font-semibold text-white">Page identity</h2><p className="mt-1 text-sm text-zinc-400">Give customers a recognizable name, helpful context, and memorable address.</p></div></div>
              <div className="space-y-5 p-5"><div className="space-y-2"><label htmlFor="status-title" className="text-sm font-medium text-zinc-300">Page title</label><input id="status-title" className={inputClass} placeholder="e.g. Acme service status" value={config.title} onChange={(event) => updateConfig({ title: event.target.value })} /></div><div className="space-y-2"><label htmlFor="status-description" className="text-sm font-medium text-zinc-300">Customer message</label><input id="status-description" className={inputClass} placeholder="Optional service description or support contact" value={config.description} onChange={(event) => updateConfig({ description: event.target.value })} /></div><div className="space-y-2"><label htmlFor="status-slug" className="text-sm font-medium text-zinc-300">Public URL slug</label><div className="flex overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/10"><span className="flex items-center border-r border-zinc-800 bg-zinc-900/60 px-3 font-mono text-xs text-zinc-500">/status/</span><input id="status-slug" className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" placeholder="acme" value={config.slug} onChange={(event) => updateConfig({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></div><p className="text-xs text-zinc-600">Use lowercase letters, numbers, and hyphens. A slug makes the public URL shareable and stable.</p></div></div>
            </section>

            <section className="overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/25 shadow-[0_10px_32px_rgb(0,0,0,0.16)]">
              <div className="flex items-start gap-4 border-b border-zinc-800/70 p-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/15 bg-amber-500/10"><Activity className="h-4 w-4 text-amber-300" /></span><div><h2 className="font-semibold text-white">Public information</h2><p className="mt-1 text-sm text-zinc-400">Choose which reliability signals customers can see.</p></div></div>
              <div className="divide-y divide-zinc-800/70"><div className="flex items-center justify-between gap-6 p-5"><div><h3 className="text-sm font-medium text-zinc-100">90-day uptime history</h3><p className="mt-1 text-sm text-zinc-500">Display historical availability from synthetic checks.</p></div><Toggle checked={config.show_uptime_history} label="Show 90-day uptime history" onChange={() => updateConfig({ show_uptime_history: !config.show_uptime_history })} /></div><div className="flex items-center justify-between gap-6 p-5"><div><h3 className="text-sm font-medium text-zinc-100">Incident timeline</h3><p className="mt-1 text-sm text-zinc-500">Display active incidents and the recent resolved-incident archive.</p></div><Toggle checked={config.show_incidents} label="Show incident timeline" onChange={() => updateConfig({ show_incidents: !config.show_incidents })} /></div></div>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            <section className="rounded-xl border border-zinc-800/70 bg-zinc-900/25 p-5"><div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-blue-300" />Release readiness</div><div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${config.enabled ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-950/60 text-zinc-400"}`}><CircleDot className="h-3.5 w-3.5" />{config.enabled ? "Public page is live" : "Draft — not public"}</div><div className="space-y-3 text-sm"><div className="flex items-center gap-2 text-zinc-400"><CheckCircle2 className={`h-4 w-4 ${config.title ? "text-emerald-400" : "text-zinc-700"}`} />Customer-facing title</div><div className="flex items-center gap-2 text-zinc-400"><CheckCircle2 className={`h-4 w-4 ${config.slug ? "text-emerald-400" : "text-zinc-700"}`} />Shareable URL</div><div className="flex items-center gap-2 text-zinc-400"><CheckCircle2 className={`h-4 w-4 ${componentCount ? "text-emerald-400" : "text-zinc-700"}`} />Service components</div><div className="flex items-center gap-2 text-zinc-400"><CheckCircle2 className={`h-4 w-4 ${config.enabled ? "text-emerald-400" : "text-zinc-700"}`} />Published</div></div></section>
            <section className="rounded-xl border border-blue-500/15 bg-blue-500/[0.06] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-blue-200"><Layers3 className="h-4 w-4" />Next: model your services</div><p className="mt-2 text-sm leading-6 text-zinc-400">Components let incidents identify exactly which customer-facing services are affected.</p><Link href={`/dashboard/status-pages/${projectId}/components`} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20">Manage components <ArrowUpRight className="h-4 w-4" /></Link></section>
          </aside>
        </div>
      </div>
    </main>
  );
}
