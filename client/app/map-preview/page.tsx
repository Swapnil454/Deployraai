"use client";

import React, { useState } from "react";
import Image from "next/image";

export default function MapPreviewPage() {
  const [selected, setSelected] = useState<"v1" | "v2">("v1");

  return (
    <div className="min-h-screen bg-[#111111] text-white p-6 sm:p-10 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-[#27272a] gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#1c222d] border border-[#2d384a] text-xs font-semibold text-emerald-400 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              SVG ARCHITECTURE COMPARISON
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Pre-Emptive Telecast &amp; Self-Healing Pipeline
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Select an option below to compare the exact vector SVG architecture maps.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected("v1")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                selected === "v1"
                  ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/10"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              Option 1: Transit Circuit Map (5 Levels)
            </button>
            <button
              onClick={() => setSelected("v2")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                selected === "v2"
                  ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-lg shadow-cyan-500/10"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              Option 2: Telemetry Highway Map (4 Levels)
            </button>
          </div>
        </div>

        {/* Live SVG Preview Card */}
        <div className="rounded-xl border border-zinc-800 bg-[#0d0f14] overflow-hidden shadow-2xl relative">
          <div className="px-5 py-3 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500/70 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/70 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/70 inline-block"></span>
              <span className="text-xs font-mono text-zinc-400 ml-2">
                {selected === "v1" ? "public/telecast-level-map-v1.svg" : "public/telecast-level-map-v2.svg"}
              </span>
            </div>
            <a
              href={selected === "v1" ? "/telecast-level-map-v1.svg" : "/telecast-level-map-v2.svg"}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-400 hover:text-white underline underline-offset-4"
            >
              Open Raw SVG in New Tab ↗
            </a>
          </div>

          <div className="p-4 sm:p-6 w-full flex items-center justify-center bg-[#111111]">
            <img
              src={selected === "v1" ? "/telecast-level-map-v1.svg" : "/telecast-level-map-v2.svg"}
              alt={selected === "v1" ? "Option 1 SVG Architecture Map" : "Option 2 SVG Architecture Map"}
              className="w-full h-auto max-w-[1400px] rounded-lg border border-zinc-800/60"
            />
          </div>
        </div>

        {/* Side-by-Side Detailed Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div
            onClick={() => setSelected("v1")}
            className={`p-5 rounded-xl border cursor-pointer transition-all ${
              selected === "v1" ? "bg-emerald-950/20 border-emerald-500/60" : "bg-zinc-900/40 border-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white">Option 1: Multi-Track Transit Circuit</h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                5 Levels
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Step-by-step circuit route connecting Level 01 (Capture) $\rightarrow$ Level 02 (Canary) $\rightarrow$ Level 03 (Radar) $\rightarrow$ Fork into Level 04 (Instant Telecast) and Level 05 (Auto-Rollback). Features a dashed feedback loop route.
            </p>
            <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <span>➔ Click to preview Option 1 above</span>
            </div>
          </div>

          <div
            onClick={() => setSelected("v2")}
            className={`p-5 rounded-xl border cursor-pointer transition-all ${
              selected === "v2" ? "bg-cyan-950/20 border-cyan-500/60" : "bg-zinc-900/40 border-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white">Option 2: Telemetry Route Highway</h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                4 Levels / Dual Fork
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Horizontal data highway with traveling telemetry packet markers, wide metric cards, and a sweeping dual-fork into Level 04A (Immediate Alert Replayer) and Level 04B (Zero-Downtime Rollback Isolation).
            </p>
            <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5">
              <span>➔ Click to preview Option 2 above</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
