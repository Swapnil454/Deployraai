"use client";

import { FormEvent, useEffect, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";

type UptimeGroup = { id: string; name: string };
const uptimeApi = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

export default function UptimeGroupsPage() {
  const [groups, setGroups] = useState<UptimeGroup[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`${uptimeApi}/groups`, { credentials: "include" })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Could not load monitor groups.")))
      .then((data: { groups: UptimeGroup[] }) => active && setGroups(data.groups))
      .catch((loadError: Error) => active && setError(loadError.message));
    return () => { active = false; };
  }, []);

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${uptimeApi}/groups`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create group.");
      setGroups((current) => current.some((group) => group.id === data.group.id) ? current : [...current, data.group]);
      setName("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create group.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-full bg-black px-6 py-8 text-zinc-100 lg:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="border-b border-zinc-800 pb-6">
          <p className="text-xs font-bold tracking-[0.16em] text-emerald-400">UPTIME CRON JOB</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Monitor groups</h1>
          <p className="mt-2 text-sm text-zinc-400">Organise monitors and assign new checks to the right group.</p>
        </header>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
            <div className="border-b border-zinc-800 px-6 py-4 text-sm font-semibold">Your groups</div>
            <div className="divide-y divide-zinc-800">{groups.map((group) => <div key={group.id} className="flex items-center gap-3 px-6 py-4"><FolderPlus className="h-4 w-4 text-emerald-400" /><span className="text-sm font-medium text-zinc-200">{group.name}</span></div>)}</div>
          </section>
          <form onSubmit={createGroup} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-base font-semibold text-white">Add group</h2>
            <p className="mt-2 text-sm text-zinc-400">Groups are stored in the Uptime Cron database and appear in the Create Monitor form.</p>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Production APIs" className="mt-5 h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-indigo-500" />
            {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
            <button disabled={saving} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"><Plus className="h-4 w-4" />{saving ? "Creating..." : "Create group"}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
