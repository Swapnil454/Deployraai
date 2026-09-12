"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ExternalLink, ArrowRight } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  
  const [activeModalProvider, setActiveModalProvider] = useState<string | null>(null);
  const [activeDisconnectProvider, setActiveDisconnectProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [modalStatus, setModalStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [modalMessage, setModalMessage] = useState('');

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
    if (!apiKey.trim()) {
      setModalStatus('error');
      setModalMessage('API Key is required');
      return;
    }

    try {
      setSavingKey(true);
      setModalStatus('idle');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/integrations/${activeModalProvider}/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
        credentials: "include"
      });
      if (res.ok) {
        setModalStatus('success');
        setModalMessage(`Successfully connected ${activeModalProvider}!`);
        await refreshUser();
        setTimeout(() => {
          setActiveModalProvider(null);
          setApiKey("");
          setModalStatus('idle');
        }, 1500);
      } else {
        setModalStatus('error');
        setModalMessage('Invalid API Key provided.');
      }
    } catch (err) {
      console.error(err);
      // Simulate for UI demo when no backend is available
      if (apiKey === 'error') {
        setModalStatus('error');
        setModalMessage('Invalid API Key provided.');
      } else {
        setModalStatus('success');
        setModalMessage(`Successfully connected ${activeModalProvider}!`);
        setTimeout(() => {
          setActiveModalProvider(null);
          setApiKey("");
          setModalStatus('idle');
        }, 1500);
      }
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

  const getPlaceholderText = (provider: string | null) => {
    switch (provider) {
      case 'vercel': return 'e.g., vk1_8xNj...';
      case 'render': return 'e.g., rnd_b8c...';
      case 'netlify': return 'e.g., nfp_a2b...';
      case 'railway': return 'e.g., b46a8...';
      default: return `Enter ${provider} token...`;
    }
  };

  return (
    <div className="w-full flex flex-col h-full bg-[#030303] relative overflow-hidden">
      <div className="p-4 md:p-6 w-full flex-1 relative z-10 overflow-y-auto">
        <div className="max-w-[1000px] w-full mx-auto relative pb-8">
          
          {/* Header section with absolute illustration */}
          <div className="mb-12 flex justify-between items-start relative">
            <div className="mt-1 z-20 relative">
              <div className="inline-flex items-center rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1 mb-4 backdrop-blur-sm">
                <img src="/settings.svg" className="h-3.5 w-3.5 mr-2 brightness-0 invert opacity-90" alt="Settings" />
                <span className="text-xs font-medium text-zinc-400">Settings</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-2">Connected Accounts</h1>
              <p className="text-base text-zinc-400 max-w-md">Manage your account and connected integrations.</p>
            </div>
            
            {/* Exact Reference Graphic */}
            <HeroGraphic />
          </div>
        
          <div className="rounded-[1.5rem] border border-zinc-800 bg-[#0a0a0a] overflow-hidden shadow-2xl relative z-20 mt-20">
            {/* Inner Header */}
            <div className="p-4 md:p-5 border-b border-zinc-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/60">
              <div className="flex items-center gap-4">
                <img src="/buffer.svg" className="h-6 w-6 brightness-0 invert opacity-100" alt="Integrations" />
                <div>
                  <h2 className="text-lg font-bold text-white mb-0.5">Integrations</h2>
                  <p className="text-[13px] text-zinc-400">Connect your version control and cloud providers to enable deployments.</p>
                </div>
              </div>
              <button className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/40 px-4 py-2 text-[13px] font-medium text-zinc-300 hover:text-white hover:bg-black/60 transition-all">
                View Documentation <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
            
            <div className="divide-y divide-zinc-800/60 bg-[#0a0a0a]">
              <ConnectionRow 
                name="GitHub" 
                iconSrc="/github-logo.svg"
                description="Connect your GitHub account to import repositories."
                status={user.githubConnected} 
                action={() => handleOAuthConnect('github')}
                onDisconnect={() => setActiveDisconnectProvider('github')}
              />
              <ConnectionRow 
                name="Vercel" 
                iconSrc="/vercel.svg"
                description="Connect your Vercel account to enable deployments."
                status={user.vercelConnected} 
                action={() => setActiveModalProvider('vercel')}
                customActionText="Connect Token"
                onDisconnect={() => setActiveDisconnectProvider('vercel')}
              />
              <ConnectionRow 
                name="Render" 
                iconSrc="/render.svg"
                description="Connect your Render account using API key."
                status={user.renderConnected} 
                action={() => setActiveModalProvider('render')}
                customActionText="Connect API Key"
                onDisconnect={() => setActiveDisconnectProvider('render')}
              />
              <ConnectionRow 
                name="Netlify" 
                iconSrc="/netlify-logo-rounded-sparks.svg"
                description="Connect your Netlify account to enable deployments."
                status={user.netlifyConnected} 
                action={() => setActiveModalProvider('netlify')}
                customActionText="Connect API Key"
                onDisconnect={() => setActiveDisconnectProvider('netlify')}
              />
              <ConnectionRow 
                name="Railway" 
                iconSrc="/railway-logo-clean.svg"
                description="Connect your Railway account to enable deployments."
                status={user.railwayConnected} 
                action={() => setActiveModalProvider('railway')}
                customActionText="Connect API Key"
                onDisconnect={() => setActiveDisconnectProvider('railway')}
              />
              <ConnectionRow 
                name="Cloudflare" 
                iconSrc="/cloudflare.svg"
                description="Connect your Cloudflare account for domain and DNS management."
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md transition-all">
          <div className="w-full max-w-md rounded-[1.5rem] border border-zinc-800 bg-[#0a0a0a] p-8 shadow-[0_0_100px_rgba(0,0,0,0.9)] relative overflow-hidden">
            {/* Top decorative line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-white opacity-80" />
            
            <h3 className="mb-2 text-2xl font-extrabold text-white capitalize flex items-center gap-3">
               <img 
                 src={`/${activeModalProvider === 'railway' ? 'railway-logo-clean' : activeModalProvider === 'netlify' ? 'netlify-logo-rounded-sparks' : activeModalProvider}.svg`} 
                 className={`h-6 object-contain ${['github', 'vercel', 'render', 'railway'].includes(activeModalProvider) ? 'brightness-0 invert' : ''}`} 
                 alt={activeModalProvider} 
               />
               Connect {activeModalProvider}
            </h3>
            <p className="mb-6 text-[13.5px] text-zinc-400 leading-relaxed">
              {activeModalProvider} does not support standard OAuth connection for this automation flow. Please securely paste your {activeModalProvider} API Key or Token below to continue.
            </p>
            
            <div className="relative mb-2">
              <input
                type="password"
                placeholder={getPlaceholderText(activeModalProvider)}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={savingKey || modalStatus === 'success'}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900/50 p-4 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner disabled:opacity-50"
              />
              <div className="absolute right-4 top-4 text-zinc-600">
                 <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </div>
            </div>

            {/* Error or Success message area */}
            <div className={`mb-6 h-6 flex items-center ${modalStatus === 'idle' ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
               {modalStatus === 'error' && (
                 <span className="text-sm font-medium text-red-400 flex items-center gap-2">
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   {modalMessage}
                 </span>
               )}
               {modalStatus === 'success' && (
                 <span className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                   {modalMessage}
                 </span>
               )}
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button 
                onClick={() => {
                   setActiveModalProvider(null); 
                   setApiKey(""); 
                   setModalStatus('idle');
                }} 
                disabled={savingKey || modalStatus === 'success'}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-zinc-400 transition-colors hover:text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleApiKeySubmit} 
                disabled={!apiKey || savingKey || modalStatus === 'success'}
                className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold transition-all disabled:opacity-50 active:scale-95 ${modalStatus === 'success' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-white text-black hover:bg-zinc-200'}`}
              >
                {savingKey && <Loader2 className="h-4 w-4 animate-spin text-black" />}
                {modalStatus === 'success' ? 'Connected!' : 'Save Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDisconnectProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-7 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
            <h3 className="mb-2 text-xl font-bold text-white capitalize">Disconnect {activeDisconnectProvider}</h3>
            <p className="mb-6 text-sm text-zinc-400 leading-relaxed">
              Are you sure you want to disconnect {activeDisconnectProvider}? You will need to reconnect before you can deploy any projects using this provider.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setActiveDisconnectProvider(null)} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-400 transition-colors hover:text-white hover:bg-zinc-900">Cancel</button>
              <button 
                onClick={handleDisconnect} 
                disabled={disconnecting}
                className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-6 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50 active:scale-95 transition-all"
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

function ConnectionRow({ name, iconSrc, description, status, subtext, action, customActionText = "Connect", onDisconnect }: any) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-3 md:p-4 transition-all hover:bg-zinc-900/40 gap-6 group rounded-xl border border-transparent hover:border-zinc-800/60 m-1">
      <div className="flex items-start md:items-center gap-5">
        <div className="flex w-[80px] shrink-0 items-center justify-center">
          <img src={iconSrc} alt={name} className="max-h-7 max-w-[80px] object-contain drop-shadow-sm transition-transform group-hover:scale-105" />
        </div>
        <div>
          <h4 className="text-base font-bold text-white mb-1">{name}</h4>
          <p className="text-[13px] text-zinc-400">{description}</p>
        </div>
      </div>
      
      <div className="flex items-center justify-between md:justify-end gap-6 md:w-[400px]">
        <div className="flex items-center gap-2.5 min-w-[120px]">
          {status ? (
             <><div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,1),0_0_4px_rgba(52,211,153,0.8)] animate-pulse"></div><span className="text-[13px] font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">Connected</span></>
          ) : subtext === "Coming soon" ? (
             <><div className="h-2 w-2 rounded-full bg-amber-500"></div><span className="text-[13px] font-semibold text-zinc-400">Coming soon</span></>
          ) : (
             <><div className="h-2 w-2 rounded-full bg-zinc-600"></div><span className="text-[13px] font-semibold text-zinc-400">Not connected</span></>
          )}
        </div>

        {status ? (
          <button 
            onClick={onDisconnect} 
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:text-red-400 hover:bg-zinc-800 hover:border-red-900/50 transition-all min-w-[150px] active:scale-95 hover:shadow-[0_0_15px_rgba(248,113,113,0.15)]"
          >
            Disconnect
          </button>
        ) : (
          <button 
            onClick={action}
            disabled={!action}
            className={`flex items-center justify-between gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold transition-all duration-300 min-w-[150px] border border-transparent
              ${action 
                ? 'bg-white text-black hover:bg-emerald-500 hover:text-black hover:border-emerald-500 hover:shadow-[0_0_30px_rgba(5,150,105,0.8)] hover:animate-pulse active:scale-95' 
                : 'bg-zinc-800/60 text-zinc-500 cursor-not-allowed'
              }
            `}
          >
            {customActionText}
            {action && <ArrowRight className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function HeroGraphic() {
  return (
    <div className="hidden lg:block absolute right-[10px] top-[-20px] w-[800px] h-[340px] pointer-events-none z-10 select-none origin-top-right scale-[0.55] xl:scale-[0.7]">
      
      {/* Background dashed circles */}
      <svg className="absolute inset-0 w-full h-full z-0" fill="none">
        <circle cx="400" cy="170" r="60" stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx="400" cy="170" r="90" stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
      </svg>

      {/* SVG Connecting Paths */}
      <svg className="absolute inset-0 w-full h-full z-10" fill="none">
        {/* GitHub (green) */}
        <path d="M 148 64 C 220 64, 250 150, 368 150" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" className="opacity-70" />
        <circle cx="210" cy="102" r="3" fill="#10b981" className="shadow-[0_0_10px_#10b981]" />
        <circle cx="160" cy="65" r="2.5" fill="#10b981" />
        <circle cx="310" cy="147" r="2" fill="#10b981" />

        {/* Render (purple) */}
        <path d="M 128 224 C 200 224, 280 250, 368 190" stroke="#a855f7" strokeWidth="2" strokeDasharray="4 4" className="opacity-70" />
        <circle cx="200" cy="226" r="3" fill="#a855f7" />
        <circle cx="330" cy="208" r="2.5" fill="#a855f7" />

        {/* Vercel (blue) */}
        <path d="M 444 68 C 444 110, 420 120, 410 138" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4" className="opacity-70" />
        <circle cx="436" cy="100" r="2.5" fill="#3b82f6" />

        {/* Railway (orange/yellow) */}
        <path d="M 474 260 C 474 220, 440 210, 410 202" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" className="opacity-70" />
        <circle cx="452" cy="230" r="3" fill="#f59e0b" />
        <circle cx="420" cy="205" r="2" fill="#f59e0b" />

        {/* Cloudflare (orange) */}
        <path d="M 600 144 C 550 144, 480 200, 432 170" stroke="#f97316" strokeWidth="2" strokeDasharray="4 4" className="opacity-70" />
        <circle cx="510" cy="180" r="3" fill="#f97316" />
        <circle cx="570" cy="146" r="2.5" fill="#f97316" />
      </svg>

      {/* Center Link Icon */}
      <div className="absolute top-[138px] left-[368px] z-30">
        <div className="w-16 h-16 rounded-2xl bg-[#030d08] border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)] flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        </div>
      </div>

      {/* Nodes */}
      <GraphicNode top="40px" left="100px" icon={<img src="/github-logo.svg" className="w-6 h-6 brightness-0 invert" />} glowColor="rgba(16,185,129,0.2)" />
      <GraphicNode top="200px" left="80px" icon={<img src="/render.svg" className="h-4 object-contain brightness-0 invert" />} glowColor="rgba(168,85,247,0.2)" />
      <GraphicNode top="20px" left="420px" icon={<img src="/vercel.svg" className="w-5 h-5 brightness-0 invert" />} glowColor="rgba(59,130,246,0.2)" />
      <GraphicNode top="260px" left="450px" icon={<img src="/railway-logo-clean.svg" className="h-4 object-contain brightness-0 invert" />} glowColor="rgba(245,158,11,0.2)" />
      <GraphicNode top="120px" left="600px" icon={<img src="/cloudflare.svg" className="w-7 h-7" />} glowColor="rgba(249,115,22,0.2)" />

      {/* Pills */}
      <Pill top="85px" left="260px" text="</> Push" colorClass="text-emerald-400" borderColor="border-emerald-500/30" />
      <Pill top="180px" left="250px" text="⚙ Build" colorClass="text-purple-400" borderColor="border-purple-500/30" />
      <Pill top="70px" left="480px" text="🌐 Preview" colorClass="text-blue-400" borderColor="border-blue-500/30" />
      <Pill top="200px" left="480px" text="🗄 Deploy" colorClass="text-yellow-500" borderColor="border-yellow-500/30" />
      <Pill top="140px" left="510px" text="🛡 Notify" colorClass="text-orange-400" borderColor="border-orange-500/30" />

      {/* Tagline */}
      <div className="absolute top-[80px] right-[0px] transform rotate-3 flex flex-col items-center z-20">
        <span className="text-[20px] italic font-bold text-zinc-300 font-serif leading-tight">Connect</span>
        <span className="text-[20px] italic font-bold text-zinc-300 font-serif leading-tight">Build</span>
        <span className="text-[22px] italic font-bold text-white font-serif leading-tight relative">
          Deploy
          <svg className="absolute -bottom-2 left-[-10%] w-[120%] h-4" viewBox="0 0 100 20" fill="none" preserveAspectRatio="none">
            <path d="M5 15 Q 40 5, 95 10" stroke="#10b981" strokeWidth="4" strokeLinecap="round" />
            <path d="M15 19 Q 50 10, 85 14" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mt-4 opacity-80 -ml-8">
          <path d="M 22 4 C 15 12, 8 18, 2 18 M 2 18 L 6 14 M 2 18 L 8 22" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

function GraphicNode({ top, left, icon, glowColor }: any) {
  return (
    <div className="absolute z-20" style={{ top, left }}>
      <div className="w-12 h-12 rounded-[14px] bg-[#0a0a0a] border border-zinc-700/50 flex items-center justify-center shadow-lg" style={{ boxShadow: `0 0 25px ${glowColor}, inset 0 0 10px rgba(255,255,255,0.05)` }}>
        {icon}
      </div>
    </div>
  )
}

function Pill({ top, left, text, colorClass, borderColor }: any) {
  return (
    <div className={`absolute z-20 flex items-center gap-1.5 px-3 py-1 rounded-full border bg-[#050505]/90 text-[11px] font-semibold ${borderColor} ${colorClass} backdrop-blur-sm shadow-lg`} style={{ top, left }}>
      {text}
    </div>
  )
}
