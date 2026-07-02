"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

export default function IssueInboxPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [issues, setIssues] = useState([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!projectId) return;
    fetchIssues();
  }, [projectId, statusFilter]);

  async function fetchIssues() {
    try {
      setLoading(true);
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues`);
      if (statusFilter !== "all") url.searchParams.set("status", statusFilter);
      if (search) url.searchParams.set("search", search);

      const [issuesRes, projectRes] = await Promise.all([
        fetch(url.toString(), { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, { credentials: "include" })
      ]);
      
      if (issuesRes.ok) {
        const data = await issuesRes.json();
        setIssues(data);
      }
      if (projectRes.ok) {
        setProject(await projectRes.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    if (status === 'resolved') return <Badge className="bg-green-500/10 text-green-500">Resolved</Badge>;
    if (status === 'ignored') return <Badge variant="outline" className="text-gray-500">Ignored</Badge>;
    if (status === 'regressed') return <Badge variant="destructive">Regressed</Badge>;
    return <Badge variant="default" className="bg-blue-500/10 text-blue-500">Open</Badge>;
  }

  if (project && !project.analytics?.verified) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pt-8">
        <ObservabilitySetup project={project} onVerified={fetchIssues} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Issue Inbox</h1>
          <p className="text-muted-foreground">Grouped errors waiting for resolution.</p>
        </div>
        <Link href={`/dashboard/issues/${projectId}/alerts`}>
          <Button variant="outline">View Alert History</Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Issues</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="regressed">Regressed</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1">
          <Input 
            placeholder="Search by title or message..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchIssues()}
          />
        </div>
        <Button onClick={fetchIssues} variant="secondary">Search</Button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading issues...</div>
        ) : issues.length === 0 ? (
          <div className="p-8 text-center border rounded-lg border-dashed text-muted-foreground">
            No issues found matching the current filters.
          </div>
        ) : (
          issues.map((issue: any) => (
            <Card key={issue.id} className="hover:border-foreground/20 transition-colors">
              <Link href={`/dashboard/issues/${projectId}/${issue.id}`}>
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg truncate">{issue.title}</h3>
                      {getStatusBadge(issue.status)}
                      <Badge variant="outline" className={issue.severity === 'critical' ? 'border-red-500 text-red-500' : ''}>
                        {issue.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{issue.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Seen {new Date(issue.last_seen_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>First seen {new Date(issue.first_seen_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-row md:flex-col gap-4 text-right shrink-0">
                    <div>
                      <div className="text-sm font-medium text-foreground">{issue.event_count}</div>
                      <div className="text-xs text-muted-foreground">Events</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{issue.affected_users || 0}</div>
                      <div className="text-xs text-muted-foreground">Users</div>
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
