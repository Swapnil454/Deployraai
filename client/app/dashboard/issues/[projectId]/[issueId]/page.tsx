"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { CustomSelect } from "@/components/ui/CustomSelect";
import Link from "next/link";
import { ArrowLeft, Clock, Activity, ShieldAlert, Sparkles, Loader2, GitPullRequest, MonitorPlay, AlertTriangle, MessageSquare, Terminal } from "lucide-react";
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
        fetch(`${process.env.NEXT_PUBLIC_ANALYTICS_API_URL}/issues/${projectId}/${issueId}/events`, { credentials: "include" }),
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(errData.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setAiDiagnosis(data);
    } catch (err: any) {
      console.error(err);
      alert(`AI Diagnosis failed: ${err.message}`);
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
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] bg-[#050505]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <div className="text-zinc-400 font-medium">Loading issue details...</div>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] bg-[#050505]">
        <AlertTriangle className="w-10 h-10 text-zinc-600 mb-4" />
        <div className="text-zinc-400 font-medium text-lg">Issue not found</div>
      </div>
    );
  }

  const stacktrace = issue.latest_deobfuscated_stacktrace || issue.latest_stacktrace;

  return (
    <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#020202] pb-20 shrink-0 font-sans">
      {/* Darker Ambient Glows */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-900/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-900/5 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 p-5 pt-6 w-full flex-1">
        <div className="max-w-[1152px] w-full mx-auto">
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-6 border-b border-white/15 pb-5 relative">
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400 mb-3 break-words drop-shadow-sm">{issue.title}</h1>
              
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <Badge variant="outline" className={`capitalize text-[10px] font-semibold tracking-wider px-2.5 py-0.5 ${
                  issue.severity === 'critical' ? 'border-red-500/40 text-red-300 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 
                  issue.severity === 'error' ? 'border-orange-500/40 text-orange-300 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.1)]' :
                  issue.severity === 'warning' ? 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10 shadow-[0_0_15px_rgba(234,179,8,0.1)]' :
                  'border-zinc-500/40 text-zinc-300 bg-zinc-500/10 shadow-[0_0_15px_rgba(161,161,170,0.1)]'
                }`}>
                  {issue.severity}
                </Badge>
                
                <div className="flex items-center gap-3 bg-white/[0.04] px-3 py-1 rounded-full border border-white/5 backdrop-blur-md shadow-inner">
                  <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-zinc-500"/> <span className="font-medium text-zinc-300">First seen:</span> {new Date(issue.first_seen_at).toLocaleString()}</span>
                  <div className="w-[1px] h-3 bg-white/10" />
                  <span className="flex items-center gap-1.5"><Activity className="w-3 h-3 text-zinc-500"/> <span className="font-medium text-zinc-300">Events:</span> {issue.event_count.toLocaleString()}</span>
                  <div className="w-[1px] h-3 bg-white/10" />
                  <span className="flex items-center gap-1.5"><ShieldAlert className="w-3 h-3 text-zinc-500"/> <span className="font-medium text-zinc-300">Fingerprint:</span> <code className="text-[10px] font-bold tracking-wider bg-white/10 text-white px-1.5 py-0.5 rounded shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">{issue.fingerprint.substring(0,8)}</code></span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
              <div className="w-[130px] shadow-[0_4px_10px_rgba(0,0,0,0.3)] rounded-lg">
                <CustomSelect
                  value={issue.status}
                  onChange={updateStatus}
                  disabled={isUpdatingStatus}
                  options={[
                    { value: "open", label: "Open" },
                    { value: "resolved", label: "Resolved" },
                    { value: "ignored", label: "Ignored" },
                    { value: "regressed", label: "Regressed" }
                  ]}
                  placeholder="Status"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* LEFT COLUMN - MAIN CONTENT */}
            <div className="lg:col-span-2 space-y-5">
              
              {/* ERROR DETAILS */}
              <div className="w-full rounded-2xl border border-white/5 bg-white/[0.04] backdrop-blur-3xl shadow-[0_12px_40px_rgba(0,0,0,0.6),_inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 bg-transparent flex items-center gap-2 relative overflow-hidden">
                  <div className="p-1.5 rounded-md bg-white/10 border border-white/10 shadow-sm">
                    <Terminal className="w-3.5 h-3.5 text-zinc-200" />
                  </div>
                  <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-widest drop-shadow-sm">Error Details</h2>
                </div>
                <div className="p-5 space-y-5 bg-gradient-to-b from-transparent to-black/40">
                  <div className="bg-white/5 border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),_0_4px_12px_rgba(0,0,0,0.5)] p-4 rounded-xl backdrop-blur-md">
                    {issue.exception_type && <div className="font-bold text-sm text-red-300 mb-2">{issue.exception_type}</div>}
                    <div className="text-sm font-mono text-red-500 whitespace-pre-wrap break-all leading-relaxed drop-shadow-sm">{issue.message}</div>
                  </div>

                  {stacktrace && (
                    <div className="pt-1">
                      <h4 className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-2">
                        Latest Stack Trace
                      </h4>
                      <pre className="bg-[#050505] border border-white/5 text-zinc-300 p-4 rounded-xl overflow-x-auto text-xs font-mono leading-loose shadow-[inset_0_2px_15px_rgba(0,0,0,1)] custom-scrollbar backdrop-blur-xl relative">
                        {stacktrace}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* AI ROOT CAUSE */}
              <div className="w-full rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.6),_inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden relative group">
                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1 h-12 bg-white rounded-r-md shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
                
                <div className="px-5 py-4  flex flex-col sm:flex-row sm:items-center justify-between gap-3  relative pl-5">
                  <div className="flex items-center gap-2">
                    <img src="/ai-icon.svg" alt="AI" className="w-10 h-10 object-contain" />
                    <h2 className="text-xs font-bold text-white uppercase tracking-widest drop-shadow-sm">
                      AI Root Cause Analysis
                    </h2>
                  </div>
                  
                  {!aiDiagnosis && (
                    <button 
                      onClick={handleDiagnose} 
                      disabled={isDiagnosing}
                      className="flex items-center gap-2 h-8 px-4 rounded-lg bg-blue-500 hover:bg-blue-700  text-[11px] font-bold text-white transition-all disabled:opacity-50 disabled:pointer-events-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
                    >
                      {isDiagnosing ? (
                         <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                      ) : (
                         <><img src="/ai-icon.svg" alt="AI" className="w-6 h-6 object-contain" /> Diagnose Issue</>
                      )}
                    </button>
                  )}
                </div>
                
                {aiDiagnosis && (
                  <div className="p-5 space-y-6 bg-gradient-to-b from-transparent to-black/40">
                    <div>
                      <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-3">Root Cause</h3>
                      <div className="text-zinc-200 leading-relaxed text-sm prose prose-invert max-w-none">
                        <ReactMarkdown>{aiDiagnosis.analysis_text}</ReactMarkdown>
                      </div>
                    </div>
                    
                    <div className="border-t border-white/5 pt-5">
                      <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-3">Suggested Fix</h3>
                      <div className="text-zinc-200 leading-relaxed text-sm prose prose-invert max-w-none bg-white/[0.04] p-4 rounded-xl border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                        <ReactMarkdown>{aiDiagnosis.suggested_fix}</ReactMarkdown>
                      </div>
                    </div>
                    
                    <div className="border-t border-white/5 pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="text-xs text-zinc-400 font-medium">
                        Automatically rewrite the affected file and open a Pull Request.
                      </div>
                      {aiDiagnosis.fix_pr_url ? (
                        <a href={aiDiagnosis.fix_pr_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <button className="flex items-center gap-2 h-9 px-5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                            <GitPullRequest className="w-3.5 h-3.5" />
                            View Pull Request
                          </button>
                        </a>
                      ) : (
                        <button 
                          onClick={handleCreatePr} 
                          disabled={isFixing}
                          className="shrink-0 flex items-center gap-2 h-9 px-5 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-[0_4px_10px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {isFixing ? (
                             <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rewriting...</>
                          ) : (
                             <><GitPullRequest className="w-3.5 h-3.5" /> Create Auto-Fix PR</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* RECENT EVENTS */}
              <div className="w-full rounded-2xl border border-white/5 bg-white/[0.04] backdrop-blur-3xl shadow-[0_12px_40px_rgba(0,0,0,0.6),_inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 bg-transparent flex items-center gap-2 relative">
                  <div className="p-1.5 rounded-md bg-white/10 border border-white/10 shadow-sm">
                    <Activity className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-widest drop-shadow-sm">Recent Events</h2>
                </div>
                <div className="p-0 bg-gradient-to-b from-transparent to-black/40">
                  {events.length === 0 ? (
                    <div className="p-8 text-center text-xs font-medium text-zinc-500">No detailed events stored.</div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {events.map((ev) => (
                        <div key={ev.id} className="p-4 hover:bg-white/[0.03] transition-colors flex flex-col gap-2.5">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <span className="text-xs font-bold text-zinc-300">{new Date(ev.occurred_at).toLocaleString()}</span>
                            <div className="flex items-center gap-2">
                              {ev.session_id && (
                                <Link href={`/dashboard/observability/sessions/${ev.session_id}?projectId=${projectId}`}>
                                  <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-indigo-500/30 bg-indigo-500/15 hover:bg-indigo-500/25 text-[11px] font-bold text-indigo-300 transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                                    <MonitorPlay className="w-3 h-3" />
                                    Watch Session
                                  </button>
                                </Link>
                              )}
                              <Link href={`/dashboard/observability/logs/${projectId}?traceId=${ev.trace_id}`}>
                                <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/10 hover:bg-white/15 text-[11px] font-bold text-white transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                                  View Trace
                                </button>
                              </Link>
                            </div>
                          </div>
                          <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-x-4 gap-y-1 bg-[#050505]/80 p-2.5 rounded-lg border border-white/5 shadow-inner">
                            {ev.environment && <span><span className="text-zinc-500 font-medium mr-1">Env:</span> <span className="text-zinc-300">{ev.environment}</span></span>}
                            {ev.release && <span><span className="text-zinc-500 font-medium mr-1">Release:</span> <span className="text-zinc-300">{ev.release}</span></span>}
                            {ev.user_id && <span><span className="text-zinc-500 font-medium mr-1">User:</span> <span className="text-zinc-300">{ev.user_id}</span></span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN - SIDEBAR */}
            <div className="space-y-5">
              
              {/* ACTIVITY & COMMENTS */}
              <div className="w-full rounded-2xl border border-white/5 bg-white/[0.04] backdrop-blur-3xl shadow-[0_12px_40px_rgba(0,0,0,0.6),_inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden flex flex-col h-[520px] sticky top-6">
                <div className="px-5 py-4 border-b border-white/5 bg-transparent flex items-center gap-2 relative">
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-300" />
                  <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-widest drop-shadow-sm">Activity & Comments</h2>
                </div>
                
                <div className="p-5 flex-1 flex flex-col justify-between bg-gradient-to-b from-transparent to-black/40 overflow-hidden">
                  <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2 mb-4 flex-1">
                    {comments.length === 0 ? (
                      <div className="text-xs text-zinc-500 font-medium text-center italic py-10 bg-black/60 rounded-xl border border-white/5 shadow-inner">No comments yet.</div>
                    ) : (
                      comments.map(c => (
                        <div key={c.id} className="bg-white/[0.03] border border-white/10 p-4 rounded-xl text-xs group hover:bg-white/[0.05] transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                          <div className="text-[10px] text-zinc-500 mb-1.5 font-bold tracking-wide uppercase">{new Date(c.created_at).toLocaleString()}</div>
                          <div className="text-zinc-200 leading-relaxed whitespace-pre-wrap">{c.body}</div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="space-y-3 pt-4 border-t border-white/5 relative">
                    <Textarea 
                      placeholder="Leave a comment or note..." 
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="bg-[#050505] border-white/10 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] focus-visible:ring-1 focus-visible:ring-zinc-500 resize-none min-h-[90px] text-xs text-zinc-200 placeholder:text-zinc-600 rounded-xl p-3 custom-scrollbar"
                    />
                    <button 
                      className="w-full h-9 rounded-lg bg-white/90 text-zinc-900 hover:bg-white border border-transparent text-xs font-bold transition-all disabled:opacity-50 disabled:pointer-events-none shadow-[0_2px_10px_rgba(255,255,255,0.2)]" 
                      onClick={postComment} 
                      disabled={!newComment.trim()}
                    >
                      Post Comment
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}} />
    </div>
  );
}
