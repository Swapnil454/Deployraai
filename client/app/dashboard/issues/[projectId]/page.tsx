"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { AlertCircle, Search, History, ChevronRight } from "lucide-react";

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
    if (status === 'resolved') return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Resolved</Badge>;
    if (status === 'ignored') return <Badge variant="outline" className="bg-zinc-800/50 text-zinc-400 border-zinc-700">Ignored</Badge>;
    if (status === 'regressed') return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">Regressed</Badge>;
    return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">Open</Badge>;
  }

  if (project && !project.analytics?.verified && false) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#050505] text-zinc-200 pb-20 font-sans p-6 pt-12">
        <ObservabilitySetup project={project} onVerified={fetchIssues} />
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0 font-sans">
      {/* Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 p-6 pt-6 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          
          {/* HEADER & CONTROLS */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-zinc-800/60 pb-5">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-orange-500" />
                Issue Inbox
              </h1>
              <p className="text-sm text-zinc-400 mt-1">Grouped errors waiting for resolution.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              {/* Search Bar */}
              <div className="relative w-full sm:w-[320px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input 
                  placeholder="Search by title or message..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchIssues()}
                  className="w-full pl-9 bg-zinc-900/50 border-zinc-800/60 text-sm text-zinc-200 placeholder:text-zinc-500 h-9 rounded-lg focus-visible:ring-1 focus-visible:ring-zinc-700"
                />
              </div>

              {/* Status Filter */}
              <div className="w-full sm:w-[150px]">
                <CustomSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "all", label: "All Issues" },
                    { value: "open", label: "Open" },
                    { value: "regressed", label: "Regressed" },
                    { value: "resolved", label: "Resolved" },
                    { value: "ignored", label: "Ignored" }
                  ]}
                  placeholder="Status"
                />
              </div>

              <Link href={`/dashboard/issues/${projectId}/alerts`}>
                <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-sm font-medium text-zinc-300 transition-colors">
                  <History className="h-4 w-4" />
                  History
                </button>
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="flex flex-col gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-full h-28 rounded-xl border border-zinc-800/60 bg-zinc-900/40 animate-pulse" />
                ))}
              </div>
            ) : issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 border border-zinc-800/60 border-dashed rounded-xl bg-zinc-900/20">
                <AlertCircle className="h-10 w-10 text-zinc-600 mb-4" />
                <p className="text-zinc-400 font-medium text-lg">No issues found</p>
                <p className="text-sm text-zinc-500 mt-1">Try adjusting your filters or search query.</p>
              </div>
            ) : (
              issues.map((issue: any) => (
                <Link key={issue.id} href={`/dashboard/issues/${projectId}/${issue.id}`} className="block group">
                  <div className="w-full rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-200">
                    <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg text-white truncate max-w-2xl">{issue.title}</h3>
                          {getStatusBadge(issue.status)}
                          <Badge variant="outline" className={`capitalize text-xs font-medium ${
                            issue.severity === 'critical' ? 'border-red-500/30 text-red-400 bg-red-500/10' : 
                            issue.severity === 'error' ? 'border-orange-500/30 text-orange-400 bg-orange-500/10' :
                            issue.severity === 'warning' ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' :
                            'border-zinc-700 text-zinc-400'
                          }`}>
                            {issue.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-400 line-clamp-1 max-w-3xl leading-relaxed">{issue.message}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500 font-medium">
                          <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div> Seen {new Date(issue.last_seen_at).toLocaleString()}</span>
                          <span className="text-zinc-700">•</span>
                          <span>First seen {new Date(issue.first_seen_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6 shrink-0">
                        <div className="flex flex-row md:flex-col gap-6 md:gap-4 text-right">
                          <div className="flex flex-col items-end">
                            <div className="text-[15px] font-semibold text-zinc-200">{issue.event_count.toLocaleString()}</div>
                            <div className="text-[11px] font-medium tracking-wider uppercase text-zinc-500 mt-0.5">Events</div>
                          </div>
                          <div className="flex flex-col items-end">
                            <div className="text-[15px] font-semibold text-zinc-200">{issue.affected_users ? issue.affected_users.toLocaleString() : 0}</div>
                            <div className="text-[11px] font-medium tracking-wider uppercase text-zinc-500 mt-0.5">Users</div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-zinc-600 group-hover:text-zinc-300 transition-colors hidden md:block ml-2" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
