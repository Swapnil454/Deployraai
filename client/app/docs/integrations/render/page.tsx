import React from 'react';
import { ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function RenderDocsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <img src="/render.svg" className="h-10 w-10 brightness-0 invert object-contain" alt="Render" />
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Connect Render
        </h1>
      </div>
      
      <p className="text-lg text-zinc-400 leading-relaxed mb-8">
        Connecting Render allows us to provision high-performance backend web services, databases, and cron jobs directly from your repositories.
      </p>

      <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-6 mb-10 flex items-start gap-4">
        <ShieldCheck className="h-6 w-6 text-purple-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-white font-bold mb-1">API Key Required</h3>
          <p className="text-sm text-zinc-400">
            You must provide a Render API Key. This securely grants our platform permission to orchestrate infrastructure in your Render account.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-6">How to get your Render API Key</h2>
      
      <div className="space-y-6 mb-10">
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">1</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Open Render Account Settings</h4>
            <p className="text-zinc-400 mb-3">Navigate to your Render Account Settings, specifically the API Keys section.</p>
            <a 
              href="https://dashboard.render.com/settings/api" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-4 py-2 rounded-lg"
            >
              Open Render API Keys <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">2</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Create API Key</h4>
            <p className="text-zinc-400 mb-2">Under the <strong>API Keys</strong> section, click on <strong>Create API Key</strong>.</p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-1 mb-2">
              <li><strong>Name:</strong> <span className="text-zinc-300">"Deploy Automation"</span></li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">3</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Copy the Key</h4>
            <p className="text-zinc-400">Copy the generated key. It typically looks like <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs font-mono">rnd_b8c...</code>. Store this safely as Render will not display it again.</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Paste into Dashboard</h4>
            <p className="text-zinc-400">Return to your Settings page and paste the API key into the Render connection modal.</p>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-800/80 flex justify-between">
        <Link href="/docs/integrations/vercel" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          ← Previous: Vercel
        </Link>
        <Link href="/docs/integrations/netlify" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          Next: Netlify →
        </Link>
      </div>
    </div>
  );
}
