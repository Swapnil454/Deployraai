"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Scissors,
  FileText,
  AppWindow,
  ShieldCheck,
  Bell,
  Copy,
} from "lucide-react";

// 5 rows of 46 dense micro-bars with flat-tilted luxury perspective
// Row 4 has a red incident tick in the middle
const createBarRow = (hasIncident = false) => {
  const bars: ("green" | "red")[] = [];
  for (let i = 0; i < 46; i++) {
    if (hasIncident && i === 28) {
      bars.push("red");
    } else {
      bars.push("green");
    }
  }
  return bars;
};

const ROWS = [
  { id: 1, bars: createBarRow(false) },
  { id: 2, bars: createBarRow(false) },
  { id: 3, bars: createBarRow(false) },
  { id: 4, bars: createBarRow(true) },
  { id: 5, bars: createBarRow(false) },
];

const PLACEHOLDER_PILLS = [
  "w-14 sm:w-16",
  "w-20 sm:w-24",
  "w-16 sm:w-18",
  "w-24 sm:w-28",
  "w-18 sm:w-20",
  "w-22 sm:w-26",
];

export default function StatusPagesSection() {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  return (
    <section className="relative w-full bg-[#111111] pt-6 sm:pt-8 lg:pt-10 pb-16 sm:pb-20 lg:pb-24 overflow-hidden z-10">
      {/* ── Background Matrix Grid Matching Homepage ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 xl:gap-14 items-center">
          {/* ── LEFT COLUMN: Clean Strictly 2-Line Headline & Feature Checkpoints ── */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col items-start">
            {/* Signature Headline (Strictly 2 lines across all screens) */}
            <h2 className="text-[21px] sm:text-[25px] md:text-[28px] lg:text-[27px] xl:text-[30px] font-bold text-white leading-[1.28] tracking-[-0.025em] mb-4 sm:mb-5">
              <span className="block whitespace-nowrap">
                Real-time status pages for your
              </span>
              <span className="block whitespace-nowrap">
                website, API, or service<span className="text-[#00e599]">.</span>
              </span>
            </h2>

            {/* Description Paragraph */}
            <p className="text-[14.5px] sm:text-[15px] text-zinc-400 font-normal leading-[1.68] tracking-tight mb-8 max-w-[480px]">
              Create branded, real-time status pages to share uptime, incidents, and
              maintenance updates — no extra tools required. Keep your users informed and
              automatically reduce support tickets.
            </p>

            {/* Feature Checkpoints (Exact 4 Items from Screenshot) */}
            <div className="flex flex-col gap-4 sm:gap-4.5 w-full mb-9">
              {/* Feature 1 */}
              <div className="flex items-center gap-3.5 text-zinc-300">
                <Scissors className="w-4.5 h-4.5 text-[#00e599] shrink-0 stroke-[2.2] -rotate-45 drop-shadow-[0_0_8px_rgba(0,229,153,0.5)]" />
                <span className="text-[15px] sm:text-[15.5px] font-normal tracking-tight text-zinc-200">
                  Custom domains &amp; branding
                </span>
              </div>

              {/* Feature 2 */}
              <div className="flex items-center gap-3.5 text-zinc-300">
                <FileText className="w-4.5 h-4.5 text-[#00e599] shrink-0 stroke-[2.2] drop-shadow-[0_0_8px_rgba(0,229,153,0.5)]" />
                <span className="text-[15px] sm:text-[15.5px] font-normal tracking-tight text-zinc-200">
                  Incident history
                </span>
              </div>

              {/* Feature 3 */}
              <div className="flex items-center gap-3.5 text-zinc-300">
                <AppWindow className="w-4.5 h-4.5 text-[#00e599] shrink-0 stroke-[2.2] drop-shadow-[0_0_8px_rgba(0,229,153,0.5)]" />
                <span className="text-[15px] sm:text-[15.5px] font-normal tracking-tight text-zinc-200">
                  Embed monitors automatically
                </span>
              </div>

              {/* Feature 4 */}
              <div className="flex items-center gap-3.5 text-zinc-300">
                <ShieldCheck className="w-4.5 h-4.5 text-[#00e599] shrink-0 stroke-[2.2] drop-shadow-[0_0_8px_rgba(0,229,153,0.5)]" />
                <span className="text-[15px] sm:text-[15.5px] font-normal tracking-tight text-zinc-200">
                  Password protection &amp; private pages
                </span>
              </div>
            </div>

            {/* Action Buttons (Clean, NO icons in Check our live demo) */}
            <div className="flex flex-wrap items-center gap-3.5 sm:gap-4">
              <Link
                href="/docs"
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-transparent hover:bg-white/[0.05] border border-zinc-600/80 hover:border-zinc-400 text-white font-medium text-[14px] transition-all"
              >
                <span>Learn more</span>
                <span className="text-zinc-400 font-bold">&gt;</span>
              </Link>

              <Link
                href="/status"
                className="inline-flex items-center px-6 py-2.5 rounded-full bg-[#00e599]/[0.08] hover:bg-[#00e599]/[0.15] border border-[#00e599]/35 hover:border-[#00e599]/50 text-[#00e599] font-medium text-[14px] transition-all"
              >
                <span>Check our live demo</span>
              </Link>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Subtle Stealth Glass Mockup ── */}
          <div className="lg:col-span-6 xl:col-span-6 relative flex items-center justify-center lg:justify-start lg:pl-3 xl:pl-6 py-10 lg:py-8 overflow-visible">
            {/* 3D Perspective Stage Container */}
            <div
              className="relative w-full max-w-[485px] sm:max-w-[520px] lg:max-w-[530px] select-none -translate-x-1 sm:-translate-x-2 lg:-translate-x-3 xl:-translate-x-4"
              style={{
                perspective: "1250px",
              }}
            >
              {/* Main Base Card with Translucent Stealth Glassmorphism (Less Visible) */}
              <div
                className="relative z-10 w-full rounded-2xl p-6.5 sm:p-8 pt-6 sm:pt-7 pb-8 sm:pb-9 transition-all duration-700 ease-out"
                style={{
                  background:
                    "linear-gradient(150deg, rgba(255, 255, 255, 0.02) 0%, rgba(13, 19, 27, 0.35) 45%, rgba(7, 10, 15, 0.45) 100%)",
                  backdropFilter: "blur(32px)",
                  WebkitBackdropFilter: "blur(32px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow:
                    "0 35px 85px -20px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.04), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.12)",
                  transform:
                    "rotateX(52deg) rotateY(6deg) rotateZ(-30deg)",
                  transformStyle: "preserve-3d",
                  opacity: 0.82,
                }}
              >
                {/* Diagonal subtle specular sheen across the glass slab */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/[0.03] via-transparent to-[#00e599]/[0.02] pointer-events-none" />

                {/* ── FLOATING POP-OUT HEADER CARD (Layer 2 - Glassmorphic Raised in Z) ── */}
                <div
                  className="relative -mt-1 mb-7 sm:mb-8"
                  style={{
                    transform: "translateZ(38px)",
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* Ghost Wireframe Layer 2 (Furthest back depth frame) */}
                  <div
                    className="absolute inset-0 rounded-xl border border-white/[0.03] pointer-events-none"
                    style={{
                      transform: "translate(-7px, -7px) translateZ(-16px)",
                    }}
                  />

                  {/* Ghost Wireframe Layer 1 (Middle depth frame) */}
                  <div
                    className="absolute inset-0 rounded-xl border border-white/[0.06] bg-white/[0.01] pointer-events-none"
                    style={{
                      transform: "translate(-3.5px, -3.5px) translateZ(-8px)",
                    }}
                  />

                  {/* Green Bell Tab Peeking out behind top-right of Header Card */}
                  <div
                    className="absolute -top-3.5 right-8 sm:right-10 w-7 h-7 rounded-lg bg-gradient-to-br from-[#00e599]/85 to-[#059669]/85 flex items-center justify-center shadow-[0_2px_8px_rgba(0,229,153,0.3)] z-0"
                    style={{
                      transform: "translateZ(-3px)",
                    }}
                  >
                    <Bell className="w-3.5 h-3.5 text-[#06140e] stroke-[2.5]" />
                  </div>

                  {/* Main Elevated Header Banner (Translucent Stealth Glassmorphism) */}
                  <div
                    className="relative z-10 flex items-center justify-between px-4 sm:px-5 py-3.5 rounded-xl border border-white/[0.1]"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(17, 24, 34, 0.45) 100%)",
                      backdropFilter: "blur(24px)",
                      WebkitBackdropFilter: "blur(24px)",
                      boxShadow:
                        "0 20px 45px -10px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.14)",
                    }}
                  >
                    {/* Left: YOUR LOGO with Rotated Diamond */}
                    <div className="flex items-center gap-2 select-none">
                      <div className="w-2.5 h-2.5 rotate-45 border-2 border-white/90 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
                      <span className="font-extrabold text-white/90 text-[11px] sm:text-[12px] tracking-[0.14em] uppercase">
                        YOUR LOGO
                      </span>
                    </div>

                    {/* Right: All systems operational with glowing green dot */}
                    <div className="flex items-center gap-1.5 select-none">
                      <span className="w-2 h-2 rounded-full bg-[#00e599] shadow-[0_0_8px_rgba(0,229,153,0.9)] animate-pulse" />
                      <span className="text-[11px] sm:text-[12px] font-semibold text-[#00e599] tracking-tight">
                        All systems operational
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── BASE CARD CONTENT (Under Header) ── */}
                <div className="grid grid-cols-12 gap-3 sm:gap-4 items-start pt-1">
                  {/* Left Column: Uptime label + 6 stacked placeholder pills with taller spacing */}
                  <div className="col-span-4 flex flex-col items-start">
                    <span className="text-[11px] font-semibold tracking-wider text-zinc-400/90 block mb-3.5 uppercase select-none">
                      Uptime
                    </span>

                    <div className="flex flex-col gap-3 sm:gap-3.5 w-full">
                      {PLACEHOLDER_PILLS.map((width, idx) => (
                        <div
                          key={idx}
                          className={`${width} h-2 rounded-full bg-gradient-to-r from-white/[0.09] to-white/[0.02]`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Right Column: 5 Rows of Micro-bars with '● Up' label and taller bars */}
                  <div className="col-span-8 flex flex-col items-end">
                    {/* Upper right corner copy/window icon */}
                    <div className="mb-2.5 text-zinc-500 hover:text-zinc-300 transition-colors">
                      <Copy className="w-3.5 h-3.5 opacity-60" />
                    </div>

                    {/* 5 Rows of compact, taller micro-bars */}
                    <div className="flex flex-col gap-3.5 sm:gap-4 w-full">
                      {ROWS.map((row) => (
                        <div
                          key={row.id}
                          onMouseEnter={() => setHoveredRow(row.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          className="flex items-center gap-2 sm:gap-2.5 w-full py-0.5"
                        >
                          {/* Micro-bars stretch */}
                          <div className="flex-1 flex items-center gap-[2.5px]">
                            {row.bars.map((bar, idx) => (
                              <div
                                key={idx}
                                className={`flex-1 h-3 sm:h-3.5 rounded-[1px] transition-transform ${
                                  hoveredRow === row.id ? "scale-y-120" : ""
                                } ${
                                  bar === "red"
                                    ? "bg-red-500/90 shadow-[0_0_8px_rgba(239,68,68,0.85)]"
                                    : "bg-[#00e599]/85 hover:bg-[#00e599] shadow-[0_0_2px_rgba(0,229,153,0.25)]"
                                }`}
                              />
                            ))}
                          </div>

                          {/* Far right: ● Up */}
                          <div className="flex items-center gap-1 shrink-0 pl-1 select-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00e599]/90 shadow-[0_0_5px_rgba(0,229,153,0.7)]" />
                            <span className="text-[10px] sm:text-[11px] font-medium text-zinc-400/90">
                              Up
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
