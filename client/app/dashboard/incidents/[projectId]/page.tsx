// "use client";

// import { useState, useEffect } from "react";
// import { useParams, useRouter } from "next/navigation";
// import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Badge } from "@/components/ui/Badge";
// import { Plus, Loader2, AlertTriangle, AlertCircle, AlertOctagon, MessageSquare, Clock, ArrowRight, Server } from "lucide-react";
// import { toast } from "sonner";
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
// import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

// export default function IncidentsPage() {
//   const params = useParams();
//   const projectId = params?.projectId;
//   const router = useRouter();
//   const [incidents, setIncidents] = useState<any[]>([]);
//   const [components, setComponents] = useState<any[]>([]);
//   const [project, setProject] = useState<any>(null);
//   const [loading, setLoading] = useState(true);

//   const [isCreating, setIsCreating] = useState(false);
//   const [newIncident, setNewIncident] = useState({
//     title: "",
//     severity: "minor",
//     status: "investigating",
//     initial_message: "",
//     component_ids: [] as string[]
//   });

//   useEffect(() => {
//     if (!projectId) return;
//     fetchData();
//   }, [projectId]);

//   async function fetchData() {
//     try {
//       setLoading(true);
//       const [incRes, compRes, projectRes] = await Promise.all([
//         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents`, {
//           credentials: "include"
//         }),
//         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, {
//           credentials: "include"
//         }),
//         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" })
//       ]);

//       if (incRes.ok) setIncidents(await incRes.json());
//       if (compRes.ok) setComponents(await compRes.json());
//       if (projectRes.ok) setProject(await projectRes.json());
//     } catch (err) {
//       toast.error("Failed to load incidents");
//     } finally {
//       setLoading(false);
//     }
//   }

//   async function handleCreate(e: React.FormEvent) {
//     e.preventDefault();
//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents`, {
//         method: "POST",
//         credentials: "include",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(newIncident)
//       });
//       if (!res.ok) throw new Error("Failed to create");

//       const created = await res.json();
//       toast.success("Incident declared");
//       setIsCreating(false);
//       router.push(`/dashboard/incidents/${projectId}/${created.id}`);
//     } catch (err) {
//       toast.error("Failed to create incident");
//     }
//   }

//   function getSeverityIcon(severity: string) {
//     switch (severity) {
//       case "minor": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
//       case "major": return <AlertCircle className="w-4 h-4 text-orange-500" />;
//       case "critical": return <AlertOctagon className="w-4 h-4 text-red-500" />;
//       default: return <AlertTriangle className="w-4 h-4 text-slate-500" />;
//     }
//   }

//   function getStatusBadge(status: string) {
//     switch (status) {
//       case "investigating": return <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100">Investigating</Badge>;
//       case "identified": return <Badge variant="warning" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Identified</Badge>;
//       case "monitoring": return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Monitoring</Badge>;
//       case "resolved": return <Badge variant="success" className="bg-green-100 text-green-800 hover:bg-green-100">Resolved</Badge>;
//       default: return <Badge variant="outline">{status}</Badge>;
//     }
//   }

//   if (loading) {
//     return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin inline mr-2"/>Loading incidents...</div>;
//   }

//   if (project && !project.observability?.verified) {
//     return (
//       <div className="space-y-6 max-w-5xl mx-auto pt-8">
//         <ObservabilitySetup project={project} onVerified={fetchData} />
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-6 max-w-5xl mx-auto">
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
//           <p className="text-muted-foreground">Declare incidents and post updates to your status page.</p>
//         </div>

//         <Dialog open={isCreating} onOpenChange={setIsCreating}>
//           <DialogTrigger asChild>
//             <Button><Plus className="w-4 h-4 mr-2" /> Declare Incident</Button>
//           </DialogTrigger>
//           <DialogContent className="max-w-md">
//             <DialogHeader>
//               <DialogTitle>Declare New Incident</DialogTitle>
//             </DialogHeader>
//             <form onSubmit={handleCreate} className="space-y-4 pt-4">
//               <div className="space-y-2">
//                 <Label>Incident Title</Label>
//                 <Input 
//                   required 
//                   placeholder="e.g., API Outage" 
//                   value={newIncident.title} 
//                   onChange={e => setNewIncident({...newIncident, title: e.target.value})}
//                 />
//               </div>
//               <div className="grid grid-cols-2 gap-4">
//                 <div className="space-y-2">
//                   <Label>Severity</Label>
//                   <Select value={newIncident.severity} onValueChange={(val: string) => setNewIncident({...newIncident, severity: val})}>
//                     <SelectTrigger><SelectValue/></SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="minor">Minor</SelectItem>
//                       <SelectItem value="major">Major</SelectItem>
//                       <SelectItem value="critical">Critical</SelectItem>
//                     </SelectContent>
//                   </Select>
//                 </div>
//                 <div className="space-y-2">
//                   <Label>Initial Status</Label>
//                   <Select value={newIncident.status} onValueChange={(val: string) => setNewIncident({...newIncident, status: val})}>
//                     <SelectTrigger><SelectValue/></SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="investigating">Investigating</SelectItem>
//                       <SelectItem value="identified">Identified</SelectItem>
//                       <SelectItem value="monitoring">Monitoring</SelectItem>
//                       <SelectItem value="resolved">Resolved</SelectItem>
//                     </SelectContent>
//                   </Select>
//                 </div>
//               </div>

//               {components.length > 0 && (
//                 <div className="space-y-2">
//                   <Label>Affected Components</Label>
//                   <div className="space-y-2 border rounded-md p-3 max-h-40 overflow-y-auto bg-slate-50">
//                     {components.map(c => (
//                       <label key={c.id} className="flex items-center space-x-2 cursor-pointer">
//                         <input 
//                           type="checkbox"
//                           className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
//                           checked={newIncident.component_ids.includes(c.id)}
//                           onChange={(e) => {
//                             if (e.target.checked) {
//                               setNewIncident({...newIncident, component_ids: [...newIncident.component_ids, c.id]});
//                             } else {
//                               setNewIncident({...newIncident, component_ids: newIncident.component_ids.filter(id => id !== c.id)});
//                             }
//                           }}
//                         />
//                         <span className="text-sm text-slate-700">{c.name}</span>
//                       </label>
//                     ))}
//                   </div>
//                 </div>
//               )}

//               <div className="space-y-2">
//                 <Label>Initial Update Message</Label>
//                 <textarea 
//                   required
//                   className="w-full border rounded-md p-2 text-sm min-h-[80px]"
//                   placeholder="We are currently investigating an issue with..."
//                   value={newIncident.initial_message}
//                   onChange={e => setNewIncident({...newIncident, initial_message: e.target.value})}
//                 />
//               </div>
//               <Button type="submit" className="w-full">Declare Incident</Button>
//             </form>
//           </DialogContent>
//         </Dialog>
//       </div>

//       {incidents.length === 0 ? (
//         <Card className="text-center p-12 bg-muted/50 border-dashed">
//           <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
//           <h3 className="text-lg font-semibold">No incidents reported</h3>
//           <p className="text-muted-foreground mb-4">When a major issue occurs, declare an incident to notify your users.</p>
//           <Button onClick={() => setIsCreating(true)} variant="outline">Declare Incident</Button>
//         </Card>
//       ) : (
//         <Card>
//           <div className="divide-y">
//             {incidents.map(incident => (
//               <div 
//                 key={incident.id} 
//                 className="p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer transition-colors"
//                 onClick={() => router.push(`/dashboard/incidents/${projectId}/${incident.id}`)}
//               >
//                 <div className="flex items-start gap-4">
//                   <div className="mt-1">
//                     {getSeverityIcon(incident.severity)}
//                   </div>
//                   <div>
//                     <div className="flex items-center gap-2 mb-1">
//                       <h3 className="font-semibold text-slate-800">{incident.title}</h3>
//                       {getStatusBadge(incident.status)}
//                     </div>
//                     <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
//                       <span className="flex items-center gap-1">
//                         <Clock className="w-3 h-3" /> 
//                         {new Date(incident.started_at).toLocaleString()}
//                       </span>
//                       {incident.components?.length > 0 && (
//                         <span className="flex items-center gap-1">
//                           <Server className="w-3 h-3" />
//                           {incident.components.map((c: any) => c.name).join(", ")}
//                         </span>
//                       )}
//                     </div>
//                   </div>
//                 </div>

//                 <div className="flex items-center text-slate-400">
//                   <ArrowRight className="w-5 h-5" />
//                 </div>
//               </div>
//             ))}
//           </div>
//         </Card>
//       )}
//     </div>
//   );
// }



"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/Badge";
import { Plus, Loader2, AlertTriangle, AlertCircle, AlertOctagon, MessageSquare, Clock, ArrowRight, Server } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

export default function IncidentsPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const router = useRouter();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [newIncident, setNewIncident] = useState({
    title: "",
    severity: "minor",
    status: "investigating",
    initial_message: "",
    component_ids: [] as string[]
  });

  useEffect(() => {
    if (!projectId) return;
    fetchData();
  }, [projectId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [incRes, compRes, projectRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents`, {
          credentials: "include"
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, {
          credentials: "include"
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" })
      ]);

      if (incRes.ok) setIncidents(await incRes.json());
      if (compRes.ok) setComponents(await compRes.json());
      if (projectRes.ok) setProject(await projectRes.json());
    } catch (err) {
      toast.error("Failed to load incidents");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newIncident)
      });
      if (!res.ok) throw new Error("Failed to create");

      const created = await res.json();
      toast.success("Incident declared");
      setIsCreating(false);
      router.push(`/dashboard/incidents/${projectId}/${created.id}`);
    } catch (err) {
      toast.error("Failed to create incident");
    }
  }

  function getSeverityIcon(severity: string) {
    switch (severity) {
      case "minor": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "major": return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case "critical": return <AlertOctagon className="w-4 h-4 text-red-500" />;
      default: return <AlertTriangle className="w-4 h-4 text-zinc-500" />;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "investigating": return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">Investigating</Badge>;
      case "identified": return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Identified</Badge>;
      case "monitoring": return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">Monitoring</Badge>;
      case "resolved": return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Resolved</Badge>;
      default: return <Badge variant="outline" className="bg-zinc-800/50 text-zinc-400 border-zinc-700">{status}</Badge>;
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

  if (project && !project.observability?.verified) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#050505] text-zinc-200 pb-20 font-sans p-6 pt-12">
        <ObservabilitySetup project={project} onVerified={fetchData} />
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
                <AlertTriangle className="h-6 w-6 text-orange-500" />
                Incidents
              </h1>
              <p className="text-sm text-zinc-400 mt-1 ml-9">Declare incidents and post updates to your status page.</p>
            </div>

            <Dialog open={isCreating} onOpenChange={setIsCreating}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-sm font-medium text-zinc-300 transition-colors">
                  <Plus className="h-4 w-4" />
                  Declare Incident
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-zinc-950 border border-zinc-800/60 text-zinc-200">
                <DialogHeader>
                  <DialogTitle className="text-white">Declare New Incident</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Incident Title</Label>
                    <Input
                      required
                      placeholder="e.g., API Outage"
                      value={newIncident.title}
                      onChange={e => setNewIncident({ ...newIncident, title: e.target.value })}
                      className="bg-zinc-900/50 border-zinc-800/60 text-sm text-zinc-200 placeholder:text-zinc-500 h-9 rounded-lg focus-visible:ring-1 focus-visible:ring-zinc-700"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Severity</Label>
                      <Select value={newIncident.severity} onValueChange={(val: string) => setNewIncident({ ...newIncident, severity: val })}>
                        <SelectTrigger className="bg-zinc-900/50 border-zinc-800/60 text-zinc-200 h-9 rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          <SelectItem value="minor">Minor</SelectItem>
                          <SelectItem value="major">Major</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Initial Status</Label>
                      <Select value={newIncident.status} onValueChange={(val: string) => setNewIncident({ ...newIncident, status: val })}>
                        <SelectTrigger className="bg-zinc-900/50 border-zinc-800/60 text-zinc-200 h-9 rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          <SelectItem value="investigating">Investigating</SelectItem>
                          <SelectItem value="identified">Identified</SelectItem>
                          <SelectItem value="monitoring">Monitoring</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {components.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Affected Components</Label>
                      <div className="space-y-2 border border-zinc-800/60 rounded-lg p-3 max-h-40 overflow-y-auto bg-zinc-900/40">
                        {components.map(c => (
                          <label key={c.id} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500/50"
                              checked={newIncident.component_ids.includes(c.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewIncident({ ...newIncident, component_ids: [...newIncident.component_ids, c.id] });
                                } else {
                                  setNewIncident({ ...newIncident, component_ids: newIncident.component_ids.filter(id => id !== c.id) });
                                }
                              }}
                            />
                            <span className="text-sm text-zinc-300">{c.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-zinc-400">Initial Update Message</Label>
                    <textarea
                      required
                      className="w-full border border-zinc-800/60 bg-zinc-900/50 rounded-lg p-2 text-sm text-zinc-200 placeholder:text-zinc-500 min-h-[80px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                      placeholder="We are currently investigating an issue with..."
                      value={newIncident.initial_message}
                      onChange={e => setNewIncident({ ...newIncident, initial_message: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="w-full h-9 rounded-lg bg-blue-500/60 hover:bg-blue-500/80 border border-blue-500/20 text-sm font-medium text-white transition-colors">
                    Declare Incident
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border border-zinc-800/60 border-dashed rounded-xl bg-zinc-900/20">
              <AlertTriangle className="h-10 w-10 text-zinc-600 mb-4" />
              <p className="text-zinc-400 font-medium text-lg">No incidents reported</p>
              <p className="text-sm text-zinc-500 mt-1 mb-4">When a major issue occurs, declare an incident to notify your users.</p>
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-sm font-medium text-zinc-300 transition-colors"
              >
                Declare Incident
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {incidents.map(incident => (
                <div
                  key={incident.id}
                  className="w-full rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-200 cursor-pointer"
                  onClick={() => router.push(`/dashboard/incidents/${projectId}/${incident.id}`)}
                >
                  <div className="p-5 flex items-center justify-between gap-6">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="mt-1">
                        {getSeverityIcon(incident.severity)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg text-white">{incident.title}</h3>
                          {getStatusBadge(incident.status)}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 font-medium">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {new Date(incident.started_at).toLocaleString()}
                          </span>
                          {incident.components?.length > 0 && (
                            <>
                              <span className="text-zinc-700">•</span>
                              <span className="flex items-center gap-1.5">
                                <Server className="w-3 h-3" />
                                {incident.components.map((c: any) => c.name).join(", ")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <ArrowRight className="h-5 w-5 text-zinc-600 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}