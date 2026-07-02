"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Loader2, Save, Trash2, ArrowLeft, Bell, Settings } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function AlertRulesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId;

  const [rules, setRules] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState<any>({
    name: "",
    event_type: "error_rate",
    operator: "gt",
    threshold: 5,
    window_minutes: 5,
    cooldown_minutes: 15,
    route_type: "dashboard",
    route_target: "",
    auto_resolve: true
  });
  
  const [targetConfig, setTargetConfig] = useState<any>({
    componentId: "",
    severity: "degraded"
  });

  useEffect(() => {
    if (!projectId) return;
    fetchRules();
    fetchComponents();
  }, [projectId]);

  async function fetchRules() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules`, { credentials: "include" });
      if (res.ok) setRules(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchComponents() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, { credentials: "include" });
      if (res.ok) setComponents(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true);
      
      let payload = { ...newRule };
      if (payload.route_type === 'status_page') {
        payload.route_target = JSON.stringify(targetConfig);
      }
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setIsCreating(false);
        fetchRules();
        setNewRule({
          name: "", event_type: "error_rate", operator: "gt", threshold: 5, 
          window_minutes: 5, cooldown_minutes: 15, route_type: "dashboard", 
          route_target: "", auto_resolve: true
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules/${ruleId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) fetchRules();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => router.push('/dashboard/alerts')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Alert Rules</h1>
          <p className="text-muted-foreground">Configure automated alerts and status page incident rules based on telemetry data.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
        >
          {isCreating ? "Cancel" : <><Plus className="h-4 w-4" /> New Rule</>}
        </button>
      </div>

      {isCreating && (
        <Card className="border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
          <CardHeader>
            <CardTitle>Create Alert Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rule Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. High Error Rate Spike" 
                  value={newRule.name}
                  onChange={e => setNewRule({...newRule, name: e.target.value})}
                  className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Metric</label>
                <select 
                  value={newRule.event_type}
                  onChange={e => setNewRule({...newRule, event_type: e.target.value})}
                  className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm"
                >
                  <option value="error_rate">Error Rate (%)</option>
                  <option value="p99_latency">P99 Latency (ms)</option>
                  <option value="uptime">Uptime (%)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Condition</label>
                <div className="flex gap-2 items-center">
                  <span className="text-zinc-500">Greater than</span>
                  <input 
                    type="number" 
                    value={newRule.threshold}
                    onChange={e => setNewRule({...newRule, threshold: Number(e.target.value)})}
                    className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Evaluation Window (mins)</label>
                <input 
                  type="number" 
                  value={newRule.window_minutes}
                  onChange={e => setNewRule({...newRule, window_minutes: Number(e.target.value)})}
                  className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cooldown (mins)</label>
                <input 
                  type="number" 
                  value={newRule.cooldown_minutes}
                  onChange={e => setNewRule({...newRule, cooldown_minutes: Number(e.target.value)})}
                  className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-zinc-800 pt-4 mt-4">
              <label className="text-sm font-medium">Action / Destination</label>
              <select 
                value={newRule.route_type}
                onChange={e => setNewRule({...newRule, route_type: e.target.value})}
                className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm"
              >
                <option value="dashboard">Dashboard (Silently Log)</option>
                <option value="status_page">Automated Status Page Incident</option>
                <option value="webhook">Custom Webhook</option>
              </select>
            </div>

            {newRule.route_type === 'webhook' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Webhook URL</label>
                <input 
                  type="text" 
                  value={newRule.route_target}
                  onChange={e => setNewRule({...newRule, route_target: e.target.value})}
                  className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
                />
              </div>
            )}

            {newRule.route_type === 'status_page' && (
              <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-orange-200">Affected Component (Optional)</label>
                    <select 
                      value={targetConfig.componentId}
                      onChange={e => setTargetConfig({...targetConfig, componentId: e.target.value})}
                      className="w-full rounded-md border border-orange-500/30 bg-black px-3 py-2 text-sm"
                    >
                      <option value="">-- None --</option>
                      {components.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-orange-200">Severity</label>
                    <select 
                      value={targetConfig.severity}
                      onChange={e => setTargetConfig({...targetConfig, severity: e.target.value})}
                      className="w-full rounded-md border border-orange-500/30 bg-black px-3 py-2 text-sm"
                    >
                      <option value="degraded">Degraded</option>
                      <option value="major">Major Outage</option>
                      <option value="critical">Critical Outage</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input 
                    type="checkbox" 
                    id="autoResolve"
                    checked={newRule.auto_resolve}
                    onChange={e => setNewRule({...newRule, auto_resolve: e.target.checked})}
                    className="h-4 w-4 rounded border-zinc-700 bg-black text-indigo-500 focus:ring-indigo-500 focus:ring-offset-black"
                  />
                  <div className="space-y-1 leading-none">
                    <label htmlFor="autoResolve" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-orange-100">
                      Auto-Resolve Incident
                    </label>
                    <p className="text-xs text-orange-200/60">If checked, the incident will automatically resolve when the metric returns to normal.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || !newRule.name}
                className="flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Rule
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {rules.length === 0 && !isCreating ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg">
            <Bell className="h-10 w-10 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white">No Alert Rules</h3>
            <p className="text-zinc-400 mt-1 mb-4">You haven't set up any automated alerts yet.</p>
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Create your first rule
            </button>
          </div>
        ) : (
          rules.map(rule => (
            <Card key={rule.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{rule.name}</h3>
                    {!rule.enabled && <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-400">Disabled</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Triggers when <strong className="text-zinc-300">{rule.event_type}</strong> is &gt; <strong className="text-zinc-300">{rule.threshold}</strong> over {rule.window_minutes} mins.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <span className="inline-flex items-center rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
                      Destination: {rule.route_type}
                    </span>
                    {rule.route_type === 'status_page' && rule.auto_resolve && (
                      <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 ring-1 ring-inset ring-green-500/20">
                        Auto-Resolve Enabled
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-2 text-zinc-500 hover:text-red-400 rounded-md hover:bg-zinc-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
