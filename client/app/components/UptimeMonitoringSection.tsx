"use client";

import { useState } from "react";
import DeployraDashboardMockup from "./DeployraDashboardMockup";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

export default function UptimeMonitoringSection() {
  const [targetUrl, setTargetUrl] = useState("");
  const router = useRouter();

  const handleStartMonitoring = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      router.push("/signup");
      return;
    }
    const normalized =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    router.push(`/signup?target=${encodeURIComponent(normalized)}`);
  };

  return (
    <section className="relative w-full bg-[#111111] py-20 sm:py-24 lg:py-28 overflow-hidden z-10">
      {/* ── Background Matrix Grid (Matches Homepage Hero) ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14 flex flex-col items-center">
        {/* Centered Main Title with Deployra Signature Serif Display Typography */}
        <h2 className="font-serif-display text-[38px] sm:text-[46px] md:text-[54px] lg:text-[60px] font-normal text-white tracking-[-0.02em] leading-[1.08] text-center max-w-3xl">
          Meet the Always-On
          <span className="block text-emerald-400 font-serif-display italic mt-1 sm:mt-1.5 tracking-[-0.015em]">
            uptime monitoring <span className="text-white">service</span>.
          </span>
        </h2>

        {/* Feature Checkmarks Row: Refined layout & icons */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 sm:gap-x-8 gap-y-2.5 mt-6 sm:mt-7 text-[13px] sm:text-[14px] font-medium tracking-tight">
          <div className="inline-flex items-center gap-1.5 text-zinc-300">
            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
            <span>Sub-30s Multi-Region Probes</span>
          </div>

          <div className="inline-flex items-center gap-1.5 text-zinc-300">
            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
            <span>Instant Multi-Channel Alerts</span>
          </div>

          <div className="inline-flex items-center gap-1.5 text-zinc-300">
            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
            <span>Public Status Pages &amp; SLAs</span>
          </div>

          <div className="inline-flex items-center gap-1.5 text-zinc-300">
            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
            <span>Autonomous AI Remediation</span>
          </div>
        </div>

        {/* Clean, Premium Glassmorphic URL Input Form */}
        <form onSubmit={handleStartMonitoring} className="mt-7 sm:mt-9 w-full max-w-[500px]">
          <div className="relative flex items-center p-1.5 rounded-full bg-[#161616]/80 backdrop-blur-md border border-zinc-700/60 hover:border-zinc-600 focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/20 shadow-[0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all">
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="eg. mywebsite.com"
              className="flex-1 bg-transparent px-4 sm:px-5 py-2 text-[13.5px] sm:text-sm text-white placeholder-zinc-500 outline-none font-sans"
            />
            <button
              type="submit"
              className="shrink-0 bg-emerald-400 hover:bg-emerald-300 text-black font-semibold text-[13px] sm:text-[14px] px-5 sm:px-6 py-2.5 rounded-full transition-all duration-200 shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_28px_rgba(52,211,153,0.5)] cursor-pointer tracking-tight"
            >
              Start monitoring for free
            </button>
          </div>
        </form>

        {/* Interactive Code-Built Dashboard Mockup */}
        <div className="mt-10 sm:mt-14 lg:mt-16 w-full max-w-[1040px] relative">
          <DeployraDashboardMockup />
        </div>
      </div>
    </section>
  );
}
