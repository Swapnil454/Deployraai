import React from 'react';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function GitHubDocsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <img src="/github-logo.svg" className="h-10 w-10 brightness-0 invert" alt="GitHub" />
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Connect GitHub
        </h1>
      </div>
      
      <p className="text-lg text-zinc-400 leading-relaxed mb-8">
        Connecting GitHub is the first step to automating your deployments. It allows us to import your source code, configure webhooks, and trigger new builds every time you push code.
      </p>

      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 mb-10 flex items-start gap-4">
        <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-white font-bold mb-1">1-Click OAuth Integration</h3>
          <p className="text-sm text-zinc-400">
            Unlike other providers that require manual API keys, GitHub uses a secure OAuth flow. You don't need to manually create any tokens!
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-6">How to connect GitHub</h2>
      
      <div className="space-y-6 mb-10">
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">1</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Click "Connect" in Settings</h4>
            <p className="text-zinc-400 mb-3">On your Settings page, locate the GitHub row and click the Connect button.</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">2</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Authorize the Application</h4>
            <p className="text-zinc-400 mb-2">You will be redirected to GitHub. We request the following permissions:</p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-1 mb-2">
              <li><strong>read:user</strong> & <strong>user:email:</strong> To identify your account.</li>
              <li><strong>public_repo:</strong> To access and clone your public repositories.</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Done!</h4>
            <p className="text-zinc-400">You will be securely redirected back to the dashboard, and your GitHub account will be marked as connected.</p>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-800/80 flex justify-between">
        <div></div>
        <Link href="/docs/integrations/vercel" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          Next: Vercel →
        </Link>
      </div>
    </div>
  );
}
