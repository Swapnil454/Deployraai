"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Rocket,
  Network,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  ChevronRight,
  Database,
  Shield,
  RefreshCw,
  Search,
  Eye,
  GitBranch,
  X,
  Box,
  Pencil,
  ChevronDown,
  Flame,
  LayoutGrid,
  AlertCircle,
  Clock,
  Zap,
  Server,
  ExternalLink,
  Globe,
  Check,
  ArrowRight,
  Terminal,
  Loader2,
  Cpu,
  Sliders,
  Plus,
  TrendingUp,
  TrendingDown,
  LayoutTemplate,
  HardDrive,
  Square,
  MousePointer2,
  Timer,
  Layout,
  Cloud,
  GitFork,
  BarChart2,
  CircleDot,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// REAL BRAND SVG ICONS (GitHub, Redis, Node.js, Java, React, Next.js, Postgres, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export function GitHubBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function NextJsBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#71717a" strokeWidth="1.5" />
      <path d="M14.8 16.5L8.5 7.8H7v8.7h1.4v-6.9l5.8 8c.2-.2.4-.4.6-.6z" fill="#ffffff" />
      <rect x="14.8" y="7.8" width="1.4" height="6.5" fill="#ffffff" />
    </svg>
  );
}

export function ReactBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="-11.5 -10.23 23 20.46" fill="none">
      <circle cx="0" cy="0" r="2.05" fill="#61DAFB"/>
      <g stroke="#61DAFB" strokeWidth="1" fill="none">
        <ellipse rx="11" ry="4.2"/>
        <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
        <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
      </g>
    </svg>
  );
}

export function NodeJsBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 2l9 5.2v10.4l-9 5.2-9-5.2V7.2L12 2z" stroke="#68A063" strokeWidth="1.8" />
      <path d="M12 6.8c-2.4 0-3.8 1.3-3.8 3.2 0 3.3 4.8 2.1 4.8 3.8 0 .7-.6 1.2-1.5 1.2-1.2 0-2-.4-2.5-1.1l-1.3 1.5c1 1.1 2.3 1.5 3.8 1.5 2.5 0 3.9-1.4 3.9-3.3 0-3.5-4.8-2.2-4.8-3.8 0-.6.5-1 1.3-1 1 0 1.7.3 2.2.8l1.3-1.5C14.7 7.2 13.5 6.8 12 6.8z" fill="#68A063" />
    </svg>
  );
}

export function JavaBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M8.5 18.5c0 0 1.5.5 3.5.5s4-.5 4-.5-1 1-4 1-3.5-1-3.5-1z" fill="#5382A1" />
      <path d="M7 21c0 0 2 .8 5 .8s6-.8 6-.8-1.5 1.5-6 1.5-5-1.5-5-1.5z" fill="#E76F00" />
      <path d="M10.5 15.5c-1.5 0-2.5-.3-2.5-.3s.8-.8 3-.8 3.5.3 3.5.3-1.5.8-4 .8z" fill="#5382A1" />
      <path d="M14 7c0 0 1-1-1-3 0 0 2.5 1 1 3z" fill="#E76F00" />
      <path d="M16.5 9c0 0 2-1.5 0-4.5 0 0 3 1.5 1 4.5 0 0-1 2.5-4 4 0 0 2.5-.5 3-4z" fill="#E76F00" />
      <path d="M6 13.5c0 0 2.5.5 6 .5s5.5-.5 5.5-.5c-1 2-4 3.5-6.5 3.5-3.5 0-5-2-5-3.5z" fill="#5382A1" />
    </svg>
  );
}

export function RedisBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M2.5 7.5L12 3l9.5 4.5-9.5 4.5L2.5 7.5z" stroke="#DC382D" strokeWidth="1.6" fill="#DC382D" fillOpacity="0.2" />
      <path d="M2.5 12l9.5 4.5 9.5-4.5" stroke="#DC382D" strokeWidth="1.6" />
      <path d="M2.5 16.5l9.5 4.5 9.5-4.5" stroke="#DC382D" strokeWidth="1.6" />
    </svg>
  );
}

export function PostgresBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5C7.8 2.5 5 4.8 4.5 8.2c-.3 2.1.5 4 1.5 5.3-.2 1.3-.8 2.8-2 3.8 2.2.3 4.4-.7 5.4-2.3 1.1.4 2.4.5 3.6.4.8 1.4 2.8 2.3 4.7 2-1-.9-1.6-2.3-1.8-3.5 1-1.3 1.7-3.1 1.4-5.2C18.8 4.6 15.6 2.5 12 2.5z" stroke="#336791" strokeWidth="1.6" fill="#336791" fillOpacity="0.2" />
      <circle cx="9" cy="9.5" r="1.2" fill="#336791" />
      <circle cx="15" cy="9.5" r="1.2" fill="#336791" />
    </svg>
  );
}

export function RabbitMQBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M18.5 13.5c-.3 0-.6-.1-.8-.2l-2.4-1.2c-.3-.2-.5-.5-.5-.9V7.5c0-.6.4-1 1-1h1.5c1.4 0 2.5 1.1 2.5 2.5v3.5c0 .6-.6 1-1.3 1zm-9-9c.8 0 1.5.7 1.5 1.5v5.2c0 .4-.2.8-.5.9l-2.4 1.2c-.2.1-.5.2-.8.2-.7 0-1.3-.4-1.3-1V5c0-1.4 1.1-2.5 2.5-2.5h1zm2 9.5c0-.6.4-1 1-1h1.5c1.4 0 2.5 1.1 2.5 2.5v1.5c0 .8-.7 1.5-1.5 1.5h-2.5c-.6 0-1-.4-1-1v-2.5zm-5 1c0-.6.4-1 1-1h1.5c.6 0 1 .4 1 1v2.5c0 .6-.4 1-1 1H7.5c-.8 0-1.5-.7-1.5-1.5v-1c0-1.4 1.1-2.5 2.5-2.5H7.5z" fill="#FF6600"/>
    </svg>
  );
}

export function ClickHouseBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="9" width="2" height="6" rx="0.5" fill="#FFCC00"/>
      <rect x="5.5" y="6" width="2" height="12" rx="0.5" fill="#FFCC00"/>
      <rect x="9" y="3" width="2" height="18" rx="0.5" fill="#FFCC00"/>
      <rect x="12.5" y="6" width="2" height="12" rx="0.5" fill="#FF4438"/>
      <rect x="16" y="8" width="2" height="8" rx="0.5" fill="#FFCC00"/>
      <rect x="19.5" y="10" width="2" height="4" rx="0.5" fill="#FFCC00"/>
    </svg>
  );
}

export function OpenAIAgentBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.28 9.82a5.98 5.98 0 00-.52-4.91 6.05 6.05 0 00-6.51-2.9 6.06 6.06 0 00-4.51-1.12 6.05 6.05 0 00-5.76 4.19 6.04 6.04 0 00-3.66 3.7 6.05 6.05 0 001.08 7.03 5.98 5.98 0 00.52 4.91 6.05 6.05 0 006.51 2.9 6.06 6.06 0 004.51 1.12 6.05 6.05 0 005.76-4.19 6.04 6.04 0 003.66-3.7 6.05 6.05 0 00-1.08-7.03zm-9.02 13.65a4.55 4.55 0 01-2.93-1.07l.15-.09 4.88-2.82c.24-.14.38-.39.38-.66v-6.9l2.07 1.2c.02.01.04.03.04.05v5.75a4.56 4.56 0 01-4.59 4.54zm-8.67-4.18a4.54 4.54 0 01-.63-3.06l.15.09 4.89 2.82c.24.14.53.14.77 0l5.96-3.45v2.39c0 .02-.01.04-.03.06l-4.98 2.87a4.56 4.56 0 01-6.13-1.72zM2.83 8.88a4.55 4.55 0 012.3-1.99v5.82c0 .27.15.52.39.66l5.96 3.45-2.06 1.2c-.02.01-.05.01-.07 0L4.37 15.14a4.56 4.56 0 01-1.54-6.26zm15.42 3.2l-5.97-3.45 2.07-1.2c.02-.01.05-.01.07 0l4.98 2.88a4.55 4.55 0 011.54 6.26 4.55 4.55 0 01-2.3 1.99v-5.82c0-.28-.15-.53-.39-.66zm3.46-3.67l-.15-.09-4.89-2.82a.77.77 0 00-.77 0L9.94 8.94V6.55c0-.02.01-.04.03-.06l4.98-2.87a4.56 4.56 0 016.13 1.72 4.54 4.54 0 01.63 3.07zm-12.04 4.3l2.37-1.37 2.37 1.37v2.73l-2.37 1.37-2.37-1.37v-2.73z" />
    </svg>
  );
}

export function QdrantBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7.5V16.5L12 22L21 16.5V7.5L12 2Z" stroke="#DC2626" strokeWidth="1.8" fill="none"/>
      <circle cx="12" cy="12" r="3.5" fill="#06B6D4"/>
    </svg>
  );
}

export function DocusaurusBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M18.5 7.5C18.5 5 16.5 3 14 3H10C8.5 3 7 4 6.5 5.5L3 14.5c-.3.8.3 1.5 1.1 1.5H8v4c0 1.1.9 2 2 2h3c1.1 0 2-.9 2-2v-4h3.5c.8 0 1.4-.7 1.1-1.5l-1.1-6.5z" fill="#3ECC5F"/>
      <circle cx="11" cy="7" r="1.5" fill="#1B1B1D"/>
    </svg>
  );
}

export function EnvoyBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="#F43F5E" strokeWidth="1.6" fill="#F43F5E" fillOpacity="0.15"/>
      <path d="M12 22V12M12 12L2 7M12 12L22 7" stroke="#F43F5E" strokeWidth="1.5"/>
    </svg>
  );
}

export function StripeBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M15.5 8.5c0-1.5-1.2-2.3-3.2-2.3-2 0-3.9.7-5.2 1.6l-.8-2.8c1.7-1 4.1-1.6 6.6-1.6 4.3 0 7 2.2 7 5.8 0 5.6-7.8 4.7-7.8 7.1 0 .8.8 1.4 2.1 1.4 2.1 0 4.3-.9 5.8-2l.9 2.8c-1.9 1.2-4.5 1.9-7 1.9-4.5 0-7.3-2.3-7.3-5.9 0-6.1 7.9-5 7.9-7.5z" fill="#635BFF"/>
    </svg>
  );
}

export function OpenSearchBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M10.5 3C6.36 3 3 6.36 3 10.5S6.36 18 10.5 18c1.76 0 3.39-.61 4.67-1.63l4.7 4.7a1.2 1.2 0 101.7-1.7l-4.7-4.7A7.46 7.46 0 0018 10.5C18 6.36 14.64 3 10.5 3zm0 2.4a5.1 5.1 0 110 10.2 5.1 5.1 0 010-10.2z" fill="#005EB8"/>
    </svg>
  );
}

export function StorageS3BrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="#E11D48" strokeWidth="1.8" fill="none"/>
      <path d="M12 6L6 9.5V14.5L12 18L18 14.5V9.5L12 6Z" stroke="#E11D48" strokeWidth="1.4" fill="none"/>
    </svg>
  );
}

type StageKey = "deploy" | "network" | "scale" | "monitor" | "evolve";

interface StageInfo {
  id: StageKey;
  label: string;
  icon: React.ElementType;
}

const STAGES: StageInfo[] = [
  { id: "deploy", label: "Deploy", icon: Cloud },
  { id: "network", label: "Network", icon: GitFork },
  { id: "scale", label: "Scale", icon: BarChart2 },
  { id: "monitor", label: "Monitor", icon: CircleDot },
  { id: "evolve", label: "Evolve", icon: Rocket },
];

export interface WorkflowStepEvent {
  id: string;
  stepName: string;
  label: string;
  status: "completed" | "sleeping" | "failed" | "failed_retrying" | "running";
  executedAt: string;
  duration: string;
  attempts?: number;
  retryReason?: string;
  payload?: any;
}

const LIVE_DEPLOYMENT_WORKFLOW_STEPS: WorkflowStepEvent[] = [
  {
    id: "step-1",
    stepName: "git-clone-and-ast-verify",
    label: "Git Clone & AST",
    status: "completed",
    executedAt: "11:46:30 AM",
    duration: "340ms",
    attempts: 1,
    payload: { commit: "23rr2v9", branch: "main", cleanWorkingTree: true },
  },
  {
    id: "step-2",
    stepName: "turbopack-bundle-compile",
    label: "Turbopack Compile",
    status: "completed",
    executedAt: "11:46:31 AM",
    duration: "1,180ms",
    attempts: 1,
    payload: { modules: 17, transformed: "100%", gzipSize: "38.4 kB" },
  },
  {
    id: "step-3",
    stepName: "canary-synthetic-healthcheck",
    label: "Canary Route Probe",
    status: "failed_retrying", // ORANGE / AMBER pipe!
    executedAt: "11:46:33 AM",
    duration: "410ms",
    attempts: 2,
    retryReason: "Socket timeout on /healthz (auto-recovered on retry #2)",
    payload: { target: "canary.railway.app", statusCode: 200, retried: true },
  },
  {
    id: "step-4",
    stepName: "kaniko-layer-bake",
    label: "Container Image Bake",
    status: "completed",
    executedAt: "11:46:34 AM",
    duration: "820ms",
    attempts: 1,
    payload: { digest: "sha256:7fa1e4", cacheHit: "94.2%" },
  },
  {
    id: "step-5",
    stepName: "zero-downtime-rollout",
    label: "Zero-Downtime Rollout",
    status: "running", // BLUE pulsing pipe!
    executedAt: "11:46:35 AM",
    duration: "Live",
    attempts: 1,
    payload: { ingressTraffic: "100%", activeReplicas: 2 },
  },
];

const getWorkflowPathColor = (status: string, stepName?: string) => {
  const n = (stepName || "").toLowerCase();
  if (status === "completed" && (n.includes("fail") || n.includes("error"))) return "#ef4444";
  if (status === "completed") return "#22c55e";
  if (status === "sleeping") return "#6366f1";
  if (status === "failed") return "#ef4444";
  if (status === "failed_retrying") return "#f59e0b"; // Orange/Amber for retry
  if (status === "cancelled") return "#52525b";
  return "#3b82f6"; // Blue for running
};

const getWorkflowStepIcon = (name: string, status: string) => {
  const n = (name || "").toLowerCase();
  if (status === "failed") return <AlertCircle className="w-5 h-5 text-red-400 drop-shadow-md" />;
  if (status === "failed_retrying") return <AlertTriangle className="w-5 h-5 text-amber-300 drop-shadow-md" />;
  if (n.includes("git") || n.includes("clone")) return <GitBranch className="w-5 h-5 text-zinc-200 drop-shadow-md" />;
  if (n.includes("compile") || n.includes("turbopack")) return <Zap className="w-5 h-5 text-emerald-300 drop-shadow-md" />;
  if (n.includes("bake") || n.includes("image") || n.includes("container")) return <Box className="w-5 h-5 text-zinc-200 drop-shadow-md" />;
  if (n.includes("rollout") || n.includes("deploy")) return <Rocket className="w-5 h-5 text-blue-300 drop-shadow-md" />;
  if (n.includes("canary") || n.includes("health")) return <Activity className="w-5 h-5 text-amber-300 drop-shadow-md" />;
  return <Activity className="w-5 h-5 text-zinc-300 drop-shadow-md" />;
};

interface FlameFrame {
  id: string;
  name: string;
  pct: number;
  widthPct: number;
  leftPct: number;
  level: number;
  color: string;
  timeStr: string;
}

const PROFILING_FLAME_FRAMES: FlameFrame[] = [
  { id: "root", name: "system.process", pct: 100, widthPct: 100, leftPct: 0, level: 0, color: "bg-amber-900/60 text-amber-200 border-amber-700/40", timeStr: "2.40s" },
  { id: "serve", name: "net/http.(*conn).serve", pct: 82.4, widthPct: 82.4, leftPct: 0, level: 1, color: "bg-orange-800/70 text-orange-200 border-orange-600/40", timeStr: "1.98s" },
  { id: "gc", name: "runtime.gcBgMarkWorker", pct: 17.6, widthPct: 17.6, leftPct: 82.4, level: 1, color: "bg-red-900/60 text-red-300 border-red-700/40", timeStr: "0.42s" },
  { id: "gin", name: "gin.Engine.handleHTTPRequest", pct: 76.8, widthPct: 76.8, leftPct: 0, level: 2, color: "bg-amber-700/70 text-amber-100 border-amber-500/40", timeStr: "1.84s" },
  { id: "tls", name: "crypto/tls.serverHandshake", pct: 5.6, widthPct: 5.6, leftPct: 76.8, level: 2, color: "bg-yellow-800/60 text-yellow-200 border-yellow-600/40", timeStr: "0.14s" },
  { id: "ingest", name: "api.IngestTelemetryHandler", pct: 54.2, widthPct: 54.2, leftPct: 0, level: 3, color: "bg-rose-700/80 text-rose-100 border-rose-500/40", timeStr: "1.30s" },
  { id: "auth", name: "auth.VerifyTokenAST", pct: 14.2, widthPct: 14.2, leftPct: 54.2, level: 3, color: "bg-amber-800/70 text-amber-200 border-amber-600/40", timeStr: "0.34s" },
  { id: "log", name: "middleware.Logger", pct: 8.4, widthPct: 8.4, leftPct: 68.4, level: 3, color: "bg-orange-900/60 text-orange-200 border-orange-700/40", timeStr: "0.20s" },
  { id: "clickhouse", name: "clickhouse.BatchInsert", pct: 36.4, widthPct: 36.4, leftPct: 0, level: 4, color: "bg-red-700/90 text-white border-red-500/60 font-semibold", timeStr: "0.87s" },
  { id: "unmarshal", name: "json.UnmarshalPayload", pct: 17.8, widthPct: 17.8, leftPct: 36.4, level: 4, color: "bg-rose-800/70 text-rose-200 border-rose-600/40", timeStr: "0.43s" },
  { id: "lz4", name: "compress/lz4.CompressBlock", pct: 24.1, widthPct: 24.1, leftPct: 0, level: 5, color: "bg-red-600 text-white border-red-400 font-bold", timeStr: "0.58s" },
  { id: "write", name: "net.(*netFD).write", pct: 12.3, widthPct: 12.3, leftPct: 24.1, level: 5, color: "bg-orange-700/80 text-orange-100 border-orange-500/40", timeStr: "0.29s" },
  { id: "malloc", name: "runtime.mallocgc", pct: 14.2, widthPct: 14.2, leftPct: 36.4, level: 5, color: "bg-rose-600 text-white border-rose-400 font-bold", timeStr: "0.34s" },
  { id: "str", name: "runtime.slicebytetostring", pct: 3.6, widthPct: 3.6, leftPct: 50.6, level: 5, color: "bg-amber-900/70 text-amber-200 border-amber-700/40", timeStr: "0.09s" },
];

export default function InteractiveDeployCanvasSection() {
  const [activeStage, setActiveStage] = useState<StageKey>("deploy");
  const shellRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(960);
  const [manualZoom, setManualZoom] = useState<number>(1);

  // Measure dynamic container width for pixel-perfect responsive square monitor scaling
  useEffect(() => {
    if (!shellRef.current) return;
    const updateWidth = () => {
      if (shellRef.current) {
        setContainerWidth(shellRef.current.clientWidth);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(shellRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Animated Simulated Cursor & Click Ripple System ───────────────────────
  const [cursorPos, setCursorPos] = useState<{ x: string; y: string; opacity: number }>({ x: "50%", y: "50%", opacity: 0 });
  const [isClicking, setIsClicking] = useState<boolean>(false);

  // ── Stage 1: Deploy states (Full-Platform Authentic 10s Showcase)
  const [deployStep, setDeployStep] = useState<
    | "select-repo"
    | "stack-detected"
    | "initial-logs"
    | "initial-success"
    | "env-exchange"
    | "sync-logs"
    | "final-success"
  >("select-repo");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [envSyncStep, setEnvSyncStep] = useState<number>(0);
  const [pipelineCompleted, setPipelineCompleted] = useState<boolean>(false);
  const [terminalLogs, setTerminalLogs] = useState<number>(0);
  const [syncTerminalLogs, setSyncTerminalLogs] = useState<number>(0);
  const [deployToast, setDeployToast] = useState<{
    show: boolean;
    title: string;
    subtitle: string;
  }>({
    show: false,
    title: "",
    subtitle: "",
  });
  const setShowDeployToast = (show: boolean) => setDeployToast((prev) => ({ ...prev, show }));
  const [selectedWorkflowStep, setSelectedWorkflowStep] = useState<WorkflowStepEvent | null>(null);

  // ── Stage 2: Network states
  const [networkStep, setNetworkStep] = useState<"create-menu" | "unapplied" | "applied">("create-menu");
  const [networkGrowthStep, setNetworkGrowthStep] = useState<number>(0);
  const [networkTreeGrown, setNetworkTreeGrown] = useState<boolean>(false);
  const [hoveredNetworkNode, setHoveredNetworkNode] = useState<string | null>(null);

  // ── Stage 3: Scale states (Deep Multi-Pod & DB Autoscaling)
  type ScaleStep = "surge-alert" | "configure-scaling" | "provisioning-mesh" | "stabilized-success";
  const [scaleStep, setScaleStep] = useState<ScaleStep>("surge-alert");
  const [scaleCpuTier, setScaleCpuTier] = useState<string>("8 vCPU");
  const [scaleReplicas, setScaleReplicas] = useState<number>(3);
  const [scaleDbReplicaAdded, setScaleDbReplicaAdded] = useState<boolean>(true);
  const [scaleToast, setScaleToast] = useState<{ show: boolean; title: string; subtitle: string }>({
    show: false,
    title: "",
    subtitle: "",
  });

  // ── Stage 4: Monitor states (Authentic Multi-Warning & Add Redis Sequence)
  type MonitorSubStep =
    | "initial-normal"
    | "warning-1"
    | "warning-2"
    | "observability-view"
    | "create-menu"
    | "search-typing"
    | "redis-deployed"
    | "all-stabilized";

  const [activeHeaderTab, setActiveHeaderTab] = useState<"Architecture" | "Workflows" | "Observability">("Architecture");
  const [monitorStep, setMonitorStep] = useState<MonitorSubStep>("initial-normal");
  const [searchQueryText, setSearchQueryText] = useState<string>("");
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [showNormalToast, setShowNormalToast] = useState<boolean>(false);
  const [dismissedWarn1, setDismissedWarn1] = useState<boolean>(false);
  const [dismissedWarn2, setDismissedWarn2] = useState<boolean>(false);
  const [hoveredFlameFrame, setHoveredFlameFrame] = useState<FlameFrame | null>(null);

  // ── Stage 5: Evolve Progressive Architecture (3 -> 8 -> 12 -> 16 -> 18 Nodes)
  type EvolveStep = "3-nodes" | "8-nodes" | "12-nodes" | "16-nodes" | "18-nodes";
  const [evolveZoomStep, setEvolveZoomStep] = useState<EvolveStep>("3-nodes");
  const [evolveMountedStep, setEvolveMountedStep] = useState<EvolveStep>("3-nodes");
  const [evolveTreeGrown, setEvolveTreeGrown] = useState<boolean>(false);

  // Dynamic Duration per stage: Transitions to next stage after all visual actions complete with generous viewing delay (1x video pace)
  const getStageDuration = (stage: StageKey) => {
    if (stage === "deploy") return 16000; // Visuals finish at 12000ms -> +4000ms delay = 16000ms
    if (stage === "network") return 11200; // Visuals finish at 7200ms -> +4000ms delay = 11200ms
    if (stage === "scale") return 9800;  // Visuals finish at 5800ms -> +4000ms delay = 9800ms
    if (stage === "monitor") return 14200; // Visuals finish at 10200ms -> +4000ms delay = 14200ms
    if (stage === "evolve") return 11400;  // Visuals finish at 7200ms -> +4200ms delay = 11400ms
    return 10000;
  };

  // ── Auto Progression Infinite Loop: Deploy -> Network -> Scale -> Monitor -> Evolve -> Deploy (Continuous Infinite Sequence)
  useEffect(() => {
    const stageDuration = getStageDuration(activeStage);
    const timer = setTimeout(() => {
      setActiveStage((curr) => {
        const idx = STAGES.findIndex((s) => s.id === curr);
        const nextIdx = (idx + 1) % STAGES.length;
        return STAGES[nextIdx].id;
      });
    }, stageDuration);

    return () => clearTimeout(timer);
  }, [activeStage]);

  // Helper to trigger simulated click with ripple
  const triggerClickAt = (x: string, y: string, callback?: () => void) => {
    setCursorPos({ x, y, opacity: 1 });
    const tClick = setTimeout(() => {
      setIsClicking(true);
      if (callback) callback();
      const tRelease = setTimeout(() => setIsClicking(false), 180);
      return () => clearTimeout(tRelease);
    }, 320);
    return tClick;
  };

  // ── Stage Micro-Timeline Sequence Handler (Snappy Flow: visual completion -> 700ms -> next stage)
  useEffect(() => {
    setIsClicking(false);

    // ── STAGE 1: DEPLOY (Paced at natural 1x video flow - Visuals complete at 12.0s -> 4.0s pause to Network)
    if (activeStage === "deploy") {
      setActiveHeaderTab("Architecture");
      setDeployStep("select-repo");
      setIsAnalyzing(false);
      setEnvSyncStep(0);
      setPipelineCompleted(false);
      setTerminalLogs(0);
      setSyncTerminalLogs(0);
      setDeployToast({ show: false, title: "", subtitle: "" });
      setNetworkTreeGrown(false);
      setEvolveTreeGrown(false);
      setSelectedWorkflowStep(null);

      // 0.3s: Virtual cursor appears and hovers over repository card
      const t0 = setTimeout(() => {
        setCursorPos({ x: "65%", y: "73%", opacity: 1 });
      }, 300);

      // 0.8s: Click "Analyze Project" button (Step 1 -> Analyzing)
      const t1 = setTimeout(() => {
        triggerClickAt("78%", "74%", () => {
          setIsAnalyzing(true);
        });
      }, 800);

      // 1.6s: Architecture detected! Show Monorepo, Next.js, Go Gin, Target platforms (Step 2)
      const t2 = setTimeout(() => {
        setIsAnalyzing(false);
        setDeployStep("stack-detected");
        setCursorPos({ x: "72%", y: "84%", opacity: 1 });
      }, 1600);

      // 2.8s: Click "Deploy Full Stack" button -> triggers Initial Deployment #1
      const t3 = setTimeout(() => {
        triggerClickAt("84%", "84%", () => {
          setDeployStep("initial-logs");
          setTerminalLogs(1);
        });
      }, 2800);

      // 3.2s – 4.8s: Initial Deployment incoming logs stream line-by-line (Step 3)
      const t6 = setTimeout(() => setTerminalLogs(2), 3200);
      const t7 = setTimeout(() => setTerminalLogs(3), 3600);
      const t8 = setTimeout(() => setTerminalLogs(4), 4000);
      const t9 = setTimeout(() => setTerminalLogs(5), 4400);
      const t10 = setTimeout(() => setTerminalLogs(6), 4800);

      // 5.4s: Initial Provisioning Complete! Show Initial Deployment Completed Successfully Frame + Toast #1
      const tInitialSuccess = setTimeout(() => {
        setDeployStep("initial-success");
        setDeployToast({
          show: true,
          title: "Deployment Successful & Exchanging Envs",
          subtitle: "Services provisioned · Starting cross-service handshake...",
        });
        setCursorPos({ x: "70%", y: "65%", opacity: 1 });
      }, 5400);

      // 7.0s: Shift from Initial Success to Environment Exchanging Frame!
      const tEnvStart = setTimeout(() => {
        setDeployStep("env-exchange");
        setDeployToast((prev) => ({ ...prev, show: false }));
        setEnvSyncStep(1);
      }, 7000);

      // 7.5s – 8.5s: Live conduits actively flowing variables
      const tEnv1 = setTimeout(() => setEnvSyncStep(2), 7500);
      const tEnv2 = setTimeout(() => setEnvSyncStep(3), 8000);
      const tEnv3 = setTimeout(() => setEnvSyncStep(4), 8500);

      // 9.1s: Cursor glides toward "Trigger Sync Rollout"
      const t4 = setTimeout(() => {
        setCursorPos({ x: "74%", y: "78%", opacity: 1 });
      }, 9100);

      // 9.7s: Click "Trigger Sync Rollout" button -> Shifts to Mock Log Frame
      const t5 = setTimeout(() => {
        triggerClickAt("84%", "78%", () => {
          setDeployStep("sync-logs");
          setSyncTerminalLogs(1);
          setCursorPos({ x: "50%", y: "65%", opacity: 0 });
        });
      }, 9700);

      // 10.1s – 11.3s: Mock Log streams lines
      const tSync1 = setTimeout(() => setSyncTerminalLogs(2), 10100);
      const tSync2 = setTimeout(() => setSyncTerminalLogs(3), 10500);
      const tSync3 = setTimeout(() => setSyncTerminalLogs(4), 10900);
      const tSync4 = setTimeout(() => setSyncTerminalLogs(5), 11300);

      // 12.0s: Final Deployment Completed Successfully Frame + Toast #2! (Visual completion)
      const tFinalSuccess = setTimeout(() => {
        setDeployStep("final-success");
        setDeployToast({
          show: true,
          title: "Production Deployment Live!",
          subtitle: "All full-stack environments synced & running healthy",
        });
      }, 12000);

      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t6);
        clearTimeout(t7);
        clearTimeout(t8);
        clearTimeout(t9);
        clearTimeout(t10);
        clearTimeout(tInitialSuccess);
        clearTimeout(tEnvStart);
        clearTimeout(tEnv1);
        clearTimeout(tEnv2);
        clearTimeout(tEnv3);
        clearTimeout(t4);
        clearTimeout(t5);
        clearTimeout(tSync1);
        clearTimeout(tSync2);
        clearTimeout(tSync3);
        clearTimeout(tSync4);
        clearTimeout(tFinalSuccess);
      };
    }

    // ── STAGE 2: NETWORK (Paced at natural 1x video flow - Visuals complete at 7.2s -> 4.0s pause to Scale)
    if (activeStage === "network") {
      setActiveHeaderTab("Architecture");
      setNetworkStep("create-menu");
      setNetworkGrowthStep(0);
      setShowDeployToast(false);
      setNetworkTreeGrown(false);
      setHoveredNetworkNode(null);

      // 0.6s: Cursor glides to "Database & Mesh Conduits" in catalog menu & clicks
      const t1 = setTimeout(() => {
        triggerClickAt("50%", "52%", () => {
          setNetworkStep("unapplied");
          // Phase 1: Origin Seed (edge-gateway) blooms into existence
          setNetworkGrowthStep(1);
        });
      }, 600);

      // 1.6s: Phase 2: Conduits 1 & 3 sprout outward; Frontend & Admin bloom in
      const t2 = setTimeout(() => {
        setNetworkGrowthStep(2);
      }, 1600);

      // 2.4s: Phase 3: Conduits 4 & 5 converge; Core Backend blooms in
      const t3 = setTimeout(() => {
        setNetworkGrowthStep(3);
      }, 2400);

      // 3.2s: Phase 4: Pending cables sprout forward; Redis & Postgres bloom with unapplied diff
      const t4 = setTimeout(() => {
        setNetworkGrowthStep(4);
        setNetworkTreeGrown(true);
      }, 3200);

      // 4.2s: Cursor glides up to "Deploy (1)" button in header
      const t5 = setTimeout(() => {
        setCursorPos({ x: "77%", y: "22px", opacity: 1 });
      }, 4200);

      // 4.7s: Cursor clicks "Deploy (1)" in header -> Mesh Deployed & Conduits Solidify into mTLS!
      const t6 = setTimeout(() => {
        triggerClickAt("77%", "22px", () => {
          setNetworkStep("applied");
          setNetworkGrowthStep(5);
        });
      }, 4700);

      // 5.7s: Cursor glides down to inspect "neon-postgres" node
      const t7 = setTimeout(() => {
        setCursorPos({ x: "70%", y: "76%", opacity: 1 });
        setHoveredNetworkNode("neon-postgres");
      }, 5700);

      // 7.2s: Cursor hides inspector before transitioning (Visual completion)
      const t8 = setTimeout(() => {
        setHoveredNetworkNode(null);
        setCursorPos((prev) => ({ ...prev, opacity: 0 }));
      }, 7200);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
        clearTimeout(t6);
        clearTimeout(t7);
        clearTimeout(t8);
      };
    }

    // ── STAGE 3: SCALE (Paced at natural 1x video flow - Visuals complete at 5.8s -> 4.0s pause to Monitor)
    if (activeStage === "scale") {
      setActiveHeaderTab("Architecture");
      setScaleStep("surge-alert");
      setScaleCpuTier("4 vCPU");
      setScaleReplicas(1);
      setScaleDbReplicaAdded(false);
      setScaleToast({ show: false, title: "", subtitle: "" });
      setShowDeployToast(false);

      // 0.6s: Virtual cursor appears and moves towards "Configure Sizing & Scale Out"
      const t1 = setTimeout(() => {
        setCursorPos({ x: "82%", y: "42%", opacity: 1 });
      }, 600);

      // 1.4s: Cursor clicks "Configure Sizing & Scale Out" -> Opens Deep Sizing Console
      const t2 = setTimeout(() => {
        triggerClickAt("82%", "42%", () => {
          setScaleStep("configure-scaling");
        });
      }, 1400);

      // 2.3s: Cursor selects "8 vCPU / 16GB Dedicated" power tier
      const t3 = setTimeout(() => {
        triggerClickAt("30%", "62%", () => {
          setScaleCpuTier("8 vCPU");
        });
      }, 2300);

      // 3.2s: Cursor confirms 3 Pods & DB Read Replica
      const t4 = setTimeout(() => {
        triggerClickAt("50%", "62%", () => {
          setScaleReplicas(3);
          setScaleDbReplicaAdded(true);
        });
      }, 3200);

      // 4.2s: Cursor clicks "Apply Sizing & Scale Out (Zero Downtime)"
      const t5 = setTimeout(() => {
        triggerClickAt("82%", "82%", () => {
          setScaleStep("provisioning-mesh");
        });
      }, 4200);

      // 5.8s: Cluster rolls out successfully -> Stabilized state with live healthy metrics! (Visual completion)
      const t6 = setTimeout(() => {
        setScaleStep("stabilized-success");
        setScaleToast({
          show: true,
          title: "Cluster Auto-Scaled & Replicas Online",
          subtitle: "Backend scaled to 3 pods (8 vCPU) · Read replica active · Latency restored to 11ms",
        });
        setCursorPos((prev) => ({ ...prev, opacity: 0 }));
      }, 5800);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
        clearTimeout(t6);
      };
    }

    // ── STAGE 4: MONITOR (Paced at natural 1x video flow - Visuals complete at 10.2s -> 4.0s pause to Evolve)
    if (activeStage === "monitor") {
      setActiveHeaderTab("Architecture");
      setMonitorStep("initial-normal");
      setSearchQueryText("");
      setShowCommandPalette(false);
      setShowNormalToast(false);
      setShowDeployToast(false);
      setDismissedWarn1(false);
      setDismissedWarn2(false);
      setCursorPos({ x: "50%", y: "50%", opacity: 0 });

      // 0.6s: Top right Warning 1 arrives ("High Memory Usage! backend's CPU resource limit reached")
      const tWarn1 = setTimeout(() => {
        setMonitorStep("warning-1");
      }, 600);

      // 1.6s: Top right Warning 2 arrives ("Resource Limit Reached! backend's surpassed memory limit by 23%")
      const tWarn2 = setTimeout(() => {
        setMonitorStep("warning-2");
      }, 1600);

      // 2.4s: Simulated cursor moves to "Observability" tab in header
      const tMoveObs = setTimeout(() => {
        setCursorPos({ x: "78%", y: "22px", opacity: 1 });
      }, 2400);

      // 2.9s: Cursor clicks "Observability" tab -> reveals Real Infrastructure CPU & Memory graphs!
      const tClickObs = setTimeout(() => {
        triggerClickAt("78%", "22px", () => {
          setActiveHeaderTab("Observability");
          setMonitorStep("observability-view");
        });
      }, 2900);

      // 5.2s: Cursor moves back to "Architecture" tab (gives 2.3s to appreciate live graphs)
      const tMoveArch = setTimeout(() => {
        setCursorPos({ x: "69%", y: "22px", opacity: 1 });
      }, 5200);

      // 5.7s: Cursor clicks "Architecture" tab -> switches back, Create Menu appears
      const tClickArch = setTimeout(() => {
        triggerClickAt("69%", "22px", () => {
          setActiveHeaderTab("Architecture");
          setMonitorStep("create-menu");
          setSearchQueryText("");
        });
      }, 5700);

      // 6.4s: Cursor glides towards the Create menu search field
      const tMoveSearch = setTimeout(() => {
        setCursorPos({ x: "47%", y: "44%", opacity: 1 });
      }, 6400);

      // 6.8s – 7.7s: Typing animation in Search Palette: "r" -> "re" -> "red" -> "redis"
      const tType1 = setTimeout(() => {
        setMonitorStep("search-typing");
        setSearchQueryText("r");
      }, 6800);
      const tType2 = setTimeout(() => setSearchQueryText("re"), 7100);
      const tType3 = setTimeout(() => setSearchQueryText("red"), 7400);
      const tType4 = setTimeout(() => setSearchQueryText("redis"), 7700);

      // 8.2s: Cursor moves to "Add Redis" option in recommendation list
      const tMoveAdd = setTimeout(() => {
        setCursorPos({ x: "49%", y: "52%", opacity: 1 });
      }, 8200);

      // 8.6s: Cursor clicks "Add Redis" -> shows configured feedback!
      const tClickAdd = setTimeout(() => {
        triggerClickAt("49%", "52%", () => {
          // brief click on Add Redis
        });
      }, 8600);

      // 9.1s: Redis node blooms into existence next to backend ("Just deployed", "redis-volume")
      const tRedisDeployed = setTimeout(() => {
        setMonitorStep("redis-deployed");
        setCursorPos((prev) => ({ ...prev, opacity: 0 }));
      }, 9100);

      // 10.2s: FINAL FRAME:
      // - Warning 1 slides off-screen with slide effect
      // - Observability badge disappears
      // - Green Toast slides in at top right: "✓ backend - CPU usage back to normal"
      // - Backend node returns to healthy dark state with replica card layers underneath! (Visual completion)
      const tStabilized = setTimeout(() => {
        setMonitorStep("all-stabilized");
        setShowNormalToast(true);
      }, 10200);

      return () => {
        clearTimeout(tWarn1);
        clearTimeout(tWarn2);
        clearTimeout(tMoveObs);
        clearTimeout(tClickObs);
        clearTimeout(tMoveArch);
        clearTimeout(tClickArch);
        clearTimeout(tMoveSearch);
        clearTimeout(tType1);
        clearTimeout(tType2);
        clearTimeout(tType3);
        clearTimeout(tType4);
        clearTimeout(tMoveAdd);
        clearTimeout(tClickAdd);
        clearTimeout(tRedisDeployed);
        clearTimeout(tStabilized);
      };
    }

    // ── STAGE 5: EVOLVE (Paced at natural 1x video flow - Visuals complete at 7.2s -> 4.2s pause to Deploy)
    if (activeStage === "evolve") {
      setActiveHeaderTab("Architecture");
      setShowDeployToast(false);
      setEvolveTreeGrown(false);
      setEvolveZoomStep("3-nodes");
      setEvolveMountedStep("3-nodes");
      setCursorPos((prev) => ({ ...prev, opacity: 0 }));

      // 0.0s – 1.0s: Initial 3 nodes at standard scale (backend, redis, postgres)
      // 1.0s: Camera begins smooth zoom-out to 8-nodes scale
      const tZoom1 = setTimeout(() => {
        setEvolveZoomStep("8-nodes");
      }, 1000);
      // 1.5s: 8-nodes mount as view expands
      const tMount1 = setTimeout(() => {
        setEvolveMountedStep("8-nodes");
        setEvolveTreeGrown(true);
      }, 1500);

      // 2.9s: Camera begins zoom-out to 12-nodes scale
      const tZoom2 = setTimeout(() => {
        setEvolveZoomStep("12-nodes");
      }, 2900);
      // 3.4s: 12-nodes mount into view
      const tMount2 = setTimeout(() => {
        setEvolveMountedStep("12-nodes");
      }, 3400);

      // 4.8s: Camera begins zoom-out to 16-nodes scale
      const tZoom3 = setTimeout(() => {
        setEvolveZoomStep("16-nodes");
      }, 4800);
      // 5.3s: 16-nodes mount into view
      const tMount3 = setTimeout(() => {
        setEvolveMountedStep("16-nodes");
      }, 5300);

      // 6.7s: Camera begins zoom-out to 18-nodes scale
      const tZoom4 = setTimeout(() => {
        setEvolveZoomStep("18-nodes");
      }, 6700);
      // 7.2s: Final enterprise nodes mount into view (Visual completion)
      const tMount4 = setTimeout(() => {
        setEvolveMountedStep("18-nodes");
      }, 7200);

      return () => {
        clearTimeout(tZoom1);
        clearTimeout(tMount1);
        clearTimeout(tZoom2);
        clearTimeout(tMount2);
        clearTimeout(tZoom3);
        clearTimeout(tMount3);
        clearTimeout(tZoom4);
        clearTimeout(tMount4);
      };
    }
  }, [activeStage]);

  // Dynamic scale calculation for Evolve fleet based on rectangular container width and zoom step
  const getEvolveScale = (step: EvolveStep) => {
    const baseScaleMap: Record<EvolveStep, number> = {
      "3-nodes": 1.0,
      "8-nodes": 0.95,
      "12-nodes": 0.86,
      "16-nodes": 0.78,
      "18-nodes": 0.72,
    };
    const base = baseScaleMap[step] || 0.72;
    // Container reference is 930px (desktop rectangular viewport)
    const factor = Math.min(1, Math.max(0.35, (containerWidth - 28) / 930));
    return Number((base * factor * manualZoom).toFixed(3));
  };

  // Smooth cinematic camera viewport styling (responsive scale across all devices)
  const cameraTransform =
    activeStage === "deploy"
      ? "none"
      : activeStage === "network"
      ? "none"
      : activeStage === "scale"
      ? "none"
      : activeStage === "monitor"
      ? "none"
      : activeStage === "evolve"
      ? `scale(${getEvolveScale(evolveZoomStep)}) translate3d(0px, 0px, 0px)`
      : "none";

  const initialLogs = [
    { time: "14:10:12", tag: "info", text: "Initializing Full-Stack Deployment #1 (Vercel + Render)..." },
    { time: "14:10:13", tag: "info", text: "[frontend] Turbopack compiling /client Next.js 16 App Router (17 dynamic modules)" },
    { time: "14:10:14", tag: "pass", text: "[frontend] ✓ Compiled static AST bundle in 1,180ms (gzip: 38.4 kB)" },
    { time: "14:10:15", tag: "info", text: "[backend] Kaniko engine baking Go microservice layer (sha256:7fa1e4, cache 94.2%)" },
    { time: "14:10:16", tag: "pass", text: "[provisioner] Ingress routes allocated: deployra-core.vercel.app & api.deployra-core.onrender.com" },
    { time: "14:10:17", tag: "pass", text: "[orchestrator] Initial deployment active · Endpoints allocated successfully ✓" },
  ];

  const syncLogs = [
    { time: "14:10:19", tag: "info", text: "[env-sync] Injecting NEXT_PUBLIC_API_URL -> deployra-core.vercel.app" },
    { time: "14:10:20", tag: "info", text: "[env-sync] Binding CORS_ALLOWED_ORIGIN -> api.deployra-core.onrender.com" },
    { time: "14:10:21", tag: "pass", text: "[secrets] Sealed DATABASE_URL (Neon PostgreSQL) & INTERNAL_JWT_SECRET" },
    { time: "14:10:22", tag: "pass", text: "[canary] Synthetic healthcheck GET /api/v1/health -> 200 OK (14ms)" },
    { time: "14:10:23", tag: "pass", text: "[rollout] Zero-downtime swap verified · Production traffic live on 100% interconnected pods ✓" },
  ];

  const platformIncomingLogs = initialLogs;

  const getLiveWorkflowSteps = (isComplete: boolean): WorkflowStepEvent[] => [
    {
      id: "step-1",
      stepName: "git-clone-and-ast-verify",
      label: "Git Clone & AST",
      status: "completed",
      executedAt: "14:10:12",
      duration: "340ms",
      attempts: 1,
      payload: { commit: "23rr2v9", branch: "main", cleanWorkingTree: true },
    },
    {
      id: "step-2",
      stepName: "turbopack-bundle-compile",
      label: "Turbopack Compile",
      status: "completed",
      executedAt: "14:10:13",
      duration: "1,180ms",
      attempts: 1,
      payload: { modules: 17, transformed: "100%", gzipSize: "38.4 kB" },
    },
    {
      id: "step-3",
      stepName: "canary-synthetic-healthcheck",
      label: "Canary Route Probe",
      status: "failed_retrying", // ORANGE / AMBER pipe with auto-recovered retry!
      executedAt: "14:10:14",
      duration: "410ms",
      attempts: 2,
      retryReason: "Socket timeout on /healthz (auto-recovered on retry #2)",
      payload: { target: "api.deployra-core.onrender.com", statusCode: 200, retried: true },
    },
    {
      id: "step-4",
      stepName: "kaniko-layer-bake",
      label: "Container Image Bake",
      status: "completed",
      executedAt: "14:10:15",
      duration: "820ms",
      attempts: 1,
      payload: { digest: "sha256:7fa1e4", cacheHit: "94.2%" },
    },
    {
      id: "step-5",
      stepName: "zero-downtime-rollout",
      label: "Full Stack Rollout",
      status: isComplete ? "completed" : "running", // Turns emerald green when pipeline is OK!
      executedAt: "14:10:16",
      duration: isComplete ? "380ms" : "Live",
      attempts: 1,
      payload: { ingressTraffic: "100%", activeReplicas: 2 },
    },
  ];

  const renderInfographicSnakePipeline = (events: WorkflowStepEvent[], compact: boolean = false) => {
    const stepWidth = compact ? 124 : 145;
    const containerWidth = events.length * stepWidth;
    const height = compact ? 210 : 240;

    return (
      <div className="relative overflow-visible my-1 shrink-0 select-none" style={{ width: containerWidth, height }}>
        {/* ── 3D Snake Pipe SVG ── */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ filter: "drop-shadow(0px 8px 12px rgba(0,0,0,0.65))" }}
        >
          {events.map((event, i) => {
            if (i === events.length - 1) return null;
            const nextEvent = events[i + 1];
            const isTop = i % 2 !== 0;

            const x1 = i * stepWidth + stepWidth / 2;
            const y1 = isTop ? (compact ? 48 : 58) : (compact ? 148 : 166);
            const x2 = (i + 1) * stepWidth + stepWidth / 2;
            const y2 = isTop ? (compact ? 148 : 166) : (compact ? 48 : 58);
            const midX = (x1 + x2) / 2;

            const strokeColor = getWorkflowPathColor(nextEvent.status, nextEvent.label);

            return (
              <g key={`pipe-segment-${i}`}>
                {/* 1. Outer dark bevel edge */}
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#000000"
                  strokeOpacity="0.6"
                  strokeWidth={compact ? "24" : "28"}
                  strokeLinecap="round"
                />
                {/* 2. Main 3D colored pipe core */}
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={compact ? "16" : "20"}
                  strokeLinecap="round"
                  className="transition-colors duration-500"
                />
                {/* 3. Sharp specular highlight */}
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity="0.36"
                  strokeWidth={compact ? "3" : "4"}
                  strokeLinecap="round"
                />
                {/* 4. Live electric pulse flowing through conduit */}
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={compact ? "3.5" : "4.5"}
                  strokeDasharray="14 110"
                  strokeLinecap="round"
                  className="animate-pulse"
                  style={{
                    filter: "drop-shadow(0 0 6px rgba(255, 255, 255, 0.95))",
                    strokeDashoffset: (i * 35).toString(),
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* ── 3D Alternating Embossed Nodes ── */}
        {events.map((event, i) => {
          const isTop = i % 2 !== 0;
          const pathColor = getWorkflowPathColor(event.status, event.label);
          const isSelected = selectedWorkflowStep?.id === event.id;
          const isPulsing = event.status === "running" || event.status === "failed_retrying";

          const circleY = isTop ? (compact ? 18 : 24) : (compact ? 118 : 132);
          const infoY = isTop ? (compact ? 98 : 110) : (compact ? 32 : 38);

          const outerBg = isTop
            ? `radial-gradient(circle at bottom left, ${pathColor}, ${pathColor}90)`
            : `radial-gradient(circle at top left, ${pathColor}, ${pathColor}90)`;

          const outerShadow = isTop
            ? `inset 0 -3.5px 5px rgba(255,255,255,0.4), inset 0 3.5px 7px rgba(0,0,0,0.5), 0 -12px 26px -4px ${pathColor}80`
            : `inset 0 3.5px 5px rgba(255,255,255,0.4), inset 0 -3.5px 7px rgba(0,0,0,0.5), 0 12px 26px -4px ${pathColor}80`;

          const innerBg = isTop
            ? `radial-gradient(circle at bottom left, #343744 0%, #0c0e14 100%)`
            : `radial-gradient(circle at top left, #343744 0%, #0c0e14 100%)`;

          const innerShadow = isTop
            ? `inset 0 -2px 3px rgba(255,255,255,0.18), inset 0 3px 6px rgba(0,0,0,0.85), 0 -6px 14px rgba(0,0,0,0.9)`
            : `inset 0 2px 3px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.85), 0 6px 14px rgba(0,0,0,0.9)`;

          return (
            <div
              key={event.id}
              className="absolute top-0 bottom-0"
              style={{ left: i * stepWidth, width: stepWidth }}
            >
              {/* 3D Embossed Sphere */}
              <div
                onClick={() => setSelectedWorkflowStep(event)}
                className={`absolute rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-200 hover:scale-110 ${
                  compact ? "w-[60px] h-[60px]" : "w-[68px] h-[68px]"
                } ${isPulsing ? "animate-pulse" : ""} ${isSelected ? "ring-2 ring-white scale-105" : ""}`}
                style={{
                  background: outerBg,
                  boxShadow: outerShadow,
                  top: circleY,
                  left: stepWidth / 2 - (compact ? 30 : 34),
                }}
              >
                <div
                  className={`rounded-full flex flex-col items-center justify-center z-10 ${
                    compact ? "w-11 h-11" : "w-13 h-13"
                  }`}
                  style={{
                    background: innerBg,
                    boxShadow: innerShadow,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {getWorkflowStepIcon(event.label, event.status)}
                </div>
              </div>

              {/* Step Info Badge & Labels */}
              <div
                className={`absolute flex flex-col items-center text-center px-1 cursor-pointer ${
                  !isTop ? "justify-end" : ""
                }`}
                style={{
                  top: infoY,
                  left: stepWidth / 2 - 58,
                  width: 116,
                  height: 75,
                }}
                onClick={() => setSelectedWorkflowStep(event)}
              >
                <span className="text-[9px] font-bold text-zinc-200 uppercase mb-1 line-clamp-1 w-full truncate font-mono">
                  {event.label}
                </span>

                <span
                  className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded-full border shadow-sm ${
                    event.status === "completed"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : event.status === "failed_retrying"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                      : event.status === "failed"
                      ? "bg-red-500/20 text-red-400 border-red-500/40"
                      : "bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse"
                  }`}
                >
                  {event.status === "failed_retrying"
                    ? "AUTO-HEALED"
                    : event.status.toUpperCase()}
                </span>

                <div className="flex items-center gap-1 text-[8px] text-zinc-400 mt-1">
                  <span>{event.duration}</span>
                  {event.attempts && event.attempts > 1 && (
                    <span className="text-amber-300 font-bold bg-amber-500/10 px-1 rounded border border-amber-500/20">
                      {event.attempts} att
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="relative w-full bg-[#111111] text-white py-8 sm:py-14 px-2.5 sm:px-6 select-none overflow-hidden font-sans antialiased subpixel-antialiased [text-rendering:geometricPrecision]">
      {/* ── Background Matrix Grid (Matches Homepage Hero & Other Sections) ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[960px] w-full mx-auto pb-6 sm:pb-8">
        
        {/* ═════════════════════════════════════════════════════════════════
            CANVAS SHELL (Video-Grade Precision + Interactive Virtual Pointer)
            ═════════════════════════════════════════════════════════════ */}
        <div
          ref={shellRef}
          className="relative w-full rounded-2xl border border-white/[0.08] bg-[#0c0d14] shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col min-h-[500px] sm:min-h-[560px] md:min-h-[590px] aspect-[16/11] sm:aspect-[16/10] antialiased [text-rendering:geometricPrecision]"
        >
          
          {/* ── Virtual Mouse Cursor & Click Wave Ripple ──────────────── */}
          <div
            className="absolute pointer-events-none z-50 transition-all duration-700 ease-out"
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
              opacity: cursorPos.opacity,
              transform: "translate(-3px, -3px)",
            }}
          >
            {/* Crisp SVG Arrow Cursor */}
            <svg
              className={`w-4 h-4 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] transition-transform duration-150 ${
                isClicking ? "scale-90 translate-y-0.5" : "scale-100"
              }`}
              viewBox="0 0 24 24"
              fill="white"
              stroke="#11131a"
              strokeWidth="1.5"
            >
              <path d="M4 2 L20 10 L12 12 L10 20 Z" />
            </svg>

            {/* Click Ripple Wave Ring */}
            {isClicking && (
              <div className="absolute -top-3.5 -left-3.5 w-11 h-11 rounded-full border-2 border-white/80 bg-white/20 animate-ping pointer-events-none shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
            )}
          </div>

          {/* ── Top Header Navigation Bar ──────────────────────────────── */}
          <div className="h-10 sm:h-11 border-b border-white/[0.06] bg-[#0e1017]/90 px-2.5 sm:px-4 flex items-center justify-between shrink-0 z-30 gap-1.5 sm:gap-2">
            {/* Left Project / Context Label */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-medium min-w-0">
              {activeStage === "deploy" && deployStep === "select-repo" ? (
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-zinc-400 font-mono text-[11px] truncate max-w-[120px] sm:max-w-none">new-deployment</span>
                </div>
              ) : activeStage === "deploy" && deployStep === "stack-detected" ? (
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[110px] sm:max-w-none hidden xs:inline">ast-inspection</span>
                </div>
              ) : activeStage === "deploy" && deployStep === "initial-logs" ? (
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[110px] sm:max-w-none hidden xs:inline">provisioning-logs</span>
                </div>
              ) : activeStage === "deploy" && deployStep === "initial-success" ? (
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[110px] sm:max-w-none hidden xs:inline">initial-provisioned</span>
                </div>
              ) : activeStage === "deploy" && deployStep === "env-exchange" ? (
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[110px] sm:max-w-none hidden xs:inline">env-handshake</span>
                </div>
              ) : activeStage === "deploy" && deployStep === "sync-logs" ? (
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[110px] sm:max-w-none hidden xs:inline">sync-rollout-logs</span>
                </div>
              ) : activeStage === "network" ? (
                <div className="flex items-center gap-1.5 font-medium min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[120px] sm:max-w-none hidden xs:inline">private-mesh-topology</span>
                  <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] bg-white/[0.06] text-zinc-300 border border-white/10 font-mono hidden sm:inline">
                    {networkStep === "unapplied" ? "diff pending" : "synced"}
                  </span>
                </div>
              ) : activeStage === "scale" ? (
                <div className="flex items-center gap-1.5 font-medium min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[120px] sm:max-w-none hidden xs:inline">cluster-autoscaling</span>
                  <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-mono bg-white/[0.05] text-zinc-300 border border-white/10 hidden sm:flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        scaleStep === "surge-alert"
                          ? "bg-red-400 animate-ping"
                          : scaleStep === "provisioning-mesh"
                          ? "bg-cyan-400 animate-pulse"
                          : "bg-emerald-400"
                      }`}
                    />
                    <span>
                      {scaleStep === "surge-alert"
                        ? "94.8% CPU Saturation"
                        : scaleStep === "configure-scaling"
                        ? "Scaling Config"
                        : scaleStep === "provisioning-mesh"
                        ? "Rolling 3 Pods + DB"
                        : "Balanced · 3 Pods Live"}
                    </span>
                  </span>
                </div>
              ) : activeStage === "monitor" ? (
                <div className="flex items-center gap-1.5 font-medium text-xs min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-500 hidden xs:inline">/</span>
                  <span className="text-zinc-200 font-medium whitespace-nowrap">production ▾</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-medium min-w-0">
                  <img
                    src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
                    alt="Deployra"
                    className="h-5 sm:h-5.5 w-auto object-contain shrink-0"
                  />
                  <span className="text-zinc-600 hidden xs:inline">/</span>
                  <span className="text-emerald-400 font-mono text-[11px] truncate max-w-[110px] sm:max-w-none hidden xs:inline">production ▾</span>
                </div>
              )}
            </div>

            {/* Right Tab Controls */}
            {activeStage === "deploy" && deployStep === "select-repo" ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 hover:text-white cursor-pointer">Dashboard</span>
                <div className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center text-[9px] font-bold shadow-sm">
                  S
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-3 text-xs font-medium text-zinc-400 shrink-0">
                {activeStage === "network" && (
                  <div className="flex items-center gap-1.5 sm:gap-2 mr-0.5 sm:mr-1 animate-in fade-in">
                    <span className="text-[10px] text-zinc-400 hidden md:inline">
                      {networkStep === "unapplied" ? "1 unapplied change" : "Mesh deployed"}
                    </span>
                    <button
                      type="button"
                      className={`px-2 sm:px-2.5 py-0.5 rounded font-semibold text-[10px] shadow-sm transition-all flex items-center gap-1 sm:gap-1.5 ${
                        networkStep === "unapplied"
                          ? "bg-white text-zinc-950 hover:bg-zinc-200 font-bold shadow-[0_0_12px_rgba(255,255,255,0.2)]"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {networkStep === "unapplied" ? (
                        <>
                          <Zap className="w-2.5 h-2.5 text-zinc-950" />
                          <span>Deploy (1)</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-2.5 h-2.5" />
                          <span className="hidden xs:inline">mTLS Active</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {activeStage === "scale" && (
                  <div className="flex items-center gap-1.5 sm:gap-2 mr-0.5 sm:mr-1 animate-in fade-in">
                    <span className="text-[10px] text-zinc-400 hidden md:inline font-mono">
                      {scaleStep === "surge-alert"
                        ? "1 Instance · 94.8% Load"
                        : scaleStep === "configure-scaling"
                        ? "Configuring HPA & Sizing"
                        : scaleStep === "provisioning-mesh"
                        ? "Provisioning Multi-AZ..."
                        : "3 Pods · Multi-AZ HA"}
                    </span>
                    <div
                      className={`px-1.5 sm:px-2 py-0.5 rounded text-[9.5px] sm:text-[10px] font-mono font-bold flex items-center gap-1 sm:gap-1.5 ${
                        scaleStep === "surge-alert"
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : scaleStep === "configure-scaling"
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          : scaleStep === "provisioning-mesh"
                          ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                          : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          scaleStep === "surge-alert"
                            ? "bg-red-400 animate-ping"
                            : scaleStep === "provisioning-mesh"
                            ? "bg-cyan-400 animate-pulse"
                            : "bg-emerald-400"
                        }`}
                      />
                      <span>
                        {scaleStep === "surge-alert"
                          ? "CPU CRITICAL"
                          : scaleStep === "stabilized-success"
                          ? "HPA OK"
                          : "SCALING"}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-0.5 sm:gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.06] shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveHeaderTab("Architecture")}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] transition-colors ${
                      activeHeaderTab === "Architecture" ? "bg-white/[0.1] text-white font-semibold" : "hover:text-zinc-200"
                    }`}
                  >
                    Architecture
                  </button>
                  {activeStage !== "monitor" && (
                    <button
                      type="button"
                      onClick={() => setActiveHeaderTab("Workflows")}
                      className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] transition-colors flex items-center gap-1 sm:gap-1.5 ${
                        activeHeaderTab === "Workflows" ? "bg-white/[0.1] text-white font-semibold" : "hover:text-zinc-200"
                      }`}
                    >
                      <span>Workflows</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveHeaderTab("Observability")}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] transition-colors flex items-center gap-1 ${
                      activeHeaderTab === "Observability" ? "bg-white/[0.1] text-white font-semibold" : "hover:text-zinc-200"
                    }`}
                  >
                    <span className="hidden xs:inline">Observability</span>
                    <span className="xs:hidden">Obs</span>
                    {activeStage === "monitor" && (monitorStep === "warning-1" || monitorStep === "redis-deployed") && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[9px] font-bold animate-in fade-in">1</span>
                    )}
                    {activeStage === "monitor" && (monitorStep === "warning-2" || monitorStep === "observability-view" || monitorStep === "create-menu" || monitorStep === "search-typing") && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[9px] font-bold animate-in fade-in">2</span>
                    )}
                  </button>
                  <span className="px-1.5 py-0.5 text-zinc-500 hidden md:inline text-[11px]">Logs</span>
                  <span className="px-1.5 py-0.5 text-zinc-500 hidden md:inline text-[11px]">Settings</span>
                  {activeStage === "monitor" && (
                    <span className="px-1.5 py-0.5 text-zinc-400 hidden md:inline text-[11px] hover:text-white cursor-pointer">Share</span>
                  )}
                </div>

                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 shadow-sm ${
                  activeStage === "monitor" ? "bg-purple-600 text-white" : "bg-white text-black"
                }`}>
                  S
                </div>
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════════
              CANVAS BODY (Cinematic Camera Viewport + Crisp Visual Flow)
              ═════════════════════════════════════════════════════════════ */}
          <div className="relative flex-1 w-full bg-[#0a0c12] overflow-hidden flex items-center justify-center">
            {/* Infinite Dot Matrix Grid */}
            <div
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(255, 255, 255, 0.08) 1.2px, transparent 1.2px)",
                backgroundSize: "26px 26px",
              }}
            />

            {/* ── Top-Right Anchored Warnings & Green Toast (True Top-Right of Canvas Frame) ── */}
            {activeStage === "monitor" && activeHeaderTab === "Architecture" && (
              <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-4 z-40 flex flex-col gap-2 items-end pointer-events-none max-w-[calc(100%-24px)]">
                {/* WARNING CARD 1: High Memory Usage (Visible during warnings & search, unmounted on all-stabilized) */}
                {(monitorStep === "warning-1" ||
                  monitorStep === "warning-2" ||
                  monitorStep === "create-menu" ||
                  monitorStep === "search-typing" ||
                  monitorStep === "redis-deployed") && !dismissedWarn1 && (
                  <div className="w-52 sm:w-56 md:w-60 p-2 sm:p-2.5 rounded-lg bg-[#14120e]/95 border border-amber-500/40 shadow-[0_8px_24px_rgba(0,0,0,0.85)] backdrop-blur-md pointer-events-auto animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center justify-between text-[11px] pb-1 border-b border-amber-500/20">
                      <div className="flex items-center gap-1.5 font-bold text-amber-400">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">High Memory Usage!</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDismissedWarn1(true)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                        title="Dismiss"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-[10px] text-zinc-300 py-1 leading-snug">
                      <span className="font-bold text-white">backend</span>'s CPU resource limit reached — service may degrade
                    </div>

                    {/* Yellow Flame Spike Mini Graph */}
                    <div className="relative w-full h-7 mt-0.5">
                      <svg className="w-full h-full" viewBox="0 0 200 45" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="warn1GradTop" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#eab308" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#eab308" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <polygon
                          points="0,40 25,38 50,37 75,35 100,32 125,28 150,22 175,14 190,8 200,4 200,45 0,45"
                          fill="url(#warn1GradTop)"
                        />
                        <path
                          d="M0,40 L25,38 L50,37 L75,35 L100,32 L125,28 L150,22 L175,14 L190,8 L200,4"
                          fill="none"
                          stroke="#eab308"
                          strokeWidth="2"
                        />
                        <circle cx="200" cy="4" r="2" fill="#eab308" className="animate-pulse" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* WARNING CARD 2: Resource Limit Reached (Slides out on redis-deployed) */}
                {(monitorStep === "warning-2" || monitorStep === "create-menu" || monitorStep === "search-typing") && !dismissedWarn2 && (
                  <div className="w-52 sm:w-56 md:w-60 p-2 sm:p-2.5 rounded-lg bg-[#14120e]/95 border border-amber-500/40 shadow-[0_8px_24px_rgba(0,0,0,0.85)] backdrop-blur-md pointer-events-auto animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center justify-between text-[11px] pb-1 border-b border-amber-500/20">
                      <div className="flex items-center gap-1.5 font-bold text-amber-400">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">Resource Limit Reached!</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDismissedWarn2(true)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                        title="Dismiss"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-[10px] text-zinc-300 py-1 leading-snug">
                      <span className="font-bold text-white">backend</span>'s surpassed memory limit by 23% — service may crash
                    </div>

                    {/* Yellow Jagged Spike Mini Graph */}
                    <div className="relative w-full h-7 mt-0.5">
                      <svg className="w-full h-full" viewBox="0 0 200 45" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="warn2GradTop" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <polygon
                          points="0,38 15,35 30,39 45,32 60,36 75,28 90,32 105,24 120,29 135,18 150,22 165,12 180,16 195,6 200,8 200,45 0,45"
                          fill="url(#warn2GradTop)"
                        />
                        <path
                          d="M0,38 L15,35 L30,39 L45,32 L60,36 L75,28 L90,32 L105,24 L120,29 L135,18 L150,22 L165,12 L180,16 L195,6 L200,8"
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="2"
                        />
                        <circle cx="200" cy="8" r="2" fill="#f59e0b" className="animate-pulse" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* GREEN STABILIZED TOAST (Mounts at absolute top-right on all-stabilized matching image copy.png!) */}
                {monitorStep === "all-stabilized" && (
                  <div className="max-w-[270px] p-2 rounded-lg bg-[#0a1610]/95 border border-emerald-500/40 shadow-xl shadow-black/85 backdrop-blur-md pointer-events-auto flex items-center justify-between gap-2.5 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Check className="w-3 h-3" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-emerald-400 font-mono">backend</div>
                        <div className="text-[9.5px] text-zinc-200 leading-tight">CPU usage back to normal</div>
                      </div>
                    </div>
                    <span className="text-zinc-500 hover:text-zinc-300 cursor-pointer text-xs shrink-0">✕</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Cinematic Camera Container ── */}
            <div
              className={`relative w-full h-full flex items-center justify-center p-3 ${
                activeStage === "evolve" ? "will-change-transform" : ""
              }`}
              style={{
                transform: activeHeaderTab === "Workflows" || activeHeaderTab === "Observability" ? "none" : cameraTransform,
                transition:
                  activeStage === "evolve"
                    ? "transform 1.8s cubic-bezier(0.16, 1, 0.3, 1)"
                    : "transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {/* ═════════════════════════════════════════════════════════════
                  WORKFLOWS TAB (Accessible across any stage from Header)
                  ═════════════════════════════════════════════════════════════ */}
              {activeHeaderTab === "Workflows" ? (
                <div className="relative z-10 w-full h-full flex flex-col justify-between p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-300">
                  <div className="w-full flex-1 flex flex-col gap-3 font-sans">
                    {/* Workflow Run Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-white/[0.08] gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white font-mono">
                            Project Deployment • commit 23rr2v9
                          </h3>
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            DURABLE REPLAY ACTIVE
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-0.5">
                          Deterministic execution flow with zero data loss guarantee · Auto-Retry with exponential backoff.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWorkflowStep(LIVE_DEPLOYMENT_WORKFLOW_STEPS[2]);
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-600/20 border border-purple-500/40 text-purple-300 text-[11px] font-semibold hover:bg-purple-600/30 transition-all shadow-sm"
                        >
                          <Play className="w-3 h-3 text-purple-400" />
                          <span>Replay Canary</span>
                        </button>
                      </div>
                    </div>

                    {/* Snake Pipeline Canvas */}
                    <div className="w-full flex justify-center items-center py-2 overflow-x-auto">
                      {renderInfographicSnakePipeline(LIVE_DEPLOYMENT_WORKFLOW_STEPS, false)}
                    </div>

                    {/* Execution Ledger Table */}
                    <div className="w-full rounded-xl bg-[#0e1017] border border-white/[0.08] p-3 font-mono text-[10px]">
                      <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06] text-zinc-400 text-[10px] font-semibold">
                        <span>Execution Ledger (Deterministic State History)</span>
                        <span className="text-purple-400">Ledger ID: #wf-ledger-23rr2v9</span>
                      </div>
                      <div className="grid grid-cols-4 py-1 text-zinc-500 border-b border-white/[0.04] text-[9px]">
                        <span>STEP</span>
                        <span>STATUS</span>
                        <span>ATTEMPTS</span>
                        <span>TIMESTAMP / DURATION</span>
                      </div>
                      {LIVE_DEPLOYMENT_WORKFLOW_STEPS.map((st) => (
                        <div
                          key={st.id}
                          onClick={() => setSelectedWorkflowStep(st)}
                          className="grid grid-cols-4 py-1 text-zinc-300 hover:bg-white/[0.02] cursor-pointer transition-colors"
                        >
                          <span className="font-semibold text-zinc-200">{st.label}</span>
                          <span
                            className={
                              st.status === "completed"
                                ? "text-emerald-400"
                                : st.status === "failed_retrying"
                                ? "text-amber-300 font-bold"
                                : "text-blue-400 font-bold"
                            }
                          >
                            {st.status === "failed_retrying" ? "AUTO-HEALED" : st.status.toUpperCase()}
                          </span>
                          <span>{st.attempts || 1} att</span>
                          <span className="text-zinc-400">{st.duration}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* ═════════════════════════════════════════════════════════════
                      STAGE 1: DEPLOY (10.0s Full-Platform Authentic Lifecycle)
                      ═════════════════════════════════════════════════════════════ */}
                  {activeStage === "deploy" && (
                    <div className="relative z-10 w-full flex items-center justify-center px-4">
                      {/* ── STEP 1: Repository & Branch Selection (Clean Black & White Monochrome) ── */}
                      {deployStep === "select-repo" && (
                        <div className="w-full max-w-xl rounded-2xl bg-[#090b10] border border-white/[0.1] shadow-[0_25px_60px_rgba(0,0,0,0.9)] p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">
                          {/* Header & Stepper */}
                          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                            <div>
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Rocket className="w-4 h-4 text-white" />
                                <span>New Deployment</span>
                              </h3>
                              <p className="text-[11px] text-zinc-400 mt-0.5">Connect your repository and deploy to production</p>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono">
                              <span className="px-2.5 py-0.5 rounded bg-white text-black font-bold shadow-sm">1. Repo</span>
                              <span className="text-zinc-600">→</span>
                              <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-500 border border-white/[0.04]">2. Branch</span>
                              <span className="text-zinc-600">→</span>
                              <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-500 border border-white/[0.04]">3. Analysis</span>
                            </div>
                          </div>

                          {/* Search input with shortcut hint */}
                          <div className="px-3 py-2 rounded-lg bg-[#050608] border border-white/[0.08] text-[11px] flex items-center justify-between text-zinc-300 transition-colors focus-within:border-white/30">
                            <div className="flex items-center gap-2">
                              <Search className="w-3.5 h-3.5 text-zinc-500" />
                              <span className="text-white font-mono">deployra/deployra-core</span>
                            </div>
                            <span className="text-[9px] text-zinc-600 font-mono border border-white/[0.06] px-1.5 py-0.2 rounded">⌘K</span>
                          </div>

                          {/* Selected Repository Card (Pure B&W with clean hover) */}
                          <div className="flex flex-col gap-2">
                            <div className="group p-4 rounded-xl bg-[#0e1017] border border-white/[0.1] text-white flex items-center justify-between shadow-md transition-all duration-300 hover:border-white/40 hover:bg-[#141620] hover:shadow-[0_0_30px_rgba(255,255,255,0.08)] cursor-pointer">
                              <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white transition-all duration-200 group-hover:bg-white/[0.12] group-hover:scale-105">
                                  <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                                  </svg>
                                </div>
                                <div>
                                  <div className="font-bold text-xs text-white group-hover:text-zinc-100 transition-colors flex items-center gap-2">
                                    <span>deployra/deployra-core</span>
                                    <span className="text-[9px] font-mono font-normal text-zinc-500 bg-white/[0.04] px-1.5 py-0.2 rounded border border-white/[0.06]">Public</span>
                                  </div>
                                  <div className="text-[10px] text-zinc-400 flex items-center gap-2 mt-1 font-mono">
                                    <span className="text-zinc-300">Default branch: main</span>
                                    <span className="w-1 h-1 rounded-full bg-zinc-600" />
                                    <span className="text-zinc-300 bg-white/[0.05] px-1.5 py-0.2 rounded border border-white/[0.08]">
                                      TypeScript Monorepo
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-zinc-600" />
                                    <span className="text-zinc-500 text-[9px]">42.8 MB · 184 commits</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <span className="px-2 py-0.5 rounded bg-white/[0.08] text-white border border-white/20 text-[10px] font-mono font-bold">
                                  main ✓
                                </span>
                                <div className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Action Footer */}
                          <div className="pt-2 flex items-center justify-between border-t border-white/[0.06]">
                            <span className="text-[10px] text-zinc-500 font-mono">Target: main (HEAD: commit 23rr2v9)</span>
                            <button
                              type="button"
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)] active:scale-95"
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                                  <span>Analyzing Architecture...</span>
                                </>
                              ) : (
                                <>
                                  <span>Analyze Project</span>
                                  <ChevronRight className="w-3.5 h-3.5 text-black" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── STEP 2: Automated Tech Stack Detection Results ── */}
                      {deployStep === "stack-detected" && (
                        <div className="w-full max-w-2xl rounded-2xl bg-[#090b10] border border-white/[0.1] shadow-2xl p-5 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-300">
                          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                            <div>
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <span>Project Analysis Complete</span>
                              </h3>
                              <p className="text-[11px] text-zinc-400 mt-0.5">Automatic tech-stack inspection via AST engine</p>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                              AST PARSED ✓
                            </span>
                          </div>

                          {/* Architecture Card */}
                          <div className="p-3 rounded-xl bg-[#0e1017] border border-white/[0.08] flex items-center justify-between">
                            <div>
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Architecture</span>
                              <p className="text-white font-semibold text-xs mt-0.5">Monorepo (Client &amp; Server detected)</p>
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono bg-white/[0.05] px-2 py-0.5 rounded border border-white/[0.08]">
                              2 Microservices
                            </span>
                          </div>

                          {/* 2-Column Detected Stacks */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Frontend Detected */}
                            <div className="p-3 rounded-xl bg-[#0e111a] border border-white/[0.1] flex flex-col gap-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  Frontend Detected
                                </span>
                                <span className="text-[9px] font-mono text-zinc-300 bg-white/[0.06] px-1.5 py-0.2 rounded border border-white/10">Next.js 16</span>
                              </div>
                              <div className="text-[10.5px] text-zinc-300 font-mono space-y-0.5 mt-0.5">
                                <p><span className="text-zinc-500">Framework:</span> Next.js (App Router)</p>
                                <p><span className="text-zinc-500">Root Path:</span> /client</p>
                                <p><span className="text-zinc-500">Build:</span> pnpm build (Turbopack)</p>
                              </div>
                            </div>

                            {/* Backend Detected */}
                            <div className="p-3 rounded-xl bg-[#0e111a] border border-white/[0.1] flex flex-col gap-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  Backend Detected
                                </span>
                                <span className="text-[9px] font-mono text-zinc-300 bg-white/[0.06] px-1.5 py-0.2 rounded border border-white/10">Go Gin</span>
                              </div>
                              <div className="text-[10.5px] text-zinc-300 font-mono space-y-0.5 mt-0.5">
                                <p><span className="text-zinc-500">Framework:</span> Go Gin + AST Engine</p>
                                <p><span className="text-zinc-500">Root Path:</span> /server</p>
                                <p><span className="text-zinc-500">Start:</span> go run main.go</p>
                              </div>
                            </div>
                          </div>

                          {/* Database Detected */}
                          <div className="p-2.5 rounded-xl bg-[#0e1017] border border-white/[0.08] flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <Database className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="font-semibold text-white">Database Detected:</span>
                              <span className="text-zinc-300 font-mono text-[11px]">PostgreSQL (Neon Serverless)</span>
                            </div>
                            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Active AST Connection</span>
                          </div>

                          {/* Deploy Initial Pods Button */}
                          <div className="pt-2 flex justify-end border-t border-white/[0.06]">
                            <button
                              type="button"
                              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.25)]"
                            >
                              <Rocket className="w-3.5 h-3.5 text-black" />
                              <span>Deploy Full Stack (Vercel + Render)</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── STEP 3: Live Incoming Build Logs (Deployment #1: Initial Provisioning) ── */}
                      {deployStep === "initial-logs" && (
                        <div className="w-full max-w-2xl rounded-2xl bg-[#090a10] border border-zinc-800 shadow-2xl p-4 flex flex-col gap-2.5 font-mono text-[11px] animate-in fade-in zoom-in-95 duration-300">
                          {/* Terminal Chrome Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                              <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                              <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                              <span className="ml-2 text-xs font-bold text-zinc-300">terminal ~ deploy #1 (Initial Provisioning)</span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                              Current Step: {terminalLogs <= 3 ? "turbopack_build" : "kaniko_bake"}
                            </span>
                          </div>

                          {/* Real Terminal Stream Logs */}
                          <div className="bg-[#050505] p-3.5 rounded-xl border border-zinc-800/60 h-44 overflow-y-auto space-y-2">
                            {initialLogs.slice(0, terminalLogs).map((l, i) => (
                              <div key={i} className="flex gap-2.5 items-start text-xs leading-relaxed animate-in fade-in duration-200">
                                <span className="text-zinc-600 shrink-0 select-none">[{l.time}]</span>
                                <span className={l.tag === "pass" ? "text-emerald-400 font-semibold" : "text-zinc-300"}>
                                  {l.text}
                                </span>
                              </div>
                            ))}
                            {terminalLogs < initialLogs.length && (
                              <div className="flex items-center gap-2 text-zinc-500 text-xs animate-pulse pt-1">
                                <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
                                <span>Streaming initial service provisioning logs...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── STEP 4: Initial Deployment Completed Successfully Frame (Clean Frame - NO Green Glow/Border) ── */}
                      {deployStep === "initial-success" && (
                        <div className="w-full max-w-3xl rounded-2xl bg-[#090b10] border border-white/[0.1] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-400 relative">
                          {/* Success Header (Clean subtle styling) */}
                          <div className="px-5 py-3.5 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                                <CheckCircle2 className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-white">Deployment Completed Successfully</h3>
                                <p className="text-[10px] text-zinc-400">Initial microservices provisioned · Awaiting environment variable sync</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/[0.06] text-emerald-400 border border-white/10 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                PODS LIVE (28ms)
                              </span>
                            </div>
                          </div>

                          {/* Content: Preview Window & Endpoints */}
                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left: macOS Browser Preview */}
                            <div className="rounded-xl border border-zinc-800 bg-[#07080d] overflow-hidden flex flex-col">
                              <div className="px-3 py-1.5 bg-[#141620] border-b border-zinc-800 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#ff5f56]" />
                                <div className="w-2 h-2 rounded-full bg-[#ffbd2e]" />
                                <div className="w-2 h-2 rounded-full bg-[#27c93f]" />
                                <div className="flex-1 text-center font-mono text-[9px] text-zinc-400 truncate px-2">
                                  https://deployra-core.vercel.app
                                </div>
                              </div>
                              {/* Mock Live App Screen */}
                              <div className="p-3 flex-1 flex flex-col justify-between bg-gradient-to-b from-zinc-950 to-black text-white">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                  <span className="font-bold text-xs tracking-tight">Deployra Core</span>
                                  <span className="text-[9px] text-emerald-400 font-mono">Status: Ingress Ready</span>
                                </div>
                                <div className="py-2.5 space-y-1.5">
                                  <div className="h-2 w-3/4 rounded bg-white/[0.1]" />
                                  <div className="h-2 w-1/2 rounded bg-white/[0.06]" />
                                  <div className="h-10 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-around px-2 text-[10px]">
                                    <div className="text-center"><span className="text-zinc-500 block text-[8px]">RPS</span> 1,420</div>
                                    <div className="text-center"><span className="text-zinc-500 block text-[8px]">LATENCY</span> 28ms</div>
                                    <div className="text-center"><span className="text-zinc-500 block text-[8px]">ERRORS</span> 0.00%</div>
                                  </div>
                                </div>
                                <div className="text-[9px] text-amber-300 font-mono flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                  <span>Exchanging cross-service envs...</span>
                                </div>
                              </div>
                            </div>

                            {/* Right: Endpoints & Next Action */}
                            <div className="flex flex-col justify-between gap-3 text-xs">
                              <div className="space-y-2">
                                <div className="p-2.5 rounded-lg border border-zinc-800 bg-black/40">
                                  <div className="text-[10px] text-zinc-500 font-mono uppercase mb-0.5">Frontend Domain (Vercel)</div>
                                  <div className="text-indigo-400 font-semibold text-[11px] flex items-center justify-between">
                                    <span>deployra-core.vercel.app</span>
                                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-lg border border-zinc-800 bg-black/40">
                                  <div className="text-[10px] text-zinc-500 font-mono uppercase mb-0.5">Backend API Domain (Render)</div>
                                  <div className="text-emerald-400 font-semibold text-[11px] flex items-center justify-between">
                                    <span>api.deployra-core.onrender.com</span>
                                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                                  </div>
                                </div>
                              </div>

                              {/* Handshake Prompt Box */}
                              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-mono text-[10px] space-y-1">
                                <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                                  <Zap className="w-3 h-3" />
                                  <span>Step 2: Environment Exchange</span>
                                </div>
                                <p className="text-zinc-300 text-[9.5px] leading-snug">
                                  Binding live API URL into frontend client bundle &amp; establishing CORS whitelist.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── STEP 5: Post-Deployment Env Variable Exchange Frame ── */}
                      {deployStep === "env-exchange" && (
                        <div className="w-full max-w-2xl rounded-2xl bg-[#090b10] border border-white/[0.1] shadow-2xl p-5 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-300">
                          {/* Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                            <div>
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Zap className="w-4 h-4 text-emerald-400" />
                                <span>Cross-Service Environment Exchange</span>
                              </h3>
                              <p className="text-[11px] text-zinc-400 mt-0.5">
                                Exchanging live provisioned endpoints between Vercel &amp; Render microservices
                              </p>
                            </div>
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded">
                              Endpoints Active ✓
                            </span>
                          </div>

                          {/* Platform Endpoints Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Frontend Pod */}
                            <div className="p-3 rounded-xl bg-[#0e1017] border border-white/[0.08] flex flex-col gap-1.5">
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Frontend Pod (Vercel)</span>
                              <div className="p-2.5 rounded-lg bg-black/60 border border-white/[0.12] flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-white font-medium">
                                  <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 116 100"><polygon points="58 0 116 100 0 100" /></svg>
                                  <span className="font-mono text-[11px]">deployra-core.vercel.app</span>
                                </div>
                                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                              </div>
                              <span className="text-[9px] text-emerald-400/80 font-mono">Status: Ready for API Binding</span>
                            </div>

                            {/* Backend Pod */}
                            <div className="p-3 rounded-xl bg-[#0e1017] border border-white/[0.08] flex flex-col gap-1.5">
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Backend Pod (Render)</span>
                              <div className="p-2.5 rounded-lg bg-black/60 border border-white/[0.12] flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-white font-medium">
                                  <div className="w-3.5 h-3.5 rounded bg-white text-black flex items-center justify-center font-bold text-[9px]">R</div>
                                  <span className="font-mono text-[11px]">api.deployra-core.onrender.com</span>
                                </div>
                                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                              </div>
                              <span className="text-[9px] text-emerald-400/80 font-mono">Status: Ingress Allocated</span>
                            </div>
                          </div>

                          {/* ── MOCK ENV VARIABLE EXCHANGE ANIMATION BRIDGE ── */}
                          <div className="relative rounded-xl border border-white/[0.1] bg-[#05060a] p-3.5 flex flex-col gap-2.5 overflow-hidden shadow-inner">
                            {/* Handshake Header Bar */}
                            <div className="flex items-center justify-between text-[10.5px] font-mono">
                              <div className="flex items-center gap-2 text-zinc-300">
                                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="font-bold text-white">Live Variable Exchange</span>
                                <span className="text-zinc-600">·</span>
                                <span className="text-zinc-400">Post-Provisioning Handshake</span>
                              </div>
                              <span className="text-[9px] font-mono flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                {envSyncStep >= 4 ? "4/4 Injected & Sealed ✓" : `Syncing Variables (${Math.max(1, envSyncStep)}/4)...`}
                              </span>
                            </div>

                            {/* Live Animated Conduit Bridge */}
                            <div className="space-y-2 relative">
                              {/* Variable 1: Render ➔ Vercel */}
                              <div className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-300 font-mono text-[10.5px] relative overflow-hidden ${
                                envSyncStep >= 2
                                  ? "bg-black/70 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.08)]"
                                  : "bg-black/40 border-white/[0.05]"
                              }`}>
                                <div className="flex items-center gap-2 z-10">
                                  <span className="text-[9px] font-bold text-zinc-300 bg-white/[0.08] px-1.5 py-0.2 rounded border border-white/10">Vercel</span>
                                  <span className="text-white font-semibold">NEXT_PUBLIC_API_URL</span>
                                </div>

                                {/* Flowing Animated Conduit Cable */}
                                <div className="hidden sm:flex items-center gap-1.5 px-2 z-10">
                                  <div className="h-0.5 w-14 bg-gradient-to-r from-zinc-700 via-emerald-400 to-emerald-500 rounded relative overflow-hidden">
                                    <div className="absolute inset-0 bg-white w-4 h-full animate-[ping_1.2s_infinite] blur-[1px]" />
                                  </div>
                                  <ArrowRight className="w-3 h-3 text-emerald-400 animate-pulse" />
                                </div>

                                <div className="flex items-center gap-2 z-10">
                                  <span className="text-[10px] text-zinc-400 truncate max-w-[180px]">
                                    https://api.deployra-core.onrender.com
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>INJECTED</span>
                                  </span>
                                </div>
                              </div>

                              {/* Variable 2: Vercel ➔ Render */}
                              <div className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-300 font-mono text-[10.5px] relative overflow-hidden ${
                                envSyncStep >= 3
                                  ? "bg-black/70 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.08)]"
                                  : "bg-black/40 border-white/[0.05]"
                              }`}>
                                <div className="flex items-center gap-2 z-10">
                                  <span className="text-[9px] font-bold text-zinc-300 bg-white/[0.08] px-1.5 py-0.2 rounded border border-white/10">Render</span>
                                  <span className="text-white font-semibold">CORS_ALLOWED_ORIGIN</span>
                                </div>

                                {/* Flowing Animated Reverse Conduit Cable */}
                                <div className="hidden sm:flex items-center gap-1.5 px-2 z-10">
                                  <ArrowRight className="w-3 h-3 text-emerald-400 rotate-180 animate-pulse" />
                                  <div className="h-0.5 w-14 bg-gradient-to-l from-zinc-700 via-emerald-400 to-emerald-500 rounded relative overflow-hidden">
                                    <div className="absolute inset-0 bg-white w-4 h-full animate-[ping_1.2s_infinite] blur-[1px]" />
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 z-10">
                                  <span className="text-[10px] text-zinc-400 truncate max-w-[180px]">
                                    https://deployra-core.vercel.app
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>ORIGIN BOUND</span>
                                  </span>
                                </div>
                              </div>

                              {/* Variable 3: Neon DB ➔ Render */}
                              <div className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-300 font-mono text-[10.5px] relative overflow-hidden ${
                                envSyncStep >= 4
                                  ? "bg-black/70 border-emerald-500/30"
                                  : "bg-black/40 border-white/[0.05]"
                              }`}>
                                <div className="flex items-center gap-2 z-10">
                                  <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">Neon DB</span>
                                  <span className="text-white font-semibold">DATABASE_URL</span>
                                </div>

                                <div className="flex items-center gap-2 z-10">
                                  <span className="text-[10px] text-zinc-500">postgresql://neondb...</span>
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold flex items-center gap-1">
                                    <Shield className="w-2.5 h-2.5" />
                                    <span>AES-256 GCM</span>
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>SEALED</span>
                                  </span>
                                </div>
                              </div>

                              {/* Variable 4: Cross-Service Shared Secret */}
                              <div className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-300 font-mono text-[10.5px] relative overflow-hidden ${
                                envSyncStep >= 4
                                  ? "bg-black/70 border-emerald-500/30"
                                  : "bg-black/40 border-white/[0.05]"
                              }`}>
                                <div className="flex items-center gap-2 z-10">
                                  <span className="text-[9px] font-bold text-zinc-400 bg-white/[0.06] px-1.5 py-0.2 rounded border border-white/10">Auth</span>
                                  <span className="text-white font-semibold">INTERNAL_JWT_SECRET</span>
                                </div>

                                <div className="flex items-center gap-2 z-10">
                                  <span className="text-[10px] text-zinc-500">•••••••••••••••• (32-byte key)</span>
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>ATTESTED</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Deployment Trigger #2: Zero-Downtime Rollout Card */}
                          <div className="rounded-xl border border-white/[0.12] bg-gradient-to-r from-[#111420] to-[#0a0f16] p-4 relative overflow-hidden shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/[0.15] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                                🔄
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">Trigger Deployment #2</span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-white/[0.08] text-white border border-white/20 font-mono font-bold">
                                    Zero-Downtime Rollout
                                  </span>
                                </div>
                                <p className="text-[10px] text-zinc-400 mt-0.5">
                                  Re-bakes Next.js frontend with backend API URL &amp; reloads backend CORS policy
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.25)] shrink-0 active:scale-95"
                            >
                              <Rocket className="w-3.5 h-3.5 text-black" />
                              <span>Trigger Sync Rollout #2</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── STEP 6: Mock Logs Frame (Deployment #2 Env Sync Rollout) ── */}
                      {deployStep === "sync-logs" && (
                        <div className="w-full max-w-2xl rounded-2xl bg-[#090a10] border border-zinc-800 shadow-2xl p-4 flex flex-col gap-2.5 font-mono text-[11px] animate-in fade-in zoom-in-95 duration-300">
                          {/* Terminal Chrome Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                              <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                              <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                              <span className="ml-2 text-xs font-bold text-zinc-300">terminal ~ env-sync &amp; rollout #2 (Vercel + Render)</span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              ROLLING OUT SYNCED ENVS
                            </span>
                          </div>

                          {/* Real Terminal Stream Logs */}
                          <div className="bg-[#050505] p-3.5 rounded-xl border border-zinc-800/60 h-44 overflow-y-auto space-y-2">
                            {syncLogs.slice(0, syncTerminalLogs).map((l, i) => (
                              <div key={i} className="flex gap-2.5 items-start text-xs leading-relaxed animate-in fade-in duration-200">
                                <span className="text-zinc-600 shrink-0 select-none">[{l.time}]</span>
                                <span className={l.tag === "pass" ? "text-emerald-400 font-semibold" : "text-zinc-300"}>
                                  {l.text}
                                </span>
                              </div>
                            ))}
                            {syncTerminalLogs < syncLogs.length && (
                              <div className="flex items-center gap-2 text-zinc-500 text-xs animate-pulse pt-1">
                                <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
                                <span>Verifying zero-downtime container swap...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── STEP 7: Brand New Ultra-Proper Final Deployment Successfully Flame / Dashboard ── */}
                      {deployStep === "final-success" && (
                        <div className="w-full max-w-[460px] sm:max-w-[490px] rounded-xl bg-[#08090e] border border-white/[0.12] shadow-2xl p-2.5 sm:p-3 flex flex-col gap-1.5 sm:gap-2 animate-in fade-in zoom-in-95 duration-400 relative overflow-hidden select-none">
                          {/* Top Header */}
                          <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08]">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-[11px] sm:text-xs font-bold text-white flex flex-wrap items-center gap-1.5">
                                  <span>Production Deployment Live</span>
                                  <span className="px-1.5 py-0.2 rounded text-[7.5px] sm:text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                                    ZERO-DOWNTIME ROLLOUT #2 ✓
                                  </span>
                                </h3>
                                <p className="text-[9px] text-zinc-400 mt-0.5 truncate">
                                  Dual full-stack microservices interconnected &amp; verified healthy
                                </p>
                              </div>
                            </div>
                            <div className="hidden xs:flex items-center gap-1 shrink-0">
                              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase bg-white/[0.06] text-emerald-400 border border-white/10 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                ALL ENVS SYNCED (14ms)
                              </span>
                            </div>
                          </div>

                          {/* Dual Interconnected Pods Cards */}
                          <div className="grid grid-cols-1 xs:grid-cols-2 gap-1.5 sm:gap-2">
                            {/* Frontend Pod Card */}
                            <div className="p-2 rounded-lg bg-[#0e1017] border border-white/[0.08] flex flex-col gap-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <svg className="w-3 h-3 fill-white" viewBox="0 0 116 100"><polygon points="58 0 116 100 0 100" /></svg>
                                  <span className="text-[10px] font-bold text-white">Frontend Microservice</span>
                                </div>
                                <span className="text-[7.5px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                                  Vercel Edge
                                </span>
                              </div>

                              <div className="p-1 rounded bg-black/50 border border-white/[0.06] flex items-center justify-between text-[9px]">
                                <span className="font-mono text-indigo-300 text-[9px] truncate max-w-[140px] sm:max-w-[170px]">
                                  https://deployra-core.vercel.app
                                </span>
                                <ExternalLink className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                              </div>

                              <div className="text-[8.5px] font-mono space-y-0.5 text-zinc-300">
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">API_URL:</span>
                                  <span className="text-emerald-400 font-semibold truncate max-w-[95px]">api.deployra...</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">Cache Hit:</span>
                                  <span className="text-white font-semibold">99.4% (iad1)</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">TLS:</span>
                                  <span className="text-emerald-400 font-semibold">TLS 1.3 Active</span>
                                </div>
                              </div>
                            </div>

                            {/* Backend Pod Card */}
                            <div className="p-2 rounded-lg bg-[#0e1017] border border-white/[0.08] flex flex-col gap-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded bg-white text-black flex items-center justify-center font-bold text-[7.5px]">R</div>
                                  <span className="text-[10px] font-bold text-white">Backend Microservice</span>
                                </div>
                                <span className="text-[7.5px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                                  Render Cluster
                                </span>
                              </div>

                              <div className="p-1 rounded bg-black/50 border border-white/[0.06] flex items-center justify-between text-[9px]">
                                <span className="font-mono text-emerald-300 text-[9px] truncate max-w-[140px] sm:max-w-[170px]">
                                  https://api.deployra-core.onrender.com
                                </span>
                                <ExternalLink className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                              </div>

                              <div className="text-[8.5px] font-mono space-y-0.5 text-zinc-300">
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">CORS:</span>
                                  <span className="text-emerald-400 font-semibold truncate max-w-[95px]">deployra...</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">DB Conn:</span>
                                  <span className="text-white font-semibold">Neon DB (0.4ms)</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">Replicas:</span>
                                  <span className="text-emerald-400 font-semibold">2 Active Healthy</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Cross-Service Handshake Sealed Banner */}
                          <div className="p-1.5 px-2 rounded-lg bg-[#0e111a] border border-white/[0.08] flex items-center justify-between text-[9px] font-mono">
                            <div className="flex items-center gap-1.5 text-zinc-300 truncate">
                              <Shield className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="text-white font-semibold">Inter-Service Handshake:</span>
                              <span className="text-zinc-400 truncate">AES-256 GCM</span>
                            </div>
                            <span className="text-[8px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 flex items-center gap-1 shrink-0">
                              <Check className="w-2.5 h-2.5" />
                              <span>ZERO DRIFT</span>
                            </span>
                          </div>

                          {/* Unified Telemetry Ribbon */}
                          <div className="p-1.5 sm:p-2 rounded-lg bg-[#05060a] border border-white/[0.06] grid grid-cols-4 gap-1 sm:gap-1.5 text-center">
                            <div>
                              <span className="text-[7.5px] uppercase tracking-wider text-zinc-500 font-bold block">THROUGHPUT</span>
                              <span className="text-white font-bold font-mono text-[10px] sm:text-[11px] mt-0.5 block">1,840 req/s</span>
                            </div>
                            <div>
                              <span className="text-[7.5px] uppercase tracking-wider text-zinc-500 font-bold block">LATENCY (P99)</span>
                              <span className="text-emerald-400 font-bold font-mono text-[10px] sm:text-[11px] mt-0.5 block">14ms</span>
                            </div>
                            <div>
                              <span className="text-[7.5px] uppercase tracking-wider text-zinc-500 font-bold block">ERROR RATE</span>
                              <span className="text-emerald-400 font-bold font-mono text-[10px] sm:text-[11px] mt-0.5 block">0.00%</span>
                            </div>
                            <div>
                              <span className="text-[7.5px] uppercase tracking-wider text-zinc-500 font-bold block">CANARY HEALTH</span>
                              <span className="text-white font-bold font-mono text-[10px] sm:text-[11px] mt-0.5 block">5/5 Passed ✓</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

              {/* ═════════════════════════════════════════════════════════════
                  STAGE 2: NETWORK (Sequential Botanical Graph Growth + Live Progression)
                  ═════════════════════════════════════════════════════════════ */}
              {activeStage === "network" && (
                <div className="relative z-10 w-full flex flex-col items-center justify-center px-2 py-1 animate-in fade-in duration-300">
                  {/* Frame 00:05: Create / Service Catalog Menu (Simple, clean, no pink) */}
                  {networkStep === "create-menu" ? (
                    <div className="w-80 rounded-2xl bg-[#0e111a]/95 backdrop-blur-xl border border-white/[0.12] shadow-2xl p-3 flex flex-col gap-2 text-xs animate-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-1.5">
                          <Network className="w-3.5 h-3.5 text-zinc-300" />
                          <span className="font-semibold text-white text-[12px]">Service & Mesh Catalog</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500">VPC 10.0.0.0/16</span>
                      </div>

                      <div className="px-2.5 py-1.5 rounded-lg bg-[#07090e] border border-white/[0.06] text-zinc-400 text-[11px] flex items-center justify-between">
                        <span>Provision service or database...</span>
                        <Search className="w-3 h-3 text-zinc-600" />
                      </div>

                      <div className="flex flex-col gap-1 mt-0.5">
                        <div className="p-2 rounded-lg text-zinc-400 flex items-center justify-between text-[11px] hover:bg-white/[0.04]">
                          <div className="flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-zinc-400" />
                            <span>GitHub Repository</span>
                          </div>
                          <ChevronRight className="w-3 h-3 text-zinc-600" />
                        </div>

                        <div className="p-2 rounded-lg text-zinc-400 flex items-center justify-between text-[11px] hover:bg-white/[0.04]">
                          <div className="flex items-center gap-2">
                            <Server className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Docker Container / Microservice</span>
                          </div>
                          <ChevronRight className="w-3 h-3 text-zinc-600" />
                        </div>

                        {/* Highlighted Catalog Item clicked by user cursor (Clean simple styling, no pink) */}
                        <div className="p-2 rounded-xl bg-white/[0.08] border border-white/25 text-white font-medium flex items-center justify-between text-[11px] shadow-lg">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-white/[0.1] border border-white/20 flex items-center justify-center text-white">
                              <Database className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-white">Database & Mesh Conduits</span>
                                <span className="px-1 py-0.2 rounded text-[8px] bg-white/10 text-zinc-300 font-mono">Select</span>
                              </div>
                              <span className="text-[10px] text-zinc-400">Postgres 16 · Redis Cache · mTLS VPC</span>
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Frames 00:07 - 00:09: Multi-Node Topology Mesh Growing Step-by-Step like TopologyGraph */
                    <div className="relative w-full flex items-center justify-center overflow-hidden py-1">
                      <div
                        className="relative w-[840px] h-[340px] shrink-0 origin-center transition-transform duration-300 select-none"
                        style={{
                          transform: `scale(${Math.min(0.90, Math.max(0.38, (containerWidth - 32) / 840))})`,
                        }}
                      >
                        {/* ── SVG Ribbon Conduits & Flowing Traffic ── */}
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 840 340"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <defs>
                          <linearGradient id="mesh-active-glow" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
                          </linearGradient>
                          <filter id="mesh-blur" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2.5" result="blur" />
                          </filter>
                        </defs>

                        {/* Conduit 1: Edge Ingress -> Frontend (Revealed in Phase 2) */}
                        <path
                          d="M 152 170 C 185 170, 175 75, 210 75"
                          stroke="#10b981"
                          strokeWidth="4"
                          strokeOpacity={networkGrowthStep >= 2 ? 0.2 : 0}
                          filter="url(#mesh-blur)"
                          strokeDasharray="170"
                          strokeDashoffset={networkGrowthStep >= 2 ? 0 : 170}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        <path
                          d="M 152 170 C 185 170, 175 75, 210 75"
                          stroke="#10b981"
                          strokeWidth="1.5"
                          strokeOpacity={networkGrowthStep >= 2 ? 0.75 : 0}
                          strokeDasharray="170"
                          strokeDashoffset={networkGrowthStep >= 2 ? 0 : 170}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        {networkGrowthStep >= 2 && (
                          <circle r="2.5" fill="#34d399">
                            <animateMotion
                              path="M 152 170 C 185 170, 175 75, 210 75"
                              dur="2.2s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}

                        {/* Conduit 2: Edge Ingress -> Backend (Revealed in Phase 3) */}
                        <path
                          d="M 152 180 C 235 180, 310 180, 395 180"
                          stroke="#06b6d4"
                          strokeWidth="4"
                          strokeOpacity={networkGrowthStep >= 3 ? 0.2 : 0}
                          filter="url(#mesh-blur)"
                          strokeDasharray="260"
                          strokeDashoffset={networkGrowthStep >= 3 ? 0 : 260}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        <path
                          d="M 152 180 C 235 180, 310 180, 395 180"
                          stroke="#06b6d4"
                          strokeWidth="1.5"
                          strokeOpacity={networkGrowthStep >= 3 ? 0.75 : 0}
                          strokeDasharray="260"
                          strokeDashoffset={networkGrowthStep >= 3 ? 0 : 260}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        {networkGrowthStep >= 3 && (
                          <circle r="2.5" fill="#22d3ee">
                            <animateMotion
                              path="M 152 180 C 235 180, 310 180, 395 180"
                              dur="2.5s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}

                        {/* Conduit 3: Edge Ingress -> Admin Portal (Revealed in Phase 2) */}
                        <path
                          d="M 152 190 C 185 190, 175 285, 210 285"
                          stroke="#10b981"
                          strokeWidth="4"
                          strokeOpacity={networkGrowthStep >= 2 ? 0.2 : 0}
                          filter="url(#mesh-blur)"
                          strokeDasharray="170"
                          strokeDashoffset={networkGrowthStep >= 2 ? 0 : 170}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        <path
                          d="M 152 190 C 185 190, 175 285, 210 285"
                          stroke="#10b981"
                          strokeWidth="1.5"
                          strokeOpacity={networkGrowthStep >= 2 ? 0.75 : 0}
                          strokeDasharray="170"
                          strokeDashoffset={networkGrowthStep >= 2 ? 0 : 170}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        {networkGrowthStep >= 2 && (
                          <circle r="2.5" fill="#34d399">
                            <animateMotion
                              path="M 152 190 C 185 190, 175 285, 210 285"
                              dur="2.6s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}

                        {/* Conduit 4: Frontend -> Backend (Revealed in Phase 3) */}
                        <path
                          d="M 368 75 C 388 75, 375 165, 395 165"
                          stroke="#10b981"
                          strokeWidth="4"
                          strokeOpacity={networkGrowthStep >= 3 ? 0.2 : 0}
                          filter="url(#mesh-blur)"
                          strokeDasharray="130"
                          strokeDashoffset={networkGrowthStep >= 3 ? 0 : 130}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        <path
                          d="M 368 75 C 388 75, 375 165, 395 165"
                          stroke="#10b981"
                          strokeWidth="1.5"
                          strokeOpacity={networkGrowthStep >= 3 ? 0.8 : 0}
                          strokeDasharray="130"
                          strokeDashoffset={networkGrowthStep >= 3 ? 0 : 130}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        {networkGrowthStep >= 3 && (
                          <circle r="2.5" fill="#34d399">
                            <animateMotion
                              path="M 368 75 C 388 75, 375 165, 395 165"
                              dur="1.9s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}

                        {/* Conduit 5: Admin -> Backend (Revealed in Phase 3) */}
                        <path
                          d="M 368 285 C 388 285, 375 195, 395 195"
                          stroke="#10b981"
                          strokeWidth="4"
                          strokeOpacity={networkGrowthStep >= 3 ? 0.2 : 0}
                          filter="url(#mesh-blur)"
                          strokeDasharray="130"
                          strokeDashoffset={networkGrowthStep >= 3 ? 0 : 130}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        <path
                          d="M 368 285 C 388 285, 375 195, 395 195"
                          stroke="#10b981"
                          strokeWidth="1.5"
                          strokeOpacity={networkGrowthStep >= 3 ? 0.8 : 0}
                          strokeDasharray="130"
                          strokeDashoffset={networkGrowthStep >= 3 ? 0 : 130}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        {networkGrowthStep >= 3 && (
                          <circle r="2.5" fill="#34d399">
                            <animateMotion
                              path="M 368 285 C 388 285, 375 195, 395 195"
                              dur="2.3s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}

                        {/* Conduit 6: Backend -> Redis Cache (Revealed in Phase 4 - Clean simple dashed or solid cyan, NO pink) */}
                        <path
                          d="M 573 165 C 598 165, 595 75, 625 75"
                          stroke={networkStep === "unapplied" ? "rgba(255, 255, 255, 0.3)" : "#06b6d4"}
                          strokeWidth={networkStep === "unapplied" ? "2.5" : "4"}
                          strokeOpacity={networkGrowthStep >= 4 ? 0.25 : 0}
                          filter="url(#mesh-blur)"
                          strokeDasharray="130"
                          strokeDashoffset={networkGrowthStep >= 4 ? 0 : 130}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        <path
                          d="M 573 165 C 598 165, 595 75, 625 75"
                          stroke={networkStep === "unapplied" ? "rgba(255, 255, 255, 0.65)" : "#06b6d4"}
                          strokeWidth="1.5"
                          strokeDasharray={networkStep === "unapplied" ? "4 4" : "130"}
                          strokeDashoffset={networkStep === "unapplied" ? 0 : (networkGrowthStep >= 4 ? 0 : 130)}
                          strokeOpacity={networkGrowthStep >= 4 ? 0.9 : 0}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease, stroke 0.4s ease" }}
                        />
                        {networkStep === "applied" && networkGrowthStep >= 5 && (
                          <circle r="2.5" fill="#22d3ee">
                            <animateMotion
                              path="M 573 165 C 598 165, 595 75, 625 75"
                              dur="1.7s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}

                        {/* Conduit 7: Backend -> Neon Postgres DB (Revealed in Phase 4 - Clean simple dashed or solid emerald, NO pink) */}
                        <path
                          d="M 573 195 C 598 195, 595 285, 625 285"
                          stroke={networkStep === "unapplied" ? "rgba(255, 255, 255, 0.3)" : "#10b981"}
                          strokeWidth={networkStep === "unapplied" ? "2.5" : "4"}
                          strokeOpacity={networkGrowthStep >= 4 ? 0.25 : 0}
                          filter="url(#mesh-blur)"
                          strokeDasharray="130"
                          strokeDashoffset={networkGrowthStep >= 4 ? 0 : 130}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease" }}
                        />
                        <path
                          d="M 573 195 C 598 195, 595 285, 625 285"
                          stroke={networkStep === "unapplied" ? "rgba(255, 255, 255, 0.65)" : "#10b981"}
                          strokeWidth="1.5"
                          strokeDasharray={networkStep === "unapplied" ? "4 4" : "130"}
                          strokeDashoffset={networkStep === "unapplied" ? 0 : (networkGrowthStep >= 4 ? 0 : 130)}
                          strokeOpacity={networkGrowthStep >= 4 ? 0.95 : 0}
                          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke-opacity 0.4s ease, stroke 0.4s ease" }}
                        />
                        {networkStep === "applied" && networkGrowthStep >= 5 && (
                          <circle r="2.5" fill="#34d399">
                            <animateMotion
                              path="M 573 195 C 598 195, 595 285, 625 285"
                              dur="2.0s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}
                      </svg>

                      {/* ── Midpoint Cable Badges (Progressive Reveal) ── */}
                      {/* Frontend <-> Backend */}
                      <div
                        className="absolute left-[354px] top-[108px] -translate-x-1/2 pointer-events-none transition-all duration-500"
                        style={{
                          opacity: networkGrowthStep >= 3 ? 1 : 0,
                          transform: networkGrowthStep >= 3 ? "translate(-50%, 0) scale(1)" : "translate(-50%, 4px) scale(0.85)",
                        }}
                      >
                        <span className="px-1.5 py-0.5 rounded-full bg-[#0a0d14]/90 border border-emerald-500/30 text-[9px] font-mono text-emerald-300 shadow-md">
                          1,420 req/s · 18ms
                        </span>
                      </div>

                      {/* Admin <-> Backend */}
                      <div
                        className="absolute left-[354px] top-[228px] -translate-x-1/2 pointer-events-none transition-all duration-500"
                        style={{
                          opacity: networkGrowthStep >= 3 ? 1 : 0,
                          transform: networkGrowthStep >= 3 ? "translate(-50%, 0) scale(1)" : "translate(-50%, 4px) scale(0.85)",
                        }}
                      >
                        <span className="px-1.5 py-0.5 rounded-full bg-[#0a0d14]/90 border border-emerald-500/30 text-[9px] font-mono text-emerald-300 shadow-md">
                          Internal API · 420 req/s
                        </span>
                      </div>

                      {/* Backend <-> Redis (Clean simple styling, no pink) */}
                      <div
                        className="absolute left-[590px] top-[108px] -translate-x-1/2 pointer-events-none transition-all duration-500"
                        style={{
                          opacity: networkGrowthStep >= 4 ? 1 : 0,
                          transform: networkGrowthStep >= 4 ? "translate(-50%, 0) scale(1)" : "translate(-50%, 4px) scale(0.85)",
                        }}
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono shadow-md transition-all ${
                            networkStep === "unapplied"
                              ? "bg-[#0e111a] border border-white/20 text-zinc-300 animate-pulse"
                              : "bg-[#0a0d14]/90 border border-cyan-500/30 text-cyan-300"
                          }`}
                        >
                          {networkStep === "unapplied" ? "Pending Mesh" : "0.2ms · 99.8% hit"}
                        </span>
                      </div>

                      {/* Backend <-> DB (Clean simple styling, no pink) */}
                      <div
                        className="absolute left-[590px] top-[228px] -translate-x-1/2 pointer-events-none transition-all duration-500"
                        style={{
                          opacity: networkGrowthStep >= 4 ? 1 : 0,
                          transform: networkGrowthStep >= 4 ? "translate(-50%, 0) scale(1)" : "translate(-50%, 4px) scale(0.85)",
                        }}
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono shadow-md transition-all ${
                            networkStep === "unapplied"
                              ? "bg-[#0e111a] border border-white/20 text-zinc-300 animate-pulse"
                              : "bg-[#0a0d14]/90 border border-emerald-500/30 text-emerald-300"
                          }`}
                        >
                          {networkStep === "unapplied" ? "Pending DB Mesh" : "PgBouncer · 0.4ms pool"}
                        </span>
                      </div>

                      {/* ═════════════════════════════════════════════════════════
                          NODE 1: EDGE INGRESS (Sprouts in Phase 1)
                          ═════════════════════════════════════════════════════════ */}
                      <div
                        className="absolute left-[16px] top-[145px] w-[136px] p-2.5 rounded-xl bg-[#0e111a]/90 backdrop-blur border border-white/[0.12] shadow-xl hover:border-white/30 transition-all cursor-pointer group"
                        style={{
                          opacity: networkGrowthStep >= 1 ? 1 : 0,
                          transform: networkGrowthStep >= 1 ? "scale(1)" : "scale(0.85)",
                          transition: "opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                        onMouseEnter={() => setHoveredNetworkNode("edge-gateway")}
                        onMouseLeave={() => setHoveredNetworkNode(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                            <Globe className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] font-bold text-white whitespace-nowrap">edge-gateway</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                            </div>
                            <span className="text-[9px] text-zinc-400 block truncate">Anycast DNS</span>
                          </div>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[9px] font-mono text-zinc-400">
                          <span className="text-cyan-400">TLS 1.3</span>
                          <span>48.2k r/s</span>
                        </div>
                      </div>

                      {/* ═════════════════════════════════════════════════════════
                          NODE 2: FRONTEND CLIENT (Blooms in Phase 2)
                          ═════════════════════════════════════════════════════════ */}
                      <div
                        className="absolute left-[210px] top-[42px] w-[158px] p-2.5 rounded-xl bg-[#0e111a]/90 backdrop-blur border border-white/[0.12] shadow-xl hover:border-white/30 transition-all cursor-pointer group"
                        style={{
                          opacity: networkGrowthStep >= 2 ? 1 : 0,
                          transform: networkGrowthStep >= 2 ? "scale(1)" : "scale(0.85)",
                          transition: "opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                        onMouseEnter={() => setHoveredNetworkNode("app-frontend")}
                        onMouseLeave={() => setHoveredNetworkNode(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-white/[0.08] border border-white/[0.15] flex items-center justify-center text-white shrink-0 overflow-hidden">
                            <img
                              src="/images/frontend_icon.webp"
                              alt="Frontend"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none";
                              }}
                            />
                            <Rocket className="w-3.5 h-3.5 text-zinc-200" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] font-bold text-white whitespace-nowrap">app-frontend-web</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            </div>
                            <span className="text-[9px] text-zinc-400 block truncate">Next.js 16 SSR</span>
                          </div>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[9px] font-mono text-zinc-400">
                          <span className="text-emerald-400">18ms TTFB</span>
                          <span>Port 3000</span>
                        </div>
                      </div>

                      {/* ═════════════════════════════════════════════════════════
                          NODE 3: ADMIN PORTAL (Blooms in Phase 2)
                          ═════════════════════════════════════════════════════════ */}
                      <div
                        className="absolute left-[210px] top-[252px] w-[158px] p-2.5 rounded-xl bg-[#0e111a]/90 backdrop-blur border border-white/[0.12] shadow-xl hover:border-white/30 transition-all cursor-pointer group"
                        style={{
                          opacity: networkGrowthStep >= 2 ? 1 : 0,
                          transform: networkGrowthStep >= 2 ? "scale(1)" : "scale(0.85)",
                          transition: "opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                        onMouseEnter={() => setHoveredNetworkNode("admin-portal")}
                        onMouseLeave={() => setHoveredNetworkNode(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 overflow-hidden">
                            <img
                              src="/images/dashboard_icon.webp"
                              alt="Admin"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none";
                              }}
                            />
                            <LayoutGrid className="w-3.5 h-3.5 text-indigo-300" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] font-bold text-white whitespace-nowrap">admin-portal</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            </div>
                            <span className="text-[9px] text-zinc-400 block truncate">React 19 Admin</span>
                          </div>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[9px] font-mono text-zinc-400">
                          <span className="text-indigo-400">RBAC SSO</span>
                          <span>Internal</span>
                        </div>
                      </div>

                      {/* ═════════════════════════════════════════════════════════
                          NODE 4: CORE BACKEND (Blooms in Phase 3)
                          ═════════════════════════════════════════════════════════ */}
                      <div
                        className="absolute left-[395px] top-[140px] w-[178px] p-3 rounded-xl bg-[#111420]/95 backdrop-blur border border-white/[0.18] shadow-2xl hover:border-emerald-500/50 transition-all cursor-pointer group z-10"
                        style={{
                          opacity: networkGrowthStep >= 3 ? 1 : 0,
                          transform: networkGrowthStep >= 3 ? "scale(1)" : "scale(0.85)",
                          transition: "opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                        onMouseEnter={() => setHoveredNetworkNode("app-backend")}
                        onMouseLeave={() => setHoveredNetworkNode(null)}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-white whitespace-nowrap">app-backend-go</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                            </div>
                            <span className="text-[10px] text-zinc-400 block truncate">Gin API Cluster</span>
                          </div>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[9px] font-mono">
                          <span className="text-emerald-400 font-semibold">1,840 req/s</span>
                          <span className="text-zinc-400">14ms p99</span>
                        </div>
                      </div>

                      {/* ═════════════════════════════════════════════════════════
                          NODE 5: REDIS CACHE & QUEUE LAYER (Sprouts in Phase 4 - Clean, no pink)
                          ═════════════════════════════════════════════════════════ */}
                      <div
                        className={`absolute left-[625px] top-[42px] w-[156px] p-2.5 rounded-xl backdrop-blur transition-all cursor-pointer group ${
                          networkStep === "unapplied"
                            ? "bg-[#0e111a]/90 border border-white/20 shadow-xl"
                            : "bg-[#0e111a]/90 border border-white/[0.12] shadow-xl hover:border-white/30"
                        }`}
                        style={{
                          opacity: networkGrowthStep >= 4 ? 1 : 0,
                          transform: networkGrowthStep >= 4 ? "scale(1)" : "scale(0.85)",
                          transition: "opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                        onMouseEnter={() => setHoveredNetworkNode("redis-cache")}
                        onMouseLeave={() => setHoveredNetworkNode(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${
                              networkStep === "unapplied"
                                ? "bg-white/[0.08] text-white border border-white/15"
                                : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                            }`}
                          >
                            <img
                              src="/images/redis_cache.webp"
                              alt="Redis"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none";
                              }}
                            />
                            <Database className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] font-bold text-white whitespace-nowrap">redis-cache</span>
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  networkStep === "unapplied" ? "bg-zinc-400 animate-pulse" : "bg-emerald-400"
                                }`}
                              />
                            </div>
                            <span className="text-[9px] text-zinc-400 block truncate">Redis 7.2 & BullMQ</span>
                          </div>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[9px] font-mono">
                          {networkStep === "unapplied" ? (
                            <>
                              <span className="text-zinc-300 font-semibold">New Service</span>
                              <span className="text-zinc-500">Unapplied</span>
                            </>
                          ) : (
                            <>
                              <span className="text-cyan-400">99.8% hit</span>
                              <span className="text-zinc-400">0.2ms</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ═════════════════════════════════════════════════════════
                          NODE 6: PRIMARY POSTGRES DATABASE (Sprouts in Phase 4 - Clean, no pink)
                          ═════════════════════════════════════════════════════════ */}
                      <div
                        className={`absolute left-[625px] top-[252px] w-[164px] p-2.5 rounded-xl backdrop-blur transition-all cursor-pointer group z-10 ${
                          networkStep === "unapplied"
                            ? "bg-[#0e111a]/90 border border-white/20 shadow-xl"
                            : "bg-[#0e111a]/90 border border-white/[0.12] shadow-xl hover:border-emerald-500/40"
                        } ${hoveredNetworkNode === "neon-postgres" ? "ring-2 ring-emerald-500/50 shadow-emerald-500/20" : ""}`}
                        style={{
                          opacity: networkGrowthStep >= 4 ? 1 : 0,
                          transform: networkGrowthStep >= 4 ? "scale(1)" : "scale(0.85)",
                          transition: "opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                        onMouseEnter={() => setHoveredNetworkNode("neon-postgres")}
                        onMouseLeave={() => setHoveredNetworkNode(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                              networkStep === "unapplied"
                                ? "bg-white/[0.08] text-white border border-white/15 font-bold text-[10px]"
                                : "bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[10px]"
                            }`}
                          >
                            🐘
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] font-bold text-white whitespace-nowrap">neon-postgres</span>
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  networkStep === "unapplied" ? "bg-zinc-400 animate-pulse" : "bg-emerald-400"
                                }`}
                              />
                            </div>
                            <span className="text-[9px] text-zinc-400 block truncate">PostgreSQL 16</span>
                          </div>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[9px] font-mono">
                          {networkStep === "unapplied" ? (
                            <>
                              <span className="text-zinc-300 font-semibold">New Service</span>
                              <span className="text-zinc-500">Unapplied</span>
                            </>
                          ) : (
                            <>
                              <span className="text-emerald-400">12,500 IOPS</span>
                              <span className="text-zinc-400">0.4ms pool</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ═════════════════════════════════════════════════════════
                          TELEMETRY INSPECTION POPOVER (Hovered Node Stats)
                          ═════════════════════════════════════════════════════════ */}
                      {(hoveredNetworkNode === "neon-postgres" || (networkStep === "applied" && hoveredNetworkNode === "neon-postgres")) && (
                        <div className="absolute left-[540px] top-[148px] w-64 p-3 rounded-xl bg-[#0b0e17]/95 backdrop-blur-xl border border-emerald-500/30 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                            <div className="flex items-center gap-1.5">
                              <Database className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="font-mono text-xs font-bold text-white">neon-postgres-primary</span>
                            </div>
                            <span className="px-1.5 py-0.2 rounded text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                              Active mTLS
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                            <div>
                              <span className="text-zinc-500 block text-[9px]">ENGINE</span>
                              <span className="font-mono text-zinc-200 font-medium">PostgreSQL 16.2</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block text-[9px]">STORAGE</span>
                              <span className="font-mono text-zinc-200 font-medium">14.8 GB (Auto)</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block text-[9px]">CONNECTION POOL</span>
                              <span className="font-mono text-emerald-400 font-medium">12 / 50 (PgBouncer)</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block text-[9px]">LATENCY</span>
                              <span className="font-mono text-emerald-400 font-medium">0.4ms VPC</span>
                            </div>
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[9px] text-zinc-400">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <Shield className="w-2.5 h-2.5" />
                              <span>TLS_AES_256_GCM</span>
                            </span>
                            <span className="text-zinc-500 font-mono">7-Day PITR</span>
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  STAGE 3: SCALE — DEEP MULTI-POD & DATABASE AUTOSCALING
                  ═════════════════════════════════════════════════════════════ */}
              {activeStage === "scale" && (
                <div className="relative z-10 w-full max-w-4xl px-2 py-1 sm:px-4 flex flex-col gap-2.5 animate-in fade-in duration-300">
                  {/* Top Live Dual Cluster Telemetry Strip */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {/* Backend Cluster Telemetry Card */}
                    <div className="p-3.5 rounded-xl border border-white/[0.08] bg-[#0d1017]/90 backdrop-blur shadow-xl transition-all duration-300">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                              scaleStep === "surge-alert"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            <Cpu className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-white">app-backend-go</span>
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  scaleStep === "surge-alert" ? "bg-red-400 animate-ping" : "bg-emerald-400"
                                }`}
                              />
                            </div>
                            <span className="text-[9.5px] text-zinc-400 font-mono">
                              {scaleStep === "surge-alert" ? "Single Node · us-east-1a" : "Multi-AZ Cluster (3 AZs)"}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                            scaleStep === "surge-alert"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : scaleStep === "provisioning-mesh"
                              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 animate-pulse"
                              : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          }`}
                        >
                          {scaleStep === "surge-alert"
                            ? "94.8% CPU (THROTTLING)"
                            : scaleStep === "stabilized-success"
                            ? "24.2% CPU (HEALTHY)"
                            : "RE-BALANCING LOAD"}
                        </span>
                      </div>

                      {/* Gauges & Metrics */}
                      <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                        <div className="p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                          <span className="text-[8.5px] font-mono uppercase text-zinc-500 block">CPU USAGE</span>
                          <span
                            className={`font-mono font-bold text-xs mt-0.5 block ${
                              scaleStep === "surge-alert" ? "text-red-400" : "text-emerald-400"
                            }`}
                          >
                            {scaleStep === "surge-alert"
                              ? "94.8%"
                              : scaleStep === "stabilized-success"
                              ? "24.2%"
                              : "48.0% ↓"}
                          </span>
                          <span className="text-[8px] text-zinc-500 font-mono">
                            {scaleStep === "stabilized-success" ? "8 vCPU EPYC" : "4 vCPU Std"}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                          <span className="text-[8.5px] font-mono uppercase text-zinc-500 block">LATENCY (P99)</span>
                          <span
                            className={`font-mono font-bold text-xs mt-0.5 block ${
                              scaleStep === "surge-alert" ? "text-red-400" : "text-emerald-400"
                            }`}
                          >
                            {scaleStep === "surge-alert"
                              ? "420ms"
                              : scaleStep === "stabilized-success"
                              ? "11ms"
                              : "84ms ↓"}
                          </span>
                          <span className="text-[8px] text-zinc-500 font-mono">
                            {scaleStep === "surge-alert" ? "+3,800% Spike" : "-97% Restored"}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                          <span className="text-[8.5px] font-mono uppercase text-zinc-500 block">CONTAINER PODS</span>
                          <span
                            className={`font-mono font-bold text-xs mt-0.5 block ${
                              scaleStep === "stabilized-success" ? "text-white" : "text-zinc-300"
                            }`}
                          >
                            {scaleStep === "surge-alert" ? "1 Pod" : "3 Pods"}
                          </span>
                          <span className="text-[8px] text-zinc-500 font-mono">
                            {scaleStep === "stabilized-success" ? "Load Balanced" : "No Failover"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Database Cluster Telemetry Card */}
                    <div className="p-3.5 rounded-xl border border-white/[0.08] bg-[#0d1017]/90 backdrop-blur shadow-xl transition-all duration-300">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 font-bold text-xs">
                            🐘
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-white">neon-postgres</span>
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  scaleStep === "surge-alert" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                                }`}
                              />
                            </div>
                            <span className="text-[9.5px] text-zinc-400 font-mono">
                              {scaleStep === "stabilized-success" ? "Primary + 1 Read Replica (HA)" : "Standalone PgBouncer"}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                            scaleStep === "surge-alert"
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              : scaleStep === "provisioning-mesh"
                              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 animate-pulse"
                              : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          }`}
                        >
                          {scaleStep === "surge-alert"
                            ? "POOL SATURATED (48/50)"
                            : scaleStep === "stabilized-success"
                            ? "POOL HEALTHY (48/200)"
                            : "SYNCING REPLICA"}
                        </span>
                      </div>

                      {/* Gauges & Metrics */}
                      <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                        <div className="p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                          <span className="text-[8.5px] font-mono uppercase text-zinc-500 block">CONN POOL</span>
                          <span
                            className={`font-mono font-bold text-xs mt-0.5 block ${
                              scaleStep === "surge-alert" ? "text-amber-400" : "text-emerald-400"
                            }`}
                          >
                            {scaleStep === "surge-alert" ? "96% (48/50)" : "24% (48/200)"}
                          </span>
                          <span className="text-[8px] text-zinc-500 font-mono">
                            {scaleStep === "surge-alert" ? "Starvation Alert" : "PgBouncer Boosted"}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                          <span className="text-[8.5px] font-mono uppercase text-zinc-500 block">REPLICATION</span>
                          <span
                            className={`font-mono font-bold text-xs mt-0.5 block ${
                              scaleStep === "stabilized-success" ? "text-emerald-400" : "text-zinc-400"
                            }`}
                          >
                            {scaleStep === "stabilized-success" ? "0.1ms Lag" : "Disabled"}
                          </span>
                          <span className="text-[8px] text-zinc-500 font-mono">
                            {scaleStep === "stabilized-success" ? "WAL Streaming" : "Single Primary"}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                          <span className="text-[8.5px] font-mono uppercase text-zinc-500 block">QUERY LATENCY</span>
                          <span className="font-mono font-bold text-xs text-emerald-400 mt-0.5 block">
                            {scaleStep === "stabilized-success" ? "0.2ms RO" : "0.4ms RW"}
                          </span>
                          <span className="text-[8px] text-zinc-500 font-mono">Read/Write Split</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Sub-Stage Body Panes ── */}
                  {/* PANE 1: Surge Alert & Remediation Call-to-Action */}
                  {scaleStep === "surge-alert" && (
                    <div className="w-full rounded-2xl bg-[#0a0c13] border border-white/[0.08] p-4 flex flex-col gap-3 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                              <span>Ingress Surge Detected: CPU &amp; Connection Bottleneck</span>
                              <span className="px-1.5 py-0.2 rounded text-[8px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
                                HOT SPOT
                              </span>
                            </h4>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              Traffic scaled from 420 req/s → 2,420 req/s. Current 1-pod configuration is failing healthchecks.
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center gap-2 self-start sm:self-auto shrink-0"
                        >
                          <Zap className="w-3.5 h-3.5 text-zinc-950" />
                          <span>Configure Sizing &amp; Scale Out</span>
                        </button>
                      </div>

                      {/* Real Flame Waveform Chart showing the spike */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-[#0d1017] border border-white/[0.08] flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                            <span className="text-red-400 font-semibold flex items-center gap-1">
                              <Flame className="w-3 h-3 text-red-400" />
                              <span>Backend CPU Flame Waveform (94.8%)</span>
                            </span>
                            <span className="text-zinc-500">Threshold: 80%</span>
                          </div>
                          <div className="h-16 mt-2 relative">
                            <svg className="w-full h-full" viewBox="0 0 200 60" preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="surgeCpuGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.10" />
                                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <line
                                x1="0"
                                y1="18"
                                x2="200"
                                y2="18"
                                stroke="#ef4444"
                                strokeDasharray="3 3"
                                strokeOpacity="0.5"
                              />
                              <polygon
                                points="0,52 20,50 40,48 60,49 80,45 100,38 120,24 140,14 160,8 180,5 200,4 200,60 0,60"
                                fill="url(#surgeCpuGrad)"
                              />
                              <path
                                d="M0,52 L20,50 L40,48 L60,49 L80,45 L100,38 L120,24 L140,14 L160,8 L180,5 L200,4"
                                fill="none"
                                stroke="#ef4444"
                                strokeWidth="2"
                              />
                            </svg>
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-1">
                            <span>T-5m (28% CPU)</span>
                            <span className="text-red-400 font-bold">T-Now (94.8% Saturated)</span>
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-[#0d1017] border border-white/[0.08] flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                            <span className="text-amber-400 font-semibold flex items-center gap-1">
                              <Database className="w-3 h-3 text-amber-400" />
                              <span>Database PgBouncer Pool Starvation</span>
                            </span>
                            <span className="text-zinc-500">Max: 50 conns</span>
                          </div>
                          <div className="h-16 mt-2 flex flex-col justify-center gap-1.5 font-mono text-[9.5px]">
                            <div className="flex justify-between text-zinc-400">
                              <span>Active Transactions:</span>
                              <span className="text-amber-400 font-bold">48 / 50 (96%)</span>
                            </div>
                            <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full w-[96%]" />
                            </div>
                            <div className="text-[8.5px] text-zinc-500">
                              Incoming write locks stalling query dispatch · WAL queue backing up.
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-1">
                            <span>Recommended: Read-Replica offload</span>
                            <span className="text-emerald-400">+150 Pool Capacity</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PANE 2: Deep Infrastructure Sizing & Auto-Scale Policy Console */}
                  {scaleStep === "configure-scaling" && (
                    <div className="w-full rounded-2xl bg-[#0a0c13] border border-white/[0.12] p-4 flex flex-col gap-3 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                      <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
                        <div>
                          <h4 className="text-xs font-bold text-white flex items-center gap-2">
                            <Sliders className="w-3.5 h-3.5 text-zinc-300" />
                            <span>Cluster Sizing &amp; Auto-Scale Policy</span>
                          </h4>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            Dynamically provision dedicated vCPU tiers and multi-AZ container replicas
                          </p>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Zero-Downtime Hot Swap
                        </span>
                      </div>

                      {/* 3 Interactive Sizing Controls */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Control 1: Compute Tier */}
                        <div className="p-3 rounded-xl bg-[#0e111a] border border-white/[0.08] flex flex-col gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                            1. VERTICAL COMPUTE POWER
                          </span>
                          <div className="flex flex-col gap-1.5 mt-0.5">
                            <div className="p-2 rounded-lg bg-black/40 border border-white/[0.05] flex items-center justify-between text-[10px] text-zinc-400">
                              <span>4 vCPU · 8 GB RAM</span>
                              <span className="text-zinc-600">Current</span>
                            </div>
                            <div className="p-2 rounded-lg bg-white/[0.08] border border-white/30 flex items-center justify-between text-[10.5px] text-white font-bold shadow-sm">
                              <div className="flex items-center gap-1.5">
                                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                                <span>8 vCPU · 16 GB Dedicated</span>
                              </div>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                            <span className="text-[8.5px] text-zinc-500 font-mono">AMD EPYC 9654 · 3.7 GHz Turbo</span>
                          </div>
                        </div>

                        {/* Control 2: Horizontal Scale (Replicas) */}
                        <div className="p-3 rounded-xl bg-[#0e111a] border border-white/[0.08] flex flex-col gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                            2. HORIZONTAL CONTAINER PODS
                          </span>
                          <div className="flex flex-col justify-between flex-1 gap-1.5 mt-0.5">
                            <div className="p-2 rounded-lg bg-white/[0.08] border border-white/20 flex items-center justify-between text-xs text-white">
                              <span className="text-zinc-400 text-[10px]">Target Replicas:</span>
                              <div className="flex items-center gap-2 font-mono font-bold">
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  3 Pods
                                </span>
                              </div>
                            </div>
                            <div className="text-[9px] font-mono text-zinc-400 space-y-0.5">
                              <p>• AZ-1: us-east-1a (Active Primary)</p>
                              <p>• AZ-2: us-east-1b (Ingress Mesh)</p>
                              <p>• AZ-3: us-east-1c (Failover Spare)</p>
                            </div>
                          </div>
                        </div>

                        {/* Control 3: Database HA Read Replica */}
                        <div className="p-3 rounded-xl bg-[#0e111a] border border-white/[0.08] flex flex-col gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                            3. DATABASE HIGH AVAILABILITY
                          </span>
                          <div className="flex flex-col justify-between flex-1 gap-1.5 mt-0.5">
                            <div className="p-2 rounded-lg bg-white/[0.08] border border-white/20 flex items-center justify-between text-xs text-white">
                              <span className="text-zinc-300 text-[10px] font-semibold">Neon Read-Replica:</span>
                              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                                ENABLED ✓
                              </span>
                            </div>
                            <div className="text-[9px] font-mono text-zinc-400 space-y-0.5">
                              <p>• Offload SELECT queries to Replica</p>
                              <p>• Pool Size: Boosted 50 → 200 conns</p>
                              <p>• Replication Lag: &lt; 0.2ms WAL</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Action Bar */}
                      <div className="pt-2 flex items-center justify-between border-t border-white/[0.06] text-xs">
                        <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Estimated cluster throughput capacity: 12,000 req/s (+495%)</span>
                        </div>
                        <button
                          type="button"
                          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.25)]"
                        >
                          <Zap className="w-3.5 h-3.5 text-zinc-950" />
                          <span>Apply Sizing &amp; Scale Out (Zero Downtime)</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* PANE 3: Rolling Rollout & Container Orchestration Matrix */}
                  {scaleStep === "provisioning-mesh" && (
                    <div className="w-full rounded-2xl bg-[#0a0c13] border border-white/[0.08] p-4 flex flex-col gap-3 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          <div>
                            <h4 className="text-xs font-bold text-white font-mono">
                              Rolling Scale Out Orchestration (#scale-run-482)
                            </h4>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              Spinning up dedicated 8 vCPU containers across multi-AZ and syncing DB replica
                            </p>
                          </div>
                        </div>
                        <span className="text-[9.5px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 animate-pulse">
                          PROVISIONING (68%)
                        </span>
                      </div>

                      {/* 4 Pod / DB Live Rolling Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[10.5px]">
                        <div className="p-2.5 rounded-xl bg-[#0d1017] border border-white/[0.08] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-white font-bold">pod-backend-01 (us-east-1a)</span>
                          </div>
                          <span className="text-emerald-400 text-[9px]">Rebalancing Traffic...</span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#0d1017] border border-white/[0.08] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                            <span className="text-white font-bold">pod-backend-02 (us-east-1b)</span>
                          </div>
                          <span className="text-cyan-300 text-[9px]">Healthy (1.1s) ✓</span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#0d1017] border border-white/[0.08] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                            <span className="text-white font-bold">pod-backend-03 (us-east-1c)</span>
                          </div>
                          <span className="text-cyan-300 text-[9px]">Ingress Ready (1.3s) ✓</span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#0d1017] border border-white/[0.08] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                            <span className="text-white font-bold">neon-postgres-ro-01</span>
                          </div>
                          <span className="text-blue-300 text-[9px]">WAL Stream Synced ✓</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden mt-1">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full w-[82%] animate-pulse" />
                      </div>
                    </div>
                  )}

                  {/* PANE 4: Stabilized Multi-Pod Balanced Architecture */}
                  {scaleStep === "stabilized-success" && (
                    <div className="w-full rounded-2xl bg-[#0a0c13] border border-white/[0.08] p-4 flex flex-col gap-3 shadow-2xl animate-in fade-in zoom-in-95 duration-400">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                              <span>Cluster Auto-Scaled &amp; Replicas Active</span>
                              <span className="px-1.5 py-0.2 rounded text-[8.5px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                3/3 HEALTHY
                              </span>
                            </h4>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              Load evenly dispersed across 3 multi-AZ instances · Latency normalized to 11ms
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/[0.04] text-emerald-400 border border-white/10 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            ANYCAST MESH BALANCED
                          </span>
                        </div>
                      </div>

                      {/* 3 Pods Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="p-3 rounded-xl bg-[#0d1017] border border-white/[0.08] flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-white text-[11px]">pod-backend-01</span>
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Healthy</span>
                          </div>
                          <div className="text-[9.5px] font-mono text-zinc-400 space-y-0.5 mt-1">
                            <div className="flex justify-between"><span>Zone:</span><span className="text-white">us-east-1a</span></div>
                            <div className="flex justify-between"><span>CPU Load:</span><span className="text-emerald-400 font-bold">24.1%</span></div>
                            <div className="flex justify-between"><span>Traffic:</span><span className="text-zinc-200">810 req/s</span></div>
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-[#0d1017] border border-white/[0.08] flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-white text-[11px]">pod-backend-02</span>
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Healthy</span>
                          </div>
                          <div className="text-[9.5px] font-mono text-zinc-400 space-y-0.5 mt-1">
                            <div className="flex justify-between"><span>Zone:</span><span className="text-white">us-east-1b</span></div>
                            <div className="flex justify-between"><span>CPU Load:</span><span className="text-emerald-400 font-bold">23.8%</span></div>
                            <div className="flex justify-between"><span>Traffic:</span><span className="text-zinc-200">795 req/s</span></div>
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-[#0d1017] border border-white/[0.08] flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-white text-[11px]">pod-backend-03</span>
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Healthy</span>
                          </div>
                          <div className="text-[9.5px] font-mono text-zinc-400 space-y-0.5 mt-1">
                            <div className="flex justify-between"><span>Zone:</span><span className="text-white">us-east-1c</span></div>
                            <div className="flex justify-between"><span>CPU Load:</span><span className="text-emerald-400 font-bold">24.7%</span></div>
                            <div className="flex justify-between"><span>Traffic:</span><span className="text-zinc-200">815 req/s</span></div>
                          </div>
                        </div>
                      </div>

                      {/* Database Split Summary */}
                      <div className="p-2.5 rounded-xl bg-[#0d1017] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10.5px] font-mono">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Database className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-white font-semibold">Neon DB HA Tier:</span>
                          <span className="text-zinc-400">Primary (Write) + Read-Replica (WAL 0.1ms)</span>
                        </div>
                        <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                          <Check className="w-3 h-3" />
                          <span>24% Total Pool Load (48 / 200)</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  STAGE 4: MONITOR — 5 DEEP OBSERVABILITY GRAPHS + ARCHITECTURE DISCOVERY
                  ═════════════════════════════════════════════════════════════ */}
              {activeStage === "monitor" && (
                <div className="relative z-10 w-full h-full flex flex-col justify-between p-2 sm:p-4 overflow-hidden animate-in fade-in duration-300">
                  {/* ── OBSERVABILITY TAB VIEW: 5 Real Production Telemetry & Analytics Graphs ── */}
                  {activeHeaderTab === "Observability" ? (
                    <div className="w-full flex-1 flex flex-col gap-2.5 font-sans overflow-y-auto max-h-[580px] pr-1 select-none">
                      {/* Sub-header Toolbar styled after Railway / Infrastructure */}
                      <div className="flex items-center justify-between pb-1.5 text-xs border-b border-white/[0.06] shrink-0 font-sans">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#131520] border border-white/[0.08] text-zinc-200 text-[11px] hover:border-white/20 transition-colors"
                          >
                            <Clock className="w-3 h-3 text-zinc-400" />
                            <span>Last 15 min</span>
                            <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
                          </button>

                          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#131520] border border-white/[0.08] text-zinc-300 text-[11px]">
                            <Sliders className="w-2.5 h-2.5 text-zinc-400" />
                            <span>Group by Pod</span>
                          </div>

                          <div className="hidden md:flex items-center gap-1 text-[10.5px] text-zinc-400 pl-2">
                            <span className="text-zinc-500 font-sans">Project:</span>
                            <span className="text-zinc-200 font-medium">gravy-truck</span>
                            <span className="text-zinc-600">/</span>
                            <span className="text-zinc-300 font-mono text-[10px]">prod-us-east-1</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>1s Live stream telemetry</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-200 border border-white/[0.1] text-[10px] font-medium flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            <span>2 Active Alerts</span>
                          </span>
                        </div>
                      </div>

                      {/* ── 5 PRODUCTION TELEMETRY GRAPHS GRID ── */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 w-full">
                        {/* ── GRAPH 1: Average CPU Utilization (Across All Instances) ── */}
                        <div className="p-3.5 rounded-xl bg-[#0b0c10] border border-white/[0.08] hover:border-white/[0.14] transition-colors flex flex-col justify-between shadow-xl relative overflow-hidden group">
                          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/[0.04]">
                            <div className="flex items-center gap-2">
                              <Cpu className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                              <div className="flex flex-col">
                                <span className="font-medium text-white text-[12px] tracking-tight">Average CPU Utilization</span>
                                <span className="text-[10px] text-zinc-400 font-normal">Across all instances</span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-200 border border-white/[0.1] text-[9.5px] font-mono flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              <span>98.4% PEAK</span>
                            </span>
                          </div>

                          {/* Multi-Pod Legend with white/zinc text, color limited to tiny swatch */}
                          <div className="flex flex-wrap items-center gap-2.5 text-[9.5px] text-zinc-300 py-1.5 font-sans">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-[2px] rounded-full bg-[#ef4444]" />
                              <span className="text-zinc-200 font-mono text-[9px]">srv-dalepnmk...-backend</span>
                              <span className="text-white font-mono text-[9px] font-medium">(98%)</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-[2px] rounded-full bg-[#3b82f6]" />
                              <span className="text-zinc-400 font-mono text-[9px]">postgres-0</span>
                              <span className="text-zinc-300 font-mono text-[9px]">(14%)</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-[2px] rounded-full bg-[#22c55e]" />
                              <span className="text-zinc-400 font-mono text-[9px]">gateway</span>
                              <span className="text-zinc-300 font-mono text-[9px]">(8%)</span>
                            </span>
                          </div>

                          {/* Chart Body with Thin Vector Stroke & Gradient Fill */}
                          <div className="relative w-full flex-1 flex items-stretch min-h-[92px]">
                            <div className="flex-1 relative h-full">
                              <svg className="w-full h-full" viewBox="0 0 240 85" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="cpuGraphGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.28" />
                                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                {/* Cartesian Grid Lines */}
                                <line x1="0" y1="12" x2="240" y2="12" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="30" x2="240" y2="30" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="48" x2="240" y2="48" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="66" x2="240" y2="66" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="82" x2="240" y2="82" stroke="#323644" strokeWidth="0.8" />

                                {/* 80% ceiling line with subtle neutral label */}
                                <line x1="0" y1="26" x2="240" y2="26" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.8" />
                                <text x="6" y="22" fill="#d4d4d8" fontSize="7.5" fontFamily="sans-serif">Ceiling (80%)</text>

                                {/* postgres calm blue line (thin 1px) */}
                                <path
                                  d="M0,72 L25,71 L50,73 L75,70 L100,72 L125,71 L150,70 L175,72 L200,71 L225,70 L240,71"
                                  fill="none"
                                  stroke="#3b82f6"
                                  strokeWidth="1"
                                />
                                {/* gateway green line (thin 1px) */}
                                <path
                                  d="M0,76 L30,75 L60,76 L90,75 L120,77 L150,75 L180,74 L210,75 L240,76"
                                  fill="none"
                                  stroke="#22c55e"
                                  strokeWidth="1"
                                />

                                {/* backend thin red curve spiking up with inner glow fill */}
                                <polygon
                                  points="0,68 20,66 40,68 60,65 80,62 100,56 120,50 140,40 160,32 175,44 185,26 200,20 215,16 230,12 240,11 240,82 0,82"
                                  fill="url(#cpuGraphGrad)"
                                />
                                <path
                                  d="M0,68 L20,66 L40,68 L60,65 L80,62 L100,56 L120,50 L140,40 L160,32 L175,44 L185,26 L200,20 L215,16 L230,12 L240,11"
                                  fill="none"
                                  stroke="#ef4444"
                                  strokeWidth="1.2"
                                />
                                <circle cx="240" cy="11" r="2.5" fill="#ef4444" className="animate-pulse" />
                              </svg>
                            </div>

                            {/* Right Y-Axis: crisp neutral white/zinc numbers */}
                            <div className="w-9 flex flex-col justify-between text-[8.5px] text-zinc-400 font-mono pl-1 select-none text-right">
                              <span className="text-zinc-300">100%</span>
                              <span>75%</span>
                              <span>50%</span>
                              <span>25%</span>
                              <span>0%</span>
                            </div>
                          </div>

                          <div className="flex justify-between text-[8px] text-zinc-400 pt-1.5 border-t border-white/[0.04] font-mono">
                            <span>08:28 PM</span>
                            <span>10:31 PM</span>
                            <span>12:28 AM</span>
                            <span>02:31 AM</span>
                            <span>04:32 AM</span>
                          </div>
                        </div>

                        {/* ── GRAPH 2: Real User Monitoring (RUM) & Web Vitals (Matching Screenshot 2026-09-18 214529.png) ── */}
                        <div className="p-3.5 rounded-xl bg-[#0b0c10] border border-white/[0.08] hover:border-white/[0.14] transition-colors flex flex-col justify-between shadow-xl relative overflow-hidden group col-span-1 md:col-span-1 lg:col-span-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-white/[0.04] gap-1.5">
                            <div className="flex items-center gap-2">
                              <Layout className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                              <div>
                                <span className="font-medium text-white text-[12px] tracking-tight">Real User Monitoring (RUM)</span>
                                <span className="text-[10px] text-zinc-400 font-normal ml-2">Web Vitals &amp; Session Telemetry</span>
                              </div>
                            </div>

                            {/* 5 Web Vital Badges: Clean White/Zinc Numbers with Status Indicator */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                              <div className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] flex items-center gap-1.5 text-[8.5px]">
                                <span className="text-zinc-400 font-medium">LCP</span>
                                <span className="text-white font-mono font-medium">2160ms</span>
                                <span className="text-emerald-400 text-[8px]">Good</span>
                              </div>
                              <div className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] flex items-center gap-1.5 text-[8.5px]">
                                <span className="text-zinc-400 font-medium">INP</span>
                                <span className="text-white font-mono font-medium">10ms</span>
                                <span className="text-emerald-400 text-[8px]">Good</span>
                              </div>
                              <div className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] flex items-center gap-1.5 text-[8.5px]">
                                <span className="text-zinc-400 font-medium">CLS</span>
                                <span className="text-white font-mono font-medium">0.007</span>
                                <span className="text-emerald-400 text-[8px]">Good</span>
                              </div>
                              <div className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] hidden sm:flex items-center gap-1.5 text-[8.5px]">
                                <span className="text-zinc-400 font-medium">FCP</span>
                                <span className="text-white font-mono font-medium">1092ms</span>
                              </div>
                              <div className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] hidden sm:flex items-center gap-1.5 text-[8.5px]">
                                <span className="text-zinc-400 font-medium">TTFB</span>
                                <span className="text-white font-mono font-medium">79ms</span>
                              </div>
                            </div>
                          </div>

                          {/* Chart Body with Dual Y-Axis and Realistic Tooltip Card */}
                          <div className="relative w-full flex-1 flex items-stretch min-h-[92px] pt-1">
                            {/* Left Y-Axis: Clean neutral white/zinc numbers */}
                            <div className="w-11 flex flex-col justify-between text-[8px] text-zinc-400 font-mono pr-1 select-none text-left">
                              <span>3600ms</span>
                              <span>2700ms</span>
                              <span>1800ms</span>
                              <span>900ms</span>
                              <span>0ms</span>
                            </div>

                            {/* Chart Viewport */}
                            <div className="flex-1 relative h-full">
                              <svg className="w-full h-full" viewBox="0 0 320 85" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="lcpGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                {/* Cartesian Grid Lines */}
                                <line x1="0" y1="12" x2="320" y2="12" stroke="#222530" strokeWidth="0.8" strokeDasharray="3 3" />
                                <line x1="0" y1="30" x2="320" y2="30" stroke="#222530" strokeWidth="0.8" strokeDasharray="3 3" />
                                <line x1="0" y1="48" x2="320" y2="48" stroke="#222530" strokeWidth="0.8" strokeDasharray="3 3" />
                                <line x1="0" y1="66" x2="320" y2="66" stroke="#222530" strokeWidth="0.8" strokeDasharray="3 3" />
                                <line x1="0" y1="82" x2="320" y2="82" stroke="#323644" strokeWidth="0.8" />

                                {/* CLS Yellow Line (Thin 1px) */}
                                <line x1="0" y1="80" x2="320" y2="80" stroke="#eab308" strokeWidth="1" />
                                <circle cx="160" cy="80" r="2" fill="#eab308" />

                                {/* INP Blue Line (Thin 1px) */}
                                <line x1="0" y1="78" x2="320" y2="78" stroke="#3b82f6" strokeWidth="1" />
                                <circle cx="240" cy="78" r="2" fill="#3b82f6" />

                                {/* LCP Green Curve: Thin 1.2px Line with Inner Area Glow */}
                                <polygon
                                  points="0,62 80,54 160,42 240,30 300,20 320,18 320,82 0,82"
                                  fill="url(#lcpGrad)"
                                />
                                <path
                                  d="M0,62 L80,54 L160,42 L240,30 L300,20 L320,18"
                                  fill="none"
                                  stroke="#10b981"
                                  strokeWidth="1.2"
                                />
                                <circle cx="320" cy="18" r="2.5" fill="#10b981" className="animate-pulse" />
                              </svg>

                              {/* Tooltip Card: Clean glassmorphic popup */}
                              <div className="absolute right-6 top-1 p-2 rounded-md bg-[#11131a]/95 border border-white/[0.12] shadow-2xl text-[8.5px] font-sans pointer-events-none z-10 flex flex-col gap-1 backdrop-blur-md">
                                <div className="text-zinc-300 font-mono text-[8px] pb-1 border-b border-white/[0.06]">9/17/2026, 7:00:00 PM</div>
                                <div className="flex items-center justify-between gap-3 text-zinc-300">
                                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#eab308]" /> CLS</span>
                                  <span className="text-white font-mono font-medium">0.007</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-zinc-300">
                                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" /> INP</span>
                                  <span className="text-white font-mono font-medium">0ms</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-zinc-300">
                                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> LCP</span>
                                  <span className="text-white font-mono font-medium">3488ms</span>
                                </div>
                              </div>
                            </div>

                            {/* Right Y-Axis: CLS unitless 0.00 - 0.25 (crisp neutral numbers) */}
                            <div className="w-9 flex flex-col justify-between text-[8px] text-zinc-400 font-mono pl-1 select-none text-right">
                              <span>0.25</span>
                              <span>0.20</span>
                              <span>0.13</span>
                              <span>0.07</span>
                              <span>0.00</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[8px] text-zinc-400 pt-1.5 border-t border-white/[0.04]">
                            <div className="flex items-center gap-2 font-mono">
                              <span>06:00 PM</span>
                              <span>06:15 PM</span>
                              <span>06:30 PM</span>
                              <span>06:45 PM</span>
                              <span>07:00 PM</span>
                            </div>
                            <div className="flex items-center gap-2.5 font-sans">
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#eab308]" /><span className="text-zinc-300">CLS</span></span>
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" /><span className="text-zinc-300">INP</span></span>
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /><span className="text-zinc-300">LCP</span></span>
                            </div>
                          </div>
                        </div>

                        {/* ── GRAPH 3: Average Memory Utilization (Across All Instances) ── */}
                        <div className="p-3.5 rounded-xl bg-[#0b0c10] border border-white/[0.08] hover:border-white/[0.14] transition-colors flex flex-col justify-between shadow-xl relative overflow-hidden group">
                          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/[0.04]">
                            <div className="flex items-center gap-2">
                              <Database className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                              <div className="flex flex-col">
                                <span className="font-medium text-white text-[12px] tracking-tight">Average Memory Utilization</span>
                                <span className="text-[10px] text-zinc-400 font-normal">Across all instances</span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-200 border border-white/[0.1] text-[9.5px] font-mono flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              <span>580 MB / 512 MB (+23%)</span>
                            </span>
                          </div>

                          {/* Multi-Pod Legend with clean white/zinc text */}
                          <div className="flex flex-wrap items-center gap-2.5 text-[9.5px] text-zinc-300 py-1.5 font-sans">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-[2px] rounded-full bg-[#f59e0b]" />
                              <span className="text-zinc-200 font-mono text-[9px]">backend</span>
                              <span className="text-white font-mono text-[9px] font-medium">(580MB)</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-[2px] rounded-full bg-[#06b6d4]" />
                              <span className="text-zinc-400 font-mono text-[9px]">postgres</span>
                              <span className="text-zinc-300 font-mono text-[9px]">(112MB)</span>
                            </span>
                          </div>

                          {/* Chart Body with 512 MB ceiling line and Thin 1.2px stroke */}
                          <div className="relative w-full flex-1 flex items-stretch min-h-[92px]">
                            <div className="flex-1 relative h-full">
                              <svg className="w-full h-full" viewBox="0 0 240 85" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="memGraphGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                <line x1="0" y1="12" x2="240" y2="12" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="30" x2="240" y2="30" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="48" x2="240" y2="48" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="66" x2="240" y2="66" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="82" x2="240" y2="82" stroke="#323644" strokeWidth="0.8" />

                                {/* Subtle dashed limit line at 512 MB */}
                                <line x1="0" y1="28" x2="240" y2="28" stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.8" />
                                <text x="6" y="24" fill="#d4d4d8" fontSize="7.5" fontFamily="sans-serif">OOM Limit (512 MB)</text>

                                {/* postgres calm cyan line (thin 1px) */}
                                <path
                                  d="M0,70 L30,69 L60,70 L90,68 L120,69 L150,68 L180,69 L210,68 L240,69"
                                  fill="none"
                                  stroke="#06b6d4"
                                  strokeWidth="1"
                                />

                                {/* backend steep amber curve: thin 1.2px stroke with inner gradient */}
                                <polygon
                                  points="0,64 25,62 50,58 75,54 100,48 125,42 150,34 175,26 200,18 220,15 240,13 240,82 0,82"
                                  fill="url(#memGraphGrad)"
                                />
                                <path
                                  d="M0,64 L25,62 L50,58 L75,54 L100,48 L125,42 L150,34 L175,26 L200,18 L220,15 L240,13"
                                  fill="none"
                                  stroke="#f59e0b"
                                  strokeWidth="1.2"
                                />
                                <circle cx="240" cy="13" r="2.5" fill="#f59e0b" className="animate-pulse" />
                              </svg>
                            </div>

                            {/* Right Y-Axis: clean white/zinc numbers */}
                            <div className="w-11 flex flex-col justify-between text-[8px] text-zinc-400 font-mono pl-1 select-none text-right">
                              <span className="text-zinc-300">16,000MB</span>
                              <span>12,000MB</span>
                              <span>8,000MB</span>
                              <span>4,000MB</span>
                              <span>0MB</span>
                            </div>
                          </div>

                          <div className="flex justify-between text-[8px] text-zinc-400 pt-1.5 border-t border-white/[0.04] font-mono">
                            <span>08:28 PM</span>
                            <span>10:31 PM</span>
                            <span>12:28 AM</span>
                            <span>02:31 AM</span>
                            <span>04:32 AM</span>
                          </div>
                        </div>

                        {/* ── GRAPH 4: Frontend Route Breakdown (p75) (Matching Screenshot 2026-09-18 214529.png Route Breakdown) ── */}
                        <div className="p-3.5 rounded-xl bg-[#0b0c10] border border-white/[0.08] hover:border-white/[0.14] transition-colors flex flex-col justify-between shadow-xl relative overflow-hidden group">
                          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/[0.04]">
                            <div className="flex items-center gap-2">
                              <Activity className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                              <div className="flex flex-col">
                                <span className="font-medium text-white text-[12px] tracking-tight">Route Breakdown (p75)</span>
                                <span className="text-[10px] text-zinc-400 font-normal">Frontend Ingress Latency</span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-200 border border-white/[0.1] text-[9.5px] font-mono">
                              p99: 482ms
                            </span>
                          </div>

                          {/* Top 3 Routes with Crisp White Route Names and Clean Numbers */}
                          <div className="flex flex-col gap-1.5 py-1">
                            <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40 border border-white/[0.04] text-[9.5px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-white font-mono">/</span>
                                <span className="text-zinc-400 text-[8px]">(Home)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-200 font-mono font-medium">3758ms</span>
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[7.5px] font-medium">Needs Work</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40 border border-white/[0.04] text-[9.5px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-white font-mono">/dashboard</span>
                                <span className="text-zinc-400 text-[8px]">(App)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-200 font-mono font-medium">1420ms</span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[7.5px] font-medium">Good</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40 border border-white/[0.04] text-[9.5px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-white font-mono">/api/v1/health</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-200 font-mono font-medium">12ms</span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[7.5px] font-medium">Good</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[8px] text-zinc-400 pt-1.5 border-t border-white/[0.04] font-sans">
                            <span>3 Sampled Routes</span>
                            <span className="text-zinc-300 font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <span>99.4% SLA Target Met</span>
                            </span>
                          </div>
                        </div>

                        {/* ── GRAPH 5: Network Egress & HTTP Throughput (Matching Railway Ref & infrastructure) ── */}
                        <div className="p-3.5 rounded-xl bg-[#0b0c10] border border-white/[0.08] hover:border-white/[0.14] transition-colors flex flex-col justify-between shadow-xl relative overflow-hidden group">
                          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/[0.04]">
                            <div className="flex items-center gap-2">
                              <Zap className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                              <div className="flex flex-col">
                                <span className="font-medium text-white text-[12px] tracking-tight">Network Egress</span>
                                <span className="text-[10px] text-zinc-400 font-normal">Edge Gateway Throughput</span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-200 border border-white/[0.1] text-[9.5px] font-mono">
                              48.2 MB/s
                            </span>
                          </div>

                          {/* Stepped Throughput Graph: Thin 1.2px stroke with subtle area gradient */}
                          <div className="relative w-full flex-1 flex items-stretch min-h-[92px]">
                            <div className="flex-1 relative h-full">
                              <svg className="w-full h-full" viewBox="0 0 240 85" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="netStepGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                <line x1="0" y1="12" x2="240" y2="12" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="30" x2="240" y2="30" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="48" x2="240" y2="48" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="66" x2="240" y2="66" stroke="#222530" strokeWidth="0.8" />
                                <line x1="0" y1="82" x2="240" y2="82" stroke="#323644" strokeWidth="0.8" />

                                {/* Stepped Network Blocks (Thin 1.2px stroke) */}
                                <polygon
                                  points="0,70 30,70 30,64 70,64 70,54 110,54 110,42 150,42 150,48 190,48 190,36 240,36 240,82 0,82"
                                  fill="url(#netStepGrad)"
                                />
                                <path
                                  d="M0,70 L30,70 L30,64 L70,64 L70,54 L110,54 L110,42 L150,42 L150,48 L190,48 L190,36 L240,36"
                                  fill="none"
                                  stroke="#3b82f6"
                                  strokeWidth="1.2"
                                />
                                <circle cx="240" cy="36" r="2" fill="#3b82f6" className="animate-pulse" />
                              </svg>
                            </div>

                            {/* Right Y-Axis: clean white/zinc numbers */}
                            <div className="w-10 flex flex-col justify-between text-[8px] text-zinc-400 font-mono pl-1 select-none text-right">
                              <span className="text-zinc-300">150 MB</span>
                              <span>100 MB</span>
                              <span>50 MB</span>
                              <span>0 MB</span>
                            </div>
                          </div>

                          <div className="flex justify-between text-[8px] text-zinc-400 pt-1.5 border-t border-white/[0.04] font-mono">
                            <span>15:50</span>
                            <span>16:00</span>
                            <span>16:10</span>
                            <span>16:20</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── ARCHITECTURE TAB VIEW: Centered Nodes Canvas & Command Palette ── */
                    <div className="relative w-full h-full flex items-center justify-center">
                      {/* Left Canvas Toolbar (Railway Style) */}
                      <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 bg-[#131520]/90 border border-white/[0.08] p-1 rounded-lg backdrop-blur-sm shadow-xl">
                        <button type="button" className="p-1.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors">
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="p-1.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors text-xs font-mono font-bold leading-none">+</button>
                        <button type="button" className="p-1.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors text-xs font-mono font-bold leading-none">-</button>
                        <button type="button" className="p-1.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors text-xs leading-none">⛶</button>
                      </div>

                      {/* Nodes Canvas Layout */}
                      <div className="relative flex flex-col items-center scale-[0.78] xs:scale-[0.88] sm:scale-100 origin-center transition-transform">
                        {/* Top Row: backend + redis */}
                        <div className="flex items-center">
                          {/* BACKEND NODE */}
                          <div className="relative group">
                            {/* Warning stacked shadow layers underneath when in warning */}
                            {(monitorStep === "warning-2" || monitorStep === "create-menu" || monitorStep === "search-typing" || monitorStep === "redis-deployed") && (
                              <>
                                <div className="absolute inset-x-2 -bottom-1.5 h-3 rounded-xl border border-yellow-700/40 bg-[#14120e] -z-10 shadow-sm" />
                                <div className="absolute inset-x-4 -bottom-3 h-3 rounded-xl border border-yellow-800/30 bg-[#0e0c0a] -z-20 shadow-sm" />
                              </>
                            )}

                            {/* Stabilized stacked replica layers when in all-stabilized (matches image copy.png) */}
                            {monitorStep === "all-stabilized" && (
                              <>
                                <div className="absolute inset-x-2 -bottom-1.5 h-3 rounded-xl border border-white/[0.08] bg-[#10121a] -z-10 shadow-sm" />
                                <div className="absolute inset-x-4 -bottom-3 h-3 rounded-xl border border-white/[0.05] bg-[#0c0d14] -z-20 shadow-sm" />
                              </>
                            )}

                            <div
                              className={`w-60 sm:w-64 p-3.5 rounded-xl transition-all duration-500 shadow-xl ${
                                monitorStep === "warning-2" || monitorStep === "create-menu" || monitorStep === "search-typing" || monitorStep === "redis-deployed"
                                   ? "bg-[#181512] border-2 border-yellow-500/80 shadow-[0_0_25px_rgba(234,179,8,0.18)]"
                                   : "bg-[#13151f] border border-white/[0.12]"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <NodeJsBrandIcon className="w-4 h-4 shrink-0" />
                                <span className="font-mono text-xs font-bold text-white">backend</span>
                              </div>

                              {monitorStep === "warning-2" || monitorStep === "create-menu" || monitorStep === "search-typing" || monitorStep === "redis-deployed" ? (
                                <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-400 py-0.5 animate-in fade-in">
                                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                                  <span>High Memory Usage</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                                  <GitHubBrandIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                  <span className="text-zinc-400">Just deployed via GitHub</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Horizontal connector line to Redis */}
                          {(monitorStep === "redis-deployed" || monitorStep === "all-stabilized") && (
                            <div className="w-8 sm:w-12 h-px border-t border-dashed border-zinc-700 animate-in fade-in duration-500" />
                          )}

                          {/* REDIS NODE (Blooms in on redis-deployed & matches image.png / image copy.png) */}
                          {(monitorStep === "redis-deployed" || monitorStep === "all-stabilized") && (
                            <div className="w-60 sm:w-64 p-3.5 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl animate-in fade-in zoom-in-95 duration-500">
                              <div className="flex items-center gap-2 mb-2">
                                <RedisBrandIcon className="w-4 h-4 shrink-0" />
                                <span className="font-mono text-xs font-bold text-white">redis</span>
                              </div>

                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 mb-1.5">
                                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-zinc-400">Just deployed</span>
                              </div>

                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono pt-1 border-t border-white/[0.04]">
                                <Database className="w-3 h-3 text-zinc-500 shrink-0" />
                                <span>redis-volume</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Vertical connector line between backend & postgres */}
                        <div className="w-px h-8 sm:h-10 border-l border-dashed border-zinc-700" />

                        {/* POSTGRES NODE */}
                        <div className="w-60 sm:w-64 p-3.5 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <PostgresBrandIcon className="w-4 h-4 shrink-0" />
                            <span className="font-mono text-xs font-bold text-white">postgres</span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 mb-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-zinc-400">Just deployed</span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono pt-1 border-t border-white/[0.04]">
                            <Database className="w-3 h-3 text-zinc-500 shrink-0" />
                            <span>pg-data</span>
                          </div>
                        </div>
                      </div>

                      {/* CREATE & SEARCH COMMAND PALETTE (Exact match to 4th & 5th reference images) */}
                      {(monitorStep === "create-menu" || monitorStep === "search-typing") && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 sm:w-80 rounded-xl bg-[#13141f]/98 border border-white/[0.14] shadow-2xl p-3.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 backdrop-blur-md z-30">
                          {monitorStep === "create-menu" ? (
                            <>
                              <div className="text-[10px] text-zinc-400 font-mono">Create &gt;</div>
                              <div className="text-xs text-zinc-400 font-medium px-2 py-0.5">What do you need?</div>
                              <div className="flex flex-col gap-0.5 text-xs font-mono text-zinc-200">
                                <div className="px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] flex items-center justify-between cursor-pointer transition-colors">
                                  <div className="flex items-center gap-2">
                                    <GitHubBrandIcon className="w-3.5 h-3.5 text-zinc-300" />
                                    <span>GitHub Repo</span>
                                  </div>
                                  <ChevronRight className="w-3 h-3 text-zinc-500" />
                                </div>
                                <div className="px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] flex items-center justify-between cursor-pointer transition-colors">
                                  <div className="flex items-center gap-2">
                                    <LayoutTemplate className="w-3.5 h-3.5 text-zinc-400" />
                                    <span>Template</span>
                                  </div>
                                  <ChevronRight className="w-3 h-3 text-zinc-500" />
                                </div>
                                <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-white flex items-center justify-between cursor-pointer">
                                  <div className="flex items-center gap-2">
                                    <Database className="w-3.5 h-3.5 text-purple-400" />
                                    <span>Database</span>
                                  </div>
                                  <ChevronRight className="w-3 h-3 text-zinc-400" />
                                </div>
                                <div className="px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] flex items-center justify-between cursor-pointer transition-colors">
                                  <div className="flex items-center gap-2">
                                    <Box className="w-3.5 h-3.5 text-zinc-400" />
                                    <span>Docker Image</span>
                                  </div>
                                </div>
                                <div className="px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] flex items-center justify-between cursor-pointer transition-colors">
                                  <div className="flex items-center gap-2">
                                    <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                                    <span>Volume</span>
                                  </div>
                                </div>
                                <div className="px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] flex items-center justify-between cursor-pointer transition-colors">
                                  <div className="flex items-center gap-2">
                                    <Square className="w-3.5 h-3.5 text-zinc-400" />
                                    <span>Empty Service</span>
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-[10px] text-zinc-400 font-mono">Search &gt;</div>
                              <div className="px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/[0.1] text-xs font-mono text-white flex items-center gap-1.5">
                                <span className="text-purple-400 font-bold">/</span>
                                <span className="text-white font-medium">{searchQueryText}</span>
                                <span className="w-1.5 h-3.5 bg-purple-400 animate-pulse" />
                              </div>

                              <div className="text-[9.5px] text-zinc-500 font-mono px-2 pt-1">
                                Project &gt; New Service &gt; Database
                              </div>

                              <div className="p-2 rounded-lg bg-white/[0.08] border border-purple-500/30 text-white flex items-center justify-between font-mono text-xs cursor-pointer shadow-lg">
                                <div className="flex items-center gap-2">
                                  <RedisBrandIcon className="w-4 h-4 shrink-0" />
                                  <span className="font-semibold text-white">Add Redis</span>
                                </div>
                                {searchQueryText === "redis" && (
                                  <span className="text-[10px] text-emerald-400 font-sans font-medium flex items-center gap-1 animate-in fade-in">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>Configured</span>
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  STAGE 5: EVOLVE — EXPANSIVE PRODUCTION FLEET (3 -> 8 -> 12 -> 16 -> 18 NODES)
                  ═════════════════════════════════════════════════════════════ */}
              {activeStage === "evolve" && (
                <div className="relative z-10 w-full h-full flex flex-col justify-between p-2 sm:p-4 select-none">
                  {/* Top Canvas Bar (Railway Style): Left Zoom & Right Sync/Create Actions */}
                  <div className="flex items-center justify-between pb-2 text-xs shrink-0 z-30">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-0.5 sm:gap-1 bg-[#131520]/90 border border-white/[0.08] p-0.5 sm:p-1 rounded-lg backdrop-blur-sm shadow-xl">
                        <button
                          type="button"
                          onClick={() => setManualZoom(1)}
                          title="Reset Zoom"
                          className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
                          title="Zoom In"
                          className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors text-xs font-mono font-bold leading-none"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
                          title="Zoom Out"
                          className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors text-xs font-mono font-bold leading-none"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualZoom(1)}
                          title="Fit to Screen"
                          className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors text-xs leading-none"
                        >
                          ⛶
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-[#131520] border border-white/[0.08] text-zinc-300 text-[10px] sm:text-[11px] font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>
                          {evolveMountedStep === "3-nodes"
                            ? "3 Services"
                            : evolveMountedStep === "8-nodes"
                            ? "8 Services"
                            : evolveMountedStep === "12-nodes"
                            ? "12 Services"
                            : evolveMountedStep === "16-nodes"
                            ? "16 Services"
                            : "18 Services Active"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-[#131520] border border-white/[0.08] text-zinc-300 hover:text-white text-[10.5px] sm:text-[11px] hover:border-white/20 transition-colors font-sans"
                      >
                        <RefreshCw className="w-3 h-3 text-zinc-400" />
                        <span className="hidden xs:inline">Sync</span>
                      </button>

                      <button
                        type="button"
                        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-white text-[10.5px] sm:text-[11px] font-sans font-medium transition-colors shadow-sm"
                      >
                        <Plus className="w-3 h-3 text-white" />
                        <span className="hidden xs:inline">Create</span>
                      </button>
                    </div>
                  </div>

                  {/* ── EXPANSIVE TOPOLOGY CANVAS (Expands smoothly with Camera Zoom) ── */}
                  <div className="relative flex-1 w-full flex items-center justify-center min-h-[380px]">
                    {/* Background Subtle Dashed Circuit Connection Lines */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 1000 480" preserveAspectRatio="none">
                      {/* Connection Lines from Column 1 to Column 2 */}
                      {evolveMountedStep !== "3-nodes" && (
                        <g className="animate-in fade-in duration-500 opacity-60">
                          <line x1="210" y1="160" x2="330" y2="160" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" />
                          <line x1="210" y1="270" x2="330" y2="250" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" />
                        </g>
                      )}

                      {/* Connection Lines between Backend & Redis / Postgres (Always visible) */}
                      <line x1="450" y1="160" x2="550" y2="160" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.8" />
                      <line x1="390" y1="210" x2="390" y2="260" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.8" />

                      {/* Connection Lines to Services & Message Queues */}
                      {evolveMountedStep !== "3-nodes" && (
                        <g className="animate-in fade-in duration-500 opacity-60">
                          <line x1="390" y1="190" x2="390" y2="310" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" />
                          <line x1="450" y1="180" x2="680" y2="220" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" />
                        </g>
                      )}

                      {/* Connection Lines to Column 4 & 5 (12, 16, 18 nodes) */}
                      {(evolveMountedStep === "12-nodes" || evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                        <g className="animate-in fade-in duration-500 opacity-60">
                          <line x1="640" y1="160" x2="710" y2="160" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" />
                          <line x1="640" y1="260" x2="710" y2="260" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" />
                        </g>
                      )}

                      {(evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                        <g className="animate-in fade-in duration-500 opacity-60">
                          <line x1="820" y1="200" x2="880" y2="200" stroke="#52525b" strokeWidth="1.2" strokeDasharray="3 3" />
                        </g>
                      )}
                    </svg>

                    {/* Multi-Tier Distributed Microservices Fleet */}
                    <div className="relative z-10 flex items-center justify-center gap-2.5 sm:gap-3.5 shrink-0 origin-center transition-all duration-300 py-2">
                      
                      {/* ══ COLUMN 1: CLIENTS & INGRESS (Mounted at 8+, 16+, 18) ══ */}
                      {evolveMountedStep !== "3-nodes" && (
                        <div className="flex flex-col gap-2.5 shrink-0 animate-in fade-in zoom-in-95 duration-500">
                          {/* 1. docs-site (Mounted at 18 nodes) */}
                          {evolveMountedStep === "18-nodes" && (
                            <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <DocusaurusBrandIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="font-mono text-xs font-bold text-white tracking-tight">docs-site</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                                <GitHubBrandIcon className="w-3 h-3 text-zinc-400 shrink-0" />
                                <span>Deployed via GitHub</span>
                              </div>
                              <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                                <span>docusaurus · v3.4</span>
                              </div>
                            </div>
                          )}

                          {/* 2. frontend (Mounted at 8+ nodes) */}
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <NextJsBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">frontend</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <GitHubBrandIcon className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span>Deployed via GitHub</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>nextjs-16 · app router</span>
                            </div>
                          </div>

                          {/* 3. admin-dashboard (Mounted at 16+ nodes) */}
                          {(evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                            <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <ReactBrandIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="font-mono text-xs font-bold text-white tracking-tight">admin-dashboard</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                                <GitHubBrandIcon className="w-3 h-3 text-zinc-400 shrink-0" />
                                <span>Deployed via GitHub</span>
                              </div>
                              <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                                <span>react-19 · vite spa</span>
                              </div>
                            </div>
                          )}

                          {/* 4. ingress-edge (Mounted at 8+ nodes) */}
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <EnvoyBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">ingress-edge</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Active Edge Proxy</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>tls-1.3 · auto-cert</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ══ COLUMN 2: GATEWAY & CORE SERVICES ══ */}
                      <div className="flex flex-col gap-2.5 shrink-0">
                        {/* 5. api-gateway (Mounted at 12+ nodes) */}
                        {(evolveMountedStep === "12-nodes" || evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <EnvoyBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">api-gateway</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Routing 42 routes</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>port: 8080 · mTLS</span>
                            </div>
                          </div>
                        )}

                        {/* 6. backend (CORE - ALWAYS VISIBLE IN 3, 8, 12, 16, 18 NODES) */}
                        <div className="relative group">
                          {/* Stabilized stacked replica layers underneath */}
                          <div className="absolute inset-x-2 -bottom-1 h-2.5 rounded-xl border border-white/[0.08] bg-[#10121a] -z-10 shadow-sm" />
                          <div className="absolute inset-x-4 -bottom-2 h-2.5 rounded-xl border border-white/[0.05] bg-[#0c0d14] -z-20 shadow-sm" />

                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <NodeJsBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">backend</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <GitHubBrandIcon className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span>Deployed via GitHub</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>node-v22 · cluster</span>
                            </div>
                          </div>
                        </div>

                        {/* 7. auth-service (Mounted at 8+ nodes) */}
                        {evolveMountedStep !== "3-nodes" && (
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <JavaBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">auth-service</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <GitHubBrandIcon className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span>Deployed via GitHub</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>java-21 · oauth2</span>
                            </div>
                          </div>
                        )}

                        {/* 8. payments (Mounted at 12+ nodes) */}
                        {(evolveMountedStep === "12-nodes" || evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <StripeBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">payments</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Webhook verified</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>stripe-connect · pci</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ══ COLUMN 3: CACHING & MESSAGE QUEUES ══ */}
                      <div className="flex flex-col gap-2.5 shrink-0">
                        {/* 9. redis (CORE - ALWAYS VISIBLE IN 3, 8, 12, 16, 18 NODES) */}
                        <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <RedisBrandIcon className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-mono text-xs font-bold text-white tracking-tight">redis</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-zinc-300 mb-0.5">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>In-memory Cache</span>
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-zinc-400 font-mono pt-1.5 border-t border-white/[0.04]">
                            <Database className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                            <span>redis-cluster · v7.2</span>
                          </div>
                        </div>

                        {/* 10. analytics-speed (Mounted at 8+ nodes) */}
                        {evolveMountedStep !== "3-nodes" && (
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <ClickHouseBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">analytics-speed</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Realtime Stream</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>olap-pipeline</span>
                            </div>
                          </div>
                        )}

                        {/* 11. rabbitmq (Mounted at 12+ nodes) */}
                        {(evolveMountedStep === "12-nodes" || evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <RabbitMQBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">rabbitmq</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Message Broker</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>amqp-queue · 0 unack</span>
                            </div>
                          </div>
                        )}

                        {/* 12. storage-s3 (Mounted at 16+ nodes) */}
                        {(evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <StorageS3BrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">storage-s3</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Object Store Active</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>bucket: assets-prod</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ══ COLUMN 4: GROUP CONTAINER — SERVICES & DATABASE CLUSTER ══ */}
                      <div className="flex flex-col gap-2.5 shrink-0">
                        {/* Dedicated Group Container Box */}
                        <div className="p-2.5 sm:p-3 rounded-2xl bg-[#0e1017]/90 border border-white/[0.1] shadow-xl flex flex-col gap-2.5">
                          <div className="flex items-center justify-between text-[11px] font-mono font-medium text-zinc-400 px-1 border-b border-white/[0.04] pb-1.5">
                            <span className="text-zinc-300 font-semibold">services</span>
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>Healthy Fleet</span>
                            </span>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2.5">
                            {/* 13. microservice (Mounted at 8+ nodes inside services container) */}
                            {evolveMountedStep !== "3-nodes" && (
                              <div className="w-32 sm:w-36 p-2 sm:p-2.5 rounded-xl bg-[#13151f] border border-white/[0.08] shadow-md animate-in fade-in zoom-in-95 duration-500">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <NodeJsBrandIcon className="w-3 h-3 shrink-0" />
                                  <span className="font-mono text-[11.5px] font-bold text-white tracking-tight">microservice</span>
                                </div>
                                <div className="flex items-center gap-1 text-[9.5px] text-zinc-300">
                                  <GitHubBrandIcon className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                                  <span>Deployed via GitHub</span>
                                </div>
                                <div className="text-[8.5px] text-zinc-500 font-mono pt-1 mt-1 border-t border-white/[0.04]">
                                  <span>orders-worker</span>
                                </div>
                              </div>
                            )}

                            {/* 14. postgres (CORE - ALWAYS VISIBLE IN 3, 8, 12, 16, 18 NODES) */}
                            <div className="w-32 sm:w-36 p-2 sm:p-2.5 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-md">
                              <div className="flex items-center gap-1.5 mb-1">
                                <PostgresBrandIcon className="w-3 h-3 shrink-0" />
                                <span className="font-mono text-[11.5px] font-bold text-white tracking-tight">postgres</span>
                              </div>
                              <div className="flex items-center gap-1 text-[9.5px] text-zinc-300 mb-0.5">
                                <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                <span>Primary DB</span>
                              </div>
                              <div className="flex items-center gap-1 text-[8.5px] text-zinc-400 font-mono pt-1 border-t border-white/[0.04]">
                                <Database className="w-2 h-2 text-zinc-500 shrink-0" />
                                <span>pg-data · v16</span>
                              </div>
                            </div>

                            {/* 15. postgres-replica (Mounted at 12+ nodes) */}
                            {(evolveMountedStep === "12-nodes" || evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                              <div className="w-32 sm:w-36 p-2 sm:p-2.5 rounded-xl bg-[#13151f] border border-white/[0.08] shadow-md animate-in fade-in zoom-in-95 duration-500">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <PostgresBrandIcon className="w-3 h-3 shrink-0" />
                                  <span className="font-mono text-[11.5px] font-bold text-white tracking-tight">postgres-rep</span>
                                </div>
                                <div className="flex items-center gap-1 text-[9.5px] text-zinc-300">
                                  <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                  <span>Read Standby</span>
                                </div>
                                <div className="text-[8.5px] text-zinc-500 font-mono pt-1 mt-1 border-t border-white/[0.04]">
                                  <span>streaming-rep</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 16. clickhouse (Mounted at 16+ nodes) */}
                        {(evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                          <div className="w-full p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <ClickHouseBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">clickhouse</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>184k traces / sec</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>columnar · 4 shards</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ══ COLUMN 5: INTELLIGENCE & OBSERVABILITY (Mounted at 16+, 18 nodes) ══ */}
                      {(evolveMountedStep === "16-nodes" || evolveMountedStep === "18-nodes") && (
                        <div className="flex flex-col gap-2.5 shrink-0 animate-in fade-in zoom-in-95 duration-500">
                          {/* 17. search-engine (Mounted at 18 nodes) */}
                          {evolveMountedStep === "18-nodes" && (
                            <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <OpenSearchBrandIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="font-mono text-xs font-bold text-white tracking-tight">search-engine</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span>OpenSearch Fleet</span>
                              </div>
                              <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                                <span>bm25-inverted-idx</span>
                              </div>
                            </div>
                          )}

                          {/* 18. ai-agent (Mounted at 16+ nodes) */}
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#141224] border border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.18)] hover:border-purple-400/60 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <OpenAIAgentBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-purple-200 tracking-tight">ai-agent</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-purple-200">
                              <Check className="w-3 h-3 text-purple-300 shrink-0" />
                              <span>Autonomous LLM</span>
                            </div>
                            <div className="text-[9px] text-purple-300/80 font-mono pt-1.5 mt-1.5 border-t border-purple-500/20">
                              <span>reasoning-loop · v4</span>
                            </div>
                          </div>

                          {/* 19. vector-db (Mounted at 16+ nodes) */}
                          <div className="w-40 sm:w-44 p-2.5 sm:p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl hover:border-white/20 transition-all animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <QdrantBrandIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono text-xs font-bold text-white tracking-tight">vector-db</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Qdrant Vector Index</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 font-mono pt-1.5 mt-1.5 border-t border-white/[0.04]">
                              <span>cosine · 1536-dim</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </>
            )}
            </div>

            {/* ── Floating Step Inspection Popover (Anchored above active step) ── */}
            {selectedWorkflowStep && (
              <div className="absolute z-40 bottom-16 left-1/2 -translate-x-1/2 w-80 p-3.5 rounded-xl bg-[#12141e]/95 border border-white/[0.14] shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-md animate-in fade-in zoom-in-95 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.08] mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        selectedWorkflowStep.status === "completed"
                          ? "bg-emerald-400"
                          : selectedWorkflowStep.status === "failed_retrying"
                          ? "bg-amber-400 animate-ping"
                          : "bg-blue-400 animate-pulse"
                      }`}
                    />
                    <span className="font-mono font-bold text-white text-xs">{selectedWorkflowStep.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedWorkflowStep(null)}
                    className="text-zinc-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 font-mono text-[10px] text-zinc-300">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Step Name:</span>
                    <span className="text-purple-300">{selectedWorkflowStep.stepName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Duration:</span>
                    <span className="text-zinc-200">{selectedWorkflowStep.duration}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Execution Status:</span>
                    <span
                      className={`font-bold ${
                        selectedWorkflowStep.status === "completed"
                          ? "text-emerald-400"
                          : selectedWorkflowStep.status === "failed_retrying"
                          ? "text-amber-300"
                          : "text-blue-400"
                      }`}
                    >
                      {selectedWorkflowStep.status === "failed_retrying" ? "AUTO-HEALED" : selectedWorkflowStep.status.toUpperCase()}
                    </span>
                  </div>
                  {selectedWorkflowStep.retryReason && (
                    <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[9px] mt-1">
                      <span className="font-bold">Recovery: </span>
                      {selectedWorkflowStep.retryReason}
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-white/[0.06] text-[8.5px] text-zinc-500">
                    <span>Deterministic Idempotency Key:</span>
                    <span className="text-zinc-400 font-mono">wf_step_23rr2v9_canary</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                CORRECTLY ANCHORED POPUP TOASTS & ALERTS (TRUE CORNERS, NOT CENTER!)
                ═══════════════════════════════════════════════════════════════ */}
            
            {/* 1. Deployment Successful Toast (Anchored to true BOTTOM-RIGHT CORNER - Elevated slightly to clear bottom dock bar) */}
            {activeStage === "deploy" && deployToast.show && (
              <div className="absolute bottom-8 right-3 sm:bottom-9 sm:right-4 max-w-[210px] sm:max-w-[230px] p-2 rounded-lg bg-[#0b1b13]/95 border border-emerald-500/40 shadow-[0_8px_30px_rgba(0,0,0,0.85)] flex items-center gap-2 z-40 animate-in fade-in slide-in-from-bottom-2 duration-300 backdrop-blur-xl pointer-events-auto">
                <div className="w-5 h-5 rounded-md bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-white truncate">Production Live!</span>
                    <span className="px-1 py-0.2 rounded text-[7.5px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                      LIVE
                    </span>
                  </div>
                  <p className="text-[8.5px] text-emerald-100/80 font-medium leading-tight mt-0.5 line-clamp-1">
                    {deployToast.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeployToast(false)}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded hover:bg-white/5 shrink-0"
                  title="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* 2. Scale Toast Notification (Anchored to true TOP-RIGHT CORNER - Compact sleek dimensions) */}
            {activeStage === "scale" && scaleToast.show && (
              <div className="absolute top-4 right-4 max-w-[280px] sm:max-w-[310px] rounded-lg bg-[#0e121a]/95 border border-emerald-500/35 p-2 sm:p-2.5 shadow-xl shadow-black/85 flex items-start gap-2 z-40 animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-md">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <span>{scaleToast.title}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="text-[9.5px] text-zinc-300 mt-0.5 leading-tight">{scaleToast.subtitle}</div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            FLOATING DOCK NAVIGATOR (Floating on bottom border on center)
            ═════════════════════════════════════════════════════════════ */}
        <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 translate-y-1/2 z-40 flex items-center justify-center max-w-[calc(100%-20px)] pointer-events-auto">
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[#13111c] border border-white/[0.14] shadow-[0_4px_16px_rgba(0,0,0,0.35)] backdrop-blur-md shrink-0 max-w-full overflow-x-auto no-scrollbar">
            {STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isActive = activeStage === stage.id;

              return (
                <React.Fragment key={stage.id}>
                  {idx > 0 && (
                    <div className="w-[1px] h-3.5 bg-white/[0.12] mx-0.5 shrink-0" />
                  )}
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => {
                      setActiveStage(stage.id);
                    }}
                    className={`relative px-2.5 xs:px-3 sm:px-4 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium flex items-center gap-1.5 sm:gap-2 transition-all duration-200 shrink-0 ${
                      isActive
                        ? "bg-[#2b1a47] text-white border border-[#523386] shadow-[0_0_14px_rgba(168,85,247,0.25)] font-semibold"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? "text-purple-300" : "text-zinc-400"
                      }`}
                    />
                    <span>{stage.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
