"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Moon, Server, Database, Globe, Zap, Shield, Terminal } from "lucide-react";
import TopologyGraph from "./components/TopologyGraph";

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
    <main className="flex-1 flex flex-col w-full bg-black text-white relative overflow-hidden font-sans select-none">
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
      <section className="relative z-10 w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14 pt-8 sm:pt-12 lg:pt-14 pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-start">
          {/* Left Column: Headline, Subtitle, CTAs — sticky so it stays visible as graph extends */}
          <div className="lg:col-span-4 flex flex-col items-start pr-0 lg:pr-2 lg:sticky lg:top-24">
            <h1 className="text-[28px] sm:text-[36px] xl:text-[42px] font-semibold text-white tracking-[-0.035em] leading-[1.15] mb-4 min-h-[110px] sm:min-h-[140px]">
              <span className="block whitespace-nowrap">Deploy with certainty.</span>
              <span className="block text-zinc-300 whitespace-nowrap">Real-time telemetry meets</span>
              <span className="inline-flex items-center mt-1">
                <span className="bg-gradient-to-r from-[#9333ea] via-[#c084fc] to-[#2dd4bf] bg-clip-text text-transparent">
                  {displayText}
                </span>
                <span className="inline-block w-3 sm:w-3.5 h-[0.75em] bg-[#9333ea]/40 border border-[#c084fc]/60 ml-2 align-middle rounded-[1px] animate-pulse" />
              </span>
            </h1>

            <p className="text-[15px] sm:text-[16px] text-zinc-400 font-normal leading-[1.55] max-w-[440px] mb-7 tracking-tight">
              Multi-region synthetic uptime monitoring and 1-click cloud deployments with autonomous AI error remediation.
            </p>

            <div className="flex flex-wrap items-center gap-3.5">
              <Link
                href="/login"
                className="bg-white text-black font-medium text-[14.5px] px-5 py-3 rounded-[2px] hover:bg-zinc-200 transition-colors flex items-center gap-2 group tracking-tight"
              >
                Start for free
                <span className="text-zinc-600 group-hover:translate-x-0.5 transition-transform font-bold text-sm">
                  &gt;
                </span>
              </Link>
              <Link
                href="/docs"
                className="border border-zinc-700/80 hover:border-zinc-500 bg-transparent text-white font-medium text-[14.5px] px-5 py-3 rounded-[2px] hover:bg-zinc-900/60 transition-colors tracking-tight"
              >
                Talk to sales
              </Link>
            </div>
          </div>

          {/* Right Column: Massive vertical topology graph — responsive layout */}
          <div className="lg:col-span-8 flex items-start justify-end relative w-full overflow-visible -mr-4 sm:-mr-8 lg:-mr-16 xl:-mr-24 -mt-4 sm:-mt-7 lg:-mt-10 xl:-mt-14 translate-x-4 sm:translate-x-8 lg:translate-x-14 xl:translate-x-18">
            <TopologyGraph />
          </div>
        </div>
      </section>


      {/* ── Sub-Section: Seamlessly connected without top border ───────────── */}
      <section className="w-full bg-black py-12 sm:py-16 relative z-10">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14">
          <div className="mb-10">
            <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
              Enterprise primitives for modern engineering teams
            </h2>
            <p className="mt-2 text-zinc-400 text-sm sm:text-base max-w-xl">
              Automatic framework detection, zero-config CI/CD pipelines, and multi-cloud split topologies.
            </p>
          </div>

          <div className="max-w-md">
            <div className="border border-zinc-800/80 bg-[#0c0d10] p-7 rounded-[2px] flex flex-col justify-between hover:border-zinc-700 transition-colors">
              <div>
                <Zap className="h-5 w-5 text-purple-400 mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Zero-Config Deployment</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Automatic project inspection, environment sync, and automated Dockerfile generation for Next.js, Vite, Express, and Go.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-900 text-xs font-mono text-zinc-500">
                MULTI-CLOUD • VERCEL • RENDER • RAILWAY
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
