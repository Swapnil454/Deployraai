"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Cpu,
  Database,
  Network,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   ── NODE DATA MODEL — Clean architecture topology
   ── ViewBox: 896 x 1180
   ── Slower, deliberate botanical evolution matching organic growth
   ═══════════════════════════════════════════════════════════════════════ */

interface NodeItem {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  revealDelay: number;
  icon?: any;
  imageSrc?: string;
  iconSize?: number;
  labelPosition: "inside" | "right" | "left" | "bottom" | "bottom-right" | "bottom-left" | "none";
  lines: string[];
  labelOffset?: { x: number; y: number };
  dashedRing?: number;
  glassRings?: number[];
  metrics?: { [key: string]: string };
}

interface RibbonStrand {
  id: string;
  path: string;
  width: number;
  opacity: number;
  hasArrow?: boolean;
  startDelay: number;
  duration: number;
  pathLength: number;
  isPrimary: boolean;
  sourceId: string;
  targetId: string;
}

const NODES: NodeItem[] = [
  // ─── TIER 1: Autonomous SRE Hub & Satellites ──────────────────────────────
  {
    id: "ai-agent",
    name: "ai-remediation-agent",
    x: 372,
    y: 247,
    r: 78,
    revealDelay: 250, // Origin root seed
    dashedRing: 88,
    imageSrc: "/images/ai_remediation_agent.webp",
    iconSize: 84,
    labelPosition: "inside",
    lines: ["ai-remediation-agent"],
    labelOffset: { x: 0, y: 34 },
    metrics: { Latency: "1.1ms", "Probes/s": "148k", "Auto-Patched": "99.9%", Status: "Active" },
  },
  {
    id: "incident-auto-fixer",
    name: "incident-auto-fixer",
    x: 248,
    y: 127,
    r: 30,
    revealDelay: 2900,
    imageSrc: "/images/incident_auto_fix.webp",
    iconSize: 42,
    labelPosition: "right",
    lines: ["incident-", "auto-fixer"],
    labelOffset: { x: 38, y: -4 },
  },
  {
    id: "go-probe-top",
    name: "go-uptime-probe-engine",
    x: 414,
    y: 101,
    r: 30,
    revealDelay: 2900,
    imageSrc: "/images/golang_uptime_engine.webp",
    iconSize: 58,
    labelPosition: "right",
    lines: ["go-uptime-", "probe-engine"],
    labelOffset: { x: 38, y: -4 },
  },
  {
    id: "go-probe-right",
    name: "go-uptime-probe-engine",
    x: 575,
    y: 234,
    r: 32,
    revealDelay: 3100,
    glassRings: [40, 47],
    imageSrc: "/images/synthetic_check_engine.webp",
    iconSize: 48,
    labelPosition: "right",
    lines: ["go-uptime-", "probe-engine"],
    labelOffset: { x: 42, y: -2 },
    metrics: { "Pings/sec": "142k", "Global Latency": "0.8ms" },
  },
  {
    id: "log-analyzer",
    name: "log-analyzer-llm",
    x: 204,
    y: 236,
    r: 28,
    revealDelay: 2900,
    imageSrc: "/images/analyse_llm.webp",
    iconSize: 40,
    labelPosition: "left",
    lines: ["log-analyzer-", "llm"],
    labelOffset: { x: -36, y: 0 },
  },
  {
    id: "ssl-cron",
    name: "ssl-expiry-cron",
    x: 256,
    y: 352,
    r: 25,
    revealDelay: 3050,
    imageSrc: "/images/ssl_expiry_cron.webp",
    iconSize: 85,
    labelPosition: "right",
    lines: ["ssl-expiry-", "cron"],
    labelOffset: { x: 34, y: -2 },
  },

  // ─── TIER 2: Core Compute Trunks & Pipeline Satellites ───────────────────
  {
    id: "app-backend",
    name: "app-backend-go",
    x: 569,
    y: 497,
    r: 52,
    revealDelay: 3400,
    icon: Cpu,
    iconSize: 40,
    labelPosition: "inside",
    lines: ["app-backend-go"],
    labelOffset: { x: 0, y: 26 },
    metrics: { Runtime: "Go 1.22", Concurrency: "100k goroutines", Throughput: "94.2 MB/s" },
  },
  {
    id: "app-frontend-large",
    name: "app-frontend-nextjs",
    x: 267,
    y: 637,
    r: 54,
    revealDelay: 3600,
    imageSrc: "/images/frontend_icon.webp",
    iconSize: 76,
    labelPosition: "inside",
    lines: ["app-frontend-nextjs"],
    labelOffset: { x: 0, y: 26 },
    metrics: { Framework: "Next.js 14 SSR", Edge: "V8 Isolated Runtime", TTFB: "18ms" },
  },
  {
    id: "express-gw",
    name: "express-api-gateway-5000",
    x: 726,
    y: 362,
    r: 33,
    revealDelay: 5500,
    imageSrc: "/images/express_gateway.webp",
    iconSize: 128,
    labelPosition: "right",
    lines: ["express-api-", "gateway-5000"],
    labelOffset: { x: 40, y: -4 },
  },
  {
    id: "deploy-orch",
    name: "deployment-orchestrator",
    x: 770,
    y: 460,
    r: 24,
    revealDelay: 5650,
    imageSrc: "/images/docker_orchestration.webp",
    iconSize: 65,
    labelPosition: "right",
    lines: ["deployment-", "orchestrator"],
    labelOffset: { x: 32, y: -4 },
  },
  {
    id: "docker-kaniko",
    name: "docker-kaniko-runner",
    x: 773,
    y: 578,
    r: 26,
    revealDelay: 5800,
    imageSrc: "/images/docker_kaniko.webp",
    iconSize: 66,
    labelPosition: "right",
    lines: ["docker-", "kaniko-", "runner"],
    labelOffset: { x: 34, y: -8 },
  },
  {
    id: "github-webhook",
    name: "github-webhook-receiver",
    x: 700,
    y: 646,
    r: 24,
    revealDelay: 5950,
    imageSrc: "/images/github_webhook.webp",
    iconSize: 55,
    labelPosition: "bottom-right",
    lines: ["github-", "webhook-", "receiver"],
    labelOffset: { x: 26, y: 22 },
  },
  {
    id: "app-frontend-small",
    name: "app-frontend-nextjs",
    x: 582,
    y: 672,
    r: 38,
    revealDelay: 5650,
    imageSrc: "/images/dashboard_icon.webp",
    iconSize: 78,
    labelPosition: "bottom-right",
    lines: ["app-frontend-", "nextjs"],
    labelOffset: { x: 34, y: 24 },
  },

  // ─── TIER 3: Edge Ingress & Security Fabric ──────────────────────────────
  {
    id: "cloudflare-top",
    name: "cloudflare-dns-proxy",
    x: 185,
    y: 760,
    r: 26,
    revealDelay: 5650,
    imageSrc: "/images/cloudflare.webp",
    iconSize: 74,
    labelPosition: "left",
    lines: ["cloudflare-", "dns-proxy"],
    labelOffset: { x: -32, y: -4 },
  },
  {
    id: "edge-hub",
    name: "edge-ingress-hub",
    x: 290,
    y: 750,
    r: 28,
    revealDelay: 5600,
    icon: Network,
    iconSize: 22,
    labelPosition: "right",
    lines: ["edge-ingress-", "hub"],
    labelOffset: { x: 34, y: -4 },
    metrics: { "Ingress Traffic": "48.2k req/s", "Edge Routing": "BGP Anycast", "TLS Latency": "3.8ms", Status: "Healthy" },
  },
  {
    id: "cloudflare-bot",
    name: "cloudflare-dns-proxy",
    x: 205,
    y: 830,
    r: 22,
    revealDelay: 7550,
    imageSrc: "/images/cloudflare_edge_waf.webp",
    iconSize: 42,
    labelPosition: "right",
    lines: ["cloudflare-", "dns-proxy"],
    labelOffset: { x: 26, y: -2 },
  },
  {
    id: "ssl-terminator",
    name: "global-ssl-terminator",
    x: 355,
    y: 825,
    r: 21,
    revealDelay: 7550,
    imageSrc: "/images/global_ssl_terminator.webp",
    iconSize: 48,
    labelPosition: "right",
    lines: ["global-ssl-", "terminator"],
    labelOffset: { x: 26, y: -2 },
  },
  {
    id: "jwt-vault-left",
    name: "jwt-auth-vault",
    x: 180,
    y: 900,
    r: 25,
    revealDelay: 7750,
    imageSrc: "/images/jwt_auth_vault.webp",
    iconSize: 50,
    labelPosition: "bottom",
    lines: ["jwt-auth-", "vault"],
    labelOffset: { x: -16, y: 32 },
  },
  {
    id: "jwt-vault-mid",
    name: "jwt-auth-vault",
    x: 265,
    y: 910,
    r: 25,
    revealDelay: 7750,
    imageSrc: "/images/session_auth_guard.webp",
    iconSize: 95,
    labelPosition: "bottom",
    lines: ["jwt-auth-", "vault"],
    labelOffset: { x: -16, y: 32 },
  },
  {
    id: "rate-limiter",
    name: "rate-limit-enforcer",
    x: 345,
    y: 910,
    r: 25,
    revealDelay: 7900,
    imageSrc: "/images/rate_limiting_enforce.webp",
    iconSize: 85,
    labelPosition: "right",
    lines: ["rate-limit-", "enforcer"],
    labelOffset: { x: 28, y: -2 },
  },

  // ─── TIER 4: Data Fabric & Persistence Roots ─────────────────────────────
  {
    id: "clickhouse",
    name: "clickhouse-telemetry-cluster",
    x: 565,
    y: 840,
    r: 42,
    revealDelay: 6000,
    imageSrc: "/images/clickhouse_telemetry_cluster.webp",
    iconSize: 66,
    labelPosition: "right",
    lines: ["clickhouse-", "telemetry-", "cluster"],
    labelOffset: { x: 48, y: -10 },
    metrics: { Compression: "ZSTD (12x)", Ingest: "180k rows/sec", QueryLatency: "4ms" },
  },
  {
    id: "neon-postgres",
    name: "neon-postgres-primary",
    x: 605,
    y: 955,
    r: 46,
    revealDelay: 6200,
    icon: Database,
    iconSize: 32,
    labelPosition: "inside",
    lines: ["neon-postgres-primary"],
    labelOffset: { x: 0, y: 24 },
    metrics: { Engine: "PostgreSQL 16", Storage: "Neon Serverless", IOPS: "12,500" },
  },
  {
    id: "redis-top",
    name: "redis-bullmq-queue",
    x: 742,
    y: 830,
    r: 28,
    revealDelay: 8100,
    imageSrc: "/images/redis_bullmq_queue.webp",
    iconSize: 46,
    labelPosition: "right",
    lines: ["redis-", "bullmq-", "queue"],
    labelOffset: { x: 34, y: -8 },
  },
  {
    id: "redis-mid",
    name: "redis-bullmq-queue",
    x: 745,
    y: 940,
    r: 36,
    revealDelay: 8400,
    imageSrc: "/images/redis_cache.webp",
    iconSize: 58,
    labelPosition: "right",
    lines: ["redis-bullmq-", "queue"],
    labelOffset: { x: 42, y: -4 },
  },
  {
    id: "kafka-pipeline",
    name: "kafka-stream-pipeline",
    x: 565,
    y: 1065,
    r: 32,
    revealDelay: 8550,
    imageSrc: "/images/kafka_stream_pipelin.webp",
    iconSize: 58,
    labelPosition: "right",
    lines: ["kafka-stream-", "pipeline"],
    labelOffset: { x: 38, y: -4 },
  },
  {
    id: "s3-store",
    name: "s3-artifact-store",
    x: 730,
    y: 1065,
    r: 32,
    revealDelay: 8750,
    imageSrc: "/images/s3_storage_icon.webp",
    iconSize: 58,
    labelPosition: "right",
    lines: ["s3-artifact-", "store"],
    labelOffset: { x: 36, y: -4 },
  },
];

const nodeMap = new Map(NODES.map((n) => [n.id, n]));

/* ═══════════════════════════════════════════════════════════════════════════
   ── MULTI-STRAND BEZIER ENGINE & PATH LENGTH COMPUTATION
   ── Generates organic tree branch curves with accurate path length for true growth
   ═══════════════════════════════════════════════════════════════════════ */

function generateBezier(
  sx: number, sy: number,
  tx: number, ty: number,
  offsetX: number, offsetY: number,
  curvature: number = 0.35,
  bendDir: number = 1,
  bowDepth: number = 14,
  curveType: "s-curve" | "arc" = "s-curve"
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  if (curveType === "arc") {
    const cx1 = sx + dx * curvature + offsetX + normalX * bendDir * bowDepth;
    const cy1 = sy + dy * curvature + offsetY + normalY * bendDir * bowDepth;
    const cx2 = tx - dx * curvature + offsetX + normalX * bendDir * bowDepth;
    const cy2 = ty - dy * curvature + offsetY + normalY * bendDir * bowDepth;
    return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
  }

  const cx1 = sx + dx * curvature + offsetX + normalX * bendDir * bowDepth;
  const cy1 = sy + dy * 0.25 + offsetY + normalY * bendDir * bowDepth;
  const cx2 = tx - dx * curvature + offsetX - normalX * bendDir * (bowDepth * 0.65);
  const cy2 = ty - dy * 0.25 + offsetY - normalY * bendDir * (bowDepth * 0.65);

  return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
}

function getApproxBezierLength(
  sx: number, sy: number,
  tx: number, ty: number,
  bowDepth: number
): number {
  const chord = Math.hypot(tx - sx, ty - sy);
  return Math.round(chord * 1.15 + Math.abs(bowDepth) * 0.85 + 20);
}

interface ConnectionDef {
  from: string;
  to: string;
  strands: number;
  baseWidth: number;
  startDelay: number;
  duration: number;
  curvature?: number;
  spread?: number;
  bendDir?: number;
  bowDepth?: number;
  curveType?: "s-curve" | "arc";
}

const CONNECTIONS: ConnectionDef[] = [
  // ── Canopy: Deliberate, graceful sprouts outward from Origin Hub (duration ~1.9s) ──
  { from: "ai-agent", to: "incident-auto-fixer", strands: 4,  baseWidth: 0.9, startDelay: 1000, duration: 1900, curvature: 0.08, spread: 6, bowDepth: 3 },
  { from: "ai-agent", to: "go-probe-top",        strands: 4,  baseWidth: 0.9, startDelay: 1000, duration: 1900, curvature: 0.08, spread: 6, bowDepth: 3 },
  { from: "ai-agent", to: "log-analyzer",        strands: 3,  baseWidth: 0.85, startDelay: 1000, duration: 1900, curvature: 0.06, spread: 5, bowDepth: 2 },
  { from: "ai-agent", to: "ssl-cron",            strands: 4,  baseWidth: 0.9, startDelay: 1100, duration: 1950, curvature: 0.08, spread: 6, bowDepth: 3 },
  { from: "ai-agent", to: "go-probe-right",       strands: 10, baseWidth: 1.1, startDelay: 1100, duration: 2000, curvature: 0.22, spread: 10, bowDepth: 8 },
  { from: "go-probe-top", to: "go-probe-right",  strands: 4,  baseWidth: 0.85, startDelay: 2900, duration: 1100, curvature: 0.32, spread: 6, bowDepth: 12 },

  // ── Hub → Main Trunks K & L (Slow, majestic trunk growth across ~2.2s) ──
  { from: "ai-agent", to: "app-backend",         strands: 18, baseWidth: 1.2, startDelay: 1200, duration: 2200, curvature: 0.38, spread: 16, bendDir: -1, bowDepth: 36 },
  { from: "ai-agent", to: "app-frontend-large",  strands: 12, baseWidth: 1.1, startDelay: 1300, duration: 2300, curvature: 0.16, spread: 12, bendDir: 1,  bowDepth: 12 },
  { from: "go-probe-right", to: "app-backend",   strands: 9,  baseWidth: 1.0, startDelay: 3100, duration: 1400, curvature: 0.32, spread: 9, bendDir: 1,  bowDepth: 24 },
  { from: "go-probe-right", to: "express-gw",    strands: 5,  baseWidth: 0.85, startDelay: 3100, duration: 1700, curvature: 0.22, spread: 6, bowDepth: 10 },

  // ── Compute Internal: Parallel sprouts forward from Node K (duration ~1.9s) ──
  { from: "app-backend", to: "app-frontend-large", strands: 20, baseWidth: 1.3, startDelay: 3500, duration: 1900, curvature: 0.46, spread: 20, bendDir: -1, bowDepth: 56 },
  { from: "app-backend", to: "express-gw",         strands: 6,  baseWidth: 0.9, startDelay: 3600, duration: 1900, curvature: 0.24, spread: 7, bowDepth: 12 },
  { from: "app-backend", to: "deploy-orch",        strands: 6,  baseWidth: 0.9, startDelay: 3700, duration: 1950, curvature: 0.20, spread: 7, bowDepth: 10 },
  { from: "app-backend", to: "docker-kaniko",      strands: 6,  baseWidth: 0.9, startDelay: 3800, duration: 2000, curvature: 0.18, spread: 7, bowDepth: 10 },
  { from: "app-backend", to: "app-frontend-small", strands: 9,  baseWidth: 1.0, startDelay: 3700, duration: 1950, curvature: 0.15, spread: 10, bowDepth: 8 },
  { from: "app-backend", to: "github-webhook",     strands: 5,  baseWidth: 0.85, startDelay: 3900, duration: 2050, curvature: 0.18, spread: 6, bowDepth: 8 },
  { from: "express-gw", to: "deploy-orch",         strands: 4,  baseWidth: 0.8, startDelay: 5500, duration: 900,  curvature: 0.15, spread: 5, bowDepth: 6 },
  { from: "deploy-orch", to: "docker-kaniko",      strands: 4,  baseWidth: 0.8, startDelay: 5650, duration: 900,  curvature: 0.1,  spread: 5, bowDepth: 5 },
  { from: "docker-kaniko", to: "github-webhook",   strands: 4,  baseWidth: 0.8, startDelay: 5800, duration: 900,  curvature: 0.18, spread: 5, bowDepth: 6 },
  { from: "app-frontend-small", to: "github-webhook", strands: 4, baseWidth: 0.8, startDelay: 5650, duration: 900,  curvature: 0.18, spread: 5, bowDepth: 6 },

  // ── Ingress & Edge Security: Parallel organic arcs from Frontend Node ──
  { from: "app-frontend-large", to: "edge-hub",        strands: 9,  baseWidth: 1.0,  startDelay: 3700, duration: 1900, curvature: 0.38, spread: 11, bendDir: -1, bowDepth: 32, curveType: "arc" },
  { from: "app-frontend-large", to: "cloudflare-top",  strands: 6,  baseWidth: 0.85, startDelay: 3700, duration: 1950, curvature: 0.36, spread: 8,  bendDir: 1,  bowDepth: 30, curveType: "arc" },
  { from: "cloudflare-top", to: "edge-hub",            strands: 4,  baseWidth: 0.85, startDelay: 5650, duration: 900,  curvature: 0.34, spread: 6,  bendDir: 1,  bowDepth: 20, curveType: "arc" },
  { from: "cloudflare-top", to: "cloudflare-bot",      strands: 4,  baseWidth: 0.8,  startDelay: 5700, duration: 1850, curvature: 0.35, spread: 5,  bendDir: 1,  bowDepth: 22, curveType: "arc" },
  { from: "cloudflare-top", to: "jwt-vault-left",      strands: 4,  baseWidth: 0.8,  startDelay: 5800, duration: 1950, curvature: 0.38, spread: 6,  bendDir: 1,  bowDepth: 34, curveType: "arc" },
  { from: "edge-hub", to: "ssl-terminator",            strands: 5,  baseWidth: 0.85, startDelay: 5700, duration: 1850, curvature: 0.36, spread: 7,  bendDir: -1, bowDepth: 26, curveType: "arc" },
  { from: "edge-hub", to: "cloudflare-bot",            strands: 4,  baseWidth: 0.8,  startDelay: 5700, duration: 1850, curvature: 0.32, spread: 5,  bendDir: -1, bowDepth: 18, curveType: "arc" },
  { from: "edge-hub", to: "jwt-vault-mid",             strands: 4,  baseWidth: 0.8,  startDelay: 5800, duration: 1950, curvature: 0.36, spread: 6,  bendDir: -1, bowDepth: 24, curveType: "arc" },
  { from: "edge-hub", to: "rate-limiter",              strands: 4,  baseWidth: 0.8,  startDelay: 5900, duration: 2000, curvature: 0.36, spread: 6,  bendDir: -1, bowDepth: 30, curveType: "arc" },
  { from: "jwt-vault-left", to: "jwt-vault-mid",       strands: 3,  baseWidth: 0.8,  startDelay: 7750, duration: 800,  curvature: 0.32, spread: 5,  bendDir: 1,  bowDepth: 16, curveType: "arc" },
  { from: "jwt-vault-mid", to: "rate-limiter",         strands: 3,  baseWidth: 0.8,  startDelay: 7750, duration: 800,  curvature: 0.32, spread: 5,  bendDir: 1,  bowDepth: 16, curveType: "arc" },
  { from: "ssl-terminator", to: "rate-limiter",        strands: 4,  baseWidth: 0.8,  startDelay: 7550, duration: 850,  curvature: 0.36, spread: 6,  bendDir: -1, bowDepth: 24, curveType: "arc" },

  // ── Data Fabric Roots: Parallel branches down to ClickHouse & Postgres ──
  { from: "app-backend", to: "clickhouse",        strands: 13, baseWidth: 1.2, startDelay: 3800, duration: 2200, curvature: 0.32, spread: 13, bendDir: -1, bowDepth: 22 },
  { from: "app-backend", to: "neon-postgres",     strands: 16, baseWidth: 1.2, startDelay: 3900, duration: 2300, curvature: 0.35, spread: 15, bendDir: 1,  bowDepth: 24 },
  { from: "app-frontend-large", to: "clickhouse", strands: 10, baseWidth: 1.1, startDelay: 3900, duration: 2200, curvature: 0.44, spread: 12, bendDir: -1, bowDepth: 34 },
  { from: "app-frontend-large", to: "neon-postgres", strands: 10, baseWidth: 1.1, startDelay: 4000, duration: 2300, curvature: 0.42, spread: 12, bendDir: -1, bowDepth: 30 },
  { from: "app-frontend-small", to: "clickhouse", strands: 5,  baseWidth: 0.85, startDelay: 5650, duration: 1400, curvature: 0.18, spread: 6, bowDepth: 8 },
  { from: "app-frontend-small", to: "neon-postgres", strands: 5, baseWidth: 0.85, startDelay: 5650, duration: 1450, curvature: 0.22, spread: 6, bowDepth: 10 },

  // ── Deep Roots: Persistence to queues & storage (duration ~2.2s) ──
  { from: "clickhouse", to: "redis-top",          strands: 4,  baseWidth: 0.8, startDelay: 6100, duration: 2000, curvature: 0.14, spread: 5, bowDepth: 6 },
  { from: "clickhouse", to: "neon-postgres",      strands: 11, baseWidth: 1.1, startDelay: 6100, duration: 1100, curvature: 0.25, spread: 11, bowDepth: 14 },
  { from: "redis-top", to: "redis-mid",           strands: 4,  baseWidth: 0.8, startDelay: 8100, duration: 950,  curvature: 0.1,  spread: 5, bowDepth: 4 },
  { from: "neon-postgres", to: "redis-mid",       strands: 5,  baseWidth: 0.85, startDelay: 6300, duration: 2100, curvature: 0.20, spread: 7, bowDepth: 8 },
  { from: "neon-postgres", to: "kafka-pipeline",  strands: 5,  baseWidth: 0.85, startDelay: 6400, duration: 2150, curvature: 0.16, spread: 7, bowDepth: 8 },
  { from: "neon-postgres", to: "s3-store",        strands: 5,  baseWidth: 0.85, startDelay: 6500, duration: 2250, curvature: 0.22, spread: 7, bowDepth: 8 },
  { from: "redis-mid", to: "s3-store",            strands: 4,  baseWidth: 0.8, startDelay: 8400, duration: 950,  curvature: 0.18, spread: 6, bowDepth: 6 },
  { from: "kafka-pipeline", to: "s3-store",       strands: 4,  baseWidth: 0.8, startDelay: 8550, duration: 900,  curvature: 0.1,  spread: 6, bowDepth: 5 },
];

function generateAllRibbons(): RibbonStrand[] {
  const ribbons: RibbonStrand[] = [];
  let counter = 0;

  for (const conn of CONNECTIONS) {
    const src = nodeMap.get(conn.from);
    const tgt = nodeMap.get(conn.to);
    if (!src || !tgt) continue;

    const spread = conn.spread ?? 8;
    const curv = conn.curvature ?? 0.35;
    const bendDir = conn.bendDir ?? 1;
    const bowDepth = conn.bowDepth ?? 14;
    const curveType = conn.curveType ?? "s-curve";
    const startDelay = conn.startDelay;
    const duration = conn.duration;
    const approxLength = getApproxBezierLength(src.x, src.y, tgt.x, tgt.y, bowDepth);

    for (let i = 0; i < conn.strands; i++) {
      const offsetFactor = i - (conn.strands - 1) / 2;
      const ox = offsetFactor * (spread * 0.7);
      const oy = offsetFactor * (spread * 0.5);

      const isRibbonBand = conn.strands >= 8 && (i === Math.floor(conn.strands / 2) || i === 1);
      const isPrimary = i === Math.floor(conn.strands / 2);
      const w = isRibbonBand ? 1.8 : 0.85;
      const opacity = isRibbonBand ? 0.32 : 0.58 + (i % 3) * 0.08;
      const hasArrow = conn.strands >= 5 && isPrimary;

      ribbons.push({
        id: `ribbon-${counter++}`,
        path: generateBezier(src.x, src.y, tgt.x, tgt.y, ox, oy, curv, bendDir, bowDepth, curveType),
        width: w,
        opacity,
        hasArrow,
        startDelay: startDelay + i * 16,
        duration: duration + (i % 3) * 25,
        pathLength: approxLength,
        isPrimary,
        sourceId: conn.from,
        targetId: conn.to,
      });
    }
  }

  return ribbons;
}

const ALL_RIBBONS = generateAllRibbons();

/* ═══════════════════════════════════════════════════════════════════════════
   ── TOPOLOGY COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export default function TopologyGraph() {
  const [animationStarted, setAnimationStarted] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<NodeItem | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Progressive botanical tree growth trigger automatically when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If IntersectionObserver is available, start when in viewport; fallback to smooth timer
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting) {
            setAnimationStarted(true);
            observer.disconnect();
          }
        },
        { threshold: 0.12 }
      );
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      const timer = setTimeout(() => setAnimationStarted(true), 150);
      return () => clearTimeout(timer);
    }
  }, []);

  const activeNode = hoveredNode || selectedNode;

  const activeConnections = useMemo(() => {
    if (!activeNode) return new Set<string>();
    const s = new Set<string>();
    for (const r of ALL_RIBBONS) {
      if (r.sourceId === activeNode.id || r.targetId === activeNode.id) {
        s.add(r.sourceId);
        s.add(r.targetId);
      }
    }
    return s;
  }, [activeNode]);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ maxWidth: "896px" }}
      onClick={() => setSelectedNode(null)}
    >
      <svg
        viewBox="0 0 896 1180"
        className="w-full h-auto overflow-visible"
        preserveAspectRatio="xMidYMin meet"
        style={{ filter: "drop-shadow(0 25px 50px rgba(0,0,0,0.85))" }}
      >
        <defs>
          {/* 3D Deep Elevation Drop Shadow */}
          <filter id="node3dShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#000000" floodOpacity="0.85" />
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
          </filter>

          {/* 3D Spherical Volume Gradients: Crisp upper-left light source */}
          <radialGradient id="sphereGrad" cx="34%" cy="28%" r="68%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f8fafc" />
            <stop offset="85%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </radialGradient>

          {/* 3D Hover Emerald Gloss Sphere */}
          <radialGradient id="sphereHoverGrad" cx="34%" cy="28%" r="68%">
            <stop offset="0%" stopColor="#ecfdf5" />
            <stop offset="45%" stopColor="#a7f3d0" />
            <stop offset="80%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </radialGradient>

          {/* 3D Connected Node Accent Sphere */}
          <radialGradient id="sphereConnectedGrad" cx="34%" cy="28%" r="68%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="65%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#d1fae5" />
          </radialGradient>

          {/* Highlight ribbon gradient - rich emerald stream */}
          <linearGradient id="streamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#047857" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#059669" stopOpacity="0.80" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.75" />
          </linearGradient>

          {/* Organic graphite/smoke ribbon gradient */}
          <linearGradient id="greyRibbon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#71717a" stopOpacity="0.55" />
            <stop offset="35%" stopColor="#a1a1aa" stopOpacity="0.68" />
            <stop offset="70%" stopColor="#71717a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#52525b" stopOpacity="0.4" />
          </linearGradient>

          {/* Directional markers */}
          <marker
            id="arr"
            viewBox="0 0 6 6"
            refX="4"
            refY="3"
            markerWidth="3.5"
            markerHeight="3.5"
            orient="auto"
          >
            <path d="M 0 1.2 L 4.5 3 L 0 4.8 z" fill="#a1a1aa" opacity="0.65" />
          </marker>
          <marker
            id="arr-emerald"
            viewBox="0 0 6 6"
            refX="4"
            refY="3"
            markerWidth="3.5"
            markerHeight="3.5"
            orient="auto"
          >
            <path d="M 0 1.2 L 4.5 3 L 0 4.8 z" fill="#059669" opacity="0.85" />
          </marker>
        </defs>

        {/* ── CONNECTION RIBBONS (Outward cascading streams) ── */}
        <g>
          {ALL_RIBBONS.map((ribbon, idx) => {
            const isHighlighted =
              activeNode &&
              (activeNode.id === ribbon.sourceId || activeNode.id === ribbon.targetId);

            return (
              <g key={ribbon.id}>
                {/* Physical Branch Stroke Growing Forward slowly and deliberately */}
                <path
                  d={ribbon.path}
                  fill="none"
                  stroke={isHighlighted ? "url(#streamGrad)" : "url(#greyRibbon)"}
                  strokeWidth={isHighlighted ? ribbon.width + 0.45 : ribbon.width}
                  strokeLinecap="round"
                  strokeOpacity={animationStarted ? (isHighlighted ? 0.75 : ribbon.opacity) : 0}
                  markerEnd={ribbon.hasArrow ? (isHighlighted ? "url(#arr-emerald)" : "url(#arr)") : undefined}
                  style={{
                    strokeDasharray: ribbon.pathLength,
                    strokeDashoffset: animationStarted ? 0 : ribbon.pathLength,
                    transition: `stroke-dashoffset ${ribbon.duration}ms cubic-bezier(0.25, 0.1, 0.25, 1) ${ribbon.startDelay}ms, stroke-opacity 0.5s ease ${ribbon.startDelay}ms, stroke-width 0.2s ease`,
                  }}
                />

                {/* Visible Growth Lead Photon: Guides the line tip slowly in real time */}
                {animationStarted && ribbon.isPrimary && (
                  <g opacity={0}>
                    <animateMotion
                      path={ribbon.path}
                      dur={`${ribbon.duration}ms`}
                      begin={`${ribbon.startDelay}ms`}
                      fill="freeze"
                      repeatCount="1"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0.95;0.95;0"
                      keyTimes="0;0.04;0.96;1"
                      dur={`${ribbon.duration}ms`}
                      begin={`${ribbon.startDelay}ms`}
                      fill="freeze"
                    />
                    {/* Glowing emerald aura */}
                    <circle r={4.5} fill="#10b981" opacity={0.3} />
                    {/* Core photon spark */}
                    <circle r={2.6} fill="#34d399" opacity={0.9} />
                    <circle r={1.2} fill="#ffffff" />
                  </g>
                )}

                {/* Post-Growth Steady Traffic Photons */}
                {idx % 7 === 0 && (
                  <g style={{ opacity: animationStarted ? 1 : 0, transition: `opacity 0.5s ease ${ribbon.startDelay + ribbon.duration}ms` }}>
                    <animateMotion
                      path={ribbon.path}
                      dur={`${3.2 + (idx % 6) * 0.4}s`}
                      repeatCount="indefinite"
                      begin={`${(ribbon.startDelay + ribbon.duration + 300) / 1000}s`}
                    />
                    <circle r={3.8} fill="#059669" opacity={0.25} />
                    <circle r={2.2} fill="#10b981" opacity={0.8} />
                    <circle r={1.1} fill="#e6fffa" />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* ── STATIC HUD TOOLTIPS ── */}
        <g>
          {/* Tooltip 1: ai-remediation-agent */}
          <g
            filter="drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
            style={{
              opacity: animationStarted ? 1 : 0,
              transition: "opacity 0.8s ease 500ms",
            }}
          >
            <line x1="600" y1="94" x2="450" y2="203" stroke="#71717a" strokeWidth="1" strokeDasharray="3 3" opacity="0.8" />
            <circle cx="450" cy="203" r="2.5" fill="#a1a1aa" />
            <rect x="600" y="48" width="185" height="92" rx="3" fill="#141416" stroke="#3f3f46" strokeWidth="1" />
            <rect x="600" y="48" width="185" height="26" rx="3" fill="#1f1f23" />
            <text x="610" y="65" fill="#f4f4f5" fontSize="11" fontFamily="monospace" fontWeight="600">ai-remediation-agent</text>
            <text x="610" y="90" fill="#a1a1aa" fontSize="10" fontFamily="monospace">Latency:</text>
            <text x="775" y="90" fill="#f4f4f5" fontSize="10" fontFamily="monospace" textAnchor="end">1.1ms</text>
            <text x="610" y="105" fill="#a1a1aa" fontSize="10" fontFamily="monospace">Probes/s:</text>
            <text x="775" y="105" fill="#f4f4f5" fontSize="10" fontFamily="monospace" textAnchor="end">148k</text>
            <text x="610" y="120" fill="#a1a1aa" fontSize="10" fontFamily="monospace">Auto-Patched:</text>
            <text x="775" y="120" fill="#f4f4f5" fontSize="10" fontFamily="monospace" textAnchor="end">99.9%</text>
            <text x="610" y="134" fill="#a1a1aa" fontSize="10" fontFamily="monospace">Status:</text>
            <circle cx="728" cy="131" r="5" fill="#22c55e" opacity="0.3">
              <animate attributeName="r" values="3.5;6.5;3.5" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="728" cy="131" r="2.5" fill="#22c55e" />
            <text x="775" y="134" fill="#22c55e" fontSize="10" fontFamily="monospace" textAnchor="end">Active</text>
          </g>

          {/* Tooltip 2: go-uptime-probe-engine */}
          <g
            filter="drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
            style={{
              opacity: animationStarted ? 1 : 0,
              transition: "opacity 0.8s ease 3200ms",
            }}
          >
            <line x1="715" y1="188" x2="618" y2="218" stroke="#71717a" strokeWidth="1" strokeDasharray="3 3" opacity="0.8" />
            <circle cx="618" cy="218" r="2.5" fill="#a1a1aa" />
            <rect x="715" y="166" width="170" height="68" rx="3" fill="#141416" stroke="#3f3f46" strokeWidth="1" />
            <rect x="715" y="166" width="170" height="24" rx="3" fill="#1f1f23" />
            <text x="725" y="182" fill="#f4f4f5" fontSize="10" fontFamily="monospace" fontWeight="600">go-uptime-probe-engine</text>
            <text x="725" y="204" fill="#a1a1aa" fontSize="9.5" fontFamily="monospace">Pings/sec:</text>
            <text x="875" y="204" fill="#f4f4f5" fontSize="9.5" fontFamily="monospace" textAnchor="end">142k</text>
            <text x="725" y="220" fill="#a1a1aa" fontSize="9.5" fontFamily="monospace">Global Latency:</text>
            <text x="875" y="220" fill="#f4f4f5" fontSize="9.5" fontFamily="monospace" textAnchor="end">0.8ms</text>
          </g>
        </g>

        {/* ── NODES: Real-time 3D Birth Shockwave & Creation strictly on the spot ── */}
        <g>
          {NODES.map((node) => {
            const isAiAgent = node.id === "ai-agent";
            const delay = node.revealDelay ?? 0;
            const isHovered = activeNode?.id === node.id;
            const isConnected = activeConnections.has(node.id);
            const Icon = node.icon;

            return (
              <g
                key={node.id}
                id={`node-${node.id}`}
                className="cursor-pointer"
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode((prev) => (prev?.id === node.id ? null : node));
                }}
              >
                {/* 3D Real-time Arrival Concentric Shockwaves: burst radially from center (0,0) on the spot */}
                {animationStarted && (
                  <g>
                    {/* Primary energy burst */}
                    <circle cx={0} cy={0} fill="none" stroke="#10b981" strokeWidth="2.5" opacity="0">
                      <animate
                        attributeName="r"
                        values={`${node.r * 0.3};${node.r + 26}`}
                        dur="0.85s"
                        begin={`${delay}ms`}
                        fill="freeze"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.95;0.45;0"
                        keyTimes="0;0.5;1"
                        dur="0.85s"
                        begin={`${delay}ms`}
                        fill="freeze"
                      />
                    </circle>
                    {/* Secondary soft echo ring */}
                    <circle cx={0} cy={0} fill="none" stroke="#34d399" strokeWidth="1.5" opacity="0">
                      <animate
                        attributeName="r"
                        values={`${node.r * 0.5};${node.r + 16}`}
                        dur="0.75s"
                        begin={`${delay + 120}ms`}
                        fill="freeze"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.8;0.3;0"
                        keyTimes="0;0.5;1"
                        dur="0.75s"
                        begin={`${delay + 120}ms`}
                        fill="freeze"
                      />
                    </circle>
                  </g>
                )}

                {/* Node Container: strictly blooms on the spot from (0,0) without lateral drift */}
                <g
                  filter="url(#node3dShadow)"
                  style={{
                    opacity: animationStarted ? 1 : 0,
                    transform: `scale(${animationStarted ? 1 : 0})`,
                    transformOrigin: "0px 0px",
                    transition: `opacity 0.45s ease-out ${delay}ms, transform 0.85s cubic-bezier(0.34, 1.45, 0.64, 1) ${delay}ms`,
                  }}
                >
                  {/* Orbit ring (Root Hub) */}
                  {node.dashedRing && (
                    <circle
                      cx={0}
                      cy={0}
                      r={node.dashedRing}
                      fill="none"
                      stroke={isHovered ? "#10b981" : "#71717a"}
                      strokeWidth={isHovered ? "1.6" : "1.3"}
                      strokeDasharray="6 5"
                      opacity={isHovered ? 0.95 : 0.6}
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 0 0"
                        to="360 0 0"
                        dur={isHovered ? "35s" : "90s"}
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Glass aura rings */}
                  {node.glassRings && node.glassRings.map((gr, i) => (
                    <circle
                      key={i}
                      cx={0}
                      cy={0}
                      r={gr}
                      fill="none"
                      stroke={isHovered ? "#10b981" : "#a1a1aa"}
                      strokeWidth="0.8"
                      opacity={isHovered ? 0.6 - i * 0.1 : 0.35 - i * 0.1}
                    />
                  ))}

                  {/* Active hover rotating orbit ring */}
                  {isHovered && !node.dashedRing && (
                    <circle
                      cx={0}
                      cy={0}
                      r={node.r + 8}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.6"
                      strokeDasharray="5 4"
                      opacity={0.9}
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 0 0"
                        to="360 0 0"
                        dur="14s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Hover outer glow halo */}
                  {isHovered && (
                    <circle
                      cx={0}
                      cy={0}
                      r={node.r + 14}
                      fill="none"
                      stroke="#059669"
                      strokeWidth="1"
                      opacity={0.25}
                    />
                  )}

                  {/* Dark green accent ring for connected nodes */}
                  {!isHovered && isConnected && (
                    <circle
                      cx={0}
                      cy={0}
                      r={node.r + 5}
                      fill="none"
                      stroke="#047857"
                      strokeWidth="1.8"
                      opacity={0.85}
                      style={{ transition: "opacity 0.25s ease, stroke 0.25s ease" }}
                    />
                  )}

                  {/* 3D Spherical Volume Body */}
                  <circle
                    cx={0}
                    cy={0}
                    r={node.r}
                    fill={isHovered ? "url(#sphereHoverGrad)" : isConnected ? "url(#sphereConnectedGrad)" : "url(#sphereGrad)"}
                    stroke={isHovered ? "#047857" : isConnected ? "#065f46" : "#0f172a"}
                    strokeWidth={isHovered ? 2.8 : isConnected ? 2.4 : 2.0}
                    style={{
                      transition: "fill 0.25s ease, stroke 0.25s ease, stroke-width 0.25s ease",
                    }}
                  />

                  {/* 3D Specular Highlight Crescent */}
                  <ellipse
                    cx={0}
                    cy={-node.r * 0.42}
                    rx={node.r * 0.52}
                    ry={node.r * 0.22}
                    fill="#ffffff"
                    opacity={isHovered ? 0.4 : 0.65}
                    className="pointer-events-none select-none"
                  />

                  {/* Center Icon */}
                  {(node.imageSrc || (Icon && node.iconSize !== 0)) && (
                    <foreignObject
                      x={-node.r + 4}
                      y={node.labelPosition === "inside" ? -node.r + 14 : -node.r + 4}
                      width={(node.r - 4) * 2}
                      height={node.labelPosition === "inside" ? (node.r - 4) * 1.3 : (node.r - 4) * 2}
                      className="pointer-events-none select-none"
                      style={{ pointerEvents: "none" }}
                    >
                      <div
                        className="w-full h-full flex items-center justify-center overflow-hidden rounded-full pointer-events-none select-none"
                        style={{ pointerEvents: "none" }}
                      >
                        {node.imageSrc ? (
                          <img
                            src={node.imageSrc}
                            alt={node.name}
                            className="object-contain pointer-events-none select-none"
                            style={{
                              width: `${node.iconSize || Math.max(16, node.r * 0.7)}px`,
                              height: `${node.iconSize || Math.max(16, node.r * 0.7)}px`,
                              pointerEvents: "none",
                            }}
                          />
                        ) : (
                          <Icon
                            style={{
                              width: node.iconSize || Math.max(14, node.r * 0.45),
                              height: node.iconSize || Math.max(14, node.r * 0.45),
                              pointerEvents: "none",
                            }}
                            strokeWidth={1.8}
                            className="text-black pointer-events-none select-none"
                          />
                        )}
                      </div>
                    </foreignObject>
                  )}

                  {/* Text Labels: Smoothly unfurl right on the spot */}
                  {node.lines.length > 0 && (
                    <g
                      className="pointer-events-none select-none"
                      style={{
                        opacity: animationStarted ? 1 : 0,
                        transition: `opacity 0.6s ease-out ${delay + 250}ms`,
                      }}
                    >
                      {node.labelPosition === "inside" ? (
                        // Label centered inside node under icon
                        node.lines.map((line, li) => (
                          <text
                            key={li}
                            x={node.labelOffset?.x ?? 0}
                            y={
                              node.labelOffset?.y !== undefined
                                ? node.labelOffset.y + li * 12
                                : 26 + li * 12
                            }
                            fill="#09090b"
                            fontSize={node.r >= 60 ? "11" : "10"}
                            fontWeight="700"
                            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
                            textAnchor="middle"
                          >
                            {line}
                          </text>
                        ))
                      ) : (
                        // Label outside node
                        node.lines.map((line, li) => (
                          <text
                            key={li}
                            x={(node.labelOffset?.x ?? (node.r + 10))}
                            y={(node.labelOffset?.y ?? 0) + li * 12}
                            fill="#f4f4f5"
                            fontSize="10"
                            fontWeight="600"
                            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
                            textAnchor={
                              node.labelPosition === "bottom"
                                ? "middle"
                                : node.labelPosition === "bottom-left" || node.labelPosition === "left"
                                ? "end"
                                : "start"
                            }
                            style={{ textShadow: "0 2px 6px rgba(0,0,0,0.95)" }}
                          >
                            {line}
                          </text>
                        ))
                      )}
                    </g>
                  )}
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating HUD Tooltip on Hover or Tap */}
      {activeNode && activeNode.metrics && (
        <div
          className="absolute z-40 bg-[#0a0b0e]/95 border border-zinc-700/80 rounded-[3px] p-3 shadow-2xl backdrop-blur-md pointer-events-none"
          style={{
            top: `${Math.max(2, Math.min(75, (activeNode.y / 1180) * 100 - 6))}%`,
            left: activeNode.x > 450 ? "4%" : "54%",
            minWidth: "210px",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-1.5 mb-2">
            <span className="font-mono text-[10.5px] text-zinc-100 font-semibold tracking-tight">
              {activeNode.name}
            </span>
            <span className="flex items-center gap-1 text-[8.5px] font-mono text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[9.5px]">
            {Object.entries(activeNode.metrics).map(([key, val]) => (
              <div key={key} className="flex flex-col">
                <span className="text-zinc-500 uppercase tracking-wider text-[8px]">{key}</span>
                <span className="text-zinc-200 font-medium">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
