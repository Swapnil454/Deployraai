import React from 'react';
import { ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function NetlifyDocsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <img src="/netlify-logo-rounded-sparks.svg" className="h-10 w-10 object-contain" alt="Netlify" />
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Connect Netlify
        </h1>
      </div>
      
      <p className="text-lg text-zinc-400 leading-relaxed mb-8">
        Connecting Netlify allows our platform to automatically deploy frontend applications, configure build settings, and set up edge networks via Netlify.
      </p>

      <div className="bg-[#00c7b7]/10 border border-[#00c7b7]/20 rounded-2xl p-6 mb-10 flex items-start gap-4">
        <ShieldCheck className="h-6 w-6 text-[#00c7b7] shrink-0 mt-0.5" />
        <div>
          <h3 className="text-white font-bold mb-1">Personal Access Token Required</h3>
          <p className="text-sm text-zinc-400">
            You must provide a Netlify Personal Access Token (PAT) so we can create sites and trigger deploys in your Netlify account.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-6">How to get your Netlify Token</h2>
      
      <div className="space-y-6 mb-10">
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">1</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Open Netlify Applications Settings</h4>
            <p className="text-zinc-400 mb-3">Navigate to your User Settings in Netlify and go to the Applications tab.</p>
            <a 
              href="https://app.netlify.com/user/applications#personal-access-tokens" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-4 py-2 rounded-lg"
            >
              Open Netlify Tokens <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">2</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Generate a New Access Token</h4>
            <p className="text-zinc-400 mb-2">Under the <strong>Personal access tokens</strong> section, click on <strong>New access token</strong>.</p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-1 mb-2">
              <li>Give it a descriptive description like <span className="text-zinc-300">"Deploy Automation"</span>.</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">3</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Copy the Token</h4>
            <p className="text-zinc-400">Copy the generated token (it usually starts with <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs font-mono">nfp_...</code>). Note it down carefully as it won't be shown again.</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Paste into Dashboard</h4>
            <p className="text-zinc-400">Return to your Settings page and paste the API key into the Netlify connection modal.</p>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-800/80 flex justify-between">
        <Link href="/docs/integrations/render" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          ← Previous: Render
        </Link>
        <Link href="/docs/integrations/railway" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          Next: Railway →
        </Link>
      </div>
    </div>
  );
}
