"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2, Plus, Search } from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/ProjectAvatar";

type Project = {
  _id: string;
  repoName?: string;
  name?: string;
};

export default function MonitoringProjectSelectorPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/projects`, {
          credentials: "include"
        });

        if (!response.ok) return;
        const data = await response.json();
        setProjects(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load projects for monitoring:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, []);

  const visibleProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;

    return projects.filter((project) =>
      (project.repoName || project.name || "").toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  return (
    <main className="flex min-h-[calc(100vh-48px)] w-full flex-1 flex-col items-center bg-black px-6" style={{ paddingTop: "11vh" }}>
      <section className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10">
            <Activity className="h-[18px] w-[18px] text-indigo-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Continue to Monitoring</h1>
          <p className="mt-1 text-sm text-zinc-400">Choose a project to view its service health</p>
        </div>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Find project..."
            className="h-10 w-full rounded-md border border-zinc-800 bg-[#0a0a0a] py-2 pl-9 pr-3 text-sm font-medium text-white outline-none transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 placeholder:text-zinc-500"
          />
        </div>

        <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
          ) : visibleProjects.length ? (
            visibleProjects.map((project) => (
              <button
                key={project._id}
                type="button"
                onClick={() => router.push(`/dashboard/projects/${project._id}/monitoring`)}
                className="group flex w-full items-center gap-3 rounded-md bg-[#0a0a0a]/50 px-3 py-2 text-left transition hover:bg-zinc-900"
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  <ProjectAvatar project={project} />
                </div>
                <span className="truncate text-sm font-medium text-zinc-300 group-hover:text-white">
                  {project.repoName || project.name || "Untitled project"}
                </span>
                <Activity className="ml-auto h-3.5 w-3.5 text-zinc-600 transition group-hover:text-indigo-400" />
              </button>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-zinc-500">No projects found.</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => router.push("/dashboard/new-deployment")}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
        >
          <Plus className="h-4 w-4" /> Create Project
        </button>
      </section>
    </main>
  );
}
