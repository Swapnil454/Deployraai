"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TopologyGraph from "./components/TopologyGraph";
import UptimeMonitoringSection from "./components/UptimeMonitoringSection";
import OutagePreventionSection from "./components/OutagePreventionSection";
import StatusPagesSection from "./components/StatusPagesSection";
import WhyDeployraSection from "./components/WhyDeployraSection";

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
    <main className="flex-1 flex flex-col w-full bg-[#111111] text-white relative overflow-hidden font-sans">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-4 xl:gap-8 items-start">
          {/* Left Column: Headline, Subtitle, CTAs — sticky so it stays visible as graph extends */}
          <div className="lg:col-span-6 xl:col-span-5 2xl:col-span-5 flex flex-col items-start pr-0 lg:pr-4 lg:sticky lg:top-20 xl:top-24 z-20 w-full max-w-[620px]">
            <h1 className="font-heading text-[26px] sm:text-[32px] md:text-[36px] lg:text-[29px] xl:text-[36px] 2xl:text-[44px] font-semibold text-white tracking-[-0.03em] leading-[1.18] mb-2 min-h-[105px] sm:min-h-[125px] md:min-h-[140px] lg:min-h-[115px] xl:min-h-[140px] 2xl:min-h-[170px]">
              <span className="block whitespace-nowrap">Deploy with certainty.</span>
              <span className="block text-zinc-300 whitespace-nowrap mt-1 sm:mt-1.5">
                real-time telemetry meets
              </span>
              <span className="flex items-center whitespace-nowrap mt-1 sm:mt-1.5 min-h-[1.25em]">
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-green-300 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(16,185,129,0.35)]">
                  {displayText || "\u00A0"}
                </span>
                <span className="inline-block w-[3px] sm:w-[3.5px] h-[0.85em] bg-emerald-400 ml-2 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse shrink-0" />
              </span>
            </h1>

            <p className="text-[14.5px] sm:text-[16px] lg:text-[15px] xl:text-[16.5px] 2xl:text-[18px] text-zinc-400 font-normal leading-[1.6] max-w-[440px] xl:max-w-[490px] mt-4 lg:mt-5 mb-7 tracking-tight">
              Multi-region synthetic uptime monitoring and 1-click cloud deployments with autonomous AI error remediation.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="bg-white hover:bg-zinc-100 text-black font-semibold text-[14px] sm:text-[15px] px-5 sm:px-6 py-3 sm:py-3.5 rounded-[3px] transition-all shadow-lg hover:shadow-white/10 flex items-center gap-2 group tracking-tight"
              >
                Start for free
                <span className="text-zinc-600 group-hover:translate-x-0.5 transition-transform font-bold text-sm">
                  &gt;
                </span>
              </Link>
              <Link
                href="/docs"
                className="border border-zinc-700/90 hover:border-zinc-500 bg-zinc-950/40 hover:bg-zinc-900/60 text-white font-medium text-[14px] sm:text-[15px] px-5 sm:px-6 py-3 sm:py-3.5 rounded-[3px] transition-all tracking-tight"
              >
                Talk to sales
              </Link>
            </div>

            {/* ── Mid-Scroll Feature Section (Aligned with Middle/Lower Architecture Nodes) ── */}
            <div className="mt-28 sm:mt-40 lg:mt-48 flex items-start gap-4 sm:gap-6 w-full pt-6">
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
              <div className="flex flex-col items-start max-w-[440px]">
                {/* Pill Tag */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14171f] border border-zinc-700/60 text-xs sm:text-[13px] font-medium text-zinc-300 tracking-tight mb-4">
                  Build and deploy
                </div>

                {/* Stylish Serif Headline */}
                <h2 className="font-serif-display text-[28px] sm:text-[36px] md:text-[40px] lg:text-[34px] xl:text-[42px] 2xl:text-[48px] font-normal text-white leading-[1.12] tracking-[-0.015em] mb-3">
                  Deploy anything
                  <span className="block text-zinc-200">without the complexity</span>
                </h2>

                {/* Subtitle in Deployra Project Context */}
                <p className="text-[14px] sm:text-[15.5px] text-zinc-400 font-normal leading-[1.65] tracking-tight">
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

          {/* Right Column: Massive vertical topology graph — cleanly anchored without overflowing */}
          <div className="lg:col-span-6 xl:col-span-7 2xl:col-span-7 flex items-start justify-end relative w-full overflow-visible -mt-4 sm:-mt-6 lg:-mt-8 xl:-mt-12 mr-0 lg:mr-0 xl:mr-0 translate-x-0">
            <TopologyGraph />
          </div>
        </div>
      </section>
      
      {/* ── UPTIME MONITORING SHOWCASE SECTION ────────────────────────────── */}
      <UptimeMonitoringSection />

      {/* ── OUTAGE PREVENTION & CONTINUOUS MONITORING SECTION ─────────────── */}
      <OutagePreventionSection />

      {/* ── REAL-TIME STATUS PAGES SHOWCASE SECTION ───────────────────────── */}
      <StatusPagesSection />

      {/* ── WHY TEAMS CHOOSE DEPLOYRA (AUTONOMOUS RELIABILITY) ─────────────── */}
      <WhyDeployraSection />
    </main>
  );
}
