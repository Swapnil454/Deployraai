// "use client";

// import { useState, useEffect, useRef } from "react";
// import { useParams } from "next/navigation";
// import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Plus, Trash2, Loader2, Target, Clock, Activity } from "lucide-react";
// import { toast } from "sonner";
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
// import { Progress } from "@/components/ui/progress";
// import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

// export default function SLODashboard() {
//   const params = useParams();
//   const projectId = params?.projectId;
//   const [slos, setSlos] = useState<any[]>([]);
//   const [statuses, setStatuses] = useState<Record<string, any>>({});
//   const [project, setProject] = useState<any>(null);
//   const [loading, setLoading] = useState(true);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const createRequestInFlight = useRef(false);

//   const [isCreating, setIsCreating] = useState(false);
//   const [newSlo, setNewSlo] = useState({
//     name: "",
//     type: "uptime",
//     target_percentage: "99.9",
//     window_days: "30",
//     metric_source: "synthetic_checks",
//     latency_threshold_ms: ""
//   });

//   useEffect(() => {
//     if (!projectId) return;
//     fetchSLOs();
//   }, [projectId]);

//   async function fetchSLOs() {
//     try {
//       setLoading(true);
//       const [slosRes, projectRes] = await Promise.all([
//         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/slos`, { credentials: "include" }),
//         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" })
//       ]);

//       if (!slosRes.ok) throw new Error("Failed to load");
//       const data = await slosRes.json();
//       setSlos(data);
//       if (projectRes.ok) setProject(await projectRes.json());

//       // Fetch statuses for each SLO
//       data.forEach((slo: any) => fetchSLOStatus(slo.id));
//     } catch (err) {
//       toast.error("Failed to load SLOs");
//     } finally {
//       setLoading(false);
//     }
//   }

//   async function fetchSLOStatus(sloId: string) {
//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/slos/${sloId}/status`, {
//         credentials: "include"
//       });
//       if (res.ok) {
//         const data = await res.json();
//         setStatuses(prev => ({ ...prev, [sloId]: data }));
//       }
//     } catch (err) {
//       console.error(err);
//     }
//   }

//   async function handleCreateSLO(e: React.FormEvent) {
//     e.preventDefault();
//     if (createRequestInFlight.current) return;
//     createRequestInFlight.current = true;
//     try {
//       setIsSubmitting(true);
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/slos`, {
//         method: "POST",
//         credentials: "include",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           ...newSlo,
//           target_percentage: parseFloat(newSlo.target_percentage),
//           window_days: parseInt(newSlo.window_days),
//           latency_threshold_ms: newSlo.latency_threshold_ms ? parseInt(newSlo.latency_threshold_ms) : null
//         })
//       });
//       const result = await res.json().catch(() => ({}));
//       if (!res.ok) throw new Error(result.error || "Failed to create SLO");

//       toast.success("SLO created successfully");
//       setIsCreating(false);
//       setNewSlo({
//         name: "",
//         type: "uptime",
//         target_percentage: "99.9",
//         window_days: "30",
//         metric_source: "synthetic_checks",
//         latency_threshold_ms: ""
//       });
//       fetchSLOs();
//     } catch (err) {
//       toast.error(err instanceof Error ? err.message : "Failed to create SLO");
//     } finally {
//       createRequestInFlight.current = false;
//       setIsSubmitting(false);
//     }
//   }

//   async function handleDeleteSLO(sloId: string) {
//     if (!confirm("Are you sure you want to delete this SLO?")) return;
//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/slos/${sloId}`, {
//         method: "DELETE",
//         credentials: "include"
//       });
//       if (!res.ok) throw new Error("Failed to delete");
//       toast.success("SLO deleted");
//       setSlos(slos.filter(s => s.id !== sloId));
//     } catch (err) {
//       toast.error("Failed to delete SLO");
//     }
//   }

//   if (loading) {
//     return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin inline mr-2"/>Loading SLOs...</div>;
//   }

//   if (project && !project.analytics?.verified) {
//     return (
//       <div className="space-y-6 max-w-5xl mx-auto pt-8">
//         <ObservabilitySetup project={project} onVerified={fetchSLOs} />
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-6 max-w-5xl mx-auto">
//       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-zinc-800/60 pb-5">
//         <div>
//           <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3"><Target className="h-6 w-6 text-blue-400" />Service Level Objectives</h1>
//           <p className="text-sm text-zinc-400 mt-1 ml-9">Track reliability targets and error budgets.</p>
//         </div>

//         <Dialog open={isCreating} onOpenChange={setIsCreating}>
//           <DialogTrigger asChild>
//             <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-sm font-medium text-zinc-300 transition-colors"><Plus className="h-4 w-4" />New SLO</button>
//           </DialogTrigger>
//           <DialogContent className="max-w-md bg-zinc-950 border border-zinc-800/60 text-zinc-200">
//             <DialogHeader>
//               <DialogTitle className="text-white">Create New SLO</DialogTitle>
//             </DialogHeader>
//             <form onSubmit={handleCreateSLO} className="space-y-4 pt-4">
//               <div className="space-y-2">
//                 <Label className="text-zinc-400">SLO Name</Label>
//                 <Input 
//                   required 
//                   placeholder="e.g., API Uptime" 
//                   value={newSlo.name} 
//                   onChange={e => setNewSlo({...newSlo, name: e.target.value})} className="bg-zinc-900/50 border-zinc-800/60 text-sm text-zinc-200 placeholder:text-zinc-500 h-9 rounded-lg focus-visible:ring-1 focus-visible:ring-zinc-700"
//                 />
//               </div>
//               <div className="space-y-2">
//                 <Label className="text-zinc-400">Metric Type</Label>
//                 <Select value={newSlo.type} onValueChange={(val: string) => setNewSlo({...newSlo, type: val})}>
//                   <SelectTrigger className="bg-zinc-900/50 border-zinc-800/60 text-zinc-200 h-9 rounded-lg"><SelectValue/></SelectTrigger>
//                   <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
//                     <SelectItem value="uptime">Uptime</SelectItem>
//                     <SelectItem value="success_rate">Success Rate</SelectItem>
//                     <SelectItem value="latency">Latency (Coming Soon)</SelectItem>
//                   </SelectContent>
//                 </Select>
//               </div>
//               <div className="grid grid-cols-2 gap-4">
//                 <div className="space-y-2">
//                   <Label className="text-zinc-400">Target (%)</Label>
//                   <Input 
//                     required 
//                     type="number" 
//                     step="0.01" 
//                     min="1" 
//                     max="100" 
//                     value={newSlo.target_percentage} 
//                     onChange={e => setNewSlo({...newSlo, target_percentage: e.target.value})} className="bg-zinc-900/50 border-zinc-800/60 text-sm text-zinc-200 h-9 rounded-lg focus-visible:ring-1 focus-visible:ring-zinc-700"
//                   />
//                 </div>
//                 <div className="space-y-2">
//                   <Label className="text-zinc-400">Window (Days)</Label>
//                   <Input 
//                     required 
//                     type="number" 
//                     min="1" 
//                     value={newSlo.window_days} 
//                     onChange={e => setNewSlo({...newSlo, window_days: e.target.value})} className="bg-zinc-900/50 border-zinc-800/60 text-sm text-zinc-200 h-9 rounded-lg focus-visible:ring-1 focus-visible:ring-zinc-700"
//                   />
//                 </div>
//               </div>
//               <div className="space-y-2">
//                 <Label className="text-zinc-400">Data Source</Label>
//                 <Select value={newSlo.metric_source} onValueChange={(val: string) => setNewSlo({...newSlo, metric_source: val})}>
//                   <SelectTrigger className="bg-zinc-900/50 border-zinc-800/60 text-zinc-200 h-9 rounded-lg"><SelectValue/></SelectTrigger>
//                   <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
//                     <SelectItem value="synthetic_checks">Synthetic Checks (External)</SelectItem>
//                     <SelectItem value="metrics_minutely">Telemetry Metrics (Internal)</SelectItem>
//                   </SelectContent>
//                 </Select>
//               </div>
//               <button type="submit" disabled={isSubmitting} className="w-full h-9 rounded-lg bg-blue-500/60 hover:bg-blue-500/80 border border-blue-500/20 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Creating SLO..." : "Create SLO"}</button>
//             </form>
//           </DialogContent>
//         </Dialog>
//       </div>

//       {slos.length === 0 ? (
//         <Card className="text-center p-12 bg-muted/50 border-dashed">
//           <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
//           <h3 className="text-lg font-semibold">No SLOs configured</h3>
//           <p className="text-muted-foreground mb-4">Define your reliability targets to track error budgets.</p>
//           <Button onClick={() => setIsCreating(true)} variant="outline">Create your first SLO</Button>
//         </Card>
//       ) : (
//         <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
//           {slos.map(slo => {
//             const status = statuses[slo.id];

//             return (
//               <Card key={slo.id} className="overflow-hidden rounded-xl border-zinc-800/60 bg-zinc-900/40 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/60">
//                 <CardHeader className="border-b border-zinc-800/60 p-5 pb-4">
//                   <div className="flex justify-between items-start">
//                     <div>
//                       <CardTitle className="text-lg text-white">{slo.name}</CardTitle>
//                       <CardDescription className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-zinc-500">
//                         <span className="flex items-center gap-1.5"><Target className="w-3 h-3" />{slo.target_percentage}% target</span>
//                         <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" />{slo.window_days}-day window</span>
//                       </CardDescription>
//                     </div>
//                     <Button variant="ghost" size="icon" onClick={() => handleDeleteSLO(slo.id)} className="-mr-2 -mt-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400">
//                       <Trash2 className="w-4 h-4" />
//                     </Button>
//                   </div>
//                 </CardHeader>
//                 <CardContent className="p-5">
//                   {status ? (
//                     <div className="space-y-5">
//                       <div>
//                         <div className="mb-2 flex justify-between text-sm font-medium">
//                           <span className="text-zinc-400">Error budget remaining</span>
//                           <span className={status.budgetRemainingPercentage > 0 ? "text-emerald-400" : "text-red-400"}>
//                             {Math.max(0, status.budgetRemainingPercentage).toFixed(1)}%
//                           </span>
//                         </div>
//                         <Progress 
//                           value={Math.max(0, status.budgetRemainingPercentage)} 
//                           className="h-1.5 bg-zinc-800"
//                           indicatorClassName={
//                             status.budgetRemainingPercentage > 50 ? "bg-emerald-500" : 
//                             status.budgetRemainingPercentage > 0 ? "bg-amber-500" : "bg-red-500"
//                           }
//                         />
//                       </div>

//                       <div className="grid grid-cols-2 gap-4 border-t border-zinc-800/60 pt-4">
//                         <div>
//                           <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Burn rate</p>
//                           <p className={`font-mono text-lg font-semibold text-zinc-100 ${status.burnRate > 1 ? 'text-red-400' : status.burnRate > 0.8 ? 'text-amber-400' : ''}`}>
//                             {status.burnRate.toFixed(1)}x
//                           </p>
//                         </div>
//                         <div>
//                           <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Budget exhaustion</p>
//                           <p className="text-lg font-semibold text-zinc-100">
//                             {status.budgetExhaustionDays ? `~${status.budgetExhaustionDays} days` : 'Healthy'}
//                           </p>
//                         </div>
//                       </div>
//                       <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3 text-sm">
//                         <div>
//                           <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Allowed error</p>
//                           <p className="font-semibold text-zinc-200">{status.allowedDowntimeMinutes.toFixed(1)} min</p>
//                         </div>
//                         <div>
//                           <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Used error</p>
//                           <p className="font-semibold text-zinc-200">{status.usedDowntimeMinutes.toFixed(1)} min</p>
//                         </div>
//                       </div>
//                       <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
//                          <span className="whitespace-nowrap">Actual success: <span className="font-medium text-zinc-300">{status.actualSuccessPercentage.toFixed(3)}%</span></span>
//                          <span className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-zinc-400">
//                            <Activity className="w-3 h-3" />
//                            {slo.metric_source === 'synthetic_checks' ? 'External Pings' : 'Internal Telemetry'}
//                          </span>
//                       </div>
//                     </div>
//                   ) : (
//                     <div className="py-8 text-center text-sm text-zinc-500">
//                       <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/> Calculating budget...
//                     </div>
//                   )}
//                 </CardContent>
//               </Card>
//             );
//           })}
//         </div>
//       )}
//     </div>
//   );
// }

"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Target, Clock, Activity } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

export default function SLODashboard() {
  const params = useParams();
  const projectId = params?.projectId;
  const [slos, setSlos] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createRequestInFlight = useRef(false);

  const [isCreating, setIsCreating] = useState(false);
  const [newSlo, setNewSlo] = useState({
    name: "",
    type: "uptime",
    target_percentage: "99.9",
    window_days: "30",
    metric_source: "synthetic_checks",
    latency_threshold_ms: ""
  });

  useEffect(() => {
    if (!projectId) return;
    fetchSLOs();
  }, [projectId]);

  async function fetchSLOs() {
    try {
      setLoading(true);
      const [slosRes, projectRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/slos`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" })
      ]);

      if (!slosRes.ok) throw new Error("Failed to load");
      const data = await slosRes.json();
      setSlos(data);
      if (projectRes.ok) setProject(await projectRes.json());

      // Fetch statuses for each SLO
      data.forEach((slo: any) => fetchSLOStatus(slo.id));
    } catch (err) {
      toast.error("Failed to load SLOs");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSLOStatus(sloId: string) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/slos/${sloId}/status`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setStatuses(prev => ({ ...prev, [sloId]: data }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateSLO(e: React.FormEvent) {
    e.preventDefault();
    if (createRequestInFlight.current) return;
    createRequestInFlight.current = true;
    try {
      setIsSubmitting(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/slos`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newSlo,
          target_percentage: parseFloat(newSlo.target_percentage),
          window_days: parseInt(newSlo.window_days),
          latency_threshold_ms: newSlo.latency_threshold_ms ? parseInt(newSlo.latency_threshold_ms) : null
        })
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to create SLO");

      toast.success("SLO created successfully");
      setIsCreating(false);
      setNewSlo({
        name: "",
        type: "uptime",
        target_percentage: "99.9",
        window_days: "30",
        metric_source: "synthetic_checks",
        latency_threshold_ms: ""
      });
      fetchSLOs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create SLO");
    } finally {
      createRequestInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleDeleteSLO(sloId: string) {
    if (!confirm("Are you sure you want to delete this SLO?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/slos/${sloId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("SLO deleted");
      setSlos(slos.filter(s => s.id !== sloId));
    } catch (err) {
      toast.error("Failed to delete SLO");
    }
  }

  if (loading) {
    return (
      <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0 font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-900/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 p-6 pt-6 w-full flex-1">
          <div className="max-w-5xl w-full mx-auto space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-full h-24 rounded-xl border border-zinc-800/60 bg-zinc-900/40 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (project && !project.analytics?.verified) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#050505] text-zinc-200 pb-20 font-sans p-6 pt-12">
        <ObservabilitySetup project={project} onVerified={fetchSLOs} />
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0 font-sans">
      {/* Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 p-6 pt-6 w-full flex-1">
        <div className="max-w-5xl w-full mx-auto">

          {/* HEADER & CONTROLS */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-zinc-800/60 pb-5">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <Target className="h-9 w-9 text-white mt-3" />
                Service Level Objectives
              </h1>
              <p className="text-sm text-zinc-400 mt-1 ml-12">Track reliability targets and error budgets.</p>
            </div>

            <Dialog open={isCreating} onOpenChange={setIsCreating}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-sm font-medium text-zinc-300 transition-colors">
                  <Plus className="h-4 w-4" />
                  New SLO
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-zinc-950 border border-zinc-800/60 text-zinc-200">
                <DialogHeader>
                  <DialogTitle className="text-white">Create New SLO</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateSLO} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">SLO Name</Label>
                    <Input
                      required
                      placeholder="e.g., API Uptime"
                      value={newSlo.name}
                      onChange={e => setNewSlo({ ...newSlo, name: e.target.value })}
                      className="bg-zinc-900/50 border-zinc-800/60 text-sm text-zinc-200 placeholder:text-zinc-500 h-9 rounded-lg focus-visible:ring-1 focus-visible:ring-zinc-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Metric Type</Label>
                    <Select value={newSlo.type} onValueChange={(val: string) => setNewSlo({ ...newSlo, type: val })}>
                      <SelectTrigger className="bg-zinc-900/50 border-zinc-800/60 text-zinc-200 h-9 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                        <SelectItem value="uptime">Uptime</SelectItem>
                        <SelectItem value="success_rate">Success Rate</SelectItem>
                        <SelectItem value="latency">Latency (Coming Soon)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Target (%)</Label>
                      <Input
                        required
                        type="number"
                        step="0.01"
                        min="1"
                        max="100"
                        value={newSlo.target_percentage}
                        onChange={e => setNewSlo({ ...newSlo, target_percentage: e.target.value })}
                        className="bg-zinc-900/50 border-zinc-800/60 text-sm text-zinc-200 h-9 rounded-lg focus-visible:ring-1 focus-visible:ring-zinc-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Window (Days)</Label>
                      <Input
                        required
                        type="number"
                        min="1"
                        value={newSlo.window_days}
                        onChange={e => setNewSlo({ ...newSlo, window_days: e.target.value })}
                        className="bg-zinc-900/50 border-zinc-800/60 text-sm text-zinc-200 h-9 rounded-lg focus-visible:ring-1 focus-visible:ring-zinc-700"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Data Source</Label>
                    <Select value={newSlo.metric_source} onValueChange={(val: string) => setNewSlo({ ...newSlo, metric_source: val })}>
                      <SelectTrigger className="bg-zinc-900/50 border-zinc-800/60 text-zinc-200 h-9 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                        <SelectItem value="synthetic_checks">Synthetic Checks (External)</SelectItem>
                        <SelectItem value="metrics_minutely">Telemetry Metrics (Internal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-9 rounded-lg bg-blue-500/60 hover:bg-blue-500/80 border border-blue-500/20 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Creating SLO..." : "Create SLO"}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {slos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border border-zinc-800/60 border-dashed rounded-xl bg-zinc-900/20">
              <Target className="h-10 w-10 text-zinc-600 mb-4" />
              <p className="text-zinc-400 font-medium text-lg">No SLOs configured</p>
              <p className="text-sm text-zinc-500 mt-1 mb-4">Define your reliability targets to track error budgets.</p>
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-sm font-medium text-zinc-300 transition-colors"
              >
                Create your first SLO
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {slos.map(slo => {
                const status = statuses[slo.id];

                return (
                  <div
                    key={slo.id}
                    className="w-full rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-200"
                  >
                    <div className="p-5 pb-4 border-b border-zinc-800/60 flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg text-white">{slo.name}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 font-medium">
                          <span className="flex items-center gap-1.5">
                            <Target className="w-3 h-3" /> {slo.target_percentage}% target
                          </span>
                          <span className="text-zinc-700">•</span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" /> {slo.window_days}-day window
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSLO(slo.id)}
                        className="-mr-2 -mt-1 p-2 rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5">
                      {status ? (
                        <div className="space-y-5">
                          <div>
                            <div className="mb-2 flex justify-between text-sm font-medium">
                              <span className="text-zinc-400">Error budget remaining</span>
                              <span className={status.budgetRemainingPercentage > 0 ? "text-emerald-400" : "text-red-400"}>
                                {Math.max(0, status.budgetRemainingPercentage).toFixed(1)}%
                              </span>
                            </div>
                            <Progress
                              value={Math.max(0, status.budgetRemainingPercentage)}
                              className="h-1.5 bg-zinc-800"
                              indicatorClassName={
                                status.budgetRemainingPercentage > 50 ? "bg-emerald-500" :
                                  status.budgetRemainingPercentage > 0 ? "bg-amber-500" : "bg-red-500"
                              }
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4 border-t border-zinc-800/60 pt-4">
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Burn rate</p>
                              <p className={`font-mono text-lg font-semibold text-zinc-100 ${status.burnRate > 1 ? 'text-red-400' : status.burnRate > 0.8 ? 'text-amber-400' : ''}`}>
                                {status.burnRate.toFixed(1)}x
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Budget exhaustion</p>
                              <p className="text-lg font-semibold text-zinc-100">
                                {status.budgetExhaustionDays ? `~${status.budgetExhaustionDays} days` : 'Healthy'}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3 text-sm">
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Allowed error</p>
                              <p className="font-semibold text-zinc-200">{status.allowedDowntimeMinutes.toFixed(1)} min</p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Used error</p>
                              <p className="font-semibold text-zinc-200">{status.usedDowntimeMinutes.toFixed(1)} min</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                            <span className="whitespace-nowrap">Actual success: <span className="font-medium text-zinc-300">{status.actualSuccessPercentage.toFixed(3)}%</span></span>
                            <span className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-zinc-400">
                              <Activity className="w-3 h-3" />
                              {slo.metric_source === 'synthetic_checks' ? 'External Pings' : 'Internal Telemetry'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-sm text-zinc-500">
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Calculating budget...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}