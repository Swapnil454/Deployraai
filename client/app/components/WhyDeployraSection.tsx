"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  Layers,
  GitPullRequest,
  Terminal,
  Activity,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Server,
  DollarSign,
  TrendingDown,
  ChevronRight,
  Code2,
} from "lucide-react";

type ActiveTab = "stack" | "diagnosis" | "fixPr";

export default function WhyDeployraSection() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("fixPr");
  const [activeVoter, setActiveVoter] = useState<number>(0);

  return (
    <section className="relative w-full bg-[#111111] pt-12 sm:pt-16 lg:pt-20 pb-20 sm:pb-24 lg:pb-28 overflow-hidden z-10">
      {/* ── Background Matrix Grid ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      {/* Subtle radial ambient glows (wide, natural, no circles) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-emerald-500/[0.03] blur-[140px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-14">
        {/* ── Header: Why Teams Choose Deployra ── */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-14 sm:mb-18">
          {/* Pill Tag */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#00e599]/[0.08] border border-[#00e599]/25 text-[#00e599] text-[12px] sm:text-[13px] font-semibold tracking-wide uppercase mb-5 shadow-[0_0_16px_rgba(0,229,153,0.12)]">
            <span className="w-2 h-2 rounded-full bg-[#00e599] animate-pulse shadow-[0_0_8px_rgba(0,229,153,0.9)]" />
            <span>The Autonomous Reliability Advantage</span>
          </div>

          {/* Main Display Headline */}
          <h2 className="text-[32px] sm:text-[42px] md:text-[48px] lg:text-[54px] font-normal text-white leading-[1.12] tracking-[-0.025em] mb-5">
            Why modern engineering teams{" "}
            <span className="font-serif-display italic font-normal text-[#00e599] block sm:inline">
              choose Deployra<span className="text-white">.</span>
            </span>
          </h2>

          {/* Subtitle Description */}
          <p className="text-[15px] sm:text-[16.5px] text-zinc-400 font-normal leading-[1.65] tracking-tight max-w-2xl">
            Legacy monitoring wakes you up with cryptic alerts and fragmented dashboards.
            Deployra unifies multi-cloud deployments, 1M-scale consensus monitoring, and
            autonomous AI agents that diagnose and patch outages before users notice.
          </p>
        </div>

        {/* ── Bento Matrix Grid (4 High-Level Architectural Pillars) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-7">
          {/* ════ CARD 1: Autonomous AI Remediation & GitHub Fix PR (7 Cols) ════ */}
          <div className="lg:col-span-7 rounded-2xl bg-gradient-to-b from-white/[0.035] to-white/[0.01] border border-white/[0.08] p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden backdrop-blur-xl group hover:border-white/[0.14] transition-all duration-300">
            {/* Ambient inner glow */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-[#00e599]/[0.04] blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center gap-2.5 text-[#00e599] mb-3 select-none">
                <Sparkles className="w-4 h-4 stroke-[2.2]" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Self-Healing Infrastructure
                </span>
              </div>

              <h3 className="text-[22px] sm:text-[25px] font-bold text-white tracking-tight leading-snug mb-3">
                AI that doesn’t just ping your phone — it writes the pull request.
              </h3>

              <p className="text-[14px] sm:text-[15px] text-zinc-400 leading-relaxed mb-6 max-w-xl">
                When an uncaught exception or degraded endpoint occurs, our TracePilot agent
                inspects server stack traces, analyzes your repository’s AST, and automatically
                submits a tested GitHub Pull Request with the exact code patch.
              </p>

              {/* Interactive Tabs Header */}
              <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3 mb-4 select-none overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab("stack")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                    activeTab === "stack"
                      ? "bg-red-500/15 text-red-400 border border-red-500/30"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>1. Incident Stack Trace</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("diagnosis")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                    activeTab === "diagnosis"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>2. TracePilot AI Diagnosis</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("fixPr")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                    activeTab === "fixPr"
                      ? "bg-[#00e599]/15 text-[#00e599] border border-[#00e599]/35 shadow-[0_0_12px_rgba(0,229,153,0.15)]"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <GitPullRequest className="w-3.5 h-3.5" />
                  <span>3. Automated Pull Request</span>
                </button>
              </div>

              {/* Dynamic Interactive Window */}
              <div className="rounded-xl bg-[#090d13]/90 border border-white/[0.08] p-4 sm:p-5 font-mono text-xs leading-relaxed overflow-x-auto min-h-[190px]">
                {activeTab === "stack" && (
                  <div className="flex flex-col gap-1.5 text-zinc-300">
                    <div className="text-red-400 font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      TypeError: Cannot read properties of undefined (reading &#39;authorization&#39;)
                    </div>
                    <div className="text-zinc-500 pl-4">
                      at authenticateSession (/server/src/middleware/auth.ts:42:24)
                    </div>
                    <div className="text-zinc-500 pl-4">
                      at Layer.handle [as handle_request] (/node_modules/express/router.js:174)
                    </div>
                    <div className="text-zinc-500 pl-4">
                      at processTicksAndRejections (node:internal/process/task_queues:95:5)
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-400 border-t border-white/[0.06] pt-2 flex items-center justify-between">
                      <span>Status: HTTP 500 Internal Error</span>
                      <span className="text-red-400">Triggered: 2.1s ago</span>
                    </div>
                  </div>
                )}

                {activeTab === "diagnosis" && (
                  <div className="flex flex-col gap-2 text-zinc-300 font-sans">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Root Cause Identified in 1.4s</span>
                    </div>
                    <p className="text-[13px] text-zinc-300 leading-snug">
                      Incoming webhook payload from payment provider omitted the lowercase{" "}
                      <code className="text-amber-300 bg-white/[0.06] px-1.5 py-0.5 rounded font-mono text-[11.5px]">
                        req.headers[&quot;authorization&quot;]
                      </code>{" "}
                      key, triggering an unhandled null dereference in the auth middleware.
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-[11.5px] font-mono text-zinc-400">
                      <span>Severity: High</span>
                      <span>•</span>
                      <span>Impact: 14% of API checkouts</span>
                      <span>•</span>
                      <span className="text-[#00e599]">Remediation: Safe fallback created</span>
                    </div>
                  </div>
                )}

                {activeTab === "fixPr" && (
                  <div className="flex flex-col gap-2.5 font-sans">
                    <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                      <div className="flex items-center gap-2 text-zinc-200 font-medium text-xs">
                        <GitPullRequest className="w-3.5 h-3.5 text-[#00e599]" />
                        <span className="font-semibold text-white">PR #142</span>
                        <span className="text-zinc-400 truncate">fix(auth): add null-safe optional header parser</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#00e599]/15 text-[#00e599] text-[10px] font-bold uppercase tracking-wider shrink-0">
                        Ready to merge
                      </span>
                    </div>

                    {/* Diff snippet */}
                    <div className="font-mono text-[11px] leading-snug flex flex-col gap-0.5 bg-black/40 p-2.5 rounded-lg border border-white/[0.04]">
                      <div className="text-zinc-500">@@ -41,3 +41,4 @@ export const authenticateSession = (req) =&gt; &#123;</div>
                      <div className="text-red-400/90 bg-red-950/30 px-1 rounded-sm line-through">
                        - const token = req.headers[&quot;authorization&quot;].split(&quot; &quot;)[1];
                      </div>
                      <div className="text-[#00e599] bg-[#00e599]/10 px-1 rounded-sm">
                        + const rawHeader = req.headers?.authorization || req.headers?.[&quot;authorization&quot;] || &quot;&quot;;
                      </div>
                      <div className="text-[#00e599] bg-[#00e599]/10 px-1 rounded-sm">
                        + const token = rawHeader.startsWith(&quot;Bearer &quot;) ? rawHeader.slice(7) : null;
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1">
                      <span className="flex items-center gap-1.5 text-[#00e599]">
                        <CheckCircle2 className="w-3 h-3 text-[#00e599]" />
                        18 automated test suites passing
                      </span>
                      <span className="text-zinc-400">Merged via 1-click</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Reduces Mean Time to Resolution (MTTR) by <span className="text-white font-bold">88%</span>
              </span>
              <Link
                href="/docs"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#00e599] hover:underline"
              >
                <span>Read TracePilot docs</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* ════ CARD 2: Zero False Alarms via Multi-Region Voter Consensus (5 Cols) ════ */}
          <div className="lg:col-span-5 rounded-2xl bg-gradient-to-b from-white/[0.035] to-white/[0.01] border border-white/[0.08] p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden backdrop-blur-xl group hover:border-white/[0.14] transition-all duration-300">
            <div>
              <div className="flex items-center gap-2.5 text-[#00e599] mb-3 select-none">
                <ShieldCheck className="w-4 h-4 stroke-[2.2]" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Consensus Engine
                </span>
              </div>

              <h3 className="text-[22px] sm:text-[25px] font-bold text-white tracking-tight leading-snug mb-3">
                Zero false alarms. 100% verified consensus.
              </h3>

              <p className="text-[14px] sm:text-[15px] text-zinc-400 leading-relaxed mb-6">
                Never wake up for a localized ISP fiber cut. When a primary probe flags an issue,
                secondary validator nodes across 3 independent continents cast confirmation votes
                before triggering on-call notifications.
              </p>

              {/* Interactive Voter Nodes */}
              <div className="flex flex-col gap-2.5">
                {[
                  {
                    region: "US-East (N. Virginia)",
                    flag: "🇺🇸",
                    latency: "18ms",
                    status: "Confirmed Down",
                  },
                  {
                    region: "EU-Central (Frankfurt)",
                    flag: "🇩🇪",
                    latency: "24ms",
                    status: "Confirmed Down",
                  },
                  {
                    region: "AP-East (Tokyo)",
                    flag: "🇯🇵",
                    latency: "76ms",
                    status: "Confirmed Down",
                  },
                ].map((node, i) => (
                  <div
                    key={node.region}
                    onClick={() => setActiveVoter(i)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      activeVoter === i
                        ? "bg-[#00e599]/[0.08] border-[#00e599]/40 shadow-[0_0_15px_rgba(0,229,153,0.1)]"
                        : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{node.flag}</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-white tracking-tight">
                          {node.region}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          Prober RTT: {node.latency}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                        Quorum Vote ✓
                      </span>
                      <div className="w-2 h-2 rounded-full bg-[#00e599] shadow-[0_0_6px_rgba(0,229,153,0.8)]" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Consensus Pill Meter */}
              <div className="mt-4 p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10.5px] uppercase font-mono tracking-wider text-zinc-400">
                    Quorum Status
                  </span>
                  <span className="text-xs font-bold text-white">3/3 Regional Consensus</span>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-[#00e599]/15 border border-[#00e599]/30 text-[#00e599] text-[11px] font-mono font-bold">
                  Genuine Outage Confirmed
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Eliminates <span className="text-white font-bold">99.4%</span> of false alert sirens
              </span>
              <span className="text-xs text-[#00e599] font-mono">Multi-Validator v2</span>
            </div>
          </div>

          {/* ════ CARD 3: 5-in-1 Stack Consolidation & 85% Cost Reduction (6 Cols) ════ */}
          <div className="lg:col-span-6 rounded-2xl bg-gradient-to-b from-white/[0.035] to-white/[0.01] border border-white/[0.08] p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden backdrop-blur-xl group hover:border-white/[0.14] transition-all duration-300">
            <div>
              <div className="flex items-center gap-2.5 text-[#00e599] mb-3 select-none">
                <Layers className="w-4 h-4 stroke-[2.2]" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Toolchain Consolidation
                </span>
              </div>

              <h3 className="text-[22px] sm:text-[25px] font-bold text-white tracking-tight leading-snug mb-3">
                Replace 5 fragmented tools with one unified control plane.
              </h3>

              <p className="text-[14px] sm:text-[15px] text-zinc-400 leading-relaxed mb-6">
                Stop juggling separate accounts and bloated invoices for deployments, synthetics,
                APM, on-call paging, and status pages. Deployra integrates the entire lifecycle
                into a single high-throughput pane of glass.
              </p>

              {/* Side-by-Side Comparison Container */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Traditional Fragmented Stack */}
                <div className="p-4 rounded-xl bg-red-950/15 border border-red-500/20 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase tracking-wider mb-2.5">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>The Fragmented Stack</span>
                    </div>

                    <div className="flex flex-col gap-2 text-xs text-zinc-300">
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>Deployments (Vercel/Render)</span>
                        <span className="font-mono text-zinc-300">$240/mo</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>APM Tracing (Datadog)</span>
                        <span className="font-mono text-zinc-300">$1,850/mo</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>Uptime Probes (Pingdom)</span>
                        <span className="font-mono text-zinc-300">$110/mo</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>On-Call Alerting (PagerDuty)</span>
                        <span className="font-mono text-zinc-300">$340/mo</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>Hosted Status Pages</span>
                        <span className="font-mono text-zinc-300">$99/mo</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-red-500/20 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-medium">Monthly Cost</span>
                    <span className="text-sm font-bold text-red-400 font-mono">~$2,639 / mo</span>
                  </div>
                </div>

                {/* Deployra Unified Stack */}
                <div className="p-4 rounded-xl bg-[#00e599]/[0.06] border border-[#00e599]/35 flex flex-col justify-between shadow-[0_0_20px_rgba(0,229,153,0.08)]">
                  <div>
                    <div className="flex items-center gap-1.5 text-[#00e599] font-bold text-xs uppercase tracking-wider mb-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>The Deployra Platform</span>
                    </div>

                    <div className="flex flex-col gap-2 text-xs text-zinc-200">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-[#00e599]" />
                        <span>Multi-Cloud Git Orchestration</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-[#00e599]" />
                        <span>1M-Scale Synthetic Probing</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-[#00e599]" />
                        <span>ClickHouse Distributed APM</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-[#00e599]" />
                        <span>TracePilot AI Auto-Fix PRs</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-[#00e599]" />
                        <span>Public &amp; Private Status Pages</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#00e599]/25 flex items-center justify-between">
                    <span className="text-[11px] text-emerald-300 font-medium">85% Lower TCO</span>
                    <span className="text-sm font-bold text-[#00e599] font-mono">From $99 / mo</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Zero tool sprawl • Single unified telemetry lake
              </span>
              <span className="text-xs text-[#00e599] font-medium">All-Inclusive</span>
            </div>
          </div>

          {/* ════ CARD 4: Go 1M Scale Engine & ClickHouse APM (6 Cols) ════ */}
          <div className="lg:col-span-6 rounded-2xl bg-gradient-to-b from-white/[0.035] to-white/[0.01] border border-white/[0.08] p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden backdrop-blur-xl group hover:border-white/[0.14] transition-all duration-300">
            <div>
              <div className="flex items-center gap-2.5 text-[#00e599] mb-3 select-none">
                <Zap className="w-4 h-4 stroke-[2.2]" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  High-Throughput Performance
                </span>
              </div>

              <h3 className="text-[22px] sm:text-[25px] font-bold text-white tracking-tight leading-snug mb-3">
                Engineered for 1,000,000 checks at sub-millisecond precision.
              </h3>

              <p className="text-[14px] sm:text-[15px] text-zinc-400 leading-relaxed mb-6">
                Written in low-overhead Go with smart TCP keep-alive connection pools that save
                30% wire egress. Raw check metrics stream directly into ClickHouse columnar storage
                with zero row-lock latency.
              </p>

              {/* Telemetry Waterfall Simulation */}
              <div className="rounded-xl bg-black/50 border border-white/[0.08] p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-b border-white/[0.06] pb-2">
                  <span>Distributed Trace Span Waterfall</span>
                  <span className="text-emerald-400">Total Latency: 42ms</span>
                </div>

                {/* Span 1 */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-white font-medium">POST /api/v1/checkout</span>
                    <span className="text-zinc-400 text-[11px]">42ms</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full w-full" />
                  </div>
                </div>

                {/* Span 2 (Child) */}
                <div className="flex flex-col gap-1 pl-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-300">├── auth.verify_token</span>
                    <span className="text-zinc-400 text-[11px]">3.2ms</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full bg-[#00e599]/80 rounded-full w-[12%]" />
                  </div>
                </div>

                {/* Span 3 (Child) */}
                <div className="flex flex-col gap-1 pl-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-300">├── clickhouse.stream_batch</span>
                    <span className="text-zinc-400 text-[11px]">7.8ms</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full bg-cyan-400/80 rounded-full w-[22%] ml-[12%]" />
                  </div>
                </div>

                {/* Span 4 (Child) */}
                <div className="flex flex-col gap-1 pl-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-300">└── stripe.payment_intent.create</span>
                    <span className="text-zinc-400 text-[11px]">28.4ms</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-[64%] ml-[34%]" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                <span className="text-white font-bold">33,333 checks / sec</span> continuous throughput
              </span>
              <span className="text-xs text-[#00e599] font-mono">ClickHouse Cloud Native</span>
            </div>
          </div>
        </div>

        {/* ── Bottom Metric Ribbon & Interactive Call to Action ── */}
        <div className="mt-12 sm:mt-16 rounded-2xl bg-gradient-to-r from-white/[0.03] via-[#00e599]/[0.04] to-white/[0.03] border border-white/[0.08] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 w-full md:w-auto">
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                33k+
              </span>
              <span className="text-xs text-zinc-400 mt-0.5">Checks / Second</span>
            </div>

            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-bold text-[#00e599] font-mono tracking-tight">
                &lt;100ms
              </span>
              <span className="text-xs text-zinc-400 mt-0.5">Dispatch Quorum Latency</span>
            </div>

            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                99.999%
              </span>
              <span className="text-xs text-zinc-400 mt-0.5">Probing Core Uptime</span>
            </div>

            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-bold text-[#00e599] font-mono tracking-tight">
                88%
              </span>
              <span className="text-xs text-zinc-400 mt-0.5">Faster MTTR via AI PRs</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-end">
            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-emerald-400 hover:bg-emerald-300 text-black font-semibold text-sm transition-all duration-200 shadow-[0_0_24px_rgba(52,211,153,0.35)] hover:shadow-[0_0_32px_rgba(52,211,153,0.5)] tracking-tight cursor-pointer"
            >
              <span>Deploy with autonomous protection</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
