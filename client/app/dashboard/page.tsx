"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, Rocket, Clock, GitBranch, Settings, Loader2, CheckCircle2, Link2 } from "lucide-react";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  
  const [activeModalProvider, setActiveModalProvider] = useState<string | null>(null);
  const [activeDisconnectProvider, setActiveDisconnectProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const fetchUser = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/auth/me`, {
          credentials: "include"
        });

        if (response.ok) {
          const userData = await response.json();
          if (userData.role === 'admin') {
            router.push('/admin');
            return;
          }
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
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/projects`, { credentials: "include" });
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
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
      router.push("/");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, { credentials: "include" });
      if (res.ok) setUser(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleOAuthConnect = (provider: string) => {
    const returnTo = encodeURIComponent(`${window.location.origin}/dashboard`);
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/integrations/${provider}/connect?returnTo=${returnTo}`;
  };

  const handleApiKeySubmit = async () => {
    try {
      setSavingKey(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/${activeModalProvider}/connect-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({ apiKey })
      });
      if (res.ok) {
        setActiveModalProvider(null);
        setApiKey("");
        await refreshUser();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to connect API key");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingKey(false);
    }
  };

  const handleDisconnect = async () => {
    if (!activeDisconnectProvider) return;
    try {
      setDisconnecting(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/${activeDisconnectProvider}/disconnect`, {
        method: 'POST',
        credentials: "include"
      });
      if (res.ok) {
        setActiveDisconnectProvider(null);
        await refreshUser();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDisconnecting(false);
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
              <div className="rounded-lg bg-zinc-800/50 divide-y divide-zinc-800/50">
                <ConnectionRow 
                  name="GitHub" 
                  status={user.githubConnected} 
                  action={() => handleOAuthConnect('github')}
                  onDisconnect={() => setActiveDisconnectProvider('github')}
                />
                <ConnectionRow 
                  name="Vercel" 
                  status={user.vercelConnected} 
                  action={() => setActiveModalProvider('vercel')}
                  customActionText="Connect Token"
                  onDisconnect={() => setActiveDisconnectProvider('vercel')}
                />
                <ConnectionRow 
                  name="Render" 
                  status={user.renderConnected} 
                  action={() => setActiveModalProvider('render')}
                  customActionText="Connect API Key"
                  onDisconnect={() => setActiveDisconnectProvider('render')}
                />
                <ConnectionRow 
                  name="Cloudflare" 
                  status={user.cloudflareConnected} 
                  subtext="Coming soon"
                  action={null}
                />
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

      {activeModalProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white capitalize">Connect {activeModalProvider}</h3>
            <p className="mb-4 text-sm text-zinc-400">
              {activeModalProvider} does not support standard OAuth connection for this automation flow. Paste your {activeModalProvider} API Key/Token. It will be encrypted and stored securely.
            </p>
            <input
              type="password"
              placeholder={`Enter ${activeModalProvider} token...`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mb-4 w-full rounded-lg border border-zinc-800 bg-black p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setActiveModalProvider(null)} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
              <button 
                onClick={handleApiKeySubmit} 
                disabled={!apiKey || savingKey}
                className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {savingKey && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDisconnectProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white capitalize">Disconnect {activeDisconnectProvider}</h3>
            <p className="mb-4 text-sm text-zinc-400">
              Are you sure you want to disconnect {activeDisconnectProvider}? This will remove your credentials and you will need to reconnect before deploying.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setActiveDisconnectProvider(null)} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
              <button 
                onClick={handleDisconnect} 
                disabled={disconnecting}
                className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                {disconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ConnectionRow({ name, status, subtext, action, customActionText = "Connect", onDisconnect }: any) {
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <h4 className="text-sm font-medium text-white">{name}</h4>
        {subtext && <p className="text-xs text-zinc-500 mt-0.5">{subtext}</p>}
      </div>
      <div>
        {status ? (
          <button 
            onClick={onDisconnect || (() => {})}
            className="flex items-center gap-1 text-sm text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 hover:text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/20 transition-colors"
            title="Click to disconnect"
          >
            <CheckCircle2 className="h-4 w-4" /> Connected
          </button>
        ) : action ? (
          <button 
            onClick={action}
            className="flex items-center gap-1 text-sm text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded-full transition-colors"
          >
            <Link2 className="h-4 w-4" /> {customActionText}
          </button>
        ) : (
          <span className="text-sm text-zinc-500 px-3 py-1">Not connected</span>
        )}
      </div>
    </div>
  );
}
