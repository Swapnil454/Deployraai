"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter, useParams, useSearchParams } from "next/navigation";
import { Search, Plus, ChevronsUpDown, X } from "lucide-react";
import { ProjectAvatar } from "./ProjectAvatar";

// Simple mapping for titles
const TITLE_MAP: Record<string, string> = {
  "/dashboard/projects": "Overview",
  "/dashboard/logs": "Logs",
  "/dashboard/analytics": "Analytics",
  "/dashboard/domains": "Domains",
  "/dashboard/usages": "Usages",
  "/dashboard/backend-usage": "Backend Usage",
  "/dashboard/workflows": "Workflows",
  "/dashboard/support": "Support",
  "/dashboard/settings": "Settings",
  "/dashboard/deployments/frontend": "Frontend Deployments",
  "/dashboard/deployments/backend": "Backend Deployments",
  "/dashboard/deployments/fullstack": "Fullstack Deployments"
};

export const Header = ({ projects }: { projects: any[] }) => {
  const pathname = usePathname() || "";
  const router = useRouter();
  const params = useParams() as any;
  const searchParams = useSearchParams();
  
  const currentProjectId = params?.projectId || params?.id || searchParams?.get('projectId');
  const currentProject = currentProjectId ? projects.find((p: any) => p._id === currentProjectId) : null;
  
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isProjectDropdownOpen) {
        setIsProjectDropdownOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isProjectDropdownOpen]);

  let currentTitle = TITLE_MAP[pathname] || "Overview";
  
  // Dynamic titles for dynamic routes
  if (pathname.startsWith("/dashboard/logs/")) {
    currentTitle = "Deployment Logs";
  } else if (pathname.startsWith("/dashboard/analytics/")) {
    currentTitle = "Analytics";
  }

  return (
    <div className="w-full border-b border-zinc-800 bg-black px-8 h-[48px] shrink-0 sticky top-0 z-40">
      <div className="max-w-[1440px] w-full mx-auto flex items-center justify-between relative h-full">
        {/* Left: All Projects Dropdown */}
        <div className="flex-1 flex items-center h-full">
          <div className="relative h-full flex items-center">
            <div className="flex items-center gap-1 group">
              <button 
                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                className={`flex items-center gap-1.5 text-[14px] font-semibold transition-colors px-2 py-1.5 -ml-2 rounded-md ${isProjectDropdownOpen ? 'bg-zinc-900/80 text-white' : 'text-zinc-200 hover:bg-zinc-900/50 hover:text-white'}`}
              >
                {currentProject ? (
                  <>
                    <div className="h-5 w-5 shrink-0 flex items-center justify-center overflow-hidden rounded-full">
                      <ProjectAvatar project={currentProject} />
                    </div>
                    {currentProject.repoName}
                  </>
                ) : (
                  "All Projects"
                )}
                <ChevronsUpDown className="h-4 w-4 text-zinc-400" />
              </button>

              {currentProject && (
                <button
                  onClick={() => {
                    if (pathname.startsWith('/dashboard/deployments')) {
                      router.push('/dashboard/deployments/fullstack');
                    } else if (pathname.startsWith('/dashboard/logs')) {
                      router.push('/dashboard/logs');
                    } else if (pathname.startsWith('/dashboard/domains')) {
                      router.push('/dashboard/domains');
                    } else if (pathname.startsWith('/dashboard/usages')) {
                      router.push('/dashboard/usages');
                    } else if (pathname.startsWith('/dashboard/backend-usage')) {
                      router.push('/dashboard/backend-usage');
                    } else if (pathname.startsWith('/dashboard/frontend-usage')) {
                      router.push('/dashboard/frontend-usage');
                    } else if (pathname.startsWith('/dashboard/workflows')) {
                      router.push('/dashboard/workflows');
                    } else {
                      router.push('/dashboard/projects');
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-all cursor-pointer"
                  title="Clear Project Selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {isProjectDropdownOpen && (
              <div className="absolute top-[calc(100%+8px)] left-0 w-[300px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-zinc-800 relative flex items-center">
                  <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-4" />
                  <input 
                    type="text" 
                    placeholder="Find Project..." 
                    value={projectSearchQuery}
                    onChange={(e) => setProjectSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-[13px] text-white focus:outline-none pl-8 pr-12 py-1.5 placeholder-zinc-500" 
                  />
                  <button 
                    onClick={() => setIsProjectDropdownOpen(false)}
                    className="absolute right-3 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors text-[10px] font-medium text-zinc-400 cursor-pointer"
                  >
                    Esc
                  </button>
                </div>
                <div className="max-h-[280px] overflow-y-auto py-1.5">
                  {projects
                    .filter((p: any) => p.repoName.toLowerCase().includes(projectSearchQuery.toLowerCase()))
                    .slice(0, 5)
                    .map((p: any) => (
                    <button 
                      key={p._id}
                      onClick={() => {
                        if (pathname.startsWith('/dashboard/deployments/')) {
                          router.push(`${pathname}?projectId=${p._id}`);
                        } else if (pathname.startsWith('/dashboard/usages')) {
                          router.push(`/dashboard/usages?projectId=${p._id}`);
                        } else if (pathname.startsWith('/dashboard/backend-usage')) {
                          router.push(`/dashboard/backend-usage?projectId=${p._id}`);
                        } else if (pathname.startsWith('/dashboard/frontend-usage')) {
                          router.push(`/dashboard/frontend-usage?projectId=${p._id}`);
                        } else if (pathname.startsWith('/dashboard/workflows')) {
                          router.push(`/dashboard/workflows?projectId=${p._id}`);
                        } else if (pathname.startsWith('/dashboard/logs')) {
                          router.push(`/dashboard/logs/${p._id}`);
                        } else if (pathname.startsWith('/dashboard/domains')) {
                          router.push(`/dashboard/domains?projectId=${p._id}`);
                        } else {
                          router.push(`/dashboard/projects/${p._id}/${p.status === 'configured' ? 'deploy' : 'overview'}`);
                        }
                        setIsProjectDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-zinc-900/50 transition-colors"
                    >
                      <div className="h-5 w-5 shrink-0 flex items-center justify-center overflow-hidden rounded-full">
                        <ProjectAvatar project={p} />
                      </div>
                      <span className="text-[13px] font-medium text-zinc-200 truncate">{p.repoName}</span>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <div className="px-3 py-4 text-center text-[13px] text-zinc-500">No projects found</div>
                  )}
                </div>
                <div className="p-1.5 border-t border-zinc-800">
                  <button 
                    onClick={() => { router.push('/dashboard/new-deployment'); setIsProjectDropdownOpen(false); }}
                    className="w-full text-left px-2 py-1.5 text-[13px] font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white rounded-md flex items-center gap-2 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Center: Dynamic Title */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center h-full">
          <h2 className="text-[14px] font-semibold text-white cursor-pointer px-1 flex items-center gap-2">
            {pathname === "/dashboard/support" || pathname.startsWith("/dashboard/support/") ? (
              <>
                <span className="text-zinc-100 font-normal">Support</span>
                <span className="text-zinc-100 font-normal">/</span>
                <span className="text-white">Cases</span>
              </>
            ) : (
              currentTitle
            )}
          </h2>
        </div>

        {/* Right: Empty spacer to balance flex */}
        <div className="flex-1"></div>
      </div>
    </div>
  );
};
