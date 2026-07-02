"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, ShieldAlert } from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";

export default function AlertsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  const lastUpdated = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const delay = 300;     
    const maxWait = 1000;  

    if (now - lastUpdated.current >= maxWait) {
      setDebouncedSearch(searchQuery);
      lastUpdated.current = now;
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDebouncedSearch(searchQuery);
        lastUpdated.current = Date.now();
      }, delay);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [searchQuery]);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjects(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div 
      className="w-full flex-1 flex flex-col items-center bg-black px-8" 
      style={{ paddingTop: '11vh' }}
    >
      <div className="max-w-sm w-full flex flex-col items-center">
        {/* Header Icon & Text */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-10 w-10 rounded-xl border border-zinc-800 flex items-center justify-center mb-4 bg-zinc-900/50">
            <ShieldAlert className="h-5 w-5 text-zinc-400" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-1">Alert Rules</h1>
          <p className="text-[14px] text-zinc-400">Choose a project to continue</p>
        </div>

        {/* Content Area */}
        <div className="w-full flex flex-col gap-0">
          {/* Search Bar */}
          <input
            type="text"
            placeholder="Find Project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-[14px] font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-all mb-2"
          />

          {/* Project List */}
          <div className="flex flex-col gap-1 w-full max-h-[300px] overflow-y-auto pr-1">
            {loadingProjects ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 text-zinc-500 animate-spin" />
              </div>
            ) : projects.length > 0 ? (
              projects.map((p: any) => (
                <button
                  key={p._id}
                  onClick={() => router.push(`/dashboard/alerts/${p._id}`)}
                  className="w-full flex items-center gap-3 py-1.5 px-3 rounded-md hover:bg-zinc-900 text-left transition-colors group bg-[#0a0a0a]/50"
                >
                  <div className="h-5 w-5 shrink-0 flex items-center justify-center overflow-hidden rounded-full">
                    <ProjectAvatar project={p} />
                  </div>
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white truncate">
                    {p.repoName}
                  </span>
                </button>
              ))
            ) : (
              <div className="text-center py-4 text-[13px] text-zinc-500">
                No projects found.
              </div>
            )}
          </div>

          {/* Create Project Link */}
          <button
            onClick={() => router.push('/dashboard/new-deployment')}
            className="w-full flex items-center gap-2 py-1.5 px-3 rounded-md hover:bg-zinc-900 text-left transition-colors text-zinc-400 hover:text-white"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Create Project</span>
          </button>
        </div>
      </div>
    </div>
  );
}
