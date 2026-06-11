"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, Rocket, Clock, GitBranch, Settings, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const fetchUser = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/auth/me", {
          credentials: "include"
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          fetchProjects();
        } else {
          router.push("/login");
        }
      } catch (error) {
        console.error("Failed to fetch user", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    const fetchProjects = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/projects", { credentials: "include" });
        if (res.ok) {
          setProjects(await res.json());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProjects(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch("http://localhost:5000/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
      router.push("/");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-black px-4 sm:px-6 lg:px-8 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between mb-8 pb-8 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            {user.avatar && (
              <Image 
                src={user.avatar} 
                alt={`${user.name}'s avatar`} 
                width={64} 
                height={64} 
                className="rounded-full border-2 border-indigo-500"
              />
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">{user.name}</h1>
              <p className="text-zinc-400">@{user.githubUsername}</p>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-10">
          {/* Connected Accounts Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Connected Accounts</h2>
            <div className="space-y-4">
              
              <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 p-3">
                <span className="text-zinc-300">GitHub</span>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${user.githubConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="text-sm text-zinc-400">{user.githubConnected ? 'Connected' : 'Not connected'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 p-3">
                <span className="text-zinc-300">Vercel</span>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${user.vercelConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="text-sm text-zinc-400">{user.vercelConnected ? 'Connected' : 'Not connected'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 p-3">
                <span className="text-zinc-300">Render</span>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${user.renderConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="text-sm text-zinc-400">{user.renderConnected ? 'Connected' : 'Not connected'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 p-3">
                <span className="text-zinc-300">Cloudflare</span>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${user.cloudflareConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="text-sm text-zinc-400">{user.cloudflareConnected ? 'Connected' : 'Not connected'}</span>
                </div>
              </div>

            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col justify-center items-center text-center">
            <h2 className="mb-2 text-xl font-semibold text-white">Deploy a Project</h2>
            <p className="mb-6 text-sm text-zinc-400">
              Connect your repository, analyze the tech stack, and deploy instantly.
            </p>
            <button 
              onClick={() => router.push('/dashboard/new-deployment')}
              className="w-full max-w-xs rounded-lg bg-white px-4 py-3 font-semibold text-black transition-colors hover:bg-zinc-200"
            >
              New Deployment
            </button>
          </div>
        </div>

        {/* Recent Projects Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Recent Deployments</h2>
          </div>
          
          {loadingProjects ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-400">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500 mb-2" />
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-400">
              No projects found. Click "New Deployment" to get started.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project: any) => (
                <div key={project._id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div className="overflow-hidden pr-2">
                      <h3 className="font-semibold text-white truncate">{project.repoName}</h3>
                      <p className="text-xs text-zinc-400 truncate">{project.repoFullName}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                      project.status === 'configured' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 
                      project.status === 'analyzed' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-zinc-500 mb-5 flex-1">
                    <div className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" /> <span className="truncate max-w-[80px]">{project.selectedBranch}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(project.updatedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <button 
                      onClick={() => router.push(`/dashboard/projects/${project._id}/configure`)}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
                    >
                      <Settings className="h-3 w-3" /> Configure
                    </button>
                    {project.status === "configured" && (
                      <button 
                        onClick={() => router.push(`/dashboard/projects/${project._id}/deploy`)}
                        className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/20"
                      >
                        <Rocket className="h-3 w-3" /> Deploy
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
