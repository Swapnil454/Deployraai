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

export default function IncidentsPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const router = useRouter();
    const [incidents, setIncidents] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
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
      const [incRes, compRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/incidents`, {
          credentials: "include"
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, {
          credentials: "include"
        })
      ]);
      
      if (incRes.ok) setIncidents(await incRes.json());
      if (compRes.ok) setComponents(await compRes.json());
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
      default: return <AlertTriangle className="w-4 h-4 text-slate-500" />;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "investigating": return <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100">Investigating</Badge>;
      case "identified": return <Badge variant="warning" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Identified</Badge>;
      case "monitoring": return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Monitoring</Badge>;
      case "resolved": return <Badge variant="success" className="bg-green-100 text-green-800 hover:bg-green-100">Resolved</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin inline mr-2"/>Loading incidents...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
          <p className="text-muted-foreground">Declare incidents and post updates to your status page.</p>
        </div>
        
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Declare Incident</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Declare New Incident</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Incident Title</Label>
                <Input 
                  required 
                  placeholder="e.g., API Outage" 
                  value={newIncident.title} 
                  onChange={e => setNewIncident({...newIncident, title: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={newIncident.severity} onValueChange={(val: string) => setNewIncident({...newIncident, severity: val})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Initial Status</Label>
                  <Select value={newIncident.status} onValueChange={(val: string) => setNewIncident({...newIncident, status: val})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
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
                  <Label>Affected Components</Label>
                  <div className="space-y-2 border rounded-md p-3 max-h-40 overflow-y-auto bg-slate-50">
                    {components.map(c => (
                      <label key={c.id} className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={newIncident.component_ids.includes(c.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewIncident({...newIncident, component_ids: [...newIncident.component_ids, c.id]});
                            } else {
                              setNewIncident({...newIncident, component_ids: newIncident.component_ids.filter(id => id !== c.id)});
                            }
                          }}
                        />
                        <span className="text-sm text-slate-700">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Initial Update Message</Label>
                <textarea 
                  required
                  className="w-full border rounded-md p-2 text-sm min-h-[80px]"
                  placeholder="We are currently investigating an issue with..."
                  value={newIncident.initial_message}
                  onChange={e => setNewIncident({...newIncident, initial_message: e.target.value})}
                />
              </div>
              <Button type="submit" className="w-full">Declare Incident</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {incidents.length === 0 ? (
        <Card className="text-center p-12 bg-muted/50 border-dashed">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">No incidents reported</h3>
          <p className="text-muted-foreground mb-4">When a major issue occurs, declare an incident to notify your users.</p>
          <Button onClick={() => setIsCreating(true)} variant="outline">Declare Incident</Button>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {incidents.map(incident => (
              <div 
                key={incident.id} 
                className="p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => router.push(`/dashboard/incidents/${projectId}/${incident.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {getSeverityIcon(incident.severity)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-800">{incident.title}</h3>
                      {getStatusBadge(incident.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> 
                        {new Date(incident.started_at).toLocaleString()}
                      </span>
                      {incident.components?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Server className="w-3 h-3" />
                          {incident.components.map((c: any) => c.name).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center text-slate-400">
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
