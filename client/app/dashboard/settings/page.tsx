"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  
  const [activeModalProvider, setActiveModalProvider] = useState<string | null>(null);
  const [activeDisconnectProvider, setActiveDisconnectProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    refreshUser();
  }, []);

  const refreshUser = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/me`, { credentials: "include" });
      if (res.ok) setUser(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleOAuthConnect = (provider: string) => {
    const returnTo = encodeURIComponent(`${window.location.origin}/dashboard/settings`);
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/integrations/${provider}/connect?returnTo=${returnTo}`;
  };

  const handleApiKeySubmit = async () => {
    try {
      setSavingKey(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/integrations/${activeModalProvider}/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
        credentials: "include"
      });
      if (res.ok) {
        setActiveModalProvider(null);
        setApiKey("");
        await refreshUser();
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/integrations/${activeDisconnectProvider}/disconnect`, {
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

  if (!user) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col min-h-full">
      <div className="p-8 w-full flex-1">
        <div className="max-w-[800px] w-full mx-auto">
          <h1 className="text-2xl font-semibold mb-6">Settings</h1>
        
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6">
            <h2 className="mb-4 text-lg font-medium text-white">Connected Accounts</h2>
            <p className="mb-6 text-sm text-zinc-400">Connect your version control and cloud providers to enable deployments.</p>
            
            <div className="rounded-md border border-zinc-800 bg-black divide-y divide-zinc-800">
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
        </div>
      </div>

      {/* Modals */}
      {activeModalProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white capitalize">Connect {activeModalProvider}</h3>
            <p className="mb-4 text-sm text-zinc-400">
              {activeModalProvider} does not support standard OAuth connection for this automation flow. Paste your {activeModalProvider} API Key/Token.
            </p>
            <input
              type="password"
              placeholder={`Enter ${activeModalProvider} token...`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mb-4 w-full rounded-md border border-zinc-800 bg-black p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setActiveModalProvider(null)} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
              <button 
                onClick={handleApiKeySubmit} 
                disabled={!apiKey || savingKey}
                className="flex items-center gap-2 rounded-md bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {savingKey && <Loader2 className="h-4 w-4 animate-spin text-black" />}
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
              Are you sure you want to disconnect {activeDisconnectProvider}? You will need to reconnect before deploying.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setActiveDisconnectProvider(null)} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
              <button 
                onClick={handleDisconnect} 
                disabled={disconnecting}
                className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
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
      <div className="flex items-center gap-3">
        {status ? (
          <>
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div> Connected
            </span>
            <button onClick={onDisconnect} className="text-xs font-medium text-zinc-500 hover:text-red-400 transition-colors">Disconnect</button>
          </>
        ) : (
          <button 
            onClick={action}
            disabled={!action}
            className="rounded-md bg-white text-black px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {customActionText}
          </button>
        )}
      </div>
    </div>
  );
}
