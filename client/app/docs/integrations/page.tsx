import React from 'react';
import { ExternalLink, Book, Settings, Key } from 'lucide-react';
import Link from 'next/link';

export default function IntegrationsIntroPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="inline-flex items-center rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1 mb-6 backdrop-blur-sm">
        <Book className="h-3.5 w-3.5 mr-2 text-emerald-400" />
        <span className="text-xs font-medium text-zinc-400">Documentation</span>
      </div>
      
      <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
        Integrations Guide
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10 max-w-2xl">
        Learn how to connect your favorite version control systems and cloud providers to enable seamless deployments and automation.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <Link href="/docs/integrations/github" className="group p-6 rounded-2xl border border-zinc-800 bg-[#0a0a0a] hover:bg-zinc-900/50 hover:border-zinc-700 transition-all cursor-pointer block">
          <div className="flex items-center gap-4 mb-4">
            <img src="/github-logo.svg" className="h-8 w-8 brightness-0 invert" alt="GitHub" />
            <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">GitHub</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Connect via secure OAuth to easily import your repositories and trigger automated deployments on every push.
          </p>
        </Link>
        
        <Link href="/docs/integrations/vercel" className="group p-6 rounded-2xl border border-zinc-800 bg-[#0a0a0a] hover:bg-zinc-900/50 hover:border-zinc-700 transition-all cursor-pointer block">
          <div className="flex items-center gap-4 mb-4">
            <img src="/vercel.svg" className="h-8 w-8 brightness-0 invert" alt="Vercel" />
            <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">Vercel</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Generate a Vercel Access Token to enable blazing-fast frontend deployments and environment variable sync.
          </p>
        </Link>
        
        <Link href="/docs/integrations/render" className="group p-6 rounded-2xl border border-zinc-800 bg-[#0a0a0a] hover:bg-zinc-900/50 hover:border-zinc-700 transition-all cursor-pointer block">
          <div className="flex items-center gap-4 mb-4">
            <img src="/render.svg" className="h-8 w-8 brightness-0 invert object-contain" alt="Render" />
            <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">Render</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Connect with a Render API Key to spin up robust backend services and databases in seconds.
          </p>
        </Link>

        <Link href="/docs/integrations/netlify" className="group p-6 rounded-2xl border border-zinc-800 bg-[#0a0a0a] hover:bg-zinc-900/50 hover:border-zinc-700 transition-all cursor-pointer block">
          <div className="flex items-center gap-4 mb-4">
            <img src="/netlify-logo-rounded-sparks.svg" className="h-8 w-8 object-contain" alt="Netlify" />
            <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">Netlify</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Use a Netlify Personal Access Token to deploy frontend apps and edge functions seamlessly.
          </p>
        </Link>

        <Link href="/docs/integrations/railway" className="group p-6 rounded-2xl border border-zinc-800 bg-[#0a0a0a] hover:bg-zinc-900/50 hover:border-zinc-700 transition-all cursor-pointer block">
          <div className="flex items-center gap-4 mb-4">
            <img src="/railway-logo-clean.svg" className="h-8 w-8 object-contain brightness-0 invert" alt="Railway" />
            <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">Railway</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Connect your Railway account to easily provision and scale backend services via API Key.
          </p>
        </Link>
        
        <Link href="/docs/integrations/cloudflare" className="group p-6 rounded-2xl border border-zinc-800 bg-[#0a0a0a] hover:bg-zinc-900/50 hover:border-zinc-700 transition-all cursor-pointer block">
          <div className="flex items-center gap-4 mb-4">
            <img src="/cloudflare.svg" className="h-8 w-8" alt="Cloudflare" />
            <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">Cloudflare</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Connect a Cloudflare API Token to automatically manage DNS records and custom domains for your deployments.
          </p>
        </Link>
      </div>
      
      <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col md:flex-row items-center gap-6">
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
          <Key className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h4 className="text-white font-bold mb-1">Security First</h4>
          <p className="text-sm text-zinc-400">
            All API keys and tokens are symmetrically encrypted at rest using AES-256-GCM. We never store them in plaintext, and they are only decrypted in memory during the deployment phase.
          </p>
        </div>
      </div>
    </div>
  );
}
