"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Shield,
  Clock,
  Mail,
  Phone,
  Users,
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

  // Auto rotate tabs every 7 seconds unless user pauses / interacts
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
    <section className="relative w-full bg-[#111111] pt-6 sm:pt-10 lg:pt-12 pb-16 sm:pb-24 lg:pb-28 overflow-hidden z-10 font-sans">
      {/* ── Background Matrix Grid matching homepage ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1380px] mx-auto px-5 sm:px-8 lg:px-12">
        {/* ── Header: Responsive 2-Column Headline & Subtitle ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start mb-8 sm:mb-10 lg:mb-12">
          <div className="lg:col-span-7">
            <h2 className="text-[30px] sm:text-[40px] md:text-[46px] lg:text-[50px] font-normal text-white leading-[1.12] tracking-[-0.02em]">
              Deep insights<span className="text-[#00e599]">.</span> Full control<span className="text-[#00e599]">.</span>
              <span className="block text-white mt-1">
                Zero blind spots<span className="text-[#00e599]">.</span>
              </span>
            </h2>
          </div>

          <div className="lg:col-span-5 lg:pt-3 flex lg:justify-end">
            <p className="text-[14.5px] sm:text-[15.5px] text-zinc-400 font-normal leading-[1.65] max-w-md">
              Go beyond simple uptime checks with advanced monitoring, incident management and access built for scaling teams.
            </p>
          </div>
        </div>

        {/* ── Main Interactive Showcase ── */}
        <div
          className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* ── LEFT COLUMN: Accordion Items with Smooth Slide & Indicator ── */}
          <div className="lg:col-span-5 flex flex-col space-y-1.5 sm:space-y-2 select-none">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <div
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsPaused(true);
                  }}
                  className="relative pl-5 sm:pl-6 py-2 cursor-pointer group"
                >
                  {/* Left Vertical Active Indicator Bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-[#00e599] rounded-full" />
                  )}

                  {/* Tab Title */}
                  <h3
                    className={`text-[19px] sm:text-[21px] md:text-[22px] font-semibold tracking-tight transition-colors duration-150 ${
                      isActive ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                    }`}
                  >
                    {tab.title}
                  </h3>

                  {/* Subtitle with Simple Smooth Slide */}
                  {isActive && (
                    <div className="mt-2 text-[14px] text-zinc-400 leading-[1.6] max-w-md animate-slide-down">
                      <p>{tab.description}</p>

                      <Link
                        href={tab.linkHref}
                        className="inline-flex items-center gap-1.5 text-[#00e599] hover:text-[#00c985] text-[13.5px] font-medium mt-2.5 transition-colors group/link"
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

          {/* ── RIGHT COLUMN: Layered Showcase Mockup (Responsive & Clean) ── */}
          <div className="lg:col-span-7 relative w-full">
            {activeTab === "multi-location" ? (
              /* ── Multi-Location Checks: Inline World Map Graphic (Transparent BG, Compact & Subtle Opacity) ── */
              <div className="w-full relative flex items-center justify-center select-none py-2 lg:py-4">
                <img
                  src="/images/deployra-multi-location-checks.webp"
                  alt="Deployra Multi-Region Global Probing & Uptime Network"
                  className="w-full max-w-[520px] xl:max-w-[560px] h-auto max-h-[360px] object-contain opacity-70 hover:opacity-85 transition-opacity duration-300"
                />
              </div>
            ) : (
              /* ── Other Tabs: Interactive Feature Mockups Over Base Telemetry ── */
              <div className="relative w-full flex flex-col lg:block">
                {/* ── TAB 2: Response time alerts ── */}
                {activeTab === "response-time" && (
                  <div key="tab-response-time" className="w-full max-w-[380px] mx-auto mb-4 sm:mb-6 lg:mb-0 lg:absolute lg:left-0 xl:-left-6 lg:top-5 lg:bottom-5 lg:w-[280px] xl:w-[310px] flex flex-col justify-between gap-3.5 z-20 pointer-events-auto">
                    {/* Response Payload Card */}
                    <div className="p-3.5 rounded-2xl bg-[#181a24] border border-white/[0.1] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.75)]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white">Response</span>
                        <div className="flex items-center gap-1 text-[10px] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">Headers</span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">Body</span>
                        </div>
                      </div>
                      <pre className="text-[10px] font-mono text-zinc-400 bg-[#0e1017] p-2 rounded-lg overflow-hidden leading-tight border border-white/[0.04]">
                        {`{"status": "degraded",\n "p99_latency_ms": 1546,\n "threshold_rule": "alert"}`}
                      </pre>
                    </div>

                    {/* To Be Notified Avatars */}
                    <div className="p-3.5 rounded-2xl bg-[#181a24] border border-white/[0.1] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.75)]">
                      <span className="text-[11px] font-mono text-zinc-400 block mb-2">To be notified</span>
                      <div className="flex items-center gap-1.5">
                        {["ML", "PA", "UT", "JD", "TE"].map((initials, idx) => (
                          <div
                            key={idx}
                            className="w-6 h-6 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-200 flex items-center justify-center border border-zinc-700"
                          >
                            {initials}
                          </div>
                        ))}
                        <span className="text-[10px] text-zinc-500 ml-1">+ 2 more</span>
                      </div>
                    </div>

                    {/* Slow Response Alert Toast */}
                    <div className="p-3.5 rounded-2xl bg-[#1a1714] border border-amber-500/40 shadow-[0_16px_36px_-10px_rgba(0,0,0,0.75)] flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-mono font-bold text-amber-400">DEPLOYRA • NOW</span>
                        </div>
                        <div className="text-xs font-semibold text-white">Slow response time detected</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 3: Incident management tools ── */}
                {activeTab === "incident-tools" && (
                  <div key="tab-incident-tools" className="w-full max-w-[380px] mx-auto mb-4 sm:mb-6 lg:mb-0 lg:absolute lg:left-0 xl:-left-6 lg:top-5 lg:bottom-5 lg:w-[280px] xl:w-[310px] flex flex-col justify-between gap-3.5 z-20 pointer-events-auto">
                    {/* Status Ongoing Card */}
                    <div className="p-3.5 rounded-2xl bg-[#181a24] border border-white/[0.1] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.75)]">
                      <span className="text-[10px] text-red-400 uppercase font-mono font-bold block mb-1">Status: Ongoing</span>
                      <span className="text-[11px] text-zinc-300 font-medium block">Started on Dec 13, 11:32 AM UTC</span>
                      <div className="mt-2 text-[10px] font-mono text-zinc-400 bg-[#0e1017] p-1.5 rounded border border-white/[0.04]">
                        503 Service Unavailable
                      </div>
                    </div>

                    {/* Traceroute Card */}
                    <div className="p-3.5 rounded-2xl bg-[#181a24] border border-white/[0.1] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.75)]">
                      <span className="text-[10px] uppercase font-mono text-zinc-400 block mb-1">Traceroute</span>
                      <div className="text-[9px] font-mono text-zinc-400 bg-[#0e1017] p-2 rounded leading-relaxed border border-white/[0.04]">
                        <div>1 192.168.1.1 1.2ms</div>
                        <div>2 10.0.4.1 4.5ms</div>
                        <div>3 172.217.16.206 14.1ms</div>
                        <div className="text-red-400">4 * * * Request timed out</div>
                      </div>
                    </div>

                    {/* Activity Feed Snippet */}
                    <div className="p-3.5 rounded-2xl bg-[#181a24] border border-white/[0.1] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.75)]">
                      <span className="text-[10px] uppercase font-mono text-zinc-400 block mb-1">Activity log</span>
                      <div className="text-xs text-zinc-200">
                        <div>John Doe assigned incident</div>
                        <div className="text-[10px] text-[#00e599] mt-1">Status page updated</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 4: Role-based team access ── */}
                {activeTab === "role-access" && (
                  <div key="tab-role-access" className="w-full max-w-[380px] mx-auto mb-4 sm:mb-6 lg:mb-0 lg:absolute lg:left-0 xl:-left-6 lg:top-5 lg:bottom-5 lg:w-[280px] xl:w-[310px] flex flex-col justify-between gap-3.5 z-20 pointer-events-auto">
                    <div className="p-4 rounded-2xl bg-[#181a24] border border-white/[0.1] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.75)]">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-[#00e599]" />
                        <span className="text-xs font-bold text-white">Invite team member</span>
                      </div>

                      <div className="space-y-2.5 text-xs text-zinc-300">
                        <div>
                          <span className="text-[10px] text-zinc-400 block mb-1">E-mail</span>
                          <div className="px-2.5 py-1.5 rounded bg-[#0e1017] border border-zinc-800 text-[11px] font-mono text-zinc-300">
                            member@company.com
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-zinc-400 block mb-1">Role</span>
                          <div className="px-2.5 py-1.5 rounded bg-[#0e1017] border border-zinc-800 text-[11px] font-medium text-white flex items-center justify-between">
                            <span>Administrator (Full edit)</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-zinc-400 block mb-1">Full name</span>
                          <div className="px-2.5 py-1.5 rounded bg-[#0e1017] border border-zinc-800 text-[11px] text-zinc-400">
                            e.g. John Doe
                          </div>
                        </div>
                      </div>

                      <button className="w-full mt-3.5 py-2 rounded-lg bg-[#2563eb] hover:bg-blue-600 text-white font-semibold text-xs transition-colors">
                        Send invite
                      </button>
                    </div>

                    {/* 2FA Pill */}
                    <div className="p-3 rounded-xl bg-[#181a24] border border-white/[0.1] shadow-lg flex items-center justify-between text-xs text-zinc-200">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#00e599]" />
                        <span>2FA Login Enforced</span>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                    </div>
                  </div>
                )}

                {/* ── TAB 5: Maintenance windows ── */}
                {activeTab === "maintenance" && (
                  <div key="tab-maintenance" className="w-full max-w-[380px] mx-auto mb-4 sm:mb-6 lg:mb-0 lg:absolute lg:left-0 xl:-left-6 lg:top-5 lg:bottom-5 lg:w-[280px] xl:w-[310px] flex flex-col justify-between gap-3.5 z-20 pointer-events-auto">
                    <div className="p-4 rounded-2xl bg-[#181a24] border border-white/[0.1] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.75)]">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-xs font-bold text-white block">Next maintenance.</span>
                          <span className="text-[11px] text-zinc-400">Friday night update</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                          In 3 days
                        </span>
                      </div>

                      <div className="space-y-2 text-xs text-zinc-300">
                        <div className="p-2 rounded bg-[#0e1017] border border-zinc-800">
                          <span className="text-[10px] text-zinc-400 block">Schedule</span>
                          <span className="text-[11px] text-white font-medium">Once on April 28, 10:00 PM UTC</span>
                        </div>

                        <div className="p-2 rounded bg-[#0e1017] border border-zinc-800">
                          <span className="text-[10px] text-zinc-400 block">Duration</span>
                          <span className="text-[11px] text-white font-mono">60 minutes</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-zinc-300">
                        <span>Visible on status pages</span>
                        <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                      </div>
                    </div>

                    {/* Suppress Alerts Pill */}
                    <div className="p-3 rounded-xl bg-[#181a24] border border-white/[0.1] shadow-lg flex items-center justify-between text-xs text-zinc-200">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#00e599]" />
                        <span>Suppress alerts during window</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#00e599] font-bold">ACTIVE</span>
                    </div>
                  </div>
                )}

                {/* ── Base Telemetry Dashboard Card ── */}
                <div className="w-full rounded-2xl bg-[#14161f] border border-white/[0.08] shadow-[0_20px_45px_-15px_rgba(0,0,0,0.7)] p-4 sm:p-6 select-none overflow-hidden relative">
                  {/* Top Row: example.com Header + Status */}
                  <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-5">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#00e599]/15 border border-[#00e599]/30 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-[#00e599]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-base font-semibold text-white tracking-tight">example.com</span>
                        </div>
                        <span className="text-[11px] text-zinc-400 hidden sm:inline-block">HTTP(S) monitor for https://example.com</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-mono text-zinc-500 block">Current status</span>
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00e599]">
                        <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                        Up
                      </div>
                      <span className="text-[10px] text-zinc-500 block">26 seconds ago</span>
                    </div>
                  </div>

                  {/* Uptime Stat Blocks */}
                  <div className="grid grid-cols-2 gap-3 mb-5 lg:w-[58%] lg:ml-auto">
                    <div className="p-3 rounded-xl bg-[#0e1017] border border-white/[0.06]">
                      <span className="text-[10px] text-zinc-400 uppercase block mb-1">Last 30 days</span>
                      <span className="text-base sm:text-lg font-bold text-[#00e599] font-mono">99.999%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0e1017] border border-white/[0.06]">
                      <span className="text-[10px] text-zinc-400 uppercase block mb-1">Last 365 days</span>
                      <span className="text-base sm:text-lg font-bold text-white font-mono">99.98%</span>
                    </div>
                  </div>

                  {/* Response Time Graph Strip */}
                  <div className="p-3.5 sm:p-4 rounded-xl bg-[#0e1017] border border-white/[0.06] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-3">
                      <span className="text-xs font-semibold text-zinc-300">Response time</span>
                      <div className="flex items-center gap-3 sm:gap-4 text-[10.5px] sm:text-[11px] font-mono flex-wrap">
                        <span className="text-zinc-400">
                          Avg: <strong className="text-white">101.66 ms</strong>
                        </span>
                        <span className="text-zinc-400">
                          Min: <strong className="text-[#00e599]">14.76 ms</strong>
                        </span>
                        <span className="text-zinc-400">
                          Max: <strong className="text-amber-400">1,546 ms</strong>
                        </span>
                      </div>
                    </div>

                    {/* Response Sparkline with Clean Green Line & Alert Marker */}
                    <div className="w-full h-14 sm:h-18 relative">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 400 60" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="deep-insights-latency" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00e599" stopOpacity="0.08" />
                            <stop offset="100%" stopColor="#00e599" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M 0 48 L 40 45 L 80 47 L 120 44 L 160 46 L 200 44 L 220 14 L 235 44 L 270 46 L 310 43 L 350 45 L 400 44 L 400 60 L 0 60 Z"
                          fill="url(#deep-insights-latency)"
                        />
                        <path
                          d="M 0 48 L 40 45 L 80 47 L 120 44 L 160 46 L 200 44 L 220 14 L 235 44 L 270 46 L 310 43 L 350 45 L 400 44"
                          fill="none"
                          stroke="#00e599"
                          strokeWidth="2"
                        />
                        <circle cx="220" cy="14" r="3.5" fill="#f59e0b" stroke="#14161f" strokeWidth="1.5" />
                      </svg>
                    </div>
                  </div>

                  {/* Latest Incidents Table Rows */}
                  <div className="space-y-2 text-xs">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">Latest incidents</span>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#0e1017] border border-white/[0.04] text-zinc-300">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00e599]" />
                        <span className="font-semibold text-white">Resolved</span>
                        <span className="text-zinc-400">Internal Server Error</span>
                      </div>
                      <span className="text-[11px] text-zinc-500">May 14, 2026 • 2m 14s</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
