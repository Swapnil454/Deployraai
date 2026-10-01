"use client";

import { useEffect, useState } from "react";
import { Plus, Activity, Loader2, Calendar, Clock, Settings, Monitor, ShieldAlert, Power, Check } from "lucide-react";
import Link from "next/link";

interface MaintenanceWindow {
  id: string;
  name: string;
  timezone: string;
  recurrence_type: string;
  start_time: string | null;
  duration_minutes: number;
  days_of_week: string[] | null;
  one_time_start_at: string | null;
  active: boolean;
  monitor_ids: string[];
  total_suppressed_checks: number;
  failed_suppressed_checks: number;
}

interface Monitor {
  id: string;
  monitor_type: string;
  url?: string;
  target_host?: string;
  dns_hostname?: string;
  udp_dns_query_name?: string;
  group_name?: string;
}

const getMonitorTarget = (m: Monitor) => {
  if (m.monitor_type === "http" || m.monitor_type === "keyword" || m.monitor_type === "api") return m.url;
  if (m.monitor_type === "ping" || m.monitor_type === "port") return m.target_host;
  if (m.monitor_type === "dns") return m.dns_hostname;
  if (m.monitor_type === "udp") return m.udp_dns_query_name || m.target_host || "UDP Probe";
  return "Unknown Target";
};

const WEEKDAYS = [
  { value: 'MO', label: 'Mo' },
  { value: 'TU', label: 'Tu' },
  { value: 'WE', label: 'We' },
  { value: 'TH', label: 'Th' },
  { value: 'FR', label: 'Fr' },
  { value: 'SA', label: 'Sa' },
  { value: 'SU', label: 'Su' }
];

export default function MaintenanceWindowsPage() {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    recurrence_type: "one_time",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    start_time: "09:00",
    duration_minutes: 60,
    days_of_week: [] as string[],
    one_time_start_at: "",
    monitor_ids: [] as string[]
  });
  const [submitting, setSubmitting] = useState(false);

  const timezones = Intl.supportedValuesOf('timeZone');
  const API = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/uptime-cron`;

  const fetchWindows = async () => {
    try {
      const res = await fetch(`${API}/maintenance`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load maintenance windows");
      const data = await res.json();
      setWindows(data.windows || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchMonitors = async () => {
    try {
      const res = await fetch(`${API}/monitors`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.monitors || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    Promise.all([fetchWindows(), fetchMonitors()]).finally(() => setLoading(false));
  }, [API]);

  const toggleDay = (day: string) => {
    setFormData(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day]
    }));
  };

  const toggleMonitor = (id: string) => {
    setFormData(prev => ({
      ...prev,
      monitor_ids: prev.monitor_ids.includes(id)
        ? prev.monitor_ids.filter(m => m !== id)
        : [...prev.monitor_ids, id]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    // Parse one-time date into UTC ISO
    let finalOneTime = null;
    if (formData.recurrence_type === "one_time") {
      if (!formData.one_time_start_at) {
        alert("Please select a start date and time for the one-time window.");
        setSubmitting(false);
        return;
      }
      finalOneTime = new Date(formData.one_time_start_at).toISOString();
    }

    try {
      const res = await fetch(`${API}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...formData,
          one_time_start_at: finalOneTime,
          // nullify unused fields
          start_time: formData.recurrence_type === 'weekly' ? formData.start_time : null,
          days_of_week: formData.recurrence_type === 'weekly' ? formData.days_of_week : null
        })
      });
      
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create");
      }
      
      await fetchWindows();
      setIsCreating(false);
      setFormData({
        name: "", recurrence_type: "one_time", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        start_time: "09:00", duration_minutes: 60, days_of_week: [], one_time_start_at: "", monitor_ids: []
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await fetch(`${API}/maintenance/${id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: !current })
      });
      fetchWindows();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteWindow = async (id: string) => {
    if (!confirm("Delete this maintenance window?")) return;
    try {
      await fetch(`${API}/maintenance/${id}`, { method: "DELETE", credentials: "include" });
      fetchWindows();
    } catch (e) {}
  };

  if (isCreating) {
    return (
      <main className="min-h-full bg-black px-6 py-8 text-zinc-100 lg:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="border-b border-zinc-800 pb-6 mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white">Create Maintenance Window</h1>
            <p className="mt-1 text-sm text-zinc-400">Schedule a time to silently suppress incident alerts during planned downtime.</p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-6">
              
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Friendly Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Weekly Database Update"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Repeat</label>
                <select value={formData.recurrence_type} onChange={e => setFormData({...formData, recurrence_type: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500">
                  <option value="one_time">Does not repeat (One-time)</option>
                  <option value="weekly">Repeat Weekly</option>
                </select>
              </div>

              {formData.recurrence_type === "weekly" && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Days to repeat</label>
                  <div className="flex gap-2">
                    {WEEKDAYS.map(day => (
                      <button type="button" key={day.value} onClick={() => toggleDay(day.value)}
                        className={`w-10 h-10 rounded-full font-bold text-xs flex items-center justify-center transition-colors
                        ${formData.days_of_week.includes(day.value) ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.recurrence_type === "weekly" ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Start Time (Local)</label>
                  <input required type="time" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})}
                    className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]" />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Start Date & Time (Local)</label>
                  <input required type="datetime-local" value={formData.one_time_start_at} onChange={e => setFormData({...formData, one_time_start_at: e.target.value})}
                    className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Duration (minutes)</label>
                <input required type="number" min="1" max="1440" value={formData.duration_minutes} onChange={e => setFormData({...formData, duration_minutes: parseInt(e.target.value)})}
                  className="w-32 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Timezone</label>
                <p className="text-xs text-zinc-500 mb-3">All times above will be evaluated strictly in this IANA timezone. This safely handles Daylight Saving Time (DST) automatically.</p>
                <select value={formData.timezone} onChange={e => setFormData({...formData, timezone: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500">
                  {timezones.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <label className="block text-sm font-medium text-zinc-300 mb-2">Monitor Scope</label>
                <p className="text-xs text-zinc-500 mb-4">Select which monitors will be suppressed. If none are selected, this maintenance window applies to <strong>ALL</strong> monitors.</p>
                
                <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                  {Object.entries(
                    monitors.reduce((acc, m) => {
                      const group = m.group_name || "Uncategorized";
                      if (!acc[group]) acc[group] = [];
                      acc[group].push(m);
                      return acc;
                    }, {} as Record<string, Monitor[]>)
                  ).map(([group, groupMonitors]) => (
                    <div key={group}>
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1">{group}</h4>
                      <div className="space-y-2">
                        {groupMonitors.map(m => (
                          <div key={m.id} onClick={() => toggleMonitor(m.id)}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${formData.monitor_ids.includes(m.id) ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                            <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${formData.monitor_ids.includes(m.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-600 bg-zinc-950'}`}>
                              {formData.monitor_ids.includes(m.id) && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white truncate max-w-[400px]">{getMonitorTarget(m)}</p>
                              <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">{m.monitor_type}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {monitors.length === 0 && <p className="text-sm text-zinc-500">No monitors available.</p>}
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Save Maintenance Window
              </button>
              <button type="button" onClick={() => setIsCreating(false)} className="px-6 py-2.5 rounded-lg text-sm font-semibold text-zinc-400 hover:text-white transition">Cancel</button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-black px-6 py-8 text-zinc-100 lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="border-b border-zinc-800 pb-8 flex justify-between items-start">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.18em] text-emerald-400">UPTIME CRON JOB</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">Maintenance Windows</h1>
            <p className="mt-2 text-sm text-zinc-400">Plan scheduled downtime without triggering incident alerts.</p>
          </div>
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus className="w-4 h-4" /> Schedule Maintenance
          </button>
        </header>

        <section className="mt-6">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex min-h-64 items-center justify-center text-red-400">{error}</div>
          ) : windows.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
              <ShieldAlert className="w-12 h-12 text-zinc-600 mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Maintenance is ready when you are</h2>
              <p className="text-zinc-400 text-sm mb-6 max-w-sm">Schedule one-time or recurring maintenance windows to prevent noisy alerts during routine updates.</p>
              <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
                <Plus className="w-4 h-4" /> Schedule Maintenance
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {windows.map((w) => (
                <div key={w.id} className={`border border-zinc-800 rounded-xl p-5 flex flex-col transition ${w.active ? 'bg-zinc-900/50' : 'bg-zinc-900/20 opacity-60'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg text-white truncate pr-2">{w.name}</h3>
                    <button onClick={() => toggleActive(w.id, w.active)} className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${w.active ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-400"}`}>
                      {w.active ? "Active" : "Paused"}
                    </button>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <Clock className="w-4 h-4 text-zinc-500" />
                      <span>{w.duration_minutes} minutes</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <Calendar className="w-4 h-4 text-zinc-500" />
                      {w.recurrence_type === 'weekly' ? (
                        <span>Weekly on {w.days_of_week?.join(", ")} at {w.start_time}</span>
                      ) : (
                        <span>One-time on {new Date(w.one_time_start_at!).toLocaleString()}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <Monitor className="w-4 h-4 text-zinc-500" />
                      <span>{w.monitor_ids.length === 0 ? 'All Monitors' : `${w.monitor_ids.length} specific monitors`}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <div className="flex flex-col rounded-lg border border-zinc-800/50 bg-zinc-950 px-3 py-2">
                      <span className="text-xl font-bold tabular-nums text-indigo-400">{w.total_suppressed_checks || 0}</span>
                      <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Total Suppressed</span>
                    </div>
                    <div className="flex flex-col rounded-lg border border-zinc-800/50 bg-zinc-950 px-3 py-2">
                      <span className="text-xl font-bold tabular-nums text-red-400">{w.failed_suppressed_checks || 0}</span>
                      <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Failed Checks</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-auto pt-4 border-t border-zinc-800 justify-between">
                    <span className="text-xs text-zinc-500 font-medium">{w.timezone}</span>
                    <button onClick={() => deleteWindow(w.id)} className="text-xs font-semibold text-red-400 hover:text-red-300 transition">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
