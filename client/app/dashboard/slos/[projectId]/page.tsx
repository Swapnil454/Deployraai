"use client";

import { useState, useEffect } from "react";
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
    try {
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
      if (!res.ok) throw new Error("Failed to create SLO");
      
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
      toast.error("Failed to create SLO");
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
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin inline mr-2"/>Loading SLOs...</div>;
  }

  if (project && !project.analytics?.verified) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pt-8">
        <ObservabilitySetup project={project} onVerified={fetchSLOs} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Level Objectives</h1>
          <p className="text-muted-foreground">Track reliability targets and error budgets.</p>
        </div>
        
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New SLO</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New SLO</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSLO} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>SLO Name</Label>
                <Input 
                  required 
                  placeholder="e.g., API Uptime" 
                  value={newSlo.name} 
                  onChange={e => setNewSlo({...newSlo, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Metric Type</Label>
                <Select value={newSlo.type} onValueChange={(val: string) => setNewSlo({...newSlo, type: val})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uptime">Uptime</SelectItem>
                    <SelectItem value="success_rate">Success Rate</SelectItem>
                    <SelectItem value="latency">Latency (Coming Soon)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target (%)</Label>
                  <Input 
                    required 
                    type="number" 
                    step="0.01" 
                    min="1" 
                    max="100" 
                    value={newSlo.target_percentage} 
                    onChange={e => setNewSlo({...newSlo, target_percentage: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Window (Days)</Label>
                  <Input 
                    required 
                    type="number" 
                    min="1" 
                    value={newSlo.window_days} 
                    onChange={e => setNewSlo({...newSlo, window_days: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data Source</Label>
                <Select value={newSlo.metric_source} onValueChange={(val: string) => setNewSlo({...newSlo, metric_source: val})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="synthetic_checks">Synthetic Checks (External)</SelectItem>
                    <SelectItem value="metrics_minutely">Telemetry Metrics (Internal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Create SLO</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {slos.length === 0 ? (
        <Card className="text-center p-12 bg-muted/50 border-dashed">
          <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">No SLOs configured</h3>
          <p className="text-muted-foreground mb-4">Define your reliability targets to track error budgets.</p>
          <Button onClick={() => setIsCreating(true)} variant="outline">Create your first SLO</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {slos.map(slo => {
            const status = statuses[slo.id];
            
            return (
              <Card key={slo.id} className="relative overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{slo.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Target className="w-3 h-3" /> {slo.target_percentage}% Target
                        <Clock className="w-3 h-3 ml-2" /> {slo.window_days} Day Window
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteSLO(slo.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {status ? (
                    <div className="space-y-4 mt-2">
                      <div>
                        <div className="flex justify-between text-sm mb-1 font-medium">
                          <span className="text-slate-600">Error Budget Remaining</span>
                          <span className={status.budgetRemainingPercentage > 0 ? "text-green-600" : "text-red-600"}>
                            {Math.max(0, status.budgetRemainingPercentage).toFixed(1)}%
                          </span>
                        </div>
                        <Progress 
                          value={Math.max(0, status.budgetRemainingPercentage)} 
                          className="h-2"
                          indicatorClassName={
                            status.budgetRemainingPercentage > 50 ? "bg-green-500" : 
                            status.budgetRemainingPercentage > 0 ? "bg-yellow-500" : "bg-red-500"
                          }
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 bg-muted/50 p-3 rounded-lg text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Allowed Downtime</p>
                          <p className="font-semibold">{status.allowedDowntimeMinutes.toFixed(1)} min</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Used Downtime</p>
                          <p className="font-semibold">{status.usedDowntimeMinutes.toFixed(1)} min</p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground flex justify-between items-center">
                         <span>Actual Success Rate: <span className="font-medium text-slate-700">{status.actualSuccessPercentage.toFixed(3)}%</span></span>
                         <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 border flex items-center gap-1">
                           <Activity className="w-3 h-3" />
                           {slo.metric_source === 'synthetic_checks' ? 'External Pings' : 'Internal Telemetry'}
                         </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      <Loader2 className="animate-spin inline mr-2 h-4 w-4"/> Calculating Budget...
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
