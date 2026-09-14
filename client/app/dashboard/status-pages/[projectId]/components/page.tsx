"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, CircleDot, Layers3, Loader2, Plus, Server, Trash2, X } from "lucide-react";

type ComponentStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";
type StatusComponent = { id: string; name: string; description?: string | null; current_status: ComponentStatus; position?: number };

const statusOptions: Array<{ value: ComponentStatus; label: string; className: string }> = [
  { value: "operational", label: "Operational", className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
  { value: "degraded", label: "Degraded", className: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
  { value: "partial_outage", label: "Partial outage", className: "text-orange-300 bg-orange-500/10 border-orange-500/20" },
  { value: "major_outage", label: "Major outage", className: "text-rose-300 bg-rose-500/10 border-rose-500/20" },
  { value: "maintenance", label: "Maintenance", className: "text-blue-300 bg-blue-500/10 border-blue-500/20" },
];

function statusMeta(status: ComponentStatus) {
  return statusOptions.find((option) => option.value === status) ?? statusOptions[0];
}

export default function StatusComponentsPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const router = useRouter();
  const [components, setComponents] = useState<StatusComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [newComponent, setNewComponent] = useState({ name: "", description: "" });

  const fetchComponents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load service components.");
      setComponents(await response.json() as StatusComponent[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load service components.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || projectId === "undefined") router.replace("/dashboard/status-pages");
  }, [projectId, router]);

  useEffect(() => {
    // This effect initiates the asynchronous server synchronization for this route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (projectId && projectId !== "undefined") void fetchComponents();
  }, [projectId, fetchComponents]);

  async function createComponent(event: React.FormEvent) {
    event.preventDefault();
    try {
      setCreating(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newComponent),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not create component.");
      setComponents((current) => [...current, data as StatusComponent]);
      setNewComponent({ name: "", description: "" });
      setIsCreating(false);
      toast.success("Service component added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create component.");
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(component: StatusComponent, current_status: ComponentStatus) {
    try {
      setUpdatingId(component.id);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components/${component.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update component status.");
      setComponents((current) => current.map((item) => item.id === component.id ? data as StatusComponent : item));
      toast.success(`${component.name} is now ${statusMeta(current_status).label.toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update component status.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteComponent(component: StatusComponent) {
    if (!window.confirm(`Remove “${component.name}” from the public status page?`)) return;
    try {
      setUpdatingId(component.id);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components/${component.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Could not remove component.");
      setComponents((current) => current.filter((item) => item.id !== component.id));
      toast.success("Service component removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove component.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <div className="flex h-[calc(100vh-48px)] items-center justify-center bg-[#050505]"><div className="flex items-center gap-3 text-sm text-zinc-400"><Loader2 className="h-5 w-5 animate-spin text-blue-400" />Loading service components...</div></div>;

  return <main className="h-[calc(100vh-48px)] overflow-y-auto bg-[#050505] text-zinc-100"><div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent" /><div className="relative mx-auto w-full max-w-5xl px-6 pb-12">
    <header className=" top-0 z-20 -mx-6 flex flex-col gap-4 border-b border-zinc-800/70 bg-[#050505]/95 px-6 py-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-3"><Layers3 className="h-10 w-10 text-white" /><div><h1 className="text-2xl font-bold tracking-tight text-white">Service components</h1><p className="mt-0.5 text-sm text-zinc-400">Model the systems customers see and incidents can affect.</p></div></div></div><button onClick={() => setIsCreating(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400"><Plus className="h-4 w-4" />Add component</button></header>

    <section className="mt-6 flex flex-col gap-3 pb-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2.5"><Server className="mt-0.5 h-4 w-4 shrink-0 text-white" /><div><h2 className="text-sm font-medium text-zinc-200">Customer-visible service map</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Components appear on the public page and can be automatically updated by linked incidents.</p></div></div><span className="self-start rounded-full border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 text-xs font-medium text-zinc-400 sm:self-auto">{components.length} {components.length === 1 ? "component" : "components"}</span></section>

    {components.length === 0 ? <section className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/15 p-8 text-center"><span className="grid h-12 w-12 place-items-center rounded-xl border border-zinc-800 bg-zinc-900"><Server className="h-5 w-5 text-zinc-500" /></span><h2 className="mt-4 text-lg font-semibold text-white">Start with your customer-facing services</h2><p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">Add services such as API, dashboard, authentication, payments, or database. Incidents can then update their public health automatically.</p><button onClick={() => setIsCreating(true)} className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"><Plus className="h-4 w-4" />Add your first component</button></section> : <section className="mt-6 overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/25"><div className="divide-y divide-zinc-800/70">{components.map((component, index) => { const meta = statusMeta(component.current_status); return <article key={component.id} className="flex flex-col gap-4 p-5 transition hover:bg-zinc-900/45 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-4"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-500">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold text-zinc-100">{component.name}</h2><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}><CircleDot className="h-3 w-3" />{meta.label}</span></div><p className="mt-1 text-sm text-zinc-500">{component.description || "No customer-facing description provided."}</p></div></div><div className="flex shrink-0 items-center gap-2"><div className="relative"><select value={component.current_status} onChange={(event) => void updateStatus(component, event.target.value as ComponentStatus)} disabled={updatingId === component.id} className="h-9 appearance-none rounded-lg border border-zinc-800 bg-zinc-950 py-0 pl-3 pr-8 text-sm text-zinc-300 outline-none transition hover:border-zinc-700 disabled:opacity-60"><option value="operational">Operational</option><option value="degraded">Degraded</option><option value="partial_outage">Partial outage</option><option value="major_outage">Major outage</option><option value="maintenance">Maintenance</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-zinc-600" /></div><button onClick={() => void deleteComponent(component)} disabled={updatingId === component.id} aria-label={`Remove ${component.name}`} className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-500 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-60"><Trash2 className="h-4 w-4" /></button></div></article>; })}</div></section>}
  </div>

  {isCreating && <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => setIsCreating(false)}><form onSubmit={createComponent} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0a0a0a] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">Add service component</h2><p className="mt-1 text-sm text-zinc-500">Use a clear name customers will understand.</p></div><button type="button" onClick={() => setIsCreating(false)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button></div><div className="mt-6 space-y-4"><label className="block space-y-2"><span className="text-sm font-medium text-zinc-300">Component name</span><input required autoFocus placeholder="e.g. Public API" value={newComponent.name} onChange={(event) => setNewComponent((current) => ({ ...current, name: event.target.value }))} className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500/60" /></label><label className="block space-y-2"><span className="text-sm font-medium text-zinc-300">Description <span className="font-normal text-zinc-600">(optional)</span></span><input placeholder="e.g. Powers customer integrations" value={newComponent.description} onChange={(event) => setNewComponent((current) => ({ ...current, description: event.target.value }))} className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500/60" /></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setIsCreating(false)} className="h-9 rounded-lg px-3 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white">Cancel</button><button disabled={creating} type="submit" className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-60">{creating && <Loader2 className="h-4 w-4 animate-spin" />}Add component</button></div></form></div>}
  </main>;
}
