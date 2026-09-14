// "use client";

// import { useState, useEffect } from "react";
// import { useParams, useRouter } from "next/navigation";
// import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Label } from "@/components/ui/label";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Badge } from "@/components/ui/Badge";
// import { Loader2, AlertTriangle, AlertCircle, AlertOctagon, Server, MessageSquare, ArrowLeft, Send } from "lucide-react";
// import { toast } from "sonner";
// import Link from "next/link";

// export default function IncidentDetailPage() {
//   const params = useParams();
//   const projectId = params?.projectId;
//   const incidentId = params?.incidentId;
//   const router = useRouter();
//     const [incident, setIncident] = useState<any>(null);
//   const [updates, setUpdates] = useState<any[]>([]);
//   const [loading, setLoading] = useState(true);
  
//   const [newMessage, setNewMessage] = useState("");
//   const [newStatus, setNewStatus] = useState("");
//   const [posting, setPosting] = useState(false);

//   useEffect(() => {
//     if (!projectId || !incidentId) return;
//     fetchData();
//   }, [projectId, incidentId]);

//   async function fetchData() {
//     try {
//       setLoading(true);
//       const [incRes, upRes] = await Promise.all([
//         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents/${incidentId}`, {
//           credentials: "include"
//         }),
//         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents/${incidentId}/updates`, {
//           credentials: "include"
//         })
//       ]);
      
//       if (incRes.ok) {
//         const incData = await incRes.json();
//         setIncident(incData);
//         setNewStatus(incData.status);
//       }
//       if (upRes.ok) {
//         setUpdates(await upRes.json());
//       }
//     } catch (err) {
//       toast.error("Failed to load incident");
//     } finally {
//       setLoading(false);
//     }
//   }

//   async function handlePostUpdate(e: React.FormEvent) {
//     e.preventDefault();
//     if (!newMessage) return toast.error("Message is required");
    
//     try {
//       setPosting(true);
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents/${incidentId}/status`, {
//         method: "PATCH",
//         credentials: "include",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           message: newMessage,
//           status: newStatus
//         })
//       });
//       if (!res.ok) throw new Error("Failed to post update");
      
//       toast.success("Update posted");
//       setNewMessage("");
//       fetchData(); // reload
//     } catch (err) {
//       toast.error("Failed to post update");
//     } finally {
//       setPosting(false);
//     }
//   }

//   function getSeverityIcon(severity: string) {
//     switch (severity) {
//       case "minor": return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
//       case "major": return <AlertCircle className="w-5 h-5 text-orange-500" />;
//       case "critical": return <AlertOctagon className="w-5 h-5 text-red-500" />;
//       default: return <AlertTriangle className="w-5 h-5 text-slate-500" />;
//     }
//   }

//   function getStatusBadge(status: string) {
//     switch (status) {
//       case "investigating": return <Badge variant="destructive" className="bg-red-100 text-red-800">Investigating</Badge>;
//       case "identified": return <Badge variant="warning" className="bg-yellow-100 text-yellow-800">Identified</Badge>;
//       case "monitoring": return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Monitoring</Badge>;
//       case "resolved": return <Badge variant="success" className="bg-green-100 text-green-800">Resolved</Badge>;
//       default: return <Badge variant="outline" className="">{status}</Badge>;
//     }
//   }

//   if (loading || !incident) {
//     return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin inline mr-2"/>Loading incident...</div>;
//   }

//   return (
//     <div className="space-y-6 max-w-4xl mx-auto">
//       <div className="flex items-center gap-4">
//         <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/incidents/${projectId}`)}>
//           <ArrowLeft className="w-4 h-4" />
//         </Button>
//         <div>
//           <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
//             {getSeverityIcon(incident.severity)}
//             {incident.title}
//           </h1>
//           <p className="text-muted-foreground text-sm flex items-center gap-4 mt-1">
//             <span>Started {new Date(incident.started_at).toLocaleString()}</span>
//             {incident.resolved_at && <span>• Resolved {new Date(incident.resolved_at).toLocaleString()}</span>}
//           </p>
//         </div>
//       </div>

//       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//         <div className="md:col-span-2 space-y-6">
          
//           <Card>
//             <CardHeader>
//               <CardTitle>Post Update</CardTitle>
//               <CardDescription>Keep your users informed by posting timeline updates.</CardDescription>
//             </CardHeader>
//             <CardContent>
//               <form onSubmit={handlePostUpdate} className="space-y-4">
//                 <div className="space-y-2">
//                   <Label>Update Status</Label>
//                   <Select value={newStatus} onValueChange={setNewStatus}>
//                     <SelectTrigger><SelectValue/></SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="investigating">Investigating</SelectItem>
//                       <SelectItem value="identified">Identified</SelectItem>
//                       <SelectItem value="monitoring">Monitoring</SelectItem>
//                       <SelectItem value="resolved">Resolved</SelectItem>
//                     </SelectContent>
//                   </Select>
//                 </div>
//                 <div className="space-y-2">
//                   <Label>Message</Label>
//                   <textarea 
//                     required
//                     className="w-full border rounded-md p-3 text-sm min-h-[100px]"
//                     placeholder="We have identified the root cause and are working on a fix..."
//                     value={newMessage}
//                     onChange={e => setNewMessage(e.target.value)}
//                   />
//                 </div>
//                 <Button type="submit" disabled={posting || incident.status === 'resolved'}>
//                   {posting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
//                   Post Update
//                 </Button>
//                 {incident.status === 'resolved' && (
//                   <p className="text-xs text-muted-foreground mt-2">This incident is resolved. Reopen it by changing the status to post a new update.</p>
//                 )}
//               </form>
//             </CardContent>
//           </Card>

//           <Card>
//             <CardHeader>
//               <CardTitle>Timeline</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <div className="space-y-6">
//                 {updates.map((update, i) => (
//                   <div key={update.id} className="relative pl-6 border-l-2 border-slate-200">
//                     <div className="absolute w-3 h-3 bg-indigo-500 rounded-full -left-[7px] top-1" />
//                     <div className="mb-1 flex items-center gap-3">
//                       {getStatusBadge(update.new_status)}
//                       <span className="text-xs text-muted-foreground">
//                         {new Date(update.created_at).toLocaleString()}
//                       </span>
//                     </div>
//                     <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{update.message}</p>
//                   </div>
//                 ))}
//               </div>
//             </CardContent>
//           </Card>

//         </div>
        
//         <div className="space-y-6">
//           <Card>
//             <CardHeader>
//               <CardTitle>Details</CardTitle>
//             </CardHeader>
//             <CardContent className="space-y-4">
//               <div>
//                 <p className="text-sm text-muted-foreground mb-1">Current Status</p>
//                 {getStatusBadge(incident.status)}
//               </div>
//               <div>
//                 <p className="text-sm text-muted-foreground mb-1">Severity</p>
//                 <Badge variant="outline" className="capitalize">{incident.severity}</Badge>
//               </div>
//               <div>
//                 <p className="text-sm text-muted-foreground mb-1">Affected Components</p>
//                 {incident.components?.length > 0 ? (
//                   <div className="flex flex-col gap-2 mt-2">
//                     {incident.components.map((c: any) => (
//                       <span key={c.id} className="flex items-center gap-2 text-sm bg-slate-100 p-2 rounded">
//                         <Server className="w-4 h-4 text-slate-500" />
//                         {c.name}
//                       </span>
//                     ))}
//                   </div>
//                 ) : (
//                   <span className="text-sm text-slate-500">None specified</span>
//                 )}
//               </div>
//             </CardContent>
//           </Card>
//         </div>
//       </div>
//     </div>
//   );
// }

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/Badge";
import { Loader2, AlertTriangle, AlertCircle, AlertOctagon, Server, MessageSquare, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function IncidentDetailPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const incidentId = params?.incidentId;
  const router = useRouter();
    const [incident, setIncident] = useState<any>(null);
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newMessage, setNewMessage] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!projectId || !incidentId) return;
    fetchData();
  }, [projectId, incidentId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [incRes, upRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents/${incidentId}`, {
          credentials: "include"
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents/${incidentId}/updates`, {
          credentials: "include"
        })
      ]);
      
      if (incRes.ok) {
        const incData = await incRes.json();
        setIncident(incData);
        setNewStatus(incData.status);
      }
      if (upRes.ok) {
        setUpdates(await upRes.json());
      }
    } catch (err) {
      toast.error("Failed to load incident");
    } finally {
      setLoading(false);
    }
  }

  async function handlePostUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage) return toast.error("Message is required");
    
    try {
      setPosting(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents/${incidentId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newMessage,
          status: newStatus
        })
      });
      if (!res.ok) throw new Error("Failed to post update");
      
      toast.success("Update posted");
      setNewMessage("");
      fetchData(); // reload
    } catch (err) {
      toast.error("Failed to post update");
    } finally {
      setPosting(false);
    }
  }

  function getSeverityIcon(severity: string) {
    switch (severity) {
      case "minor": return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case "major": return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case "critical": return <AlertOctagon className="w-5 h-5 text-red-500" />;
      default: return <AlertTriangle className="w-5 h-5 text-zinc-500" />;
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

  function getSeverityBadge(severity: string) {
    const cls =
      severity === "critical" ? "border-red-500/30 text-red-400 bg-red-500/10" :
      severity === "major" ? "border-orange-500/30 text-orange-400 bg-orange-500/10" :
      severity === "minor" ? "border-yellow-500/30 text-yellow-400 bg-yellow-500/10" :
      "border-zinc-700 text-zinc-400";
    return <Badge variant="outline" className={`capitalize text-xs font-medium ${cls}`}>{severity}</Badge>;
  }

  if (loading || !incident) {
    return (
      <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0 font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-900/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 p-6 pt-6 w-full flex-1">
          <div className="max-w-4xl w-full mx-auto space-y-6">
            <div className="h-10 w-2/3 rounded-lg bg-zinc-900/40 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <div className="h-48 rounded-xl border border-zinc-800/60 bg-zinc-900/40 animate-pulse" />
                <div className="h-64 rounded-xl border border-zinc-800/60 bg-zinc-900/40 animate-pulse" />
              </div>
              <div className="h-48 rounded-xl border border-zinc-800/60 bg-zinc-900/40 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0 font-sans">
      {/* Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 p-6 pt-6 w-full flex-1">
        <div className="max-w-4xl w-full mx-auto">

          {/* HEADER */}
          <div className="flex items-center gap-4 mb-8 border-b border-zinc-800/60 pb-5">
            
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3 truncate">
                {getSeverityIcon(incident.severity)}
                <span className="truncate">{incident.title}</span>
              </h1>
              <p className="text-zinc-400 text-sm flex items-center gap-1.5 mt-1 ml-9">
                <span>Started {new Date(incident.started_at).toLocaleString()}</span>
                {incident.resolved_at && (
                  <>
                    <span className="text-zinc-700">•</span>
                    <span>Resolved {new Date(incident.resolved_at).toLocaleString()}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">

              {/* POST UPDATE */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm p-6">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-white" />
                    Post Update
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">Keep your users informed by posting timeline updates.</p>
                </div>
                <form onSubmit={handlePostUpdate} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Update Status</Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger className="bg-zinc-900/50 border-zinc-800/60 text-zinc-200 h-9 rounded-lg"><SelectValue/></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                        <SelectItem value="investigating"><span className="text-rose-400">Investigating</span></SelectItem>
                        <SelectItem value="identified"><span className="text-yellow-400">Identified</span></SelectItem>
                        <SelectItem value="monitoring"><span className="text-blue-400">Monitoring</span></SelectItem>
                        <SelectItem value="resolved"><span className="text-emerald-400">Resolved</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Message</Label>
                    <textarea 
                      required
                      className="w-full border border-zinc-800/60 bg-zinc-900/50 rounded-lg p-3 text-sm text-zinc-200 placeholder:text-zinc-500 min-h-[100px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                      placeholder="We have identified the root cause and are working on a fix..."
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={posting || incident.status === 'resolved'}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-500 hover:bg-blue-700 border border-blue-500/20 text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-orange-500/10"
                  >
                    {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Post Update
                  </button>
                  {incident.status === 'resolved' && (
                    <p className="text-xs text-zinc-500 mt-2">This incident is resolved. Reopen it by changing the status to post a new update.</p>
                  )}
                </form>
              </div>

              {/* TIMELINE */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm p-6">
                <h2 className="text-base font-semibold text-white mb-5">Timeline</h2>
                {updates.length === 0 ? (
                  <p className="text-sm text-zinc-500">No updates posted yet.</p>
                ) : (
                  <div className="space-y-6">
                    {updates.map((update, i) => (
                      <div key={update.id} className="relative pl-6 border-l-2 border-zinc-800">
                        <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-[7px] top-1 ring-4 ring-[#0a0a0a]" />
                        <div className="mb-1 flex items-center gap-3">
                          {getStatusBadge(update.new_status)}
                          <span className="text-xs text-zinc-500">
                            {new Date(update.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap leading-relaxed">{update.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* SIDEBAR */}
            <div className="space-y-6">
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm p-6">
                <h2 className="text-base font-semibold text-white mb-4">Details</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider font-medium text-zinc-500 mb-1.5">Current Status</p>
                    {getStatusBadge(incident.status)}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider font-medium text-zinc-500 mb-1.5">Severity</p>
                    {getSeverityBadge(incident.severity)}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider font-medium text-zinc-500 mb-1.5">Affected Components</p>
                    {incident.components?.length > 0 ? (
                      <div className="flex flex-col gap-2 mt-2">
                        {incident.components.map((c: any) => (
                          <span key={c.id} className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-800/40 border border-zinc-800/60 p-2 rounded-lg">
                            <Server className="w-4 h-4 text-zinc-500" />
                            {c.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-500">None specified</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}