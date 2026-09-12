"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronRight, Loader2, AlertCircle, Search } from "lucide-react";

const GithubIcon = (props: any) => (
  <svg {...props} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
);

export default function NewDeploymentPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [analysis, setAnalysis] = useState<any | null>(null);

  // Pagination & Search state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset pagination when debouncedSearch changes
  useEffect(() => {
    setPage(1);
    setRepos([]);
    fetchRepos(1, debouncedSearch, true);
  }, [debouncedSearch]);

  const fetchRepos = async (pageNumber = 1, searchQuery = "", isReset = false) => {
    if (isReset) setLoading(true);
    else setLoadingMore(true);
    
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/github/repos?page=${pageNumber}&limit=10&search=${encodeURIComponent(searchQuery)}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("GitHub connection expired. Please reconnect GitHub.");
        throw new Error("Failed to fetch repositories");
      }
      const data = await res.json();
      setRepos(prev => isReset ? data.repos : [...prev, ...data.repos]);
      setHasMore(data.hasMore);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (isReset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const lastElementRef = useCallback((node: HTMLButtonElement | null) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => {
           fetchRepos(prevPage + 1, debouncedSearch, false);
           return prevPage + 1;
        });
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore, debouncedSearch]);

  const fetchBranches = async (repo: any) => {
    setSelectedRepo(repo);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/github/repos/${repo.owner}/${repo.name}/branches`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch branches");
      const data = await res.json();
      setBranches(data);
      if (data.length > 0) {
        // Auto-select default branch if present, or first branch
        const defaultB = data.find((b: any) => b.name === repo.defaultBranch);
        setSelectedBranch(defaultB ? defaultB.name : data[0].name);
      }
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedRepo || !selectedBranch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/projects/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          owner: selectedRepo.owner,
          repo: selectedRepo.name,
          branch: selectedBranch
        })
      });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setAnalysis(data.analysis);
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col bg-black px-4 sm:px-6 lg:px-8 py-10 overflow-hidden">
      {/* Page Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 mx-auto w-full max-w-3xl">
        
        {/* Header & Navigation */}
        <div className="mb-8 flex items-center gap-4">
          <button 
            onClick={() => router.push('/dashboard')}
            className="group flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] active:scale-95"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">New Deployment</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Connect your repository and deploy</p>
          </div>
        </div>

        {/* Stepper Progress */}
        <div className="mb-10 flex items-center justify-between px-1">
          {[
            { num: 1, label: "Repository" },
            { num: 2, label: "Branch" },
            { num: 3, label: "Analysis" },
            { num: 4, label: "Deploy" }
          ].map((s, idx) => (
            <div key={s.num} className="flex flex-1 items-center">
              <div className={`flex items-center gap-2.5 ${step >= s.num ? 'text-white' : 'text-zinc-500'}`}>
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border transition-all duration-500 ${step >= s.num ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_10px_rgba(37,99,235,0.3)]' : 'bg-zinc-900/50 border-zinc-800 text-zinc-500'}`}>
                  {step > s.num ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.num}
                </div>
                <span className={`hidden sm:inline text-[13px] font-medium ${step === s.num ? 'text-blue-400' : ''}`}>{s.label}</span>
              </div>
              {idx < 3 && <div className={`mx-3 h-[1.5px] flex-1 transition-all duration-500 ${step > s.num ? 'bg-blue-600/70 shadow-[0_0_8px_rgba(37,99,235,0.4)] border-none' : 'bg-transparent border-t-[1.5px] border-dotted border-zinc-700'}`} />}
            </div>
          ))}
        </div>

        {/* Error Alert */}
        {error && !error.toLowerCase().includes("github") && (
          <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-red-900/50 bg-red-900/20 p-3.5 text-red-400 shadow-md backdrop-blur-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Content Area */}
        <div className="relative bg-transparent mt-2">

          {/* STEP 1: Repository Selection */}
          {step === 1 && (
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Select a Repository</h2>
                  <p className="text-sm text-zinc-400 mt-1">Choose the repository you want to deploy from.</p>
                </div>
                
                {/* Search Field */}
                {(!error?.toLowerCase()?.includes("github") && (repos.length > 0 || search || loading)) && (
                  <div className="relative w-full sm:w-64 shrink-0 sm:mr-2">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Search className="w-4 h-4 text-zinc-500" />
                    </div>
                    <input 
                      type="text" 
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search repositories..." 
                      className="w-full bg-zinc-900/50 border border-zinc-800 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-9 p-2 transition-colors"
                    />
                  </div>
                )}
              </div>

              {error?.toLowerCase()?.includes("github") ? (
                <div className="relative overflow-hidden flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl border border-zinc-700/40 bg-gradient-to-b from-zinc-800/40 to-black/40 backdrop-blur-md mt-4 shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                  {/* Subtle Glow inside the warning box */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] bg-blue-500/10 blur-[60px] rounded-full pointer-events-none" />
                  
                  <div className="relative z-10 bg-gradient-to-br from-zinc-700/80 to-zinc-900 p-3 rounded-xl mb-4 border border-zinc-600/50 shadow-lg">
                    <GithubIcon className="w-6 h-6 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
                  </div>
                  <h3 className="relative z-10 text-lg font-bold text-white mb-2">GitHub Not Connected</h3>
                  <p className="relative z-10 mb-6 text-zinc-300 text-sm max-w-sm leading-relaxed">
                    Your GitHub connection is missing or expired. Connect your account to select a repository.
                  </p>
                  <button
                    onClick={() => router.push('/dashboard/settings')}
                    className="relative z-10 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-black transition-all hover:bg-zinc-200 hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.15)] hover:shadow-[0_0_20px_rgba(255,255,255,0.25)]"
                  >
                    Go to Settings
                  </button>
                </div>
              ) : loading && repos.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-full h-20 rounded-lg border border-zinc-800/50 bg-zinc-900/20 animate-pulse"></div>
                  ))}
                </div>
              ) : repos.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 mt-4">
                  <p className="text-zinc-400 text-sm">No repositories found.</p>
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {repos.map((repo, index) => {
                    const isLast = index === repos.length - 1;
                    return (
                      <button
                        ref={isLast ? lastElementRef : null}
                        key={repo.id}
                        onClick={() => fetchBranches(repo)}
                        className="group flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-all hover:border-zinc-600 hover:bg-zinc-800"
                      >
                        <div>
                          <h3 className="font-medium text-white transition-colors group-hover:text-blue-400">{repo.fullName}</h3>
                          <p className="text-xs text-zinc-500 mt-1.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-zinc-700"></span>
                            Default branch: {repo.defaultBranch}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                      </button>
                    )
                  })}
                  {loadingMore && (
                    <div className="w-full h-20 rounded-lg border border-zinc-800/50 bg-zinc-900/20 animate-pulse mt-2"></div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Branch Selection */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-white">Select Branch</h2>
              <p className="mb-6 text-sm text-zinc-400">Choose the branch to deploy for <span className="text-white font-medium">{selectedRepo?.name}</span>.</p>
              
              {loading ? (
                <div className="flex py-12 justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-3 mt-4">
                    {branches.map(branch => (
                      <button
                        key={branch.name}
                        onClick={() => setSelectedBranch(branch.name)}
                        className={`flex items-center justify-between rounded-lg border p-4 text-left transition-all ${selectedBranch === branch.name ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800'}`}
                      >
                        <span className={`font-medium ${selectedBranch === branch.name ? 'text-blue-400' : 'text-white'}`}>{branch.name}</span>
                        {selectedBranch === branch.name && <CheckCircle2 className="h-5 w-5 text-blue-500" />}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center border-t border-zinc-800 pt-6 mt-4">
                    <button 
                      onClick={() => setStep(1)}
                      className="rounded-md px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:text-white hover:bg-zinc-800"
                    >
                      Back
                    </button>
                    <button 
                      onClick={handleAnalyze}
                      disabled={!selectedBranch}
                      className="flex items-center gap-2 rounded-md bg-white px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-50 transition-all hover:bg-zinc-200"
                    >
                      Analyze Project
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Analysis Results */}
          {step === 3 && analysis && (
            <div>
              <h2 className="mb-6 text-lg font-semibold text-white">Project Analysis complete</h2>
              
              <div className="space-y-4">
                
                {/* Structure / Monorepo Flag */}
                <div className="rounded-lg bg-zinc-800/40 p-4 border border-zinc-800">
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Architecture</span>
                  <p className="text-white font-medium">{analysis.isMonorepo ? "Monorepo (Client & Server detected)" : "Single Application"}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Frontend Details */}
                  {analysis.frontend.detected && (
                    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4">
                      <h3 className="mb-3 font-semibold text-indigo-400 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" /> Frontend Detected
                      </h3>
                      <div className="space-y-2 text-sm text-zinc-300">
                        <p><span className="text-zinc-500">Framework:</span> {analysis.frontend.framework}</p>
                        <p><span className="text-zinc-500">Path:</span> {analysis.frontend.path}</p>
                        <p><span className="text-zinc-500">Build:</span> {analysis.frontend.buildCommand}</p>
                      </div>
                    </div>
                  )}

                  {/* Backend Details */}
                  {analysis.backend.detected && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <h3 className="mb-3 font-semibold text-emerald-400 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" /> Backend Detected
                      </h3>
                      <div className="space-y-2 text-sm text-zinc-300">
                        <p><span className="text-zinc-500">Framework:</span> {analysis.backend.framework}</p>
                        <p><span className="text-zinc-500">Path:</span> {analysis.backend.path}</p>
                        <p><span className="text-zinc-500">Start:</span> {analysis.backend.startCommand}</p>
                      </div>
                    </div>
                  )}

                  {/* DB Details */}
                  {analysis.database.detected && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 sm:col-span-2">
                      <h3 className="mb-3 font-semibold text-amber-400 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" /> Database Detected
                      </h3>
                      <div className="space-y-2 text-sm text-zinc-300">
                        <p><span className="text-zinc-500">Type:</span> {analysis.database.type} ({analysis.database.orm})</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Warnings */}
                {analysis.warnings.length > 0 && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 mt-6">
                    <h3 className="mb-2 font-semibold text-yellow-500 text-sm">Warnings</h3>
                    <ul className="list-disc pl-4 space-y-1 text-sm text-yellow-200/80">
                      {analysis.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}

              </div>

              <div className="flex justify-between pt-8">
                <button 
                  onClick={() => setStep(2)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white"
                >
                  Back
                </button>
                <button 
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/projects`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                          owner: selectedRepo.owner,
                          repo: selectedRepo.name,
                          branch: selectedBranch,
                          fullName: selectedRepo.fullName,
                          htmlUrl: selectedRepo.htmlUrl,
                          defaultBranch: selectedRepo.defaultBranch,
                          analysis: analysis
                        })
                      });
                      if (!res.ok) throw new Error("Failed to save project");
                      const data = await res.json();
                      router.push(`/dashboard/projects/${data.projectId}/configure`);
                    } catch(err: any) {
                      setError(err.message);
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Continue to Configure
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
