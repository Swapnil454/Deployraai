// "use client";

// import { useState, useEffect } from "react";
// import { useParams, useRouter } from "next/navigation";
// import { Plus, Loader2, Save, Trash2, ArrowLeft, Bell, Settings } from "lucide-react";
// import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// export default function AlertRulesPage() {
//   const params = useParams();
//   const router = useRouter();
//   const projectId = params?.projectId;

//   const [rules, setRules] = useState<any[]>([]);
//   const [components, setComponents] = useState<any[]>([]);
//   const [loading, setLoading] = useState(true);
  
//   const [isCreating, setIsCreating] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [newRule, setNewRule] = useState<any>({
//     name: "",
//     event_type: "error_rate",
//     operator: "gt",
//     threshold: 5,
//     window_minutes: 5,
//     cooldown_minutes: 15,
//     route_type: "dashboard",
//     route_target: "",
//     auto_resolve: true
//   });
  
//   const [targetConfig, setTargetConfig] = useState<any>({
//     componentId: "",
//     severity: "degraded"
//   });

//   useEffect(() => {
//     if (!projectId) return;
//     fetchRules();
//     fetchComponents();
//   }, [projectId]);

//   async function fetchRules() {
//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules`, { credentials: "include" });
//       if (res.ok) setRules(await res.json());
//     } catch (err) {
//       console.error(err);
//     } finally {
//       setLoading(false);
//     }
//   }

//   async function fetchComponents() {
//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, { credentials: "include" });
//       if (res.ok) setComponents(await res.json());
//     } catch (err) {
//       console.error(err);
//     }
//   }

//   const handleSave = async () => {
//     try {
//       setSaving(true);
      
//       let payload = { ...newRule };
//       if (payload.route_type === 'status_page') {
//         payload.route_target = JSON.stringify(targetConfig);
//       }
      
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         credentials: "include",
//         body: JSON.stringify(payload)
//       });
      
//       if (res.ok) {
//         setIsCreating(false);
//         fetchRules();
//         setNewRule({
//           name: "", event_type: "error_rate", operator: "gt", threshold: 5, 
//           window_minutes: 5, cooldown_minutes: 15, route_type: "dashboard", 
//           route_target: "", auto_resolve: true
//         });
//       }
//     } catch (err) {
//       console.error(err);
//     } finally {
//       setSaving(false);
//     }
//   };

//   const handleDelete = async (ruleId: string) => {
//     if (!confirm("Are you sure you want to delete this rule?")) return;
//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules/${ruleId}`, {
//         method: "DELETE",
//         credentials: "include"
//       });
//       if (res.ok) fetchRules();
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;

//   return (
//     <div className="max-w-5xl mx-auto space-y-6">
//       <div className="flex items-center gap-4 mb-6">
//         <button 
//           onClick={() => router.push('/dashboard/alerts')}
//           className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-white"
//         >
//           <ArrowLeft className="h-5 w-5" />
//         </button>
//         <div>
//           <h1 className="text-2xl font-bold tracking-tight text-white">Alert Rules</h1>
//           <p className="text-muted-foreground">Configure automated alerts and status page incident rules based on telemetry data.</p>
//         </div>
//         <button
//           onClick={() => setIsCreating(!isCreating)}
//           className="ml-auto flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
//         >
//           {isCreating ? "Cancel" : <><Plus className="h-4 w-4" /> New Rule</>}
//         </button>
//       </div>

//       {isCreating && (
//         <Card className="border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
//           <CardHeader>
//             <CardTitle>Create Alert Rule</CardTitle>
//           </CardHeader>
//           <CardContent className="space-y-4">
//             <div className="grid grid-cols-2 gap-4">
//               <div className="space-y-2">
//                 <label className="text-sm font-medium">Rule Name</label>
//                 <input 
//                   type="text" 
//                   placeholder="e.g. High Error Rate Spike" 
//                   value={newRule.name}
//                   onChange={e => setNewRule({...newRule, name: e.target.value})}
//                   className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
//                 />
//               </div>
//               <div className="space-y-2">
//                 <label className="text-sm font-medium">Metric</label>
//                 <select 
//                   value={newRule.event_type}
//                   onChange={e => setNewRule({...newRule, event_type: e.target.value})}
//                   className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm"
//                 >
//                   <option value="error_rate">Error Rate (%)</option>
//                   <option value="p99_latency">P99 Latency (ms)</option>
//                   <option value="uptime">Uptime (%)</option>
//                 </select>
//               </div>
//             </div>

//             <div className="grid grid-cols-3 gap-4">
//               <div className="space-y-2">
//                 <label className="text-sm font-medium">Condition</label>
//                 <div className="flex gap-2 items-center">
//                   <span className="text-zinc-500">Greater than</span>
//                   <input 
//                     type="number" 
//                     value={newRule.threshold}
//                     onChange={e => setNewRule({...newRule, threshold: Number(e.target.value)})}
//                     className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
//                   />
//                 </div>
//               </div>
//               <div className="space-y-2">
//                 <label className="text-sm font-medium">Evaluation Window (mins)</label>
//                 <input 
//                   type="number" 
//                   value={newRule.window_minutes}
//                   onChange={e => setNewRule({...newRule, window_minutes: Number(e.target.value)})}
//                   className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
//                 />
//               </div>
//               <div className="space-y-2">
//                 <label className="text-sm font-medium">Cooldown (mins)</label>
//                 <input 
//                   type="number" 
//                   value={newRule.cooldown_minutes}
//                   onChange={e => setNewRule({...newRule, cooldown_minutes: Number(e.target.value)})}
//                   className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
//                 />
//               </div>
//             </div>

//             <div className="space-y-2 border-t border-zinc-800 pt-4 mt-4">
//               <label className="text-sm font-medium">Action / Destination</label>
//               <select 
//                 value={newRule.route_type}
//                 onChange={e => setNewRule({...newRule, route_type: e.target.value})}
//                 className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm"
//               >
//                 <option value="dashboard">Dashboard (Silently Log)</option>
//                 <option value="status_page">Automated Status Page Incident</option>
//                 <option value="webhook">Custom Webhook</option>
//               </select>
//             </div>

//             {newRule.route_type === 'webhook' && (
//               <div className="space-y-2">
//                 <label className="text-sm font-medium">Webhook URL</label>
//                 <input 
//                   type="text" 
//                   value={newRule.route_target}
//                   onChange={e => setNewRule({...newRule, route_target: e.target.value})}
//                   className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm" 
//                 />
//               </div>
//             )}

//             {newRule.route_type === 'status_page' && (
//               <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-4">
//                 <div className="grid grid-cols-2 gap-4">
//                   <div className="space-y-2">
//                     <label className="text-sm font-medium text-orange-200">Affected Component (Optional)</label>
//                     <select 
//                       value={targetConfig.componentId}
//                       onChange={e => setTargetConfig({...targetConfig, componentId: e.target.value})}
//                       className="w-full rounded-md border border-orange-500/30 bg-black px-3 py-2 text-sm"
//                     >
//                       <option value="">-- None --</option>
//                       {components.map(c => (
//                         <option key={c.id} value={c.id}>{c.name}</option>
//                       ))}
//                     </select>
//                   </div>
//                   <div className="space-y-2">
//                     <label className="text-sm font-medium text-orange-200">Severity</label>
//                     <select 
//                       value={targetConfig.severity}
//                       onChange={e => setTargetConfig({...targetConfig, severity: e.target.value})}
//                       className="w-full rounded-md border border-orange-500/30 bg-black px-3 py-2 text-sm"
//                     >
//                       <option value="degraded">Degraded</option>
//                       <option value="major">Major Outage</option>
//                       <option value="critical">Critical Outage</option>
//                     </select>
//                   </div>
//                 </div>

//                 <div className="flex items-center gap-3 pt-2">
//                   <input 
//                     type="checkbox" 
//                     id="autoResolve"
//                     checked={newRule.auto_resolve}
//                     onChange={e => setNewRule({...newRule, auto_resolve: e.target.checked})}
//                     className="h-4 w-4 rounded border-zinc-700 bg-black text-indigo-500 focus:ring-indigo-500 focus:ring-offset-black"
//                   />
//                   <div className="space-y-1 leading-none">
//                     <label htmlFor="autoResolve" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-orange-100">
//                       Auto-Resolve Incident
//                     </label>
//                     <p className="text-xs text-orange-200/60">If checked, the incident will automatically resolve when the metric returns to normal.</p>
//                   </div>
//                 </div>
//               </div>
//             )}

//             <div className="pt-4 flex justify-end">
//               <button
//                 onClick={handleSave}
//                 disabled={saving || !newRule.name}
//                 className="flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
//               >
//                 {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
//                 Save Rule
//               </button>
//             </div>
//           </CardContent>
//         </Card>
//       )}

//       <div className="space-y-4">
//         {rules.length === 0 && !isCreating ? (
//           <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg">
//             <Bell className="h-10 w-10 text-zinc-600 mx-auto mb-4" />
//             <h3 className="text-lg font-medium text-white">No Alert Rules</h3>
//             <p className="text-zinc-400 mt-1 mb-4">You haven't set up any automated alerts yet.</p>
//             <button
//               onClick={() => setIsCreating(true)}
//               className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
//             >
//               Create your first rule
//             </button>
//           </div>
//         ) : (
//           rules.map(rule => (
//             <Card key={rule.id}>
//               <CardContent className="p-4 flex items-center justify-between">
//                 <div>
//                   <div className="flex items-center gap-2">
//                     <h3 className="font-semibold text-lg">{rule.name}</h3>
//                     {!rule.enabled && <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-400">Disabled</span>}
//                   </div>
//                   <p className="text-sm text-muted-foreground mt-1">
//                     Triggers when <strong className="text-zinc-300">{rule.event_type}</strong> is &gt; <strong className="text-zinc-300">{rule.threshold}</strong> over {rule.window_minutes} mins.
//                   </p>
//                   <div className="flex gap-2 mt-2">
//                     <span className="inline-flex items-center rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
//                       Destination: {rule.route_type}
//                     </span>
//                     {rule.route_type === 'status_page' && rule.auto_resolve && (
//                       <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 ring-1 ring-inset ring-green-500/20">
//                         Auto-Resolve Enabled
//                       </span>
//                     )}
//                   </div>
//                 </div>
//                 <button
//                   onClick={() => handleDelete(rule.id)}
//                   className="p-2 text-zinc-500 hover:text-red-400 rounded-md hover:bg-zinc-800"
//                 >
//                   <Trash2 className="h-4 w-4" />
//                 </button>
//               </CardContent>
//             </Card>
//           ))
//         )}
//       </div>
//     </div>
//   );
// }




"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Loader2, Save, Trash2, ArrowLeft, Bell, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CustomSelect } from "@/components/ui/CustomSelect";

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

  return (
    <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0 font-sans">
      {/* Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 p-6 pt-6 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">

          {/* HEADER & CONTROLS */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-zinc-800/60 pb-5">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                  <Bell className="h-8 w-8 text-white" />
                  Alert Rules
                </h1>
                <p className="text-sm text-zinc-400 mt-1 ml-11">Configure automated alerts and status page incident rules based on telemetry data.</p>
              </div>
            </div>

            <button
              onClick={() => setIsCreating(!isCreating)}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-colors"
            >
              {isCreating ? "Cancel" : <><Plus className="h-4 w-4" /> New Rule</>}
            </button>
          </div>

          {/* {isCreating && (
            <div className="mb-6 rounded-xl border border-indigo-500/30 bg-zinc-900/40 backdrop-blur-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden">
              <div className="p-5 border-b border-zinc-800/60">
                <h2 className="font-semibold text-lg text-white">Create Alert Rule</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Rule Name</label>
                    <input
                      type="text"
                      placeholder="e.g. High Error Rate Spike"
                      value={newRule.name}
                      onChange={e => setNewRule({...newRule, name: e.target.value})}
                      className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Metric</label>
                    <select
                      value={newRule.event_type}
                      onChange={e => setNewRule({...newRule, event_type: e.target.value})}
                      className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                    >
                      <option value="error_rate">Error Rate (%)</option>
                      <option value="p99_latency">P99 Latency (ms)</option>
                      <option value="uptime">Uptime (%)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Condition</label>
                    <div className="flex gap-2 items-center">
                      <span className="text-zinc-500 text-sm whitespace-nowrap">Greater than</span>
                      <input
                        type="number"
                        value={newRule.threshold}
                        onChange={e => setNewRule({...newRule, threshold: Number(e.target.value)})}
                        className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Evaluation Window (mins)</label>
                    <input
                      type="number"
                      value={newRule.window_minutes}
                      onChange={e => setNewRule({...newRule, window_minutes: Number(e.target.value)})}
                      className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Cooldown (mins)</label>
                    <input
                      type="number"
                      value={newRule.cooldown_minutes}
                      onChange={e => setNewRule({...newRule, cooldown_minutes: Number(e.target.value)})}
                      className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t border-zinc-800/60 pt-4 mt-4">
                  <label className="text-sm font-medium text-zinc-300">Action / Destination</label>
                  <select
                    value={newRule.route_type}
                    onChange={e => setNewRule({...newRule, route_type: e.target.value})}
                    className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                  >
                    <option value="dashboard">Dashboard (Silently Log)</option>
                    <option value="status_page">Automated Status Page Incident</option>
                    <option value="webhook">Custom Webhook</option>
                  </select>
                </div>

                {newRule.route_type === 'webhook' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Webhook URL</label>
                    <input
                      type="text"
                      value={newRule.route_target}
                      onChange={e => setNewRule({...newRule, route_target: e.target.value})}
                      className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
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
                          className="w-full rounded-lg border border-orange-500/30 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500/40"
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
                          className="w-full rounded-lg border border-orange-500/30 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500/40"
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
                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900/50 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-black"
                      />
                      <div className="space-y-1 leading-none">
                        <label htmlFor="autoResolve" className="text-sm font-medium leading-none text-orange-100">
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
                    className="flex items-center gap-2 h-9 px-6 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Rule
                  </button>
                </div>
              </div>
            </div>
          )} */}

          {isCreating && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
              onClick={() => setIsCreating(false)}
            >
              <div
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-indigo-500/30 bg-zinc-950/95 backdrop-blur-md shadow-[0_20px_60px_rgb(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-5 border-b border-zinc-800/60">
                  <div>
                    <h2 className="font-semibold text-lg text-white">Create Alert Rule</h2>
                    <p className="text-sm text-zinc-400 mt-0.5">Define a threshold and where the alert should go.</p>
                  </div>
                  <button
                    onClick={() => setIsCreating(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Rule Name</label>
                      <input
                        type="text"
                        placeholder="e.g. High Error Rate Spike"
                        value={newRule.name}
                        onChange={e => setNewRule({...newRule, name: e.target.value})}
                        className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Metric</label>
                      <CustomSelect
                        value={newRule.event_type}
                        onChange={(val: string) => setNewRule({...newRule, event_type: val})}
                        options={[
                          { value: "error_rate", label: "Error Rate (%)" },
                          { value: "p99_latency", label: "P99 Latency (ms)" },
                          { value: "uptime", label: "Uptime (%)" }
                        ]}
                        placeholder="Metric"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Condition</label>
                      <div className="flex gap-2 items-center">
                        <span className="text-zinc-500 text-sm whitespace-nowrap">Greater than</span>
                        <input
                          type="number"
                          value={newRule.threshold}
                          onChange={e => setNewRule({...newRule, threshold: Number(e.target.value)})}
                          className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Evaluation Window (mins)</label>
                      <input
                        type="number"
                        value={newRule.window_minutes}
                        onChange={e => setNewRule({...newRule, window_minutes: Number(e.target.value)})}
                        className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Cooldown (mins)</label>
                      <input
                        type="number"
                        value={newRule.cooldown_minutes}
                        onChange={e => setNewRule({...newRule, cooldown_minutes: Number(e.target.value)})}
                        className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-zinc-800/60 pt-5">
                    <label className="text-sm font-medium text-zinc-300">Action / Destination</label>
                    <CustomSelect
                      value={newRule.route_type}
                      onChange={(val: string) => setNewRule({...newRule, route_type: val})}
                      options={[
                        { value: "dashboard", label: "Dashboard (Silently Log)" },
                        { value: "status_page", label: "Automated Status Page Incident" },
                        { value: "webhook", label: "Custom Webhook" }
                      ]}
                      placeholder="Destination"
                    />
                  </div>

                  {newRule.route_type === 'webhook' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Webhook URL</label>
                      <input
                        type="text"
                        value={newRule.route_target}
                        onChange={e => setNewRule({...newRule, route_target: e.target.value})}
                        className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                      />
                    </div>
                  )}

                  {newRule.route_type === 'status_page' && (
                    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-200">Affected Component (Optional)</label>
                          <CustomSelect
                            value={targetConfig.componentId}
                            onChange={(val: string) => setTargetConfig({...targetConfig, componentId: val})}
                            options={[
                              { value: "", label: "-- None --" },
                              ...components.map(c => ({ value: c.id, label: c.name }))
                            ]}
                            placeholder="Component"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-200">Severity</label>
                          <CustomSelect
                            value={targetConfig.severity}
                            onChange={(val: string) => setTargetConfig({...targetConfig, severity: val})}
                            options={[
                              { value: "degraded", label: "Degraded" },
                              { value: "major", label: "Major Outage" },
                              { value: "critical", label: "Critical Outage" }
                            ]}
                            placeholder="Severity"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <input
                          type="checkbox"
                          id="autoResolve"
                          checked={newRule.auto_resolve}
                          onChange={e => setNewRule({...newRule, auto_resolve: e.target.checked})}
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900/50 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-black"
                        />
                        <div className="space-y-1 leading-none">
                          <label htmlFor="autoResolve" className="text-sm font-medium leading-none text-orange-100">
                            Auto-Resolve Incident
                          </label>
                          <p className="text-xs text-orange-200/60">If checked, the incident will automatically resolve when the metric returns to normal.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 p-5 border-t border-zinc-800/60">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-sm font-medium text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !newRule.name}
                    className="flex items-center gap-2 h-9 px-6 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Rule
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {loading ? (
              <div className="flex flex-col gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-full h-28 rounded-xl border border-zinc-800/60 bg-zinc-900/40 animate-pulse" />
                ))}
              </div>
            ) : rules.length === 0 && !isCreating ? (
              <div className="flex flex-col items-center justify-center py-24 border border-zinc-800/60 border-dashed rounded-xl bg-zinc-900/20">
                <Bell className="h-10 w-10 text-zinc-600 mb-4" />
                <p className="text-zinc-400 font-medium text-lg">No Alert Rules</p>
                <p className="text-sm text-zinc-500 mt-1 mb-4">You haven't set up any automated alerts yet.</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-sm font-medium text-zinc-300 transition-colors"
                >
                  Create your first rule
                </button>
              </div>
            ) : (
              rules.map(rule => (
                <div key={rule.id} className="w-full rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                  <div className="p-5 flex items-center justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-white truncate">{rule.name}</h3>
                        {!rule.enabled && <Badge variant="outline" className="bg-zinc-800/50 text-zinc-400 border-zinc-700">Disabled</Badge>}
                      </div>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        Triggers when <span className="text-zinc-300 font-medium">{rule.event_type}</span> is &gt; <span className="text-zinc-300 font-medium">{rule.threshold}</span> over {rule.window_minutes} mins.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                          Destination: {rule.route_type}
                        </Badge>
                        {rule.route_type === 'status_page' && rule.auto_resolve && (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            Auto-Resolve Enabled
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="shrink-0 p-2 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800/60 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}