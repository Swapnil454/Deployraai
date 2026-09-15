"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Book, GitBranch, Triangle, Box, Zap, Server, Cloud } from 'lucide-react';

const navItems = [
  { name: 'Introduction', href: '/docs/integrations', icon: Book, exact: true },
  { name: 'GitHub', href: '/docs/integrations/github', icon: GitBranch },
  { name: 'Vercel', href: '/docs/integrations/vercel', icon: Triangle },
  { name: 'Render', href: '/docs/integrations/render', icon: Box },
  { name: 'Netlify', href: '/docs/integrations/netlify', icon: Zap },
  { name: 'Railway', href: '/docs/integrations/railway', icon: Server },
  { name: 'Cloudflare', href: '/docs/integrations/cloudflare', icon: Cloud },
];

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-[#030303] overflow-hidden text-zinc-300">
      {/* Sidebar Navigation */}
      <nav className="w-72 border-r border-zinc-800/80 bg-[#0a0a0a] flex flex-col h-full z-20 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
        <div className="p-6 border-b border-zinc-800/80">
          <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Book className="h-5 w-5 text-emerald-400" />
            Integrations Hub
          </h2>
          <p className="text-xs text-zinc-500 mt-2 font-medium">Documentation & Setup Guides</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-[14px] font-semibold ${
                  isActive
                    ? 'bg-zinc-800/80 text-white border-l-2 border-emerald-500 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]'
                    : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 border-l-2 border-transparent'
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                {item.name}
              </Link>
            );
          })}
        </div>
        
        <div className="p-4 border-t border-zinc-800/80">
          <Link
            href="/dashboard/settings"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-zinc-900 border border-zinc-700/50 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
          >
            Back to Settings
          </Link>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#030303] relative">
        {/* Background glow effects */}
        <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-100px] left-[-100px] w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-[800px] mx-auto p-8 md:p-12 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
