"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Globe,
  Bell,
  Wrench,
  Users,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Shield,
  Clock,
  Mail,
  Phone,
  MessageSquare,
  Search,
  ExternalLink,
} from "lucide-react";

interface TabItem {
  id: string;
  title: string;
  description: string;
  linkText: string;
  linkHref: string;
}

const TABS: TabItem[] = [
  {
    id: "multi-location",
    title: "Multi-location checks",
    description: "Check from up to four regions and catch the outages only part of the world sees.",
    linkText: "Learn more",
    linkHref: "/docs/monitoring/multi-location",
  },
  {
    id: "response-time",
    title: "Response time alerts",
    description: "Detect performance issues before they cause downtime. Get instant alerts when response times exceed your custom thresholds.",
    linkText: "Learn more",
    linkHref: "/docs/monitoring/response-time",
  },
  {
    id: "incident-tools",
    title: "Incident management tools",
    description: "Track, prioritize, and resolve incidents fast. Collaborate with your team using notes, timelines, and status updates.",
    linkText: "Learn more",
    linkHref: "/docs/monitoring/incidents",
  },
  {
    id: "role-access",
    title: "Role-based team access",
    description: "Manage access with granular permissions. Assign roles, limit visibility, and control who can edit monitors, view alerts, or manage integrations.",
    linkText: "Learn more",
    linkHref: "/docs/teams/rbac",
  },
  {
    id: "maintenance",
    title: "Maintenance windows",
    description: "Run updates without the noise. Schedule maintenance periods to suppress alerts and keep your uptime data accurate.",
    linkText: "Learn more",
    linkHref: "/docs/monitoring/maintenance-windows",
  },
];

export default function DeepInsightsSection() {
  const [activeTab, setActiveTab] = useState<string>("multi-location");
  const [isPaused, setIsPaused] = useState(false);

  // Auto rotate tabs every 7 seconds unless user is hovering/interacting
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveTab((prev) => {
        const currentIndex = TABS.findIndex((t) => t.id === prev);
        const nextIndex = (currentIndex + 1) % TABS.length;
        return TABS[nextIndex].id;
      });
    }, 7000);
    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <section className="relative w-full bg-[#0d1117] pt-24 sm:pt-32 pb-24 sm:pb-36 overflow-hidden z-10 font-sans border-t border-zinc-800/40">
      {/* ── Background Subtle Glow ── */}
      <div className="absolute top-1/3 left-1/4 w-[600px] h-[400px] bg-emerald-500/[0.02] blur-[150px] pointer-events-none z-0" />
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[400px] bg-teal-500/[0.02] blur-[150px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1380px] mx-auto px-6 sm:px-10 lg:px-12">
        {/* ── Header: Exact 2-Column Headline & Subtitle ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start mb-16 sm:mb-20">
          <div className="lg:col-span-7">
            <h2 className="text-[34px] sm:text-[44px] md:text-[50px] lg:text-[52px] font-normal text-white leading-[1.12] tracking-[-0.02em]">
              Deep insights<span className="text-[#00e599]">.</span> Full control<span className="text-[#00e599]">.</span>
              <span className="block text-white mt-1">
                Zero blind spots<span className="text-[#00e599]">.</span>
              </span>
            </h2>
          </div>

          <div className="lg:col-span-5 lg:pt-3 flex lg:justify-end">
            <p className="text-[15px] sm:text-[16px] text-[#8b949e] font-normal leading-[1.65] max-w-md">
              Go beyond simple uptime checks with advanced monitoring, incident management and access built for scaling teams.
            </p>
          </div>
        </div>

        {/* ── Main Interactive Showcase ── */}
        <div
          className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* ── LEFT COLUMN: 5 Accordion Items with Green Indicator ── */}
          <div className="lg:col-span-5 flex flex-col space-y-4 select-none">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="relative pl-6 py-2 cursor-pointer transition-all duration-200 group"
                >
                  {/* Left Vertical Active Indicator Bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-[#00e599] rounded-full shadow-[0_0_12px_rgba(0,229,153,0.7)] animate-fadeIn" />
                  )}

                  {/* Tab Title */}
                  <h3
                    className={`text-[21px] sm:text-[23px] font-semibold tracking-tight transition-colors duration-200 ${
                      isActive ? "text-white" : "text-[#6b7280] group-hover:text-zinc-300"
                    }`}
                  >
                    {tab.title}
                  </h3>

                  {/* Expanded Content (Only on Active Tab) */}
                  {isActive && (
                    <div className="mt-2.5 animate-fadeIn">
                      <p className="text-[14.5px] text-[#8b949e] font-normal leading-[1.6] max-w-md">
                        {tab.description}
                      </p>

                      <Link
                        href={tab.linkHref}
                        className="inline-flex items-center gap-1.5 text-[#00e599] hover:text-emerald-300 text-[14px] font-medium mt-3 transition-colors group/link"
                      >
                        <span>{tab.linkText}</span>
                        <ChevronRight className="w-4 h-4 group-hover/link:translate-x-0.5 transition-transform" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── RIGHT COLUMN: Layered Monitor Dashboard & Floating Cards ── */}
          <div className="lg:col-span-7 relative w-full min-h-[460px] sm:min-h-[520px] flex items-center">
            {/* ── Base Dashboard Card (Present in the background across views) ── */}
            <div className="w-full rounded-2xl bg-[#111620] border border-[#1f2937]/80 shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-5 sm:p-6 select-none overflow-hidden relative">
              {/* Top Row: example.com Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#1f2937]/70 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#00e599]/15 border border-[#00e599]/30 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-[#00e599]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-semibold text-white tracking-tight">example.com</span>
                    </div>
                    <span className="text-[11px] text-[#8b949e]">HTTP(S) monitor for https://example.com</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-mono text-[#6b7280] block">Current status</span>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00e599]">
                    <span className="w-2 h-2 rounded-full bg-[#00e599] animate-pulse" />
                    Up
                  </div>
                  <span className="text-[10px] text-[#6b7280] block">26 seconds ago</span>
                </div>
              </div>

              {/* 3 Metrics: Last 24 hours, Last 30 days, Last 365 days */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="p-3 rounded-xl bg-[#0b0e14]/70 border border-[#1f2937]/50">
                  <span className="text-[10px] text-[#8b949e] uppercase block mb-1">Last 24 hours</span>
                  <span className="text-base sm:text-lg font-bold text-[#00e599] font-mono">100%</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0b0e14]/70 border border-[#1f2937]/50">
                  <span className="text-[10px] text-[#8b949e] uppercase block mb-1">Last 30 days</span>
                  <span className="text-base sm:text-lg font-bold text-[#00e599] font-mono">99.999%</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0b0e14]/70 border border-[#1f2937]/50">
                  <span className="text-[10px] text-[#8b949e] uppercase block mb-1">Last 365 days</span>
                  <span className="text-base sm:text-lg font-bold text-white font-mono">99.98%</span>
                </div>
              </div>

              {/* Response Time Graph Strip */}
              <div className="p-4 rounded-xl bg-[#0b0e14]/70 border border-[#1f2937]/50 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-300">Response time</span>
                  <div className="flex items-center gap-4 text-[11px] font-mono">
                    <span className="text-[#8b949e]">
                      Avg: <strong className="text-white">101.66 ms</strong>
                    </span>
                    <span className="text-[#8b949e]">
                      Min: <strong className="text-[#00e599]">14.76 ms</strong>
                    </span>
                    <span className="text-[#8b949e]">
                      Max: <strong className="text-amber-400">1,546 ms</strong>
                    </span>
                  </div>
                </div>

                {/* Response Sparkline */}
                <div className="w-full h-16 sm:h-20 relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 400 60" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="latency-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00e599" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#00e599" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 0 48 L 40 45 L 80 47 L 120 44 L 160 46 L 200 44 L 220 14 L 235 44 L 270 46 L 310 43 L 350 45 L 400 44 L 400 60 L 0 60 Z"
                      fill="url(#latency-area)"
                    />
                    <path
                      d="M 0 48 L 40 45 L 80 47 L 120 44 L 160 46 L 200 44 L 220 14 L 235 44 L 270 46 L 310 43 L 350 45 L 400 44"
                      fill="none"
                      stroke="#00e599"
                      strokeWidth="2"
                    />
                    <circle cx="220" cy="14" r="3.5" fill="#f59e0b" className="animate-ping" />
                    <circle cx="220" cy="14" r="3" fill="#f59e0b" />
                  </svg>
                </div>
              </div>

              {/* Latest Incidents Table Rows */}
              <div className="space-y-2 text-xs">
                <span className="text-[10px] uppercase font-mono text-[#6b7280] block">Latest incidents</span>
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0b0e14]/50 border border-[#1f2937]/40 text-zinc-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                    <span className="font-semibold text-white">Resolved</span>
                    <span className="text-[#8b949e]">Internal Server Error</span>
                  </div>
                  <span className="text-[11px] text-[#6b7280]">May 14, 2026 • 2m 14s</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0b0e14]/50 border border-[#1f2937]/40 text-zinc-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="font-semibold text-white">Ongoing</span>
                    <span className="text-[#8b949e]">High response time</span>
                  </div>
                  <span className="text-[11px] text-[#6b7280]">26s ago</span>
                </div>
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════════
                FLOATING OVERLAY CARDS (Accurately Layered Per Tab)
            ════════════════════════════════════════════════════════════════════ */}

            {/* ── TAB 1: Multi-location checks (Floating Regions Map + To be notified) ── */}
            {activeTab === "multi-location" && (
              <div className="absolute -left-4 sm:-left-8 top-6 bottom-6 w-[270px] sm:w-[310px] flex flex-col justify-between pointer-events-none z-20 animate-fadeIn">
                {/* Regions Card */}
                <div className="p-4 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-white">Regions</span>
                  </div>

                  {/* World Map Schematic with 3 Green Dots */}
                  <div className="relative w-full h-24 mb-3 rounded-lg overflow-hidden flex items-center justify-center bg-[#0e131d]">
                    <svg className="w-full h-full opacity-30" viewBox="0 0 200 100" fill="none">
                      <path
                        d="M 25 35 Q 40 25 55 35 Q 60 55 45 65 Q 30 65 25 35 Z M 95 30 Q 115 25 125 40 Q 120 60 100 55 Z M 140 40 Q 165 35 175 55 Q 160 75 140 60 Z"
                        fill="#00e599"
                      />
                    </svg>
                    {/* Pulsing Green Nodes */}
                    <div className="absolute left-[28%] top-[38%] flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full bg-[#00e599]/40 animate-ping absolute" />
                      <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                    </div>
                    <div className="absolute left-[54%] top-[34%] flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full bg-[#00e599]/40 animate-ping absolute" />
                      <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                    </div>
                    <div className="absolute left-[78%] top-[56%] flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full bg-[#00e599]/40 animate-ping absolute" />
                      <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                    </div>
                  </div>

                  {/* Node Labels */}
                  <div className="space-y-1.5 text-xs">
                    <div className="text-zinc-300 font-medium">Atlanta, North America</div>
                    <div className="text-zinc-300 font-medium">Poland, Europe</div>
                    <div className="text-zinc-300 font-medium">Bangkok, Thailand</div>
                  </div>
                </div>

                {/* To Be Notified Card */}
                <div className="p-4 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
                  <span className="text-[11px] font-mono text-[#8b949e] block mb-2.5">To be notified</span>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-zinc-200">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-300">
                          JD
                        </div>
                        <span>John Doe</span>
                      </div>
                      <Mail className="w-3.5 h-3.5 text-zinc-400" />
                    </div>

                    <div className="flex items-center justify-between text-zinc-200">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-900/60 text-[#00e599] flex items-center justify-center text-[10px]">
                          TA
                        </div>
                        <span>Tara Alley...</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <Phone className="w-3 h-3" />
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-zinc-200">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-cyan-900/60 text-cyan-400 flex items-center justify-center text-[10px]">
                          JR
                        </div>
                        <span>Jim Read</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <Phone className="w-3 h-3" />
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-zinc-200">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-purple-900/60 text-purple-300 flex items-center justify-center text-[10px]">
                          #
                        </div>
                        <span>Channel 1</span>
                      </div>
                      <span className="text-[10px] text-[#8b949e]">+ 2 more</span>
                    </div>
                  </div>

                  {/* Green Button at bottom */}
                  <div className="mt-3.5 pt-2 border-t border-zinc-800 flex justify-center">
                    <button className="w-full py-1.5 rounded-lg bg-[#00e599] hover:bg-[#00c985] text-black font-semibold text-xs transition-colors">
                      Upgrade now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: Response time alerts (Response Code Card + Avatars + Slow Response Toast) ── */}
            {activeTab === "response-time" && (
              <div className="absolute -left-4 sm:-left-8 top-6 bottom-6 w-[270px] sm:w-[310px] flex flex-col justify-between pointer-events-none z-20 animate-fadeIn">
                {/* Response Headers/Body Card */}
                <div className="p-3.5 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">Response</span>
                    <div className="flex items-center gap-1 text-[10px] font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">Headers</span>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">Body</span>
                    </div>
                  </div>
                  <pre className="text-[10px] font-mono text-[#8b949e] bg-[#0b0e14] p-2 rounded-lg overflow-hidden leading-tight">
                    {`{"status": "degraded",\n "p99_latency_ms": 1546,\n "threshold_rule": "alert"}`}
                  </pre>
                </div>

                {/* To Be Notified Avatar Circles */}
                <div className="p-3.5 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
                  <span className="text-[11px] font-mono text-[#8b949e] block mb-2">To be notified</span>
                  <div className="flex items-center gap-1.5">
                    {["ML", "PA", "UT", "JD", "TE"].map((initials, idx) => (
                      <div
                        key={idx}
                        className="w-6 h-6 rounded-full bg-zinc-700/80 text-[10px] font-bold text-white flex items-center justify-center border border-zinc-600"
                      >
                        {initials}
                      </div>
                    ))}
                    <span className="text-[10px] text-[#8b949e] ml-1">+ 2 more</span>
                  </div>
                </div>

                {/* Slow Response Alert Toast Card */}
                <div className="p-3.5 rounded-2xl bg-[#1a1714] border border-amber-500/50 shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-bold text-amber-400">UPTIMEROBOT</span>
                      <span className="text-[9px] font-mono text-[#8b949e]">NOW</span>
                    </div>
                    <div className="text-xs font-semibold text-white">Slow response time detected</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: Incident management tools (Ongoing Incident Log + Traceroute) ── */}
            {activeTab === "incident-tools" && (
              <div className="absolute -left-4 sm:-left-8 top-6 bottom-6 w-[270px] sm:w-[310px] flex flex-col justify-between pointer-events-none z-20 animate-fadeIn">
                {/* Status Ongoing Card */}
                <div className="p-3.5 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
                  <span className="text-[10px] text-red-400 uppercase font-mono font-bold block mb-1">Status: Ongoing</span>
                  <span className="text-[11px] text-zinc-300 font-medium block">Started on Dec 13, 11:32 AM GMT+1</span>
                  <div className="mt-2 text-[10px] font-mono text-[#8b949e] bg-[#0b0e14] p-1.5 rounded">
                    503 Service Unavailable
                  </div>
                </div>

                {/* Traceroute Card */}
                <div className="p-3.5 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
                  <span className="text-[10px] uppercase font-mono text-[#8b949e] block mb-1">Traceroute</span>
                  <div className="text-[9px] font-mono text-zinc-400 bg-[#0b0e14] p-2 rounded leading-relaxed">
                    <div>1 192.168.1.1 1.2ms</div>
                    <div>2 10.0.4.1 4.5ms</div>
                    <div>3 172.217.16.206 14.1ms</div>
                    <div className="text-red-400">4 * * * Request timed out</div>
                  </div>
                </div>

                {/* Activity Feed Snippet */}
                <div className="p-3.5 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
                  <span className="text-[10px] uppercase font-mono text-[#8b949e] block mb-1">Activity log</span>
                  <div className="text-xs text-zinc-200">
                    <div>John Doe assigned incident</div>
                    <div className="text-[10px] text-[#00e599] mt-1">Status page updated</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 4: Role-based team access (Invite Member Modal) ── */}
            {activeTab === "role-access" && (
              <div className="absolute left-1/2 -translate-x-1/2 top-4 bottom-4 w-[300px] sm:w-[340px] flex flex-col justify-between pointer-events-none z-20 animate-fadeIn">
                <div className="p-5 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_20px_45px_rgba(0,0,0,0.9)] backdrop-blur-md">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-[#00e599]" />
                    <span className="text-xs font-bold text-white">Invite team member</span>
                  </div>

                  <div className="space-y-2.5 text-xs text-zinc-300">
                    <div>
                      <span className="text-[10px] text-[#8b949e] block mb-1">E-mail</span>
                      <div className="px-2.5 py-1.5 rounded bg-[#0b0e14] border border-zinc-800 text-[11px] font-mono text-zinc-300">
                        member@company.com
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#8b949e] block mb-1">Role</span>
                      <div className="px-2.5 py-1.5 rounded bg-[#0b0e14] border border-zinc-800 text-[11px] font-medium text-white flex items-center justify-between">
                        <span>Administrator (Full edit access)</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#8b949e] block mb-1">Full name</span>
                      <div className="px-2.5 py-1.5 rounded bg-[#0b0e14] border border-zinc-800 text-[11px] text-zinc-400">
                        e.g. John Doe
                      </div>
                    </div>
                  </div>

                  <button className="w-full mt-4 py-2 rounded-lg bg-[#2563eb] text-white font-semibold text-xs">
                    Send invite
                  </button>
                </div>

                {/* SSO / 2FA Pill at bottom */}
                <div className="p-3 rounded-xl bg-[#161d2b] border border-[#2d3748] shadow-lg flex items-center justify-between text-xs text-zinc-200">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#00e599]" />
                    <span>2FA Login Enforced</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                </div>
              </div>
            )}

            {/* ── TAB 5: Maintenance windows (Schedule Window Card) ── */}
            {activeTab === "maintenance" && (
              <div className="absolute left-1/2 -translate-x-1/2 top-4 bottom-4 w-[300px] sm:w-[340px] flex flex-col justify-between pointer-events-none z-20 animate-fadeIn">
                <div className="p-5 rounded-2xl bg-[#161d2b] border border-[#2d3748] shadow-[0_20px_45px_rgba(0,0,0,0.9)] backdrop-blur-md">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-xs font-bold text-white block">Next maintenance.</span>
                      <span className="text-[11px] text-[#8b949e]">Friday night update</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                      In 3 days
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-zinc-300">
                    <div className="p-2 rounded bg-[#0b0e14] border border-zinc-800">
                      <span className="text-[10px] text-[#8b949e] block">Schedule</span>
                      <span className="text-[11px] text-white font-medium">Once on April 28, 10:00 PM UTC</span>
                    </div>

                    <div className="p-2 rounded bg-[#0b0e14] border border-zinc-800">
                      <span className="text-[10px] text-[#8b949e] block">Duration</span>
                      <span className="text-[11px] text-white font-mono">60 minutes</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-300">
                    <span>Visible on status pages</span>
                    <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                  </div>
                </div>

                {/* Suppress Alerts Card */}
                <div className="p-3 rounded-xl bg-[#161d2b] border border-[#2d3748] shadow-lg flex items-center justify-between text-xs text-zinc-200">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#00e599]" />
                    <span>Suppress alerts during window</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#00e599] font-bold">ACTIVE</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
