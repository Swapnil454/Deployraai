import React from 'react';
import { ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function RailwayDocsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <img src="/railway-logo-clean.svg" className="h-10 w-10 brightness-0 invert object-contain" alt="Railway" />
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Connect Railway
        </h1>
      </div>
      
      <p className="text-lg text-zinc-400 leading-relaxed mb-8">
        Connecting Railway allows our platform to automatically provision Docker-based services, databases, and cron jobs via the Railway platform.
      </p>

      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6 mb-10 flex items-start gap-4">
        <ShieldCheck className="h-6 w-6 text-yellow-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-white font-bold mb-1">API Token Required</h3>
          <p className="text-sm text-zinc-400">
            You must provide a Railway Project or Personal Token. This grants our platform programmatic access to deploy and manage services in your Railway account.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-6">How to get your Railway Token</h2>
      
      <div className="space-y-6 mb-10">
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">1</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Open Railway Account Settings</h4>
            <p className="text-zinc-400 mb-3">Navigate to your Account Settings in Railway to generate a Personal Token.</p>
            <a 
              href="https://railway.app/account/tokens" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-4 py-2 rounded-lg"
            >
              Open Railway Tokens <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">2</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Create New Token</h4>
            <p className="text-zinc-400 mb-2">Click on <strong>Create New Token</strong> and name it something descriptive like <span className="text-zinc-300">"Deploy Automation"</span>.</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">3</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Copy the Token</h4>
            <p className="text-zinc-400">Copy the generated API token (often starts with <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs font-mono">b46a...</code>) and store it securely.</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Paste into Dashboard</h4>
            <p className="text-zinc-400">Return to your Settings page and paste the API key into the Railway connection modal.</p>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-800/80 flex justify-between">
        <Link href="/docs/integrations/netlify" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          ← Previous: Netlify
        </Link>
        <Link href="/docs/integrations/cloudflare" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          Next: Cloudflare →
        </Link>
      </div>
    </div>
  );
}
