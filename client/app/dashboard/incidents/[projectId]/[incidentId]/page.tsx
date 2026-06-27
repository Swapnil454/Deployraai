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
      default: return <AlertTriangle className="w-5 h-5 text-slate-500" />;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "investigating": return <Badge variant="destructive" className="bg-red-100 text-red-800">Investigating</Badge>;
      case "identified": return <Badge variant="warning" className="bg-yellow-100 text-yellow-800">Identified</Badge>;
      case "monitoring": return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Monitoring</Badge>;
      case "resolved": return <Badge variant="success" className="bg-green-100 text-green-800">Resolved</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (loading || !incident) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin inline mr-2"/>Loading incident...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/incidents/${projectId}`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            {getSeverityIcon(incident.severity)}
            {incident.title}
          </h1>
          <p className="text-muted-foreground text-sm flex items-center gap-4 mt-1">
            <span>Started {new Date(incident.started_at).toLocaleString()}</span>
            {incident.resolved_at && <span>• Resolved {new Date(incident.resolved_at).toLocaleString()}</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          
          <Card>
            <CardHeader>
              <CardTitle>Post Update</CardTitle>
              <CardDescription>Keep your users informed by posting timeline updates.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePostUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Update Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="identified">Identified</SelectItem>
                      <SelectItem value="monitoring">Monitoring</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <textarea 
                    required
                    className="w-full border rounded-md p-3 text-sm min-h-[100px]"
                    placeholder="We have identified the root cause and are working on a fix..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={posting || incident.status === 'resolved'}>
                  {posting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Post Update
                </Button>
                {incident.status === 'resolved' && (
                  <p className="text-xs text-muted-foreground mt-2">This incident is resolved. Reopen it by changing the status to post a new update.</p>
                )}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {updates.map((update, i) => (
                  <div key={update.id} className="relative pl-6 border-l-2 border-slate-200">
                    <div className="absolute w-3 h-3 bg-indigo-500 rounded-full -left-[7px] top-1" />
                    <div className="mb-1 flex items-center gap-3">
                      {getStatusBadge(update.new_status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(update.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{update.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Current Status</p>
                {getStatusBadge(incident.status)}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Severity</p>
                <Badge variant="outline" className="capitalize">{incident.severity}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Affected Components</p>
                {incident.components?.length > 0 ? (
                  <div className="flex flex-col gap-2 mt-2">
                    {incident.components.map((c: any) => (
                      <span key={c.id} className="flex items-center gap-2 text-sm bg-slate-100 p-2 rounded">
                        <Server className="w-4 h-4 text-slate-500" />
                        {c.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">None specified</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
