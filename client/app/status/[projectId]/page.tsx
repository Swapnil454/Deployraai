"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Activity, ShieldAlert, CheckCircle, HelpCircle, XCircle, AlertTriangle, Info, Server } from "lucide-react";

export default function PublicStatusPage() {
  const params = useParams();
  const projectId = params?.projectId;

  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    fetchData();
  }, [projectId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [statusRes, historyRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/public/status/${projectId}`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/public/status/${projectId}/history`)
      ]);

      if (statusRes.status === 404) {
        setError("Status page not found or disabled.");
        return;
      }

      if (statusRes.ok) setData(await statusRes.json());
      if (historyRes.ok) setHistory(await historyRes.json());

    } catch (err) {
      setError("Failed to load status data.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading status...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-slate-300" />
        <h1 className="text-xl font-semibold text-slate-700">Page Not Found</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  const { config, status, components, activeIncidents, pastIncidents } = data;

  const StatusBanner = () => {
    switch (status) {
      case "operational":
        return (
          <div className="bg-green-500 text-white rounded-lg p-6 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8" />
              <h2 className="text-2xl font-semibold">All Systems Operational</h2>
            </div>
            <p className="text-green-100 text-sm">Last updated just now</p>
          </div>
        );
      case "degraded":
        return (
          <div className="bg-yellow-500 text-white rounded-lg p-6 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8" />
              <h2 className="text-2xl font-semibold">Degraded Performance</h2>
            </div>
            <p className="text-yellow-100 text-sm">We are investigating</p>
          </div>
        );
      case "down":
        return (
          <div className="bg-red-500 text-white rounded-lg p-6 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8" />
              <h2 className="text-2xl font-semibold">Major Outage</h2>
            </div>
            <p className="text-red-100 text-sm">We are working on a fix</p>
          </div>
        );
      default:
        return (
          <div className="bg-slate-300 text-slate-800 rounded-lg p-6 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <HelpCircle className="w-8 h-8" />
              <h2 className="text-2xl font-semibold">Unknown Status</h2>
            </div>
            <p className="text-slate-500 text-sm">No recent data</p>
          </div>
        );
    }
  };

  const getComponentStatusColor = (s: string) => {
    switch(s) {
      case 'operational': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'partial_outage': return 'text-orange-600';
      case 'major_outage': return 'text-red-600';
      case 'maintenance': return 'text-blue-600';
      default: return 'text-slate-600';
    }
  };

  const getComponentStatusText = (s: string) => {
    switch(s) {
      case 'operational': return 'Operational';
      case 'degraded': return 'Degraded';
      case 'partial_outage': return 'Partial Outage';
      case 'major_outage': return 'Major Outage';
      case 'maintenance': return 'Under Maintenance';
      default: return 'Unknown';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-10">
        
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{config.title}</h1>
          {config.description && <p className="text-lg text-slate-500">{config.description}</p>}
        </header>

        <StatusBanner />

        {/* Active Incidents */}
        {activeIncidents && activeIncidents.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Active Incidents</h2>
            {activeIncidents.map((incident: any) => (
              <Card key={incident.id} className="border-l-4 border-l-red-500 overflow-hidden shadow-sm">
                <CardHeader className="bg-red-50/50 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-red-900 text-xl">{incident.title}</CardTitle>
                      <p className="text-sm text-red-600 mt-1">
                        Incident declared {new Date(incident.started_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="destructive" className="capitalize">{incident.severity}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                    {incident.updates.map((update: any, idx: number) => (
                      <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white bg-slate-200 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10" />
                        <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.25rem)] bg-white p-4 rounded border shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline" className="capitalize text-xs font-semibold">{update.status}</Badge>
                            <span className="text-xs text-slate-400">{new Date(update.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{update.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Components */}
        {components && components.length > 0 && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">System Components</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {components.map((c: any) => (
                  <div key={c.id} className="py-4 flex items-center justify-between first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <Server className="w-5 h-5 text-slate-400" />
                      <div>
                        <h3 className="font-medium text-slate-800">{c.name}</h3>
                        {c.description && <p className="text-sm text-slate-500">{c.description}</p>}
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${getComponentStatusColor(c.current_status)}`}>
                      {getComponentStatusText(c.current_status)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 90-Day History */}
        {config.show_uptime_history && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Uptime History <span className="text-sm font-normal text-slate-500">(90 Days)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center text-muted-foreground p-4">No history available yet.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-[2px] h-12 items-end group relative">
                    {history.map((day, i) => {
                      let bgColor = "bg-slate-200"; // gray/unknown
                      if (day.status === "green") bgColor = "bg-green-500";
                      else if (day.status === "yellow") bgColor = "bg-yellow-400";
                      else if (day.status === "red") bgColor = "bg-red-500";
                      
                      return (
                        <div 
                          key={i} 
                          className={`flex-1 rounded-sm cursor-help hover:opacity-80 transition-opacity ${bgColor}`}
                          style={{ minWidth: '3px', height: '100%' }}
                          title={`${new Date(day.date).toLocaleDateString()}: ${
                            day.status === 'gray' ? 'No data' : `${day.uptimePercentage}% uptime (${day.failedChecks} failures)`
                          }`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>90 days ago</span>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"/> Operational</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400"/> Degraded</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/> Downtime</span>
                    </span>
                    <span>Today</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Past Incidents */}
        {pastIncidents && pastIncidents.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h2 className="text-xl font-bold text-slate-800">Past Incidents</h2>
            <div className="space-y-4">
              {pastIncidents.map((incident: any) => (
                <div key={incident.id} className="bg-white rounded-lg p-5 border shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-800 text-lg">{incident.title}</h3>
                    <span className="text-sm text-slate-500">
                      {new Date(incident.resolved_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="space-y-4 pl-4 border-l-2 border-slate-100">
                    {incident.updates.map((update: any, idx: number) => (
                      <div key={idx} className="relative">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold capitalize text-slate-500">{update.status}</span>
                          <span className="text-xs text-slate-400">— {new Date(update.created_at).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-sm text-slate-700">{update.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="text-center text-sm text-slate-400 pt-8">
          Powered by TracePilot
        </footer>

      </div>
    </div>
  );
}
