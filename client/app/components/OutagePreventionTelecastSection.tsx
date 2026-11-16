"use client";

import React, { useEffect, useRef } from "react";
import { Video, RefreshCw, Activity } from "lucide-react";

export default function OutagePreventionTelecastSection() {
  const path1Ref = useRef<SVGPathElement | null>(null);
  const path2Ref = useRef<SVGPathElement | null>(null);
  const path4ARef = useRef<SVGPathElement | null>(null);
  const path4BRef = useRef<SVGPathElement | null>(null);

  const dotGroupRef = useRef<SVGGElement | null>(null);
  const dotCoreRef = useRef<SVGCircleElement | null>(null);
  const dotHaloRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    let animId: number;
    let cycleStart = performance.now();
    let currentFork: "4A" | "4B" = Math.random() < 0.5 ? "4A" : "4B";

    // Much slower, graceful and deliberate timing for clear packet tracking
    const DURATION_TRACK1 = 3200; // ms: Live User Actions -> Pre-Release Sandbox
    const DURATION_PAUSE2 = 700;  // ms: Sandbox verification pause at node
    const DURATION_TRACK2 = 3200; // ms: Pre-Release Sandbox -> Instant Bug Radar
    const DURATION_PAUSE3 = 700;  // ms: Bug Radar triage evaluation pause
    const DURATION_FORK = 2600;   // ms: Fork travel to chosen remediation branch
    const DURATION_END_PAUSE = 1000; // ms: Arrival confirmation hold
    const TOTAL_CYCLE =
      DURATION_TRACK1 +
      DURATION_PAUSE2 +
      DURATION_TRACK2 +
      DURATION_PAUSE3 +
      DURATION_FORK +
      DURATION_END_PAUSE;

    const t1End = DURATION_TRACK1;
    const p2End = t1End + DURATION_PAUSE2;
    const t2End = p2End + DURATION_TRACK2;
    const p3End = t2End + DURATION_PAUSE3;
    const forkEnd = p3End + DURATION_FORK;

    const render = (now: number) => {
      let elapsed = now - cycleStart;

      // When cycle completes, loop again from initial and pick new random branch
      if (elapsed >= TOTAL_CYCLE) {
        cycleStart = now;
        elapsed = 0;
        currentFork = Math.random() < 0.5 ? "4A" : "4B";
      }

      let x = 114;
      let y = 25.5;
      let color = "#2dd4bf";

      if (elapsed < t1End) {
        // Track 1: Live User Actions -> Pre-Release Sandbox
        const p = elapsed / DURATION_TRACK1;
        if (path1Ref.current) {
          const len = path1Ref.current.getTotalLength();
          const pt = path1Ref.current.getPointAtLength(p * len);
          x = pt.x;
          y = pt.y;
        }
        color = "#2dd4bf";
      } else if (elapsed < p2End) {
        // Paused at Pre-Release Sandbox node (dead-center on line at y=64.5)
        x = 254;
        y = 64.5;
        color = "#2dd4bf";
      } else if (elapsed < t2End) {
        // Track 2: Pre-Release Sandbox -> Instant Bug Radar
        const p = (elapsed - p2End) / DURATION_TRACK2;
        if (path2Ref.current) {
          const len = path2Ref.current.getTotalLength();
          const pt = path2Ref.current.getPointAtLength(p * len);
          x = pt.x;
          y = pt.y;
        }
        color = "#38bdf8";
      } else if (elapsed < p3End) {
        // Inspection pause at Instant Bug Radar
        x = 66.5;
        y = 114.5;
        color = "#38bdf8";
      } else if (elapsed < forkEnd) {
        // Track 3 to randomly chosen fork (Video Replay Alert or Automatic Rollback)
        const p = (elapsed - p3End) / DURATION_FORK;
        const targetRef = currentFork === "4A" ? path4ARef.current : path4BRef.current;
        if (targetRef) {
          const len = targetRef.getTotalLength();
          const pt = targetRef.getPointAtLength(p * len);
          x = pt.x;
          y = pt.y;
        }
        color = currentFork === "4A" ? "#fbbf24" : "#2dd4bf";
      } else {
        // Hold at chosen destination before repeating from initial
        x = 240.5;
        y = currentFork === "4A" ? 85.5 : 151.5;
        color = currentFork === "4A" ? "#fbbf24" : "#2dd4bf";
      }

      if (dotGroupRef.current) {
        dotGroupRef.current.setAttribute("transform", `translate(${x}, ${y})`);
      }
      if (dotCoreRef.current) {
        dotCoreRef.current.setAttribute("fill", color);
      }
      if (dotHaloRef.current) {
        dotHaloRef.current.setAttribute("fill", color);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <section className="relative w-full bg-[#111111] pt-10 sm:pt-14 pb-16 sm:pb-24 overflow-hidden z-10 font-sans">
      {/* ── Background Matrix Grid ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      {/* ── Atmospheric Ambient Diffuse Glows ── */}
      <div className="absolute top-1/3 left-1/4 w-[500px] h-[300px] bg-teal-500/[0.02] blur-[160px] pointer-events-none z-0" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[300px] bg-emerald-500/[0.02] blur-[160px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14">
        {/* ── Section Header (Clean, tagless, aligned) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 xl:gap-12 items-start mb-8 sm:mb-12">
          <div className="lg:col-span-7 xl:col-span-7 text-center lg:text-left">
            <h2 className="font-serif-display text-[26px] sm:text-[34px] md:text-[40px] lg:text-[34px] xl:text-[40px] 2xl:text-[46px] font-normal text-white leading-[1.15] tracking-[-0.02em]">
              <span className="block whitespace-nowrap">Outage Prevention</span>
              <span className="block text-zinc-100 whitespace-nowrap mt-1">
                Before First User Exposure<span className="text-emerald-400">.</span>
              </span>
            </h2>
          </div>

          <div className="lg:col-span-5 xl:col-span-5 lg:pt-3 xl:pt-4 text-center lg:text-left flex lg:justify-end">
            <p className="text-[14px] sm:text-[15px] lg:text-[14.5px] xl:text-[15.5px] text-zinc-400 font-normal leading-[1.65] tracking-tight max-w-xl text-left">
              Deployra continuously clones and replays real user sessions against upcoming canary builds in isolated shadow sandboxes. Anomalies trigger instant video reproductions and automated 12ms rollbacks so downtime never reaches production.
            </p>
          </div>
        </div>

        {/* ── Pure Inline Architecture Highway (Dead-Center Aligned Dot 2, No Numbers) ── */}
        <div className="w-full flex items-center justify-center my-4 sm:my-6">
          <div className="w-full max-w-[880px] transition-transform duration-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 340 185"
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-auto select-none"
              style={{ background: "transparent" }}
            >
              <style>{`
                .stage-hover {
                  cursor: pointer;
                  transition: transform 0.2s ease, opacity 0.2s ease;
                }
                .stage-hover:hover .n-core {
                  r: 2.8px;
                  filter: drop-shadow(0 0 5px currentColor);
                }
                .stage-hover:hover text.t-head {
                  filter: drop-shadow(0 0 5px rgba(255,255,255,0.4));
                }
                .t-sub {
                  fill: #828997 !important;
                  transition: fill 0.25s ease;
                  font-family: inherit;
                }
                .stage-hover:hover .t-sub {
                  fill: #b8c1cc !important;
                }
                .bus-hover:hover path {
                  stroke-opacity: 1 !important;
                }
              `}</style>

              <defs>
                <linearGradient id="sec-bg-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.95" />
                </linearGradient>

                <linearGradient id="sec-bg-loop" x1="100%" y1="0%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
                  <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.3" />
                </linearGradient>

                <linearGradient id="sec-bg-alert" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.95" />
                </linearGradient>

                <linearGradient id="sec-bg-heal" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.95" />
                </linearGradient>
              </defs>

              {/* ── 3-LANE CONTINUOUS HIGHWAY ── */}
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                {/* Track 1: Live User Actions -> Pre-Release Sandbox Node (Ends dead-center at x=254, y=64.5) */}
                <g className="bus-hover">
                  <path d="M 114 24 L 268 24 C 278 24, 283 30, 283 42 L 283 54 C 283 62, 278 63, 268 63 L 254 63" stroke="#1c2432" strokeWidth="0.5" />
                  <path
                    ref={path1Ref}
                    d="M 114 25.5 L 268 25.5 C 276 25.5, 281.5 31, 281.5 42 L 281.5 54 C 281.5 61, 276 64.5, 268 64.5 L 254 64.5"
                    stroke="url(#sec-bg-cyan)"
                    strokeWidth="0.7"
                  />
                  <path d="M 114 27 L 268 27 C 274 27, 280 32, 280 42 L 280 54 C 280 60, 274 66, 268 66 L 254 66" stroke="#1c2432" strokeWidth="0.5" />
                </g>

                {/* Track 2: Pre-Release Sandbox Left Outbound -> Instant Bug Radar (Starts at x=148, y=64.5) */}
                <g className="bus-hover">
                  <path d="M 148 63 L 54 63 C 44 63, 39 70, 39 82 L 39 102 C 39 112, 44 113, 54 113 L 64 113" stroke="#1c2432" strokeWidth="0.5" />
                  <path
                    ref={path2Ref}
                    d="M 148 64.5 L 54 64.5 C 45 64.5, 40.5 71, 40.5 82 L 40.5 102 C 40.5 111, 45 114.5, 54 114.5 L 64 114.5"
                    stroke="url(#sec-bg-loop)"
                    strokeWidth="0.7"
                  />
                  <path d="M 148 66 L 54 66 C 46 66, 42 72, 42 82 L 42 102 C 42 110, 46 116, 54 116 L 64 116" stroke="#1c2432" strokeWidth="0.5" />
                </g>

                {/* Track 3: Instant Bug Radar Outbound to Fork */}
                <g className="bus-hover">
                  <path d="M 164 113 L 198 113" stroke="#1c2432" strokeWidth="0.5" />
                  <path d="M 164 114.5 L 200 114.5" stroke="#38bdf8" strokeWidth="0.7" />
                  <path d="M 164 116 L 198 116" stroke="#1c2432" strokeWidth="0.5" />
                </g>

                {/* Upper Fork -> Video Replay Alert (Ends dead-center at x=240.5, y=85.5) */}
                <g className="bus-hover">
                  <path d="M 198 113 L 206 113 C 212 113, 216 108, 216 100 L 216 93 C 216 88, 220 85, 226 85 L 240.5 85" stroke="#1c2432" strokeWidth="0.5" />
                  <path
                    ref={path4ARef}
                    d="M 164 114.5 L 200 114.5 L 207 114.5 C 213 114.5, 217 109, 217 100 L 217 93 C 217 89, 221 85.5, 227 85.5 L 240.5 85.5"
                    stroke="url(#sec-bg-alert)"
                    strokeWidth="0.7"
                  />
                  <path d="M 198 116 L 205 116 C 211 116, 215 110, 215 100 L 215 93 C 215 90, 219 86, 225 86 L 240.5 86" stroke="#2a2316" strokeWidth="0.5" />
                </g>

                {/* Lower Fork -> Automatic Rollback (Ends dead-center at x=240.5, y=151.5) */}
                <g className="bus-hover">
                  <path d="M 198 113 L 205 113 C 211 113, 215 119, 215 128 L 215 142 C 215 148, 219 151, 225 151 L 240.5 151" stroke="#1c2432" strokeWidth="0.5" />
                  <path
                    ref={path4BRef}
                    d="M 164 114.5 L 200 114.5 L 207 114.5 C 213 114.5, 217 120, 217 128 L 217 142 C 217 149, 221 151.5, 227 151.5 L 240.5 151.5"
                    stroke="url(#sec-bg-heal)"
                    strokeWidth="0.7"
                  />
                  <path d="M 198 116 L 206 116 C 212 116, 216 121, 216 128 L 216 142 C 216 150, 220 152, 226 152 L 240.5 152" stroke="#162e24" strokeWidth="0.5" />
                </g>

                {/* ── ONLY ONE SLOW-MOVING TELEMETRY DOT (RANDOM FORK) ── */}
                <g ref={dotGroupRef} transform="translate(114, 25.5)" style={{ pointerEvents: "none" }}>
                  <circle ref={dotHaloRef} r="3.2" fill="#2dd4bf" opacity="0.35" />
                  <circle ref={dotCoreRef} r="1.4" fill="#2dd4bf" />
                  <circle r="0.6" fill="#ffffff" />
                </g>
              </g>

              {/* ── STATION 1: LIVE USER ACTIONS (NO NUMBERING) ── */}
              <g className="stage-hover" transform="translate(14, 17)">
                <circle cx="2.5" cy="8.5" r="3" stroke="#2dd4bf" strokeOpacity="0.3" strokeWidth="0.5" fill="none" />
                <circle className="n-core" cx="2.5" cy="8.5" r="1.5" fill="#2dd4bf" />
                <text className="t-head" x="8" y="7" fill="#ffffff" fontSize="6.8" fontWeight="700">
                  Live User Actions
                </text>
                <text className="t-sub" x="8" y="14" fill="#828997" fontSize="4.7">
                  Every click &amp; visit is buffered in real time
                </text>
                <text className="t-sub" x="8" y="20" fill="#828997" fontSize="4.5">
                  PII-masked with 0ms user latency
                </text>
              </g>

              {/* ── STATION 2: PRE-RELEASE SANDBOX (NODE DEAD-CENTER ON LINE AT Y=64.5, NO NUMBERING) ── */}
              <g className="stage-hover" transform="translate(145, 56)">
                <text className="t-head" x="100" y="7" textAnchor="end" fill="#ffffff" fontSize="6.8" fontWeight="700">
                  Pre-Release Sandbox
                </text>
                <text className="t-sub" x="100" y="14" textAnchor="end" fill="#828997" fontSize="4.7">
                  Replays live traffic on secret canary server
                </text>
                <text className="t-sub" x="100" y="20" textAnchor="end" fill="#828997" fontSize="4.5">
                  Tests code before customers ever reach it
                </text>
                {/* Node is at absolute cx=145+109=254, cy=56+8.5=64.5 -> dead-center on line at y=64.5 */}
                <circle cx="109" cy="8.5" r="3" stroke="#2dd4bf" strokeOpacity="0.3" strokeWidth="0.5" fill="none" />
                <circle className="n-core" cx="109" cy="8.5" r="1.5" fill="#2dd4bf" />
              </g>

              {/* ── STATION 3: INSTANT BUG RADAR (NO NUMBERING) ── */}
              <g className="stage-hover" transform="translate(64, 106)">
                <circle cx="2.5" cy="8.5" r="3" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="0.5" fill="none" />
                <circle className="n-core" cx="2.5" cy="8.5" r="1.5" fill="#38bdf8" />
                <text className="t-head" x="8" y="7" fill="#ffffff" fontSize="6.8" fontWeight="700">
                  Instant Bug Radar
                </text>
                <text className="t-sub" x="8" y="14" fill="#828997" fontSize="4.7">
                  Sensors detect crashes &amp; memory spikes
                </text>
                <text className="t-sub" x="8" y="20" fill="#828997" fontSize="4.5">
                  Catches silent 5xx errors in microseconds
                </text>
              </g>

              {/* ── STATION 4A: VIDEO REPLAY ALERT (NO NUMBERING) ── */}
              <g className="stage-hover" transform="translate(238, 77)">
                <circle cx="2.5" cy="8.5" r="3" stroke="#fbbf24" strokeOpacity="0.3" strokeWidth="0.5" fill="none" />
                <circle className="n-core" cx="2.5" cy="8.5" r="1.5" fill="#fbbf24" />
                <text className="t-head" x="8" y="7" fill="#fbbf24" fontSize="6.8" fontWeight="700">
                  Video Replay Alert
                </text>
                <text className="t-sub" x="8" y="14" fill="#828997" fontSize="4.7">
                  Slack/PagerDuty alert in &lt;100ms
                </text>
                <text className="t-sub" x="8" y="20" fill="#828997" fontSize="4.5">
                  Includes exact video replay of the bug
                </text>
              </g>

              {/* ── STATION 4B: AUTOMATIC ROLLBACK (NO NUMBERING) ── */}
              <g className="stage-hover" transform="translate(238, 143)">
                <circle cx="2.5" cy="8.5" r="3" stroke="#2dd4bf" strokeOpacity="0.3" strokeWidth="0.5" fill="none" />
                <circle className="n-core" cx="2.5" cy="8.5" r="1.5" fill="#2dd4bf" />
                <text className="t-head" x="8" y="7" fill="#2dd4bf" fontSize="6.8" fontWeight="700">
                  Automatic Rollback
                </text>
                <text className="t-sub" x="8" y="14" fill="#828997" fontSize="4.7">
                  Drains faulty code in 12 milliseconds
                </text>
                <text className="t-sub" x="8" y="20" fill="#828997" fontSize="4.5">
                  Restores safe version with 0% downtime
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* ── 3 High-Impact Telemetry Stats (Clean, Borderless, Inline) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 mt-4 border-t border-zinc-800/40">
          <div className="flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 shrink-0 mt-0.5">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white mb-1">Pre-Flight Shadow Telecast</h3>
              <p className="text-[12.5px] text-zinc-400 leading-relaxed">
                Replays live user sessions against canary pods before any customer connects. Zero false positives and zero risk of customer disruption.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white mb-1">100% Video Bug Reproduction</h3>
              <p className="text-[12.5px] text-zinc-400 leading-relaxed">
                No more &quot;could not reproduce&quot;. Developers receive an immediate Slack alert with a full session recording showing the exact pre-crash state.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white mb-1">12ms Autonomous Rollback</h3>
              <p className="text-[12.5px] text-zinc-400 leading-relaxed">
                If the canary fails, Deployra automatically drains bad traffic and reverts to the last verified commit hash in 12ms without human triage.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
