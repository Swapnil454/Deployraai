"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  Radio,
} from "lucide-react";

export default function ZeroCodeObservabilitySection() {
  const [inputUrl, setInputUrl] = useState("https://yourwebsite.com");

  return (
    <section className="relative w-full bg-[#111111] pt-24 sm:pt-28 lg:pt-32 pb-24 sm:pb-32 overflow-hidden z-10 font-sans">
      {/* ── Background Matrix Grid ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      {/* Deep atmospheric glows matching the image */}
      <div className="absolute top-1/4 left-1/4 w-[700px] h-[400px] bg-[#00e599]/[0.035] blur-[160px] pointer-events-none z-0" />
      <div className="absolute top-1/2 right-1/4 w-[600px] h-[380px] bg-cyan-500/[0.03] blur-[150px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12">
        {/* ── Headline: Exact matching typography from Image ── */}
        <div className="mb-14 sm:mb-20">
          <h2 className="text-[34px] sm:text-[44px] md:text-[50px] lg:text-[54px] font-bold tracking-tight leading-[1.12]">
            <span className="text-[#00e599] drop-shadow-[0_0_28px_rgba(0,229,153,0.4)]">
              Zero-Code
            </span>{" "}
            <span className="text-white">Observability</span>
            <br />
            <span className="text-white">&amp; analytics pipeline</span>{" "}
            <span className="text-[#00e599] font-mono text-[22px] sm:text-[28px] md:text-[32px] font-normal tracking-normal ml-1 sm:ml-2">
              step by step
            </span>
          </h2>
        </div>

        {/* ── 4-STEP PIPELINE CARDS ── */}
        <div className="relative">
          {/* Cards Grid: items-start so Card 1 and Card 2 retain their natural compact proportions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[250px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-6 lg:gap-5 items-start relative z-10">
            {/* ══════════════════════════════════════════════════════════════════
                STEP 1: Zero-Code Setup (Exact Match to Cropped Image)
            ══════════════════════════════════════════════════════════════════ */}
            <div className="flex flex-col justify-start">
              {/* Header Label: Zero-Code Setup */}
              <div className="mb-3.5 select-none">
                <h3 className="text-white text-[16px] sm:text-[17px] font-semibold tracking-tight">
                  Zero-Code Setup
                </h3>
              </div>

              {/* Outer Card with Soft Right Emerald Aura */}
              <div
                className="relative rounded-[22px] p-4 select-none overflow-visible shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] group transition-all duration-300"
                style={{
                  background:
                    "radial-gradient(circle at 88% 50%, rgba(0, 229, 153, 0.16) 0%, rgba(13, 20, 18, 0.72) 42%, rgba(10, 14, 18, 0.95) 100%)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(255, 255, 255, 0.09)",
                  boxShadow:
                    "0 25px 60px -15px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
                }}
              >
                {/* macOS 3 dots */}
                <div className="flex items-center gap-1.5 mb-3 pl-0.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                </div>

                {/* Inner Frosted Glass Card */}
                <div
                  className="relative rounded-xl p-3.5"
                  style={{
                    background:
                      "linear-gradient(145deg, rgba(255, 255, 255, 0.065) 0%, rgba(255, 255, 255, 0.02) 100%)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    boxShadow:
                      "inset 0 1px 1px rgba(255, 255, 255, 0.16), 0 10px 30px rgba(0, 0, 0, 0.35)",
                  }}
                >
                  {/* Two-Line Title */}
                  <p className="text-[13px] font-medium text-white/95 leading-[1.3] mb-3 tracking-tight">
                    Enter your website URL or
                    <br />
                    connect your cloud
                  </p>

                  {/* Dark Translucent Input Box */}
                  <div
                    className="w-full rounded-lg px-3 py-2 mb-2 flex items-center transition-all focus-within:border-[#00e599]/60"
                    style={{
                      background: "rgba(10, 15, 20, 0.65)",
                      border: "1px solid rgba(255, 255, 255, 0.09)",
                    }}
                  >
                    <input
                      type="text"
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      className="bg-transparent text-[12px] text-zinc-300 outline-none w-full font-sans tracking-tight placeholder-zinc-500"
                      placeholder="https://yourwebsite.com"
                    />
                  </div>

                  {/* Connect Cloud Repository Button */}
                  <div
                    className="w-full rounded-lg px-2.5 py-2 flex items-center justify-between text-[11.5px] text-zinc-200 cursor-pointer transition-colors hover:border-white/20"
                    style={{
                      background: "rgba(10, 15, 20, 0.65)",
                      border: "1px solid rgba(255, 255, 255, 0.09)",
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <svg className="w-3.5 h-3.5 text-white shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                      <span className="font-normal text-zinc-200 truncate">Connect cloud repo</span>
                    </div>
                    <span className="text-zinc-400 font-light text-xs shrink-0">&gt;</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                STEP 2: Automated Global Probing (Vector Sharp, Solid Dark Card)
            ══════════════════════════════════════════════════════════════════ */}
            <div className="flex flex-col justify-start">
              {/* Step Label */}
              <div className="mb-3.5 select-none">
                <h3 className="text-white text-[16px] sm:text-[17px] font-semibold tracking-tight">
                  Automated Global Probing
                </h3>
              </div>

              {/* Solid Matte Dark Card (No Glassy Effect, 100% Vector Sharp) */}
              <div className="relative w-full rounded-[20px] bg-[#0c1017] border border-white/[0.08] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col justify-between group transition-all duration-300 hover:border-[#00e599]/30">
                {/* Top Text (Native Vector Typography) */}
                <div className="text-center pt-5 pb-1 px-4 select-none">
                  <p className="text-[14px] sm:text-[14.5px] font-semibold text-white tracking-tight">
                    Multi-region probe voters locations
                  </p>
                  <p className="text-[12px] sm:text-[12.5px] text-zinc-300 font-normal tracking-tight mt-0.5">
                    DNS, SSL, HTTP status &amp; API health
                  </p>
                </div>

                {/* Vector SVG World Map with Concentric Glowing Beacons */}
                <div className="relative w-full px-2 sm:px-3 py-2 overflow-hidden flex items-center justify-center">
                  {/* Embedded custom keyframes for slow, ultra-premium radar ripple effect */}
                  <style
                    dangerouslySetInnerHTML={{
                      __html: `
                        @keyframes slowRadarPing {
                          0% {
                            transform: scale(0.9);
                            opacity: 0.85;
                          }
                          55% {
                            opacity: 0.3;
                          }
                          100% {
                            transform: scale(2.3);
                            opacity: 0;
                          }
                        }
                        @keyframes slowNodePulse {
                          0%, 100% {
                            box-shadow: 0 0 6px rgba(0, 229, 153, 0.65), inset 0 0 3px rgba(0, 229, 153, 0.4);
                          }
                          50% {
                            box-shadow: 0 0 10px rgba(0, 229, 153, 0.95), inset 0 0 5px rgba(0, 229, 153, 0.6);
                          }
                        }
                      `,
                    }}
                  />

                  <img
                    src="/world-map-dark.svg"
                    alt="Global Probe Voting Mesh"
                    className="w-full h-auto object-contain select-none pointer-events-none block opacity-95"
                  />

                  {/* 10 Glowing Probe Voter Beacons with Slow Premium Radar Waves */}
                  {[
                    { id: "us-west", name: "US West (Oregon)", left: "18.2%", top: "32.5%", delay: "0s" },
                    { id: "us-central", name: "US Central (Texas)", left: "24.0%", top: "41.0%", delay: "1.4s" },
                    { id: "us-east", name: "US East (Virginia)", left: "29.2%", top: "34.0%", delay: "0.7s" },
                    { id: "uk-london", name: "UK (London)", left: "48.5%", top: "28.5%", delay: "2.1s" },
                    { id: "se-stockholm", name: "Europe (Stockholm)", left: "54.0%", top: "22.0%", delay: "0.4s" },
                    { id: "de-frankfurt", name: "Europe (Frankfurt)", left: "53.0%", top: "33.0%", delay: "1.8s" },
                    { id: "in-mumbai", name: "South Asia (Mumbai)", left: "70.8%", top: "51.5%", delay: "1.0s" },
                    { id: "cn-east", name: "East Asia (Shanghai)", left: "78.8%", top: "40.5%", delay: "2.5s" },
                    { id: "sg-singapore", name: "Southeast Asia (Singapore)", left: "77.8%", top: "62.5%", delay: "1.6s" },
                    { id: "jp-tokyo", name: "East Asia (Tokyo)", left: "86.8%", top: "40.0%", delay: "0.9s" },
                  ].map((node) => (
                    <div
                      key={node.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 group"
                      style={{ left: node.left, top: node.top }}
                      title={node.name}
                    >
                      {/* Slow expanding radar wave (transparent fill, crisp delicate green border) */}
                      <span
                        className="absolute inset-0 rounded-full border border-[#00e599]/60 bg-transparent pointer-events-none"
                        style={{
                          animation: "slowRadarPing 3.8s cubic-bezier(0.2, 0.6, 0.35, 1) infinite",
                          animationDelay: node.delay,
                        }}
                      />

                      {/* Secondary slow echo wave for depth */}
                      <span
                        className="absolute inset-0 rounded-full border border-[#00e599]/35 bg-transparent pointer-events-none"
                        style={{
                          animation: "slowRadarPing 3.8s cubic-bezier(0.2, 0.6, 0.35, 1) infinite",
                          animationDelay: `${(parseFloat(node.delay) + 1.4).toFixed(1)}s`,
                        }}
                      />

                      {/* Premium crisp radar beacon circle */}
                      <div
                        className="relative w-[12px] h-[12px] sm:w-[13.5px] sm:h-[13.5px] rounded-full border border-[#00e599] bg-[#00e599]/25 flex items-center justify-center transition-transform duration-300 group-hover:scale-125"
                        style={{
                          animation: "slowNodePulse 3s ease-in-out infinite",
                          animationDelay: node.delay,
                        }}
                      >
                        {/* Inner bright solid white core dot */}
                        <span className="w-1 h-1 rounded-full bg-white shadow-[0_0_3px_#ffffff]" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Text (Native Vector Typography) */}
                <div className="text-center pb-5 pt-1 px-4 select-none">
                  <p className="text-[#00e599] text-[13px] sm:text-[13.5px] font-semibold tracking-tight">
                    Multi-region probe voter nodes
                  </p>
                  <p className="text-zinc-300 text-[11.5px] sm:text-[12px] leading-snug tracking-tight mt-1 max-w-[240px] mx-auto">
                    Executing checks for DNS, SSL, HTTP
                    <br />
                    status, and API health
                  </p>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                STEP 3: Dashboard (Exact 1:1 Mirror of Reference Image)
            ══════════════════════════════════════════════════════════════════ */}
            <div className="flex flex-col justify-start">
              {/* Label */}
              <div className="mb-3.5 select-none">
                <h3 className="text-white text-[16px] sm:text-[17px] font-semibold tracking-tight">
                  Dashboard
                </h3>
              </div>

              {/* Exact Mirror Glassmorphic HUD Card */}
              <div
                className="relative w-full rounded-[22px] p-3.5 sm:p-4 overflow-hidden group transition-all duration-300 flex flex-col justify-between"
                style={{
                  background:
                    "linear-gradient(150deg, rgba(13, 26, 32, 0.82) 0%, rgba(7, 16, 22, 0.88) 45%, rgba(4, 11, 16, 0.95) 100%)",
                  backdropFilter: "blur(32px)",
                  WebkitBackdropFilter: "blur(32px)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  boxShadow:
                    "0 30px 80px -15px rgba(0, 0, 0, 0.95), inset 0 1px 1px rgba(255, 255, 255, 0.28), inset 0 -1px 2px rgba(0, 229, 153, 0.15), 0 0 50px rgba(0, 229, 153, 0.18)",
                }}
              >
                {/* Lush Ambient Glass Backlight Halos */}
                <div className="absolute -top-16 -right-12 w-56 h-56 rounded-full bg-[#00e599]/20 blur-[50px] pointer-events-none -z-10" />
                <div className="absolute -bottom-16 -left-12 w-56 h-56 rounded-full bg-[#06b6d4]/18 blur-[50px] pointer-events-none -z-10" />

                {/* Top Nav Bar inside card */}
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.08] select-none">
                  {/* Glowing 3D Emerald Sphere Logo */}
                  <div className="relative w-6 h-6 rounded-full overflow-hidden shadow-[0_0_14px_rgba(0,229,153,0.9)] flex items-center justify-center">
                    <div className="absolute inset-0 bg-gradient-to-tr from-[#00b074] via-[#00e599] to-[#80ffd0]" />
                    <div className="absolute inset-y-0 right-0 w-2.5 bg-[#031016]/55 rounded-l-full backdrop-blur-[1px]" />
                    <div className="absolute top-0.5 left-1 w-2 h-1 bg-white/75 rounded-full blur-[0.4px]" />
                  </div>

                  {/* Translucent Glass Pill Button */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.06] border border-white/[0.14] text-[11.5px] text-zinc-200 font-medium select-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] hover:bg-white/[0.1] transition-colors cursor-pointer">
                    <span className="w-1.5 h-1.5 rounded-full border border-zinc-400/80" />
                    <span>Dashboard</span>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2.5]" />
                  </div>
                </div>

                {/* Sub-panel 1: Sub-second latency (p50, p95, p80) */}
                <div className="bg-[#051017]/75 border border-white/[0.09] backdrop-blur-md rounded-xl p-2.5 sm:p-3 mb-2 relative overflow-hidden select-none">
                  <p className="text-[11.5px] font-medium text-zinc-200 tracking-tight mb-1">
                    Sub-second latency (p50, p95, p80)
                  </p>

                  <div className="flex items-center relative">
                    {/* Y-Axis numbers */}
                    <div className="flex flex-col justify-between text-[7px] font-mono text-zinc-500 pr-2 h-14 text-right shrink-0">
                      <span>1000</span>
                      <span>200</span>
                      <span>100</span>
                      <span>0</span>
                    </div>

                    {/* SVG Dual Smooth Bezier Wave Graph */}
                    <div className="flex-1 h-14 relative overflow-hidden">
                      {/* Horizontal Subtle Guide Grids */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                        <div className="w-full border-b border-dashed border-white/20" />
                        <div className="w-full border-b border-dashed border-white/20" />
                        <div className="w-full border-b border-dashed border-white/20" />
                        <div className="w-full border-b border-white/20" />
                      </div>

                      <svg className="w-full h-full relative z-10" viewBox="0 0 240 56" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="p95GradExact" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00e599" stopOpacity="0.48" />
                            <stop offset="100%" stopColor="#00e599" stopOpacity="0.0" />
                          </linearGradient>
                          <linearGradient id="p50GradExact" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#a3e635" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Top Smooth Wave Area Fill (p95, Emerald #00e599) */}
                        <path
                          d="M 0,47 C 30,47 60,46 90,46 C 110,46 122,45 128,42 C 132,38 134,18 138,14 C 141,11 144,24 147,32 C 150,38 153,16 156,14 C 159,12 162,28 165,30 C 169,32 173,8 178,6 C 182,5 186,18 190,20 C 194,22 198,13 202,15 C 208,17 212,23 218,25 C 226,27 232,30 240,34 L 240,56 L 0,56 Z"
                          fill="url(#p95GradExact)"
                        />
                        {/* Top Smooth Wave Stroke */}
                        <path
                          d="M 0,47 C 30,47 60,46 90,46 C 110,46 122,45 128,42 C 132,38 134,18 138,14 C 141,11 144,24 147,32 C 150,38 153,16 156,14 C 159,12 162,28 165,30 C 169,32 173,8 178,6 C 182,5 186,18 190,20 C 194,22 198,13 202,15 C 208,17 212,23 218,25 C 226,27 232,30 240,34"
                          fill="none"
                          stroke="#00e599"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Bottom Smooth Baseline Area Fill (p50, Lime #a3e635) */}
                        <path
                          d="M 0,50 C 35,50 70,49 105,49 C 120,49 126,48 130,46 C 133,43 135,36 138,34 C 141,32 144,39 147,42 C 150,44 153,35 156,34 C 159,33 162,40 166,41 C 170,42 173,35 178,34 C 183,33 186,37 190,38 C 196,39 204,38 214,40 C 224,42 232,44 240,46 L 240,56 L 0,56 Z"
                          fill="url(#p50GradExact)"
                        />
                        {/* Bottom Smooth Baseline Stroke */}
                        <path
                          d="M 0,50 C 35,50 70,49 105,49 C 120,49 126,48 130,46 C 133,43 135,36 138,34 C 141,32 144,39 147,42 C 150,44 153,35 156,34 C 159,33 162,40 166,41 C 170,42 173,35 178,34 C 183,33 186,37 190,38 C 196,39 204,38 214,40 C 224,42 232,44 240,46"
                          fill="none"
                          stroke="#a3e635"
                          strokeWidth="1.3"
                          strokeOpacity="0.85"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* X-Axis Ticks */}
                  <div className="flex justify-between text-[7px] font-mono text-zinc-500 pl-7 pr-0.5 mt-1">
                    <span>000</span>
                    <span>100</span>
                    <span>150</span>
                    <span>200</span>
                    <span>250</span>
                    <span>300</span>
                  </div>
                </div>

                {/* Sub-panel 2: Time to First Byte (TTFB) */}
                <div className="bg-[#051017]/75 border border-white/[0.09] backdrop-blur-md rounded-xl p-2.5 sm:p-3 mb-2 relative overflow-hidden select-none">
                  <p className="text-[11.5px] font-medium text-zinc-200 tracking-tight mb-1">
                    Time to First Byte (TTFB)
                  </p>

                  <div className="flex items-center relative">
                    {/* Y-Axis numbers */}
                    <div className="flex flex-col justify-between text-[7px] font-mono text-zinc-500 pr-2 h-14 text-right shrink-0">
                      <span>200</span>
                      <span>150</span>
                      <span>100</span>
                      <span>50</span>
                      <span>0</span>
                    </div>

                    {/* SVG Cyan Smooth Wave Graph */}
                    <div className="flex-1 h-14 relative overflow-hidden">
                      {/* Horizontal Subtle Guide Grids */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                        <div className="w-full border-b border-dashed border-white/20" />
                        <div className="w-full border-b border-dashed border-white/20" />
                        <div className="w-full border-b border-dashed border-white/20" />
                        <div className="w-full border-b border-white/20" />
                      </div>

                      <svg className="w-full h-full relative z-10" viewBox="0 0 240 56" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="ttfbCyanGradExact" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Cyan Smooth Wave Area Fill */}
                        <path
                          d="M 0,48 C 15,48 22,42 30,42 C 38,42 45,47 52,47 C 60,47 68,36 75,36 C 82,36 88,44 95,44 C 103,44 110,38 118,38 C 126,38 130,28 136,24 C 142,20 148,34 152,34 C 158,34 162,12 168,10 C 174,8 178,38 184,38 C 188,38 191,8 195,6 C 199,4 203,32 208,34 C 214,36 218,24 224,24 C 230,24 235,36 240,40 L 240,56 L 0,56 Z"
                          fill="url(#ttfbCyanGradExact)"
                        />
                        {/* Cyan Smooth Wave Stroke */}
                        <path
                          d="M 0,48 C 15,48 22,42 30,42 C 38,42 45,47 52,47 C 60,47 68,36 75,36 C 82,36 88,44 95,44 C 103,44 110,38 118,38 C 126,38 130,28 136,24 C 142,20 148,34 152,34 C 158,34 162,12 168,10 C 174,8 178,38 184,38 C 188,38 191,8 195,6 C 199,4 203,32 208,34 C 214,36 218,24 224,24 C 230,24 235,36 240,40"
                          fill="none"
                          stroke="#06b6d4"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* X-Axis Ticks */}
                  <div className="flex justify-between text-[7px] font-mono text-zinc-500 pl-7 pr-0.5 mt-1">
                    <span>000</span>
                    <span>100</span>
                    <span>150</span>
                    <span>200</span>
                    <span>250</span>
                    <span>300</span>
                  </div>
                </div>

                {/* Sub-panel 3: Middle Split Row (Calendar + Global Uptime 99.99%) */}
                <div className="grid grid-cols-12 gap-2 mb-2 select-none">
                  {/* 90 day Availability Calendar */}
                  <div className="col-span-8 bg-[#051017]/75 border border-white/[0.09] backdrop-blur-md rounded-xl p-2.5 flex flex-col justify-between">
                    <p className="text-[10px] text-zinc-300 font-medium mb-1 truncate">
                      90 day Availability Calendar
                    </p>

                    <div className="flex items-center">
                      <div className="flex flex-col justify-between text-[6.5px] font-mono text-zinc-500 pr-1 h-8 text-right shrink-0">
                        <span>2000</span>
                        <span>1000</span>
                        <span>0</span>
                      </div>

                      {/* Sparkline Dense Waveform */}
                      <div className="flex-1 h-8 relative overflow-hidden">
                        <svg className="w-full h-full" viewBox="0 0 160 32" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="calSparkGradExact" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#00e599" stopOpacity="0.45" />
                              <stop offset="100%" stopColor="#00e599" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M 0,28 L 4,28 L 6,22 L 8,28 L 12,28 L 14,16 L 16,28 L 20,28 L 22,24 L 24,28 L 28,28 L 30,12 L 32,28 L 36,28 L 38,20 L 40,28 L 44,28 L 46,10 L 48,28 L 52,28 L 54,6 L 56,28 L 60,28 L 62,18 L 64,28 L 68,28 L 70,8 L 72,28 L 76,28 L 78,14 L 80,28 L 84,28 L 86,4 L 88,28 L 92,28 L 94,12 L 96,28 L 100,28 L 102,6 L 104,28 L 108,28 L 110,20 L 112,28 L 116,28 L 118,10 L 120,28 L 124,28 L 126,16 L 128,28 L 132,28 L 134,6 L 136,28 L 140,28 L 142,18 L 144,28 L 148,28 L 150,12 L 152,28 L 156,28 L 158,24 L 160,28 L 160,32 L 0,32 Z"
                            fill="url(#calSparkGradExact)"
                          />
                          <path
                            d="M 0,28 L 4,28 L 6,22 L 8,28 L 12,28 L 14,16 L 16,28 L 20,28 L 22,24 L 24,28 L 28,28 L 30,12 L 32,28 L 36,28 L 38,20 L 40,28 L 44,28 L 46,10 L 48,28 L 52,28 L 54,6 L 56,28 L 60,28 L 62,18 L 64,28 L 68,28 L 70,8 L 72,28 L 76,28 L 78,14 L 80,28 L 84,28 L 86,4 L 88,28 L 92,28 L 94,12 L 96,28 L 100,28 L 102,6 L 104,28 L 108,28 L 110,20 L 112,28 L 116,28 L 118,10 L 120,28 L 124,28 L 126,16 L 128,28 L 132,28 L 134,6 L 136,28 L 140,28 L 142,18 L 144,28 L 148,28 L 150,12 L 152,28 L 156,28 L 158,24 L 160,28"
                            fill="none"
                            stroke="#00e599"
                            strokeWidth="1.3"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>

                    <div className="flex justify-between text-[6.5px] font-mono text-zinc-500 pl-5 pr-0.5 mt-0.5">
                      <span>000</span>
                      <span>100</span>
                      <span>150</span>
                      <span>200</span>
                      <span>300</span>
                    </div>
                  </div>

                  {/* Global Uptime 99.99% Stat Card */}
                  <div className="col-span-4 bg-[#051017]/75 border border-white/[0.09] backdrop-blur-md rounded-xl p-2.5 flex flex-col justify-center items-start">
                    <p className="text-[9.5px] text-zinc-400 font-medium leading-tight mb-1">
                      Global Uptime
                    </p>
                    <p className="text-[20px] sm:text-[22px] font-bold text-[#00e599] font-mono tracking-tight leading-none drop-shadow-[0_0_12px_rgba(0,229,153,0.7)]">
                      99.99%
                    </p>
                  </div>
                </div>

                {/* Sub-panel 4: 90-day Availability Region Bars */}
                <div className="bg-[#051017]/75 border border-white/[0.09] backdrop-blur-md rounded-xl p-2.5 sm:p-3 select-none">
                  <div className="flex items-center justify-between text-[11px] mb-2 font-medium">
                    <span className="text-zinc-200">90-day Availability</span>
                    <span className="text-zinc-400 font-mono text-[9.5px]">90 day</span>
                  </div>

                  {/* 6 Region Bars Matching Reference */}
                  <div className="flex flex-col gap-1.5">
                    {[
                      { code: "US-E", pct: "100%" },
                      { code: "US-W", pct: "100%" },
                      { code: "EU-C", pct: "82%" },
                      { code: "AP-S", pct: "76%" },
                      { code: "AP-N", pct: "88%" },
                      { code: "SA-E", pct: "100%" },
                    ].map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[7.5px] font-mono text-zinc-400 w-5 shrink-0 text-right">
                          {row.code}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-[#15222c] border border-white/[0.04] overflow-hidden">
                          <div
                            style={{ width: row.pct }}
                            className="h-full rounded-full bg-[#00e599] shadow-[0_0_8px_rgba(0,229,153,0.7)] transition-all duration-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Timeline Axis */}
                  <div className="flex justify-between text-[7px] font-mono text-zinc-500 mt-2 pl-7 pr-0.5">
                    <span>0</span>
                    <span>30 days</span>
                    <span>60 days</span>
                    <span>90 d</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                STEP 4: Instant Automated Protection (Exact 1:1 Mirror)
            ══════════════════════════════════════════════════════════════════ */}
            <div className="flex flex-col justify-start">
              {/* Label */}
              <div className="mb-3.5 select-none">
                <h3 className="text-white text-[16px] sm:text-[17px] font-semibold tracking-tight">
                  Instant Automated Protection
                </h3>
              </div>

              {/* Exact Mirror Card */}
              <div className="relative w-full rounded-[20px] bg-[#0c1017] border border-white/[0.08] p-4 sm:p-5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] flex flex-col justify-between group transition-all duration-300 hover:border-[#00e599]/30">
                {/* Top Section: Multi-Channel Alert Badges */}
                <div className="select-none">
                  <p className="text-[14px] sm:text-[15px] font-semibold text-white text-center tracking-tight leading-snug">
                    Instant multi-channel
                    <br />
                    alert badges
                  </p>

                  {/* 3-Lobed Scalloped Pod Tray (Exact 1:1 Match to Reference) */}
                  <div className="relative my-4 flex items-center justify-center select-none w-full max-w-[270px] mx-auto">
                    {/* The 3 Vertical Pill Lobes (Wide lobes extending above and below each badge) */}
                    <div className="absolute inset-x-0 -top-2 -bottom-2 flex justify-between px-1 pointer-events-none z-0">
                      {/* Lobe 1 (behind Slack) */}
                      <div className="w-[30%] h-full rounded-2xl bg-[#202936] border border-white/[0.22] shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />
                      {/* Lobe 2 (behind Discord) */}
                      <div className="w-[30%] h-full rounded-2xl bg-[#202936] border border-white/[0.22] shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />
                      {/* Lobe 3 (behind PagerDuty) */}
                      <div className="w-[30%] h-full rounded-2xl bg-[#202936] border border-white/[0.22] shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />
                    </div>

                    {/* Connecting Horizontal Pod Body (Solid background covering inner lobe seams) */}
                    <div className="relative z-10 w-full rounded-2xl bg-[#202936] border-y border-white/[0.22] p-1.5 shadow-lg">
                      {/* Left and Right Rounded Endcaps */}
                      <div className="absolute inset-y-0 -left-[1px] w-4 rounded-l-2xl border-l border-white/[0.22] bg-[#202936] pointer-events-none" />
                      <div className="absolute inset-y-0 -right-[1px] w-4 rounded-r-2xl border-r border-white/[0.22] bg-[#202936] pointer-events-none" />

                      {/* The 3 Branded Badges sitting with comfortable padding inside the tray */}
                      <div className="relative z-20 grid grid-cols-3 gap-1.5 items-center">
                        {/* Slack Badge */}
                        <div className="bg-white rounded-lg py-1 px-1.5 sm:px-2 flex items-center justify-center gap-1.5 shadow-sm">
                          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 127 127">
                            <path d="M27.2 79.9a13.6 13.6 0 1 1-13.6-13.6h13.6v13.6zm6.8 0a13.6 13.6 0 1 1 27.2 0v34a13.6 13.6 0 1 1-27.2 0v-34z" fill="#E01E5A" />
                            <path d="M47.6 27.2a13.6 13.6 0 1 1 13.6-13.6v13.6H47.6zm0 6.8a13.6 13.6 0 1 1 0 27.2h-34a13.6 13.6 0 1 1 0-27.2h34z" fill="#36C5F0" />
                            <path d="M99.8 47.6a13.6 13.6 0 1 1 13.6 13.6H99.8V47.6zm-6.8 0a13.6 13.6 0 1 1-27.2 0v-34a13.6 13.6 0 1 1 27.2 0v34z" fill="#2EB67D" />
                            <path d="M79.9 99.8a13.6 13.6 0 1 1-13.6 13.6V99.8h13.6zm0-6.8a13.6 13.6 0 1 1 0-27.2h34a13.6 13.6 0 1 1 0 27.2h-34z" fill="#ECB22E" />
                          </svg>
                          <span className="text-[11px] font-bold text-black tracking-tight">slack</span>
                        </div>

                        {/* Discord Badge */}
                        <div className="bg-[#5865F2] rounded-lg py-1 px-1.5 sm:px-2 flex items-center justify-center gap-1.5 shadow-sm text-white">
                          <svg className="w-3.5 h-3.5 fill-white shrink-0" viewBox="0 0 127.14 96.36">
                            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                          </svg>
                          <span className="text-[11px] font-bold text-white tracking-tight">Discord</span>
                        </div>

                        {/* PagerDuty Badge */}
                        <div className="bg-[#00c957] rounded-lg py-1 px-1.5 sm:px-2 flex items-center justify-center gap-1 shadow-sm text-white">
                          <span className="text-[11px] font-bold text-white tracking-tight">PagerDuty</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-zinc-400 text-[12px] text-center tracking-tight leading-snug mt-2 mb-3.5 select-none">
                    Instant multi-channel alert
                    <br />
                    alert badges
                  </p>
                </div>

                {/* Bottom Section: Cascading Glassy Tabs / macOS Public Status Windows */}
                <div className="relative w-full pt-1 pb-3 select-none">
                  {/* Secondary Tab Peeking Below (Centered along bottom border) */}
                  <div
                    className="absolute -bottom-2 inset-x-4 h-6 rounded-b-2xl border-b border-x border-white/[0.18] shadow-2xl pointer-events-none z-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(28, 38, 52, 0.98) 0%, rgba(16, 22, 32, 0.98) 100%)",
                      backdropFilter: "blur(20px)",
                    }}
                  />
                  {/* Tertiary Subtle Tab Peeking Below (Centered along bottom border) */}
                  <div
                    className="absolute -bottom-3.5 inset-x-8 h-4 rounded-b-xl border-b border-x border-white/[0.10] shadow-xl pointer-events-none -z-10"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(20, 28, 38, 0.92) 0%, rgba(12, 16, 24, 0.92) 100%)",
                      backdropFilter: "blur(16px)",
                    }}
                  />

                  {/* Front Main macOS Status Window (Centered) */}
                  <div
                    className="relative z-10 w-full rounded-2xl p-3 sm:p-3.5"
                    style={{
                      background:
                        "linear-gradient(155deg, rgba(13, 19, 27, 0.98) 0%, rgba(8, 13, 20, 0.99) 100%)",
                      border: "1px solid rgba(255, 255, 255, 0.16)",
                      boxShadow:
                        "0 20px 45px -10px rgba(0, 0, 0, 0.95), inset 0 1px 1px rgba(255, 255, 255, 0.22)",
                      backdropFilter: "blur(24px)",
                    }}
                  >
                    {/* Muted Window Dots (Exact to Image 1) */}
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <span className="w-2 h-2 rounded-full bg-[#48564b] border border-white/[0.08]" />
                      <span className="w-2 h-2 rounded-full bg-[#5b7360] border border-white/[0.08]" />
                      <span className="w-2 h-2 rounded-full bg-[#3e5f48] border border-white/[0.08]" />
                    </div>

                    {/* Status Page Title & Subtitle */}
                    <div className="text-center mb-3">
                      <p className="text-[13.5px] font-semibold text-white tracking-tight">
                        Public status page
                      </p>
                      <p className="text-[8px] sm:text-[8.5px] text-zinc-400 font-normal tracking-tight mt-0.5 leading-tight max-w-[210px] mx-auto">
                        Real-time status updates &amp; incident communication
                        <br />
                        about the infrastructure
                      </p>
                    </div>

                    {/* Total Monitors & Incidents Dual Status Badges */}
                    <div className="grid grid-cols-2 gap-2 mb-2.5">
                      {/* Total Monitors */}
                      <div className="bg-[#071813]/90 border border-[#00e599]/30 rounded-xl p-2 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#00e599] shadow-[0_0_6px_#00e599]" />
                          <span className="text-[9px] sm:text-[9.5px] font-medium text-zinc-200 tracking-tight">Total Monitors</span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-[#00e599]/40 mt-2" />
                      </div>

                      {/* Incidents */}
                      <div className="bg-[#1c0e10]/90 border border-red-500/30 rounded-xl p-2 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_#ef4444]" />
                          <span className="text-[9px] sm:text-[9.5px] font-medium text-zinc-200 tracking-tight">Incidents</span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-[#ef4444]/40 mt-2" />
                      </div>
                    </div>

                    {/* Historical Incidents Row */}
                    <div className="flex items-center justify-between text-[7.5px] font-mono text-zinc-500 mb-2 px-0.5">
                      <span>Historical incidents</span>
                      <span className="text-[#00e599] font-sans">View status ↗</span>
                    </div>

                    {/* Automated Resolution Item Tile */}
                    <div className="bg-white/[0.04] border border-white/[0.07] rounded-lg p-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00e599]" />
                        <span className="text-[8.5px] text-zinc-300 font-medium">Automated resolution</span>
                      </div>
                      <span className="text-[7.5px] font-mono text-zinc-500">Resolved in 32s</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Subtitle Text (Outside of box) */}
              <p className="text-zinc-400 text-[12px] sm:text-[12.5px] leading-snug tracking-tight text-center mt-3.5 select-none">
                Automated public status page
                <br />
                updates automatically based
                <br />
                on the detected incidents
              </p>
            </div>
          </div>
        </div>

        {/* ── Bottom Quick Action Bar ── */}
        <div className="mt-14 sm:mt-18 flex flex-col sm:flex-row items-center justify-between p-6 sm:p-7 rounded-2xl bg-gradient-to-r from-white/[0.02] via-[#00e599]/[0.035] to-white/[0.02] border border-white/[0.08] gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#00e599]/10 border border-[#00e599]/25 flex items-center justify-center text-[#00e599] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">
                Protect your infrastructure with zero code
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Set up automated synthetic monitoring and hosted status pages in under 60 seconds.
              </p>
            </div>
          </div>

          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#00e599] hover:bg-[#00c885] text-black font-semibold text-xs sm:text-sm transition-all shadow-[0_0_20px_rgba(0,229,153,0.3)] hover:shadow-[0_0_28px_rgba(0,229,153,0.5)] cursor-pointer whitespace-nowrap"
          >
            <span>Start zero-code monitoring</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
