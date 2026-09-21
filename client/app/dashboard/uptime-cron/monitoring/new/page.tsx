"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  KeyRound,
  Network,
  Plus,
  Save,
  Server,
  ShieldCheck,
  Target,
  Trash2,
  Webhook,
} from "lucide-react";

type MonitorType =
  | "HTTP / website monitoring"
  | "Keyword monitoring"
  | "Ping monitoring"
  | "Port monitoring"
  | "Cron job / Heartbeat monitoring"
  | "DNS monitoring"
  | "API monitoring"
  | "UDP monitoring";

const monitorTypes: Array<{
  name: MonitorType;
  description: string;
  icon: typeof Globe2;
  locked?: boolean;
}> = [
  { name: "HTTP / website monitoring", description: "Use HTTP(S) monitoring for websites, APIs, and anything running on HTTP.", icon: Globe2 },
  { name: "Keyword monitoring", description: "Check the presence or absence of specific text in an HTTP response.", icon: KeyRound },
  { name: "Ping monitoring", description: "Make sure your server or network device is always available.", icon: Target },
  { name: "Port monitoring", description: "Monitor services such as SMTP, POP3, FTP, and other TCP ports.", icon: Server },
  { name: "Cron job / Heartbeat monitoring", description: "Check that scheduled requests arrive at the expected time.", icon: Clock3 },
  { name: "DNS monitoring", description: "Monitor DNS servers and verify records resolve to expected values.", icon: Network },
  { name: "API monitoring", description: "Validate API responses with JSON assertions.", icon: Webhook },
  { name: "UDP monitoring", description: "Monitor UDP services such as DNS, SNMP, and other data services.", icon: ShieldCheck },
];

const intervalSeconds = [
  15,
  30,
  45,
  ...Array.from({ length: 30 }, (_, index) => (index + 1) * 60),
  ...Array.from({ length: 5 }, (_, index) => (index + 7) * 5 * 60),
  ...Array.from({ length: 24 }, (_, index) => (index + 1) * 3600),
];
const intervalMarks = [
  { seconds: 15, label: "15s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 1800, label: "30m" },
  { seconds: 3600, label: "1h" },
  { seconds: 43200, label: "12h" },
  { seconds: 86400, label: "24h" },
];

const intervalScaleAnchors = [
  { seconds: 15, position: 0 },
  { seconds: 30, position: 4 },
  { seconds: 60, position: 9 },
  { seconds: 300, position: 14 },
  { seconds: 1800, position: 25 },
  { seconds: 3600, position: 30 },
  { seconds: 43200, position: 65 },
  { seconds: 86400, position: 100 },
];

function intervalPosition(index: number) {
  const seconds = intervalSeconds[index];
  const nextAnchorIndex = intervalScaleAnchors.findIndex((anchor) => anchor.seconds >= seconds);
  const end = intervalScaleAnchors[nextAnchorIndex === -1 ? intervalScaleAnchors.length - 1 : nextAnchorIndex];
  const start = intervalScaleAnchors[Math.max(0, nextAnchorIndex - 1)];
  if (start.seconds === end.seconds) return start.position;
  const progress = (seconds - start.seconds) / (end.seconds - start.seconds);
  return start.position + (end.position - start.position) * progress;
}

function closestIntervalIndex(position: number) {
  return intervalSeconds.reduce((closest, _, index) => (
    Math.abs(intervalPosition(index) - position) < Math.abs(intervalPosition(closest) - position) ? index : closest
  ), 0);
}

function formatInterval(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${seconds / 60}m`;
  return `${seconds / 3600}h`;
}

type UptimeGroup = { id: string; name: string };
const uptimeApi = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

const inputClass =
  "mt-2 h-11 w-full rounded-lg border border-zinc-700 bg-[#0b0d12] px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15";

function CardSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-700/80 px-6 py-7 last:border-b-0 md:px-8">
      {children}
    </section>
  );
}

export default function NewUptimeMonitorPage() {
  const [monitorType, setMonitorType] = useState<MonitorType>("HTTP / website monitoring");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [intervalIndex, setIntervalIndex] = useState(6);
  const [timeout, setTimeoutValue] = useState("30");
  const [followRedirects, setFollowRedirects] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [sslOpen, setSslOpen] = useState(false);
  const [method, setMethod] = useState("HEAD");
  const [groups, setGroups] = useState<UptimeGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [slowResponseAlert, setSlowResponseAlert] = useState(false);
  const [slowResponseMs, setSlowResponseMs] = useState("2000");
  const [sendAsJson, setSendAsJson] = useState(false);
  const [sslChecks, setSslChecks] = useState({ errors: true, certificateExpiry: true, domainExpiry: true });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const router = useRouter();

  const selectedType = monitorTypes.find((type) => type.name === monitorType) ?? monitorTypes[0];
  const SelectedIcon = selectedType.icon;
  const intervalSecondsValue = intervalSeconds[intervalIndex];
  const intervalProgress = intervalPosition(intervalIndex);
  const timeoutProgress = ((Number(timeout) - 5) / 55) * 100;

  useEffect(() => {
    let active = true;
    void fetch(`${uptimeApi}/groups`, { credentials: "include" })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Could not load monitor groups.")))
      .then((data: { groups: UptimeGroup[] }) => {
        if (!active) return;
        setGroups(data.groups);
        setSelectedGroup((current) => current || data.groups[0]?.id || "");
      })
      .catch((error: Error) => active && setFormError(error.message));
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setSaved(false);
    setFormError("");
    try {
      const response = await fetch(`${uptimeApi}/monitors`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.get("url"), group_id: selectedGroup || null, tags,
          interval_seconds: intervalSecondsValue, timeout_seconds: Number(timeout),
          follow_redirects: followRedirects, http_method: method,
          request_body: form.get("requestBody") || null, send_as_json: sendAsJson,
          request_headers: [{ key: form.get("headerKey"), value: form.get("headerValue") }].filter((item) => item.key),
          meta_fields: [{ key: form.get("metaKey"), value: form.get("metaValue") }].filter((item) => item.key),
          ssl_check_enabled: sslOpen, ssl_error_check_enabled: sslChecks.errors,
          ssl_expiry_reminder_enabled: sslChecks.certificateExpiry, domain_expiry_reminder_enabled: sslChecks.domainExpiry,
          slow_response_alert_enabled: slowResponseAlert, slow_response_threshold_ms: slowResponseAlert ? Number(slowResponseMs) : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not create monitor.");
      // Redirect to detail page so the user immediately sees live status
      router.push(`/dashboard/uptime-cron/monitoring/${data.monitor.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create monitor.");
    } finally {
      setSaving(false);
    }
  }

  async function addGroup() {
    const group = newGroup.trim();
    if (!group) return;
    try {
      const response = await fetch(`${uptimeApi}/groups`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: group }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create group.");
      setGroups((current) => current.some((item) => item.id === data.group.id) ? current : [...current, data.group]);
      setSelectedGroup(data.group.id);
      setNewGroup("");
      setAddingGroup(false);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not create group."); }
  }

  function addTags() {
    const nextTags = tagInput.split(",").map((tag) => tag.trim()).filter(Boolean);
    setTags((current) => Array.from(new Set([...current, ...nextTags])));
    setTagInput("");
  }

  return (
    <main className="flex min-h-[calc(100vh-40px)] w-full flex-col bg-black px-5 py-5 text-zinc-100 md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-center gap-3 border-b border-zinc-800 pb-4">
          <Link
            href="/dashboard/uptime-cron"
            aria-label="Back to monitoring"
            className="grid h-9 w-9 place-items-center rounded-lg  bg-zinc-900 text-zinc-300 transition hover:border-indigo-500/60 hover:bg-zinc-800 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              Add single monitor<span className="text-emerald-400">.</span>
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">Create a reliable endpoint check with advanced controls.</p>
          </div>
        </header>

        <div className="mt-5">
          <div>
            <form
              onSubmit={submit}
              className="overflow-visible rounded-2xl border border-zinc-800 bg-[#111318] shadow-[0_24px_60px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.035)]"
            >
              <CardSection>
                <label className="block text-sm font-semibold text-slate-100">Monitor type</label>
                <div className="relative mt-3">
                  <button
                    type="button"
                    onClick={() => setTypeMenuOpen((open) => !open)}
                    className="flex w-full items-center gap-4 rounded-lg border border-zinc-700 bg-[#0b0d12] p-4 text-left shadow-inner transition hover:border-indigo-500/60"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400">
                      <SelectedIcon className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-base text-slate-100">{selectedType.name}</strong>
                      <small className="mt-1 block text-sm font-normal leading-5 text-slate-400">{selectedType.description}</small>
                    </span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-slate-300 transition-transform ${typeMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {typeMenuOpen && (
                    <div className="absolute z-20 mt-2 max-h-[560px] w-full overflow-y-auto rounded-lg border border-zinc-700 bg-[#111318] shadow-2xl">
                      {monitorTypes.map((type) => {
                        const Icon = type.icon;
                        return (
                          <button
                            key={type.name}
                            type="button"
                            onClick={() => {
                              setMonitorType(type.name);
                              setTypeMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-3 border-b border-slate-700/80 px-4 py-3 text-left last:border-b-0 enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            <Icon className="h-6 w-6 shrink-0 text-emerald-400" />
                            <span className="min-w-0 flex-1">
                              <strong className="block text-sm text-slate-100">{type.name}</strong>
                              <small className="mt-0.5 block text-xs text-slate-400">{type.description}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <label className="mt-6 block text-sm font-semibold">
                  URL to monitor
                  <input required name="url" type="url" defaultValue="https://" className={inputClass} />
                </label>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="block text-sm font-semibold">Group</label>
                      <button type="button" onClick={() => setAddingGroup((open) => !open)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300"><Plus className="h-3.5 w-3.5" />Add group</button>
                    </div>
                    <span className="mt-1 block text-xs text-slate-400">Your monitor is added to this group.</span>
                    <select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} className={inputClass}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
                    {addingGroup && <div className="mt-2 flex gap-2"><input autoFocus value={newGroup} onChange={(event) => setNewGroup(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGroup(); } }} placeholder="New group name" className="mt-0 h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-[#0b0d12] px-3 text-sm outline-none focus:border-indigo-500" /><button type="button" onClick={addGroup} className="h-10 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500">Create</button></div>}
                  </div>
                  <label className="block text-sm font-semibold">
                    Add tags
                    <span className="mt-1 block text-xs font-normal text-slate-400">Organise monitors using searchable tags.</span>
                    <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-[#0b0d12] px-2 py-1.5 focus-within:border-indigo-500">
                      {tags.map((tag) => <button type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))} key={tag} className="rounded-md bg-indigo-500/15 px-2 py-1 text-xs font-medium text-indigo-200">{tag} ×</button>)}
                      <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTags(); } }} onBlur={addTags} placeholder={tags.length ? "Add another tag" : "Add one or more tags"} className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600" />
                    </div>
                  </label>
                </div>
              </CardSection>

              <CardSection>
                <h2 className="text-base font-bold text-white">How will we notify you?</h2>
                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { title: "E-mail", note: "workspace@deployai.dev", enabled: true },
                    { title: "SMS message", note: "Add phone number" },
                    { title: "Voice call", note: "Add phone number" },
                    { title: "Push", note: "Download the app" },
                  ].map((channel) => (
                    <label key={channel.title} className="flex gap-2 text-sm">
                      <input type="checkbox" defaultChecked={channel.enabled} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                      <span>
                        <strong className="block text-slate-200">{channel.title}</strong>
                        <small className="mt-1 block text-slate-400">{channel.note}</small>
                        <span className="mt-2 inline-block text-xs text-slate-500">No delay, no repeat</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-5 text-xs text-slate-400">
                  Set up notification channels in <span className="text-emerald-400">Integrations & Team</span> and edit them later.
                </p>
              </CardSection>

              <CardSection>
                <h2 className="text-base font-bold text-white">Monitor interval</h2>
                <p className="mt-1 text-sm text-slate-400">Your monitor will be checked every <strong className="text-white">{formatInterval(intervalSecondsValue)}</strong>.</p>
                <input type="range" min="0" max="100" step="0.1" value={intervalProgress} onChange={(event) => setIntervalIndex(closestIntervalIndex(Number(event.target.value)))} style={{ background: `linear-gradient(90deg, #4f46e5 0%, #6366f1 ${intervalProgress}%, #334155 ${intervalProgress}%, #334155 100%)` }} className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(99,102,241,0.18)]" />
                <div className="relative mt-3 h-4 text-xs text-slate-500">{intervalMarks.map((mark) => <span key={mark.label} style={{ left: `${intervalPosition(intervalSeconds.indexOf(mark.seconds))}%` }} className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full">{mark.label}</span>)}</div>
                <h3 className="mt-7 text-sm font-bold text-white">Location to monitor from</h3>
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-[#0b0d12] p-2">
                  <span className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-semibold">🇺🇸 Default (auto-select)</span>
                  <span className="text-xs text-slate-400"><Globe2 className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />Additional monitoring locations can be selected after creation.</span>
                </div>
                <button type="button" onClick={() => setSslOpen((open) => !open)} className="mt-6 flex w-full items-center justify-between border-t border-slate-700 pt-5 text-left text-sm font-bold text-white">
                  <span className="flex items-center gap-1"><ChevronRight className={`h-4 w-4 transition-transform ${sslOpen ? "rotate-90" : ""}`} />SSL certificate and Domain checks</span>
                </button>
                {sslOpen && <div className="mt-4 grid gap-3 rounded-lg border border-zinc-700 bg-[#0b0d12] p-4 sm:grid-cols-3">{[
                  ["errors", "Check SSL errors", "Detect invalid or insecure certificates."],
                  ["certificateExpiry", "SSL expiry reminders", "Alert before the certificate expires."],
                  ["domainExpiry", "Domain expiry reminders", "Alert before the domain registration expires."],
                ].map(([key, title, description]) => <label key={key} className="flex cursor-pointer items-start gap-2.5"><input type="checkbox" checked={sslChecks[key as keyof typeof sslChecks]} onChange={(event) => setSslChecks((current) => ({ ...current, [key]: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span><strong className="block text-sm text-slate-200">{title}</strong><small className="mt-1 block text-xs leading-4 text-slate-500">{description}</small></span></label>)}</div>}
              </CardSection>

              <CardSection>
                <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center gap-1 text-left text-base font-bold text-white">
                  <ChevronRight className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-90" : ""}`} />
                  Advanced settings
                </button>
                {advancedOpen && (
                  <div className="mt-6 space-y-7">
                    <div>
                      <h3 className="text-sm font-bold text-white">Request timeout</h3>
                      <p className="mt-1 text-sm text-slate-400">The request timeout is <strong className="text-white">{timeout} seconds</strong>. The shorter the timeout, the earlier we mark the website as down.</p>
                      <input type="range" min="5" max="60" step="1" value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} style={{ background: `linear-gradient(90deg, #4f46e5 0%, #6366f1 ${timeoutProgress}%, #334155 ${timeoutProgress}%, #334155 100%)` }} className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(99,102,241,0.18)]" />
                      <div className="relative mt-3 h-4 text-xs text-slate-500">{[5, 10, 15, 30, 45, 60].map((mark) => <span key={mark} style={{ left: `${((mark - 5) / 55) * 100}%` }} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full">{mark}s</span>)}</div>
                    </div>
                    <label className="border-y border-slate-700 py-5 text-sm">
                      <span className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={slowResponseAlert} onChange={(event) => setSlowResponseAlert(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span><strong className="block">Slow response time alert</strong><small className="mt-1 block text-slate-400">Receive a notification when the response time exceeds this threshold.</small></span></span>
                      {slowResponseAlert && <label className="mt-4 block max-w-sm text-xs font-semibold text-slate-300">Response time threshold<div className="relative"><input type="number" min="1" value={slowResponseMs} onChange={(event) => setSlowResponseMs(event.target.value)} className={`${inputClass} pr-12`} /><span className="absolute right-3 top-5 text-xs text-slate-500">ms</span></div></label>}
                    </label>
                    <div>
                      <h3 className="text-sm font-bold text-white">Internet Protocol version</h3>
                      <p className="mt-1 text-sm text-slate-400">Use IPv4 first, then IPv6 only when IPv4 is not available.</p>
                      <select className={`${inputClass} max-w-md`}><option>IPv4 / IPv6 (IPv4 Priority)</option><option>IPv4 only</option><option>IPv6 only</option></select>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 border-y border-slate-700 py-5 text-sm">
                      <input type="checkbox" checked={followRedirects} onChange={(event) => setFollowRedirects(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                      <span><strong className="block">Follow redirections</strong><small className="mt-1 block text-slate-400">If disabled, redirect HTTP codes (3xx) are returned as responses.</small></span>
                    </label>
                    <div>
                      <div><h3 className="text-sm font-bold text-white">Up HTTP status codes</h3><p className="mt-1 text-sm text-slate-400">Create an incident when the response is not one of the codes below.</p></div>
                      <div className="mt-3 rounded-lg border border-zinc-700 bg-[#0b0d12] p-3"><span className="mr-2 inline-block rounded bg-emerald-400/20 px-2 py-1 text-xs text-emerald-300">2xx ×</span><span className="inline-block rounded bg-indigo-400/20 px-2 py-1 text-xs text-indigo-200">3xx ×</span></div>
                    </div>
                    <div className="grid gap-5 md:grid-cols-[190px_1fr]">
                      <label className="block text-sm font-bold">Auth. type<select className={inputClass}><option>None</option><option>Basic authentication</option></select></label>
                      <div><p className="text-sm font-bold text-slate-400">Auth. credentials</p><div className="mt-2 grid grid-cols-2 gap-3"><input disabled placeholder="Username" className={inputClass} /><input disabled placeholder="Password" className={inputClass} /></div></div>
                    </div>
                    <div>
                      <div><h3 className="text-sm font-bold text-white">HTTP method</h3><p className="mt-1 text-sm text-slate-400">HEAD is lightweight unless you need a specific method.</p></div>
                      <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-lg border border-zinc-700 sm:grid-cols-8">{["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"].map((item) => <button type="button" onClick={() => setMethod(item)} key={item} className={`h-10 border-r border-zinc-700 text-xs font-semibold last:border-r-0 ${method === item ? "bg-emerald-500/15 text-emerald-400" : "bg-[#0b0d12] text-slate-400"}`}>{item}</button>)}</div>
                    </div>
                    <div><h3 className="text-sm font-bold text-white">Request body</h3><textarea name="requestBody" placeholder={'{ "key": "value" }'} className="mt-3 min-h-24 w-full rounded-lg border border-zinc-700 bg-[#0b0d12] p-3 font-mono text-sm outline-none placeholder:text-zinc-600 focus:border-indigo-500" /><label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={sendAsJson} onChange={(event) => setSendAsJson(event.target.checked)} className="h-4 w-4 accent-indigo-600" />Send as JSON <span className="text-xs text-slate-500">(application/json)</span></label><p className="mt-2 text-xs text-slate-500">{sendAsJson ? "The request body will be sent as application/json." : "The request body will be sent as standard form data."}</p></div>
                    <div><h3 className="text-sm font-bold text-white">Request headers</h3><div className="mt-3 flex gap-3"><input name="headerKey" placeholder="X-Header-Name" className={`mt-0 min-w-0 flex-1 ${inputClass}`} /><input name="headerValue" placeholder="Value" className={`mt-0 min-w-0 flex-1 ${inputClass}`} /><button type="button" className="grid h-11 w-11 place-items-center rounded-lg bg-rose-500/10 text-rose-400"><Trash2 className="h-4 w-4" /></button></div></div>
                    <div><div><h3 className="text-sm font-bold text-white">Meta fields</h3><p className="mt-1 text-sm text-slate-400">Custom metadata for organising, filtering, and routing alerts.</p></div><div className="mt-3 flex gap-3"><input name="metaKey" placeholder="Meta-key" className={`mt-0 min-w-0 flex-1 ${inputClass}`} /><input name="metaValue" placeholder="Value" className={`mt-0 min-w-0 flex-[2] ${inputClass}`} /></div><button type="button" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"><Plus className="h-4 w-4" />Add meta field</button></div>
                  </div>
                )}
              </CardSection>

              <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-zinc-800 bg-[#111318]/95 px-6 py-4 backdrop-blur md:px-8">
                <p className="hidden text-xs text-slate-400 sm:block">You can refine these settings at any time.</p>
                <div className="ml-auto flex gap-3"><Link href="/dashboard/uptime-cron" className="inline-flex h-10 items-center rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-300 hover:bg-slate-800">Cancel</Link><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Creating..." : "Create monitor"}</button></div>
              </footer>
              {saved && <p className="px-6 pb-5 text-sm text-emerald-400 md:px-8">Monitor saved to the Uptime Cron database. The scheduler will run its first check when it is due.</p>}
              {formError && <p className="px-6 pb-5 text-sm text-rose-400 md:px-8">{formError}</p>}
            </form>
          </div>

        </div>
      </div>
    </main>
  );
}
