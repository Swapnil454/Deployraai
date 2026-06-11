"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronRight, Loader2, AlertCircle } from "lucide-react";

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

  // Fetch Repos on mount
  useEffect(() => {
    fetchRepos();
  }, []);

  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:5000/api/github/repos", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("GitHub connection expired. Please reconnect GitHub.");
        throw new Error("Failed to fetch repositories");
      }
      const data = await res.json();
      setRepos(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async (repo: any) => {
    setSelectedRepo(repo);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:5000/api/github/repos/${repo.owner}/${repo.name}/branches`, { credentials: "include" });
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
      const res = await fetch("http://localhost:5000/api/projects/analyze", {
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
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-black px-4 sm:px-6 lg:px-8 py-10">
      <div className="mx-auto w-full max-w-3xl">
        
        {/* Header & Navigation */}
        <div className="mb-8 flex items-center gap-4">
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">New Deployment</h1>
            <p className="text-sm text-zinc-400">Connect your repository and deploy</p>
          </div>
        </div>

        {/* Stepper Progress */}
        <div className="mb-8 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
          {[
            { num: 1, label: "Repository" },
            { num: 2, label: "Branch" },
            { num: 3, label: "Analysis" },
            { num: 4, label: "Deploy" }
          ].map((s, idx) => (
            <div key={s.num} className="flex flex-1 items-center">
              <div className={`flex items-center gap-2 ${step >= s.num ? 'text-white' : 'text-zinc-600'}`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step >= s.num ? 'bg-indigo-500' : 'bg-zinc-800'}`}>
                  {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
                </div>
                <span className="hidden sm:inline text-sm font-medium">{s.label}</span>
              </div>
              {idx < 3 && <div className={`mx-4 h-px flex-1 ${step > s.num ? 'bg-indigo-500/50' : 'bg-zinc-800'}`} />}
            </div>
          ))}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Content Area */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          
          {/* STEP 1: Repository Selection */}
          {step === 1 && (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-white">Select a Repository</h2>
              {loading ? (
                <div className="flex py-12 justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
              ) : repos.length === 0 ? (
                <p className="text-zinc-400">No public repositories found. Private repos coming soon.</p>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {repos.map(repo => (
                    <button
                      key={repo.id}
                      onClick={() => fetchBranches(repo)}
                      className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/80"
                    >
                      <div>
                        <h3 className="font-medium text-white">{repo.fullName}</h3>
                        <p className="text-xs text-zinc-500 mt-1">Default branch: {repo.defaultBranch}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-zinc-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Branch Selection */}
          {step === 2 && (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-white">Select Branch for {selectedRepo?.name}</h2>
              {loading ? (
                <div className="flex py-12 justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    {branches.map(branch => (
                      <button
                        key={branch.name}
                        onClick={() => setSelectedBranch(branch.name)}
                        className={`flex items-center justify-between rounded-lg border p-4 text-left transition-colors ${selectedBranch === branch.name ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800/80'}`}
                      >
                        <span className="font-medium text-white">{branch.name}</span>
                        {selectedBranch === branch.name && <CheckCircle2 className="h-5 w-5 text-indigo-500" />}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between pt-4">
                    <button 
                      onClick={() => setStep(1)}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white"
                    >
                      Back
                    </button>
                    <button 
                      onClick={handleAnalyze}
                      disabled={!selectedBranch}
                      className="flex items-center gap-2 rounded-lg bg-white px-6 py-2 text-sm font-medium text-black disabled:opacity-50 transition-colors hover:bg-zinc-200"
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
                      const res = await fetch("http://localhost:5000/api/projects", {
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
