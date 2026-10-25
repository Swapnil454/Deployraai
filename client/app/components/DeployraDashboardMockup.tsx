"use client";

import React, { useState } from "react";
import GlobeNetworkWidget from "./GlobeNetworkWidget";
import {
  Activity,
  AlertTriangle,
  Layers,
  Wrench,
  Users,
  Sliders,
  ChevronDown,
  ArrowUp,
  Bell,
  Pause,
  Edit2,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  Clock,
  BarChart2,
  TrendingUp,
  Calendar,
  Zap,
} from "lucide-react";

export default function DeployraDashboardMockup() {
  const [isPaused, setIsPaused] = useState(false);
  const [selectedRange, setSelectedRange] = useState("Last 30 days");

  return (
    <div className="relative w-full">
      {/* ── Extended Precision Bezel Outer Border ── */}
      {/* Solid green across the top and down sides to 25%, then slowly & smoothly fading out toward the bottom */}
      <div
        className="relative z-10 p-[1.5px] rounded-[22px] sm:rounded-[26px] transition-all duration-300"
        style={{
          background:
            "linear-gradient(to bottom, #10b981 0%, #10b981 25%, rgba(16,185,129,0.85) 38%, rgba(16,185,129,0.55) 52%, rgba(16,185,129,0.25) 68%, rgba(16,185,129,0.06) 82%, transparent 92%)",
        }}
      >
        {/* ── Main Chassis Container: Matches Homepage Background #111111 ── */}
        <div className="relative w-full rounded-[20.5px] sm:rounded-[24.5px] bg-[#111111] overflow-hidden">
          {/* Subtle Inner Top Specular Line */}
          <div
            className="absolute inset-0 rounded-[20.5px] sm:rounded-[24.5px] pointer-events-none z-20"
            style={{
              boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.14)",
              maskImage:
                "linear-gradient(to bottom, black 0%, transparent 28%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 0%, transparent 28%)",
            }}
          />

          {/* Sized so sidebar and right page boxes end at the EXACT same horizontal baseline */}
          <div className="relative z-10 flex flex-col md:flex-row items-stretch">
            {/* ── LEFT SIDEBAR: Clean Neutral Dark with height matching the right boxes row horizontally ── */}
            <aside className="w-full md:w-[195px] lg:w-[205px] shrink-0 bg-[#181a20] md:border-r border-[#262933] p-3.5 sm:p-4 pb-0 sm:pb-0 flex flex-col justify-between">
              <div>
                {/* Deployra Brand Logo */}
                <div className="flex items-center gap-2 px-1 mb-5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
                  <span className="text-white font-bold text-[17px] tracking-tight">Deployra</span>
                </div>

                {/* Nav Menu - Pure text list, Monitoring hardcoded active */}
                <nav className="space-y-3 px-1">
                  {/* Monitoring (Hardcoded Active) */}
                  <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-white select-none">
                    <Activity className="w-3.5 h-3.5 text-[#10b981]" />
                    <span>Monitoring</span>
                  </div>

                  {/* Incidents */}
                  <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-zinc-400 select-none">
                    <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Incidents</span>
                  </div>

                  {/* Status pages */}
                  <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-zinc-400 select-none">
                    <Layers className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Status pages</span>
                  </div>

                  {/* Maintenance */}
                  <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-zinc-400 select-none">
                    <Wrench className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Maintenance</span>
                  </div>

                  {/* Team members */}
                  <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-zinc-400 select-none">
                    <Users className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Team members</span>
                  </div>

                  {/* Integrations & API */}
                  <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-zinc-400 select-none">
                    <Sliders className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Integrations &amp; API</span>
                  </div>
                </nav>
              </div>

              {/* Sidebar bottom indicator aligned with last row of boxes */}
              <div className="py-3 px-1 border-t border-[#262933]/70 flex items-center justify-between text-[10.5px] text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                  <span className="text-zinc-300 font-medium">99.99% Uptime</span>
                </span>
                <span className="text-zinc-500 font-mono text-[9.5px]">v2.4</span>
              </div>
            </aside>

            {/* ── MAIN CONTENT AREA ─────────────────────────────────────── */}
            <main className="flex-1 p-3.5 sm:p-4 pb-0 sm:pb-0 bg-[#111111] flex flex-col gap-2.5">
              {/* Top Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
                {/* Title & Domain Block */}
                <div className="flex items-center gap-3">
                  {/* Big Green Circle with Arrow Up */}
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#1dd97b] flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(29,217,123,0.3)]">
                    <ArrowUp className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-[#071910] stroke-[2.8]" />
                  </div>

                  <div>
                    <h3 className="text-white font-bold text-[18px] sm:text-[20px] tracking-tight leading-none">
                      api.deployra.cloud
                    </h3>
                    <p className="text-zinc-400 text-[10.5px] sm:text-[11px] mt-1 font-normal">
                      HTTP/S monitor for https://api.deployra.cloud
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#1f222a] border border-[#2d323e] text-[10px] text-zinc-200 font-medium">
                        Client 1
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#1f222a] border border-[#2d323e] text-[10px] text-zinc-200 font-medium">
                        Server Europe
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[5px] bg-[#1f222a] border border-[#2d323e] text-zinc-200 text-[11.5px] font-medium hover:bg-[#272b35] hover:border-zinc-600 transition-colors shadow-sm cursor-pointer"
                  >
                    <Bell className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Test notification</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPaused(!isPaused)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[5px] bg-[#1f222a] border border-[#2d323e] text-zinc-200 text-[11.5px] font-medium hover:bg-[#272b35] hover:border-zinc-600 transition-colors shadow-sm cursor-pointer"
                  >
                    <Pause className="w-3 h-3 text-zinc-300 fill-zinc-300" />
                    <span>{isPaused ? "Resume" : "Pause"}</span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[5px] bg-[#1f222a] border border-[#2d323e] text-zinc-200 text-[11.5px] font-medium hover:bg-[#272b35] hover:border-zinc-600 transition-colors shadow-sm cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3 text-zinc-300" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded-[5px] bg-[#1f222a] border border-[#2d323e] text-zinc-300 hover:text-white hover:bg-[#272b35] hover:border-zinc-600 transition-colors shadow-sm cursor-pointer"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* ── ROW 1: 4 Top Metric Cards (Elevated 'more white' background #1f222a with border #2d323e) ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Card 1: Current status */}
                <div className="bg-[#1f222a] border border-[#2d323e] rounded-[8px] p-3 sm:p-3.5 flex flex-col justify-between shadow-sm hover:border-zinc-600 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-300 text-[10.5px] font-sans font-medium tracking-normal">
                    <Activity className="w-3 h-3 text-emerald-400" />
                    <span>Current status</span>
                  </div>
                  <div className="my-1.5 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[#22c55e] text-[22px] sm:text-[24px] font-bold tracking-tight">
                      Up
                    </span>
                  </div>
                  <div className="text-zinc-400 text-[10px]">
                    Currently up for <span className="text-zinc-200 font-medium">18 d, 4 h, 12 m</span>
                  </div>
                </div>

                {/* Card 2: Last check */}
                <div className="bg-[#1f222a] border border-[#2d323e] rounded-[8px] p-3 sm:p-3.5 flex flex-col justify-between shadow-sm hover:border-zinc-600 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-300 text-[10.5px] font-sans font-medium tracking-normal">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>Last check</span>
                  </div>
                  <div className="my-1.5">
                    <span className="text-white text-[17px] sm:text-[18px] font-bold tracking-tight">
                      14 seconds ago
                    </span>
                  </div>
                  <div className="text-zinc-400 text-[10px]">
                    Checked every 30 s
                  </div>
                </div>

                {/* Card 3: Last 24 hours */}
                <div className="bg-[#1f222a] border border-[#2d323e] rounded-[8px] p-3 sm:p-3.5 flex flex-col justify-between shadow-sm hover:border-zinc-600 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-300 text-[10.5px] font-sans font-medium tracking-normal">
                    <BarChart2 className="w-3 h-3 text-zinc-400" />
                    <span>Last 24 hours</span>
                  </div>
                  <div className="my-1">
                    <span className="text-white text-[18px] sm:text-[19px] font-bold tracking-tight">
                      100%
                    </span>
                  </div>
                  {/* Row of 24 rounded pill bars in vibrant green with tactile hover */}
                  <div className="flex items-center gap-[2.5px] pt-1">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        title={`Hour ${i + 1}: 100% operational`}
                        className={`h-3.5 sm:h-4 w-[3.2px] rounded-full transition-all duration-150 cursor-pointer ${
                          i === 23
                            ? "bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.6)] animate-pulse"
                            : "bg-[#22c55e] hover:brightness-125 hover:scale-y-110 shadow-[0_0_2px_rgba(34,197,94,0.3)]"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Card 4: Domain & SSL cert. */}
                <div className="bg-[#1f222a] border border-[#2d323e] rounded-[8px] p-3 sm:p-3.5 flex flex-col justify-between gap-1.5 shadow-sm hover:border-zinc-600 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-300 text-[10.5px] font-sans font-medium tracking-normal">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>Domain &amp; SSL cert.</span>
                  </div>
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-start gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                      <div className="text-[10px] text-zinc-300 leading-tight">
                        Domain valid until <span className="text-zinc-400 font-mono">12/03/2027</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="text-[10px] text-zinc-300 leading-tight">
                        SSL certificate valid until <span className="text-zinc-400 font-mono">12/03/2027</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ROW 2: Uptime stats & Next maintenance ──────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
                {/* Card 5: Uptime stats. (Span 7) */}
                <div className="lg:col-span-7 bg-[#1f222a] border border-[#2d323e] rounded-[8px] p-3 sm:p-3.5 flex flex-col justify-between shadow-sm hover:border-zinc-600 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-300 text-[10.5px] font-sans font-medium tracking-normal">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    <span>Uptime stats.</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <div className="text-[10px] text-zinc-400">Last 7 days:</div>
                      <div className="text-[#22c55e] text-[18px] sm:text-[19px] font-bold tracking-tight mt-0.5">
                        100%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-400">Last 30 days:</div>
                      <div className="text-white text-[18px] sm:text-[19px] font-bold tracking-tight mt-0.5">
                        99.999%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-400">Last 365 days:</div>
                      <div className="text-zinc-300 text-[18px] sm:text-[19px] font-bold tracking-tight mt-0.5">
                        99.99%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 6: Next maintenance. (Span 5) */}
                <div className="lg:col-span-5 bg-[#1f222a] border border-[#2d323e] rounded-[8px] p-3 sm:p-3.5 flex flex-col justify-between shadow-sm hover:border-zinc-600 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-300 text-[10.5px] font-sans font-medium tracking-normal">
                    <Calendar className="w-3 h-3 text-zinc-400" />
                    <span>Next maintenance.</span>
                  </div>
                  <div className="my-1">
                    <span className="text-white text-[19px] sm:text-[21px] font-bold tracking-tight">
                      In 3 days
                    </span>
                  </div>
                  <div className="text-zinc-400 text-[9.5px]">
                    Standard maintenance window
                  </div>
                </div>
              </div>

              {/* ── ROW 3: Response Time Chart & 3D Rotating Earth Network Mesh ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
                {/* Card 7: Response time (Span 7) */}
                <div className="lg:col-span-7 bg-[#1f222a] border border-[#2d323e] rounded-[8px] p-3 sm:p-3.5 flex flex-col justify-between shadow-sm hover:border-zinc-600 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-zinc-300 text-[10.5px] font-sans font-medium tracking-normal">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span>Response time</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono font-medium bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        avg 41ms
                      </span>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#272b35] border border-[#373c4b] text-[9.5px] text-zinc-200 hover:bg-[#303541] hover:border-zinc-500 transition-colors cursor-pointer"
                      >
                        <span>{selectedRange}</span>
                        <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  {/* Glowing Emerald Response Time Wave Graph */}
                  <div className="w-full h-20 sm:h-22 relative">
                    <svg
                      viewBox="0 0 540 100"
                      className="w-full h-full overflow-visible"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="respWaveFillCompact" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                          <stop offset="65%" stopColor="#10b981" stopOpacity="0.04" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines Mesh */}
                      <g stroke="#2d323e" strokeWidth="1" strokeDasharray="3 3">
                        <line x1="0" y1="20" x2="540" y2="20" />
                        <line x1="0" y1="45" x2="540" y2="45" />
                        <line x1="0" y1="70" x2="540" y2="70" />
                        <line x1="0" y1="95" x2="540" y2="95" />
                        <line x1="90" y1="0" x2="90" y2="100" />
                        <line x1="180" y1="0" x2="180" y2="100" />
                        <line x1="270" y1="0" x2="270" y2="100" />
                        <line x1="360" y1="0" x2="360" y2="100" />
                        <line x1="450" y1="0" x2="450" y2="100" />
                      </g>

                      {/* Gradient Area Fill */}
                      <path
                        d="M 0 88 C 80 88, 140 88, 190 88 C 230 88, 240 22, 270 22 C 300 22, 310 82, 350 82 C 400 82, 440 54, 480 54 C 510 54, 530 88, 540 88 L 540 100 L 0 100 Z"
                        fill="url(#respWaveFillCompact)"
                      />

                      {/* Stroke Curve */}
                      <path
                        d="M 0 88 C 80 88, 140 88, 190 88 C 230 88, 240 22, 270 22 C 300 22, 310 82, 350 82 C 400 82, 440 54, 480 54 C 510 54, 530 88, 540 88"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2.0"
                      />

                      {/* Active Live Pulse Data Point */}
                      <circle cx="270" cy="22" r="3.5" fill="#22c55e" className="animate-ping" opacity="0.6" />
                      <circle cx="270" cy="22" r="3" fill="#34d399" stroke="#1f222a" strokeWidth="1.5" />
                    </svg>
                  </div>
                </div>

                {/* Real 3D Rotating Earth Global Network Mesh */}
                <div className="lg:col-span-5 relative flex items-center justify-center overflow-visible">
                  <GlobeNetworkWidget />
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
