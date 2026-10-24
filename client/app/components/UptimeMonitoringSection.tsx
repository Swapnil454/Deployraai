"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

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
    const normalized = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    router.push(`/signup?target=${encodeURIComponent(normalized)}`);
  };

  return (
    <section className="relative w-full bg-[#111111] py-20 sm:py-24 lg:py-28 overflow-hidden z-10">
      {/* ── Background Matrix Grid (Identical to Homepage Hero) ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14 flex flex-col items-center">
        {/* Centered Main Title: Refined, slightly smaller, perfectly balanced SaaS scale */}
        <h2 className="font-heading text-[28px] sm:text-[36px] md:text-[42px] lg:text-[48px] xl:text-[50px] font-bold text-white tracking-[-0.038em] leading-[1.12] text-center max-w-3xl">
          Meet the Always-On
          <span className="block text-emerald-400 mt-1.5 sm:mt-2 tracking-[-0.038em]">
            uptime monitoring service.
          </span>
        </h2>

        {/* Feature Checkmarks Row: Refined proportions & spacing */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 sm:gap-x-7 gap-y-2.5 mt-6 sm:mt-7 text-[13px] sm:text-[14px] lg:text-[14.5px] font-medium select-none tracking-tight">
          <div className="inline-flex items-center gap-2 text-zinc-300">
            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Sub-30s Multi-Region Probes</span>
          </div>

          <div className="inline-flex items-center gap-2 text-zinc-300">
            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Instant Multi-Channel Alerts</span>
          </div>

          <div className="inline-flex items-center gap-2 text-zinc-300">
            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Public Status Pages &amp; SLAs</span>
          </div>

          <div className="inline-flex items-center gap-2 text-zinc-300">
            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Autonomous AI Remediation</span>
          </div>
        </div>

        {/* URL Input Form (Clean, perfectly balanced proportions) */}
        <form onSubmit={handleStartMonitoring} className="mt-7 sm:mt-9 w-full max-w-[500px]">
          <div className="relative flex items-center p-1.5 rounded-full bg-[#0c1017] border border-zinc-800/80 focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/20 shadow-[0_4px_24px_rgba(0,0,0,0.6)] transition-all">
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

        {/* High-Resolution Dashboard Mockup */}
        <div className="mt-12 sm:mt-16 lg:mt-20 w-full max-w-[1240px] relative">
          {/* Subtle Ambient Backlight Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[70%] bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />

          <div className="relative overflow-hidden group">
            <Image
              src="/images/deployra_dashboard_preview.webp"
              alt="Deployra Uptime Monitoring Dashboard"
              width={1376}
              height={768}
              className="w-full h-auto rounded-2xl sm:rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] transition-transform duration-700 ease-out group-hover:scale-[1.004]"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
