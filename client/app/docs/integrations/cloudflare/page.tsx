import React from 'react';
import { ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function CloudflareDocsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <img src="/cloudflare.svg" className="h-10 w-10" alt="Cloudflare" />
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Connect Cloudflare
        </h1>
      </div>
      
      <p className="text-lg text-zinc-400 leading-relaxed mb-8">
        Connecting Cloudflare allows our platform to automatically provision DNS records, assign custom domains to your deployments, and manage caching rules.
      </p>

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 mb-10 flex items-start gap-4">
        <ShieldCheck className="h-6 w-6 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-white font-bold mb-1">API Token Required</h3>
          <p className="text-sm text-zinc-400">
            You must provide a Cloudflare API Token. Note that this is different from your Global API Key. We recommend creating a scoped token for better security.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-6">How to get your Cloudflare Token</h2>
      
      <div className="space-y-6 mb-10">
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">1</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Open Cloudflare Profile Settings</h4>
            <p className="text-zinc-400 mb-3">Navigate to your Profile Settings in Cloudflare, under the API Tokens section.</p>
            <a 
              href="https://dash.cloudflare.com/profile/api-tokens" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-4 py-2 rounded-lg"
            >
              Open Cloudflare API Tokens <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">2</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Create Token</h4>
            <p className="text-zinc-400 mb-2">Click <strong>Create Token</strong> and use the <strong>Edit zone DNS</strong> template (or create a Custom Token). Ensure it has the following permissions:</p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-1 mb-2">
              <li><strong>Zone</strong> - <strong>DNS</strong> - <strong>Edit</strong></li>
              <li><strong>Zone</strong> - <strong>Zone</strong> - <strong>Read</strong></li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0">3</div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Copy the Token</h4>
            <p className="text-zinc-400">Copy the generated token. Cloudflare will not display this token again, so keep it safe!</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="pt-1">
            <h4 className="text-white font-bold mb-1">Paste into Dashboard</h4>
            <p className="text-zinc-400">Return to your Settings page and paste the API key into the Cloudflare connection modal.</p>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-800/80 flex justify-between">
        <Link href="/docs/integrations/railway" className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold">
          ← Previous: Railway
        </Link>
        <div></div>
      </div>
    </div>
  );
}
