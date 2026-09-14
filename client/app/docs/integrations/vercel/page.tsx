import React from 'react';
import { ExternalLink, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function VercelDocsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <img src="/vercel.svg" className="h-10 w-10 brightness-0 invert" alt="Vercel" />
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Connect Vercel
        </h1>
      </div>
      
      <p className="text-lg text-zinc-400 leading-relaxed mb-8">
        Connecting Vercel allows our platform to automatically provision Vercel projects, sync environment variables, and trigger zero-downtime frontend deployments.
      </p>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 mb-10 flex items-start gap-4">
        <ShieldCheck className="h-6 w-6 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-white font-bold mb-1">Secure Connection</h3>
          <p className="text-sm text-zinc-400">
            You will need to generate a Vercel Access Token. This token gives our platform programmatic access to manage deployments on your behalf.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-6">How to get your Vercel Token</h2>
      
      <div className="space-y-6 mb-10">
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">1</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Open Vercel Settings</h4>
            <p className="text-zinc-400 mb-3">Go directly to the Vercel Tokens page using the link below, or navigate to <strong>Settings → Tokens</strong> in your Vercel dashboard.</p>
            <a 
              href="https://vercel.com/account/tokens" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-4 py-2 rounded-lg"
            >
              Open Vercel Tokens Page <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">2</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Create a New Token</h4>
            <p className="text-zinc-400 mb-2">Click the <strong>Create</strong> button and configure your token:</p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-1 mb-2">
              <li><strong>Name:</strong> <span className="text-zinc-300">"Deploy Automation"</span> (or whatever you prefer)</li>
              <li><strong>Scope:</strong> <span className="text-zinc-300">Full Account</span> (required to create projects and set env vars)</li>
              <li><strong>Expiration:</strong> Choose <strong>No Expiration</strong> to prevent your deployments from suddenly failing next year.</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">3</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Copy the Token</h4>
            <p className="text-zinc-400">Copy the generated token. It typically starts with <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs font-mono">vk1_...</code>. <strong>Keep this secure!</strong> Vercel will only show it to you once.</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Paste into Dashboard</h4>
            <p className="text-zinc-400">Return to your Settings page and paste the token into the Vercel connection modal.</p>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-800/80 flex justify-between">
        <Link href="/docs/integrations/github" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          ← Previous: GitHub
        </Link>
        <Link href="/docs/integrations/render" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          Next: Render →
        </Link>
      </div>
    </div>
  );
}
