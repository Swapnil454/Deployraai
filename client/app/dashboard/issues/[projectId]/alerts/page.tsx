"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
export default function AlertHistoryPage() {
  const params = useParams();
  const projectId = params?.projectId;
    const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    fetchHistory();
  }, [projectId]);

  async function fetchHistory() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/history`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    if (status === 'sent') return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Delivered</Badge>;
    if (status === 'queued') return <Badge variant="secondary">Queued</Badge>;
    if (status === 'suppressed') return <Badge variant="outline" className="text-gray-500">Suppressed</Badge>;
    if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
    return <Badge>{status}</Badge>;
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alert History</h1>
        <p className="text-muted-foreground">Recent alerts triggered by your rules.</p>
      </div>

      <div className="space-y-4">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts have been triggered yet.</p>
        ) : (
          history.map((event: any) => (
            <Card key={event.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{event.title}</h3>
                      {getStatusBadge(event.status)}
                      <Badge variant="outline">{event.severity}</Badge>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Rule: {event.rule_name || 'Deleted Rule'}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{event.message}</p>
                    {event.fingerprint && (
                      <p className="text-xs text-muted-foreground font-mono mt-2">Fingerprint: {event.fingerprint}</p>
                    )}
                    {event.error_message && (
                      <p className="text-xs text-red-500 mt-1">Delivery Error: {event.error_message}</p>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-xs text-muted-foreground">{new Date(event.triggered_at).toLocaleString()}</p>
                    <p className="text-xs font-medium">via {event.route_type}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
