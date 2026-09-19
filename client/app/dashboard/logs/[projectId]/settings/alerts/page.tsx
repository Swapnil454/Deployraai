"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/Badge";
import { Trash2 } from "lucide-react";
export default function AlertRulesPage() {
  const params = useParams();
  const projectId = params?.projectId;
    const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState("any");
  const [threshold, setThreshold] = useState("1");
  const [windowMins, setWindowMins] = useState("5");
  const [cooldownMins, setCooldownMins] = useState("15");
  const [routeType, setRouteType] = useState("dashboard");
  const [routeTarget, setRouteTarget] = useState("");

  useEffect(() => {
    if (!projectId) return;
    fetchRules();
  }, [projectId]);

  async function fetchRules() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules`, {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          event_type: "exception",
          severity,
          threshold: parseInt(threshold),
          window_minutes: parseInt(windowMins),
          cooldown_minutes: parseInt(cooldownMins),
          route_type: routeType,
          route_target: routeTarget
        })
      });
      if (res.ok) {
        setName("");
        setRouteTarget("");
        fetchRules();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/rules/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        fetchRules();
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alert Rules</h1>
        <p className="text-muted-foreground">Configure when and how you get notified about errors.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create New Rule</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRule} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rule Name</label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Critical Frontend Errors" />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Severity</label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Severity</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Threshold (Errors)</label>
                <Input required type="number" min="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Time Window (Minutes)</label>
                <Input required type="number" min="1" value={windowMins} onChange={(e) => setWindowMins(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Delivery Channel</label>
                <Select value={routeType} onValueChange={setRouteType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard">Dashboard Only</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="slack_webhook">Slack Webhook</SelectItem>
                    <SelectItem value="webhook">Generic Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {routeType !== 'dashboard' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target URL or Email Address</label>
                  <Input required value={routeTarget} onChange={(e) => setRouteTarget(e.target.value)} placeholder={routeType === 'email' ? 'dev@example.com' : 'https://...'} />
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Cooldown (Minutes)</label>
                <Input required type="number" min="0" value={cooldownMins} onChange={(e) => setCooldownMins(e.target.value)} />
              </div>
            </div>

            <Button type="submit">Create Rule</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Active Rules</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alert rules configured.</p>
        ) : (
          rules.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{r.name}</h3>
                    <Badge variant="outline">{r.severity === 'any' ? 'Any severity' : r.severity}</Badge>
                    <Badge variant="secondary">{r.route_type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Trigger if {r.threshold} {r.event_type}s occur within {r.window_minutes} mins. Cooldown: {r.cooldown_minutes} mins.
                  </p>
                  {r.route_target && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{r.route_target}</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
