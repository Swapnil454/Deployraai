"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft, Clock, Activity, ShieldAlert, Sparkles, Loader2, GitPullRequest } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from 'react-markdown';

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId;
  const issueId = params?.issueId;
    const [issue, setIssue] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newComment, setNewComment] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  const [aiDiagnosis, setAiDiagnosis] = useState<any>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    if (!projectId || !issueId) return;
    fetchData();
  }, [projectId, issueId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [issueRes, eventsRes, commentsRes, aiRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues/${issueId}`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues/${issueId}/events`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues/${issueId}/comments`, { credentials: "include" }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues/${issueId}/diagnose`, { credentials: "include" })
      ]);

      if (issueRes.ok) setIssue(await issueRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
      if (commentsRes.ok) setComments(await commentsRes.json());
      if (aiRes.ok) setAiDiagnosis(await aiRes.json());

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!issue || isUpdatingStatus) return;
    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues/${issueId}/status`, {
        method: 'PATCH',
        credentials: "include",
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const updated = await res.json();
        setIssue(updated);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function postComment() {
    if (!newComment.trim()) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues/${issueId}/comments`, {
        method: 'POST',
        credentials: "include",
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: newComment })
      });
      if (res.ok) {
        const comment = await res.json();
        setComments([...comments, comment]);
        setNewComment("");
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDiagnose() {
    try {
      setIsDiagnosing(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues/${issueId}/diagnose`, {
        method: 'POST',
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAiDiagnosis(data);
    } catch (err) {
      console.error(err);
      alert("Failed to generate AI Diagnosis.");
    } finally {
      setIsDiagnosing(false);
    }
  }

  async function handleCreatePr() {
    if (!aiDiagnosis) return;
    try {
      setIsFixing(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/issues/${issueId}/create-pr`, {
        method: 'POST',
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAiDiagnosis({ ...aiDiagnosis, fix_pr_url: data.pr_url });
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to create Auto-Fix PR.");
    } finally {
      setIsFixing(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading issue details...</div>;
  }

  if (!issue) {
    return <div className="p-8 text-center text-muted-foreground">Issue not found.</div>;
  }

  const stacktrace = issue.latest_deobfuscated_stacktrace || issue.latest_stacktrace;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{issue.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <Badge variant="outline" className={issue.severity === 'critical' ? 'border-red-500 text-red-500' : ''}>
              {issue.severity}
            </Badge>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> First seen: {new Date(issue.first_seen_at).toLocaleString()}</span>
            <span className="flex items-center gap-1"><Activity className="w-3 h-3"/> Events: {issue.event_count}</span>
            <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> Fingerprint: <code className="text-xs bg-muted p-1 rounded">{issue.fingerprint.substring(0,8)}</code></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={issue.status} onValueChange={updateStatus} disabled={isUpdatingStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
              <SelectItem value="regressed">Regressed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Error Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="font-semibold text-red-500 mb-2">{issue.exception_type}</div>
                <div className="text-sm font-mono whitespace-pre-wrap break-all">{issue.message}</div>
              </div>

              {stacktrace && (
                <div>
                  <h4 className="font-medium mb-2">Latest Stack Trace</h4>
                  <pre className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-x-auto text-xs font-mono leading-relaxed">
                    {stacktrace}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-indigo-200 overflow-hidden shadow-sm relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
            <CardHeader className="bg-indigo-50/50 flex flex-row items-center justify-between py-4">
              <div>
                <CardTitle className="text-indigo-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                  AI Root Cause Analysis
                </CardTitle>
              </div>
              {!aiDiagnosis && (
                <Button 
                  onClick={handleDiagnose} 
                  disabled={isDiagnosing}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isDiagnosing ? (
                     <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                  ) : (
                     <><Sparkles className="w-4 h-4 mr-2" /> Diagnose Issue</>
                  )}
                </Button>
              )}
            </CardHeader>
            {aiDiagnosis && (
              <CardContent className="pt-6 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Root Cause</h3>
                  <div className="text-slate-800 leading-relaxed text-sm">
                    <ReactMarkdown>{aiDiagnosis.analysis_text}</ReactMarkdown>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Suggested Fix</h3>
                  <div className="prose prose-sm max-w-none text-slate-800">
                    <ReactMarkdown>{aiDiagnosis.suggested_fix}</ReactMarkdown>
                  </div>
                </div>
                
                <div className="border-t pt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Automatically rewrite the affected file and open a GitHub Pull Request.
                  </div>
                  {aiDiagnosis.fix_pr_url ? (
                    <a href={aiDiagnosis.fix_pr_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                        <GitPullRequest className="w-4 h-4" />
                        View Pull Request
                      </Button>
                    </a>
                  ) : (
                    <Button 
                      onClick={handleCreatePr} 
                      disabled={isFixing}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                    >
                      {isFixing ? (
                         <><Loader2 className="w-4 h-4 animate-spin" /> Rewriting Code...</>
                      ) : (
                         <><GitPullRequest className="w-4 h-4" /> Create Auto-Fix PR</>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Events</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground">No detailed events stored.</div>
              ) : (
                <div className="space-y-4">
                  {events.map((ev) => (
                    <div key={ev.id} className="border-b last:border-0 pb-4 last:pb-0 flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium">{new Date(ev.occurred_at).toLocaleString()}</span>
                        <Link href={`/dashboard/logs/${projectId}?traceId=${ev.trace_id}`}>
                          <Button variant="link" size="sm" className="h-auto p-0">View Trace</Button>
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-4">
                        {ev.environment && <span>Env: {ev.environment}</span>}
                        {ev.release && <span>Release: {ev.release}</span>}
                        {ev.user_id && <span>User: {ev.user_id}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Activity & Comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {comments.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center italic">No comments yet.</div>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="bg-muted p-3 rounded-lg text-sm">
                      <div className="text-xs text-muted-foreground mb-1">{new Date(c.created_at).toLocaleString()}</div>
                      <div>{c.body}</div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="space-y-2">
                <Textarea 
                  placeholder="Leave a comment or note..." 
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <Button className="w-full" onClick={postComment} disabled={!newComment.trim()}>
                  Post Comment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
