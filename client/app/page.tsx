"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TopologyGraph from "./components/TopologyGraph";
import UptimeMonitoringSection from "./components/UptimeMonitoringSection";

const ROTATING_FEATURES = [
  "autonomous self-healing",
  "sub-second uptime",
  "one-click orchestration",
  "intelligent error triage",
];

export default function Home() {
  const [featureIndex, setFeatureIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentFullText = ROTATING_FEATURES[featureIndex];
    let timeout: NodeJS.Timeout;

    if (!isDeleting) {
      if (displayText.length < currentFullText.length) {
        // Typing: smooth, deliberate keystroke speed with clear pause on spaces
        const nextChar = currentFullText[displayText.length];
        const delay = nextChar === " " ? 220 : 90;
        timeout = setTimeout(() => {
          setDisplayText(currentFullText.slice(0, displayText.length + 1));
        }, delay);
      } else {
        // Full phrase finished: comfortable 2.8 second hold for reading
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, 2800);
      }
    } else {
      if (displayText.length > 0) {
        // Erasing: steady, visible backspacing so the cursor movement feels natural
        timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1));
        }, 48);
      } else {
        // Fully erased: relaxed half-second pause before typing next feature
        timeout = setTimeout(() => {
          setIsDeleting(false);
          setFeatureIndex((prev) => (prev + 1) % ROTATING_FEATURES.length);
        }, 500);
      }
    }

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, featureIndex]);

  return (
    <main className="flex-1 flex flex-col w-full bg-[#111111] text-white relative overflow-hidden font-sans select-none">
      {/* ── Background Matrix Grid ────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      {/* ── Corner Greenish Background Tint (Naturally diffused corner glow, matching top strip #011910) ── */}
      <div 
        className="absolute -top-12 -left-12 w-[540px] h-[380px] pointer-events-none z-0 blur-[40px] opacity-90"
        style={{
          background: "radial-gradient(ellipse 90% 85% at 20% 20%, #011910 0%, rgba(1, 25, 16, 0.75) 30%, rgba(1, 25, 16, 0.35) 60%, rgba(1, 25, 16, 0.08) 82%, transparent 100%)"
        }}
      />

      {/* ── HERO SECTION ──────────────────────────────────────────────────── */}
      <section className="relative z-10 w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14 pt-8 sm:pt-12 lg:pt-16 pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-start">
          {/* Left Column: Headline, Subtitle, CTAs — sticky so it stays visible as graph extends */}
          <div className="lg:col-span-4 flex flex-col items-start pr-0 lg:pr-2 lg:sticky lg:top-24 z-20 w-full max-w-[540px] xl:max-w-[580px]">
            <h1 className="font-heading text-[32px] sm:text-[40px] md:text-[44px] lg:text-[48px] xl:text-[53px] font-semibold text-white tracking-[-0.038em] leading-[1.16] mb-2 min-h-[180px] sm:min-h-[210px] md:min-h-[225px] lg:min-h-[240px] xl:min-h-[255px]">
              <span className="block whitespace-nowrap">Deploy with certainty.</span>
              <span className="block text-zinc-200/90 whitespace-nowrap mt-2 sm:mt-3">real-time telemetry meets</span>
              <span className="inline-flex items-center mt-2.5 sm:mt-3.5 h-[1.3em] min-h-[1.3em] whitespace-nowrap overflow-visible py-1">
                {/* Typographic strut: ensures exact baseline and line height when text is completely erased */}
                <span className="inline-block w-0 overflow-hidden invisible select-none pointer-events-none" aria-hidden="true">A</span>
                <span className="inline-block pb-3 -mb-3 pr-1 bg-gradient-to-r from-emerald-400 via-teal-300 to-green-300 bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(16,185,129,0.35)] leading-normal">
                  {displayText}
                </span>
                <span className={`inline-block w-3.5 sm:w-4 xl:w-4.5 h-[0.78em] bg-emerald-400/40 border border-emerald-400/75 align-middle rounded-[1.5px] shadow-[0_0_12px_rgba(52,211,153,0.5)] animate-pulse ${displayText ? "ml-2.5" : "ml-0"}`} />
              </span>
            </h1>

            <p className="text-[16.5px] sm:text-[18px] lg:text-[18.5px] xl:text-[19px] text-zinc-400 font-normal leading-[1.62] max-w-[490px] xl:max-w-[520px] mt-6 mb-8 tracking-tight">
              Multi-region synthetic uptime monitoring and 1-click cloud deployments with autonomous AI error remediation.
            </p>

            <div className="flex flex-wrap items-center gap-3.5">
              <Link
                href="/login"
                className="bg-white hover:bg-zinc-100 text-black font-semibold text-[15px] px-6 py-3.5 rounded-[3px] transition-all shadow-lg hover:shadow-white/10 flex items-center gap-2 group tracking-tight"
              >
                Start for free
                <span className="text-zinc-600 group-hover:translate-x-0.5 transition-transform font-bold text-sm">
                  &gt;
                </span>
              </Link>
              <Link
                href="/docs"
                className="border border-zinc-700/90 hover:border-zinc-500 bg-zinc-950/40 hover:bg-zinc-900/60 text-white font-medium text-[15px] px-6 py-3.5 rounded-[3px] transition-all tracking-tight"
              >
                Talk to sales
              </Link>
            </div>

            {/* ── Mid-Scroll Feature Section (Aligned with Middle/Lower Architecture Nodes) ── */}
            <div className="mt-36 sm:mt-48 lg:mt-56 flex items-start gap-4 sm:gap-6 w-full pt-6">
              {/* Vertical Rail Indicator Track (matching Railway signature style) */}
              <div className="hidden sm:flex flex-col items-center pt-1.5 select-none shrink-0" aria-hidden="true">
                <div className="w-4 h-4 rounded-full border-2 border-zinc-400 bg-zinc-950 flex items-center justify-center shadow-[0_0_8px_rgba(255,255,255,0.15)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                </div>
                <div className="w-[1.5px] h-10 bg-gradient-to-b from-zinc-600 via-zinc-800 to-zinc-800" />
                <div className="w-3.5 h-12 rounded-full border border-zinc-700/90 bg-[#12141a] flex flex-col items-center justify-around py-1 shadow-inner">
                  <div className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                  <div className="w-1 h-1 rounded-full bg-zinc-600" />
                  <div className="w-1 h-1 rounded-full bg-zinc-700" />
                </div>
                <div className="w-[1.5px] h-32 bg-gradient-to-b from-zinc-800 to-transparent" />
              </div>

              {/* Text & Content Block */}
              <div className="flex flex-col items-start max-w-[460px]">
                {/* Pill Tag */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14171f] border border-zinc-700/60 text-xs sm:text-[13px] font-medium text-zinc-300 tracking-tight mb-5">
                  Build and deploy
                </div>

                {/* Stylish Serif Headline */}
                <h2 className="font-serif-display text-[36px] sm:text-[44px] md:text-[48px] lg:text-[52px] font-normal text-white leading-[1.12] tracking-[-0.015em] mb-4">
                  Deploy anything
                  <span className="block text-zinc-200">without the complexity</span>
                </h2>

                {/* Subtitle in Deployra Project Context */}
                <p className="text-[15px] sm:text-[16px] text-zinc-400 font-normal leading-[1.65] tracking-tight">
                  Connect your repo, Deployra handles the rest. Auto-detect frameworks, instant preview environments, multi-region telemetry, and autonomous AI remediation. No new tools to learn.{" "}
                  <Link
                    href="/docs"
                    className="inline-flex items-center gap-1 text-white hover:text-emerald-400 font-medium transition-colors group ml-1"
                  >
                    Learn more
                    <span className="group-hover:translate-x-0.5 transition-transform text-zinc-400 group-hover:text-emerald-400">
                      &rarr;
                    </span>
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Massive vertical topology graph — 100% full size untouched */}
          <div className="lg:col-span-8 flex items-start justify-end relative w-full overflow-visible -mr-4 sm:-mr-8 lg:-mr-16 xl:-mr-24 -mt-4 sm:-mt-7 lg:-mt-10 xl:-mt-14 translate-x-4 sm:translate-x-8 lg:translate-x-14 xl:translate-x-18">
            <TopologyGraph />
          </div>
        </div>
      </section>
      
      {/* ── UPTIME MONITORING SHOWCASE SECTION ────────────────────────────── */}
      <UptimeMonitoringSection />
    </main>
  );
}
