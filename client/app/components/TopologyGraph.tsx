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
  reversedPath: string;
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
    name: "synthetic-check-engine",
    x: 588,
    y: 234,
    r: 32,
    revealDelay: 3100,
    glassRings: [40, 47],
    imageSrc: "/images/synthetic_check_engine.webp",
    iconSize: 48,
    labelPosition: "right",
    lines: ["synthetic-", "check-engine"],
    labelOffset: { x: 56, y: -2 },
    metrics: { "Pings/sec": "142k", "Global Latency": "0.8ms" },
  },
  {
    id: "log-analyzer",
    name: "log-analyzer-llm",
    x: 196,
    y: 210,
    r: 28,
    revealDelay: 2900,
    imageSrc: "/images/analyse_llm.webp",
    iconSize: 40,
    labelPosition: "bottom",
    lines: ["log-analyzer-", "llm"],
    labelOffset: { x: 0, y: 38 },
  },
  {
    id: "ssl-cron",
    name: "ssl-expiry-cron",
    x: 174,
    y: 304,
    r: 25,
    revealDelay: 3050,
    imageSrc: "/images/ssl_expiry_cron.webp",
    iconSize: 85,
    labelPosition: "bottom",
    lines: ["ssl-expiry-", "cron"],
    labelOffset: { x: 0, y: 35 },
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
    name: "dashboard",
    x: 582,
    y: 672,
    r: 38,
    revealDelay: 5650,
    imageSrc: "/images/dashboard_icon.webp",
    iconSize: 78,
    labelPosition: "bottom-right",
    lines: ["dashboard"],
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
    name: "cloudflare-waf",
    x: 205,
    y: 830,
    r: 22,
    revealDelay: 7550,
    imageSrc: "/images/cloudflare_edge_waf.webp",
    iconSize: 42,
    labelPosition: "right",
    lines: ["cloudflare-", "waf"],
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
    name: "session-auth-guard",
    x: 265,
    y: 910,
    r: 25,
    revealDelay: 7750,
    imageSrc: "/images/session_auth_guard.webp",
    iconSize: 95,
    labelPosition: "bottom",
    lines: ["session-auth-", "guard"],
    labelOffset: { x: -24, y: 32 },
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
    name: "redis-cache-layer",
    x: 745,
    y: 940,
    r: 36,
    revealDelay: 8400,
    imageSrc: "/images/redis_cache.webp",
    iconSize: 58,
    labelPosition: "right",
    lines: ["redis-cache-", "layer"],
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

function generatePinchedSCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  offsetFactor: number,
  midSpread: number = 14,
  endSpread: number = 2.2,
  bowDepth: number = 32,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  const midX = (sx + tx) / 2 + normalX * offsetFactor * midSpread;
  const midY = (sy + ty) / 2 + normalY * offsetFactor * midSpread;

  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (bowDepth * 0.8);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (bowDepth * 0.8);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (bowDepth * 0.4);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (bowDepth * 0.4);

  const cx3 = midX + dx * 0.16 - normalX * bendDir * (bowDepth * 0.4);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (bowDepth * 0.4);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (bowDepth * 0.8);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (bowDepth * 0.8);

  return `M ${sx} ${sy} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${tx} ${ty}`;
}

function generateOrganicTwistedSCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number,
  midSpread: number = 8.5,
  endSpread: number = 0.7,
  baseBowDepth: number = 36,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  const offsetFactor = strandIndex - (totalStrands - 1) / 2;

  // Each line has a distinct, uniquely varied curve wave
  const bowVariation = [1.22, 0.92, 1.14, 0.82][strandIndex % 4] ?? 1.0;
  const lobe1Ratio = [0.85, 0.70, 0.88, 0.65][strandIndex % 4] ?? 0.8;
  const lobe2Ratio = [0.65, 0.88, 0.70, 0.85][strandIndex % 4] ?? 0.8;
  const tMid = 0.5 + ([-0.05, 0.04, -0.02, 0.05][strandIndex % 4] ?? 0);

  const midX = sx + dx * tMid + normalX * offsetFactor * midSpread;
  const midY = sy + dy * tMid + normalY * offsetFactor * midSpread;

  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  const strandBow = baseBowDepth * bowVariation;

  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.38);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.38);

  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.38);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.38);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * lobe2Ratio);

  return `M ${sx} ${sy} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${tx} ${ty}`;
}

function generateIrregularTwinSCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  midSpread: number = 8,
  endSpread: number = 1.0,
  baseBowDepth: number = 22,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  const offsetFactor = strandIndex === 0 ? -0.5 : 0.5;

  // Strand 0 & 1 have complementary asymmetric lobes for a varying, irregular gap
  const lobe1Ratio = strandIndex === 0 ? 1.15 : 0.72;
  const lobe2Ratio = strandIndex === 0 ? 0.68 : 1.18;
  const tMid = strandIndex === 0 ? 0.46 : 0.54;
  const strandMidSpread = strandIndex === 0 ? midSpread * 0.85 : midSpread * 1.15;

  const midX = sx + dx * tMid + normalX * offsetFactor * strandMidSpread;
  const midY = sy + dy * tMid + normalY * offsetFactor * strandMidSpread;

  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${sx} ${sy} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${tx} ${ty}`;
}

function generateIrregularTrioSCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  midSpread: number = 8,
  endSpread: number = 0.8,
  baseBowDepth: number = 20,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands: -1 (strand 0), 0 (strand 1), +1 (strand 2)
  const offsetFactor = strandIndex === 0 ? -1 : strandIndex === 1 ? 0 : 1;

  // Irregular gap dynamics: asymmetric lobes and shifted inflection midpoints
  // Strand 0 opens wide in first lobe, tighter in second lobe
  // Strand 1 stays balanced with a subtle organic offset
  // Strand 2 stays tighter in first lobe, opens wide in second lobe
  const lobe1Ratio = strandIndex === 0 ? 1.25 : strandIndex === 1 ? 0.82 : 0.62;
  const lobe2Ratio = strandIndex === 0 ? 0.62 : strandIndex === 1 ? 0.88 : 1.28;
  const tMid = strandIndex === 0 ? 0.44 : strandIndex === 1 ? 0.51 : 0.58;

  // Dynamic mid offset giving non-uniform spacing across the 3 strands
  const midNormalFactor = strandIndex === 0 ? -1.15 : strandIndex === 1 ? 0.12 : 1.25;

  const midX = sx + dx * tMid + normalX * midNormalFactor * midSpread;
  const midY = sy + dy * tMid + normalY * midNormalFactor * midSpread;

  // Very pinched start and end points
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${sx} ${sy} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${tx} ${ty}`;
}

function generateIrregularClickhouseSCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 9,
  midSpread: number = 4.2,
  endSpread: number = 0.45,
  bypassDepth: number = 72
): string {
  const dx = tx - sx;
  const dy = ty - sy;

  // 9 strands with highly irregular spacing: tight pairs, medium spaces, and open chasms
  // Strictly increasing: ensures zero crossings while delivering rich irregular gaps
  const normOffsets = [-4.0, -3.45, -2.30, -0.85, -0.20, 1.10, 2.00, 2.60, 4.00];
  const irregularFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand so gaps breathe along the trajectory
  const lobe1Ratios = [1.14, 1.10, 0.96, 0.88, 1.00, 1.12, 0.94, 0.86, 1.05];
  const lobe2Ratios = [0.88, 0.92, 1.05, 1.12, 1.00, 0.90, 1.08, 1.14, 0.95];
  const tMids       = [0.48, 0.49, 0.51, 0.52, 0.50, 0.47, 0.53, 0.51, 0.49];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  // Turn to the left to bypass the dashboard node (dashboard is at x=582, y=672, r=38)
  // Base turn pulls x leftwards by bypassDepth (~72px)
  const strandOffset = irregularFactor * midSpread;
  const midX = (sx + tx) / 2 - bypassDepth + strandOffset;
  const midY = sy + dy * tMid;

  // Very pinched start and end points directly at the node rims
  const startOx = irregularFactor * endSpread;
  const endOx = irregularFactor * endSpread;

  // Segment 1: from app-backend (569, 497) turning out to the left towards midX (around x=495)
  const cx1 = sx + dx * 0.20 + startOx - (bypassDepth * 0.45) * lobe1Ratio;
  const cy1 = sy + dy * 0.22;
  const cx2 = midX + 8 * (lobe1Ratio - 1.0);
  const cy2 = midY - dy * 0.16;

  // Segment 2: from midX turning back inwards towards clickhouse (565, 840)
  const cx3 = midX - 8 * (lobe2Ratio - 1.0);
  const cy3 = midY + dy * 0.16;
  const cx4 = tx - dx * 0.20 + endOx - (bypassDepth * 0.35) * (2 - lobe2Ratio);
  const cy4 = ty - dy * 0.22;

  return `M ${(sx + startOx).toFixed(1)} ${sy.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${ty.toFixed(1)}`;
}

function generateIrregularPostgresSCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 13,
  midSpread: number = 2.2,
  endSpread: number = 0.35,
  bypassDepth: number = 96
): string {
  // Shift ending point to the right side of neon-postgres (tx + 24) to avoid sharing the same ending point as dashboard
  const endTargetX = tx + 24;

  const dx = endTargetX - sx;
  const dy = ty - sy;

  // 13 strands with distinct irregular gaps (proper & sufficient gap variation)
  const normOffsets = [-6.85, -6.10, -4.85, -3.25, -2.45, -1.35, 0.15, 1.00, 2.35, 3.10, 4.65, 5.50, 6.90];
  const irregularFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand so gaps breathe along the trajectory
  const lobe1Ratios = [1.12, 1.08, 0.96, 0.90, 1.04, 1.14, 0.98, 0.88, 1.06, 1.12, 0.94, 0.90, 1.05];
  const lobe2Ratios = [0.88, 0.92, 1.04, 1.10, 0.96, 0.86, 1.02, 1.12, 0.94, 0.88, 1.06, 1.10, 0.95];
  const tMids       = [0.45, 0.46, 0.47, 0.48, 0.46, 0.44, 0.47, 0.49, 0.46, 0.44, 0.48, 0.47, 0.45];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.46;

  // Turn to the right to bypass dashboard and run cleanly to the right of the dashboard->postgres line
  const strandOffset = irregularFactor * midSpread;
  const midX = (sx + endTargetX) / 2 + bypassDepth * 0.72 + strandOffset;
  const midY = sy + dy * tMid;

  // Tightly pinched start and end points at the node rims
  const startOx = irregularFactor * endSpread;
  const endOx = irregularFactor * endSpread;

  // Segment 1: from app-backend (569, 497) curving out to the right corridor
  const cx1 = sx + dx * 0.18 + startOx + (bypassDepth * 0.42) * lobe1Ratio;
  const cy1 = sy + dy * 0.20;
  const cx2 = midX + 6 * (lobe1Ratio - 1.0);
  const cy2 = midY - dy * 0.16;

  // Segment 2: from midX sweeping down into the right side of neon-postgres
  const cx3 = midX - 6 * (lobe2Ratio - 1.0);
  const cy3 = midY + dy * 0.16;
  const cx4 = endTargetX - dx * 0.18 + endOx + (bypassDepth * 0.22) * (2 - lobe2Ratio);
  const cy4 = ty - dy * 0.20;

  return `M ${(sx + startOx).toFixed(1)} ${sy.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(endTargetX + endOx).toFixed(1)} ${ty.toFixed(1)}`;
}

function generateIrregularDashboardToPostgresCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 7,
  midSpread: number = 3.2,
  endSpread: number = 0.45,
  bypassDepth: number = 48
): string {
  const dx = tx - sx;
  const dy = ty - sy;

  // 7 strands with distinct irregular gaps (proper & sufficient gap variation)
  const normOffsets = [-3.50, -2.70, -1.25, -0.35, 1.25, 2.10, 3.50];
  const irregularFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand so gaps breathe along the trajectory
  const lobe1Ratios = [1.14, 1.08, 0.95, 1.00, 1.12, 0.92, 1.05];
  const lobe2Ratios = [0.88, 0.94, 1.05, 1.00, 0.90, 1.08, 0.95];
  const tMids       = [0.53, 0.54, 0.56, 0.55, 0.53, 0.57, 0.55];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.55;

  // Turn to the right to bypass clickhouse (clickhouse at x=565, y=840, r=42)
  const strandOffset = irregularFactor * midSpread;
  const midX = (sx + tx) / 2 + bypassDepth + strandOffset;
  const midY = sy + dy * tMid;

  // Tightly pinched start and end points at the node rims
  const startOx = irregularFactor * endSpread;
  const endOx = irregularFactor * endSpread;

  // Segment 1: from dashboard (582, 672) sweeping down-right around clickhouse
  const cx1 = sx + dx * 0.22 + startOx + (bypassDepth * 0.50) * lobe1Ratio;
  const cy1 = sy + dy * 0.22;
  const cx2 = midX + 5 * (lobe1Ratio - 1.0);
  const cy2 = midY - dy * 0.16;

  // Segment 2: from midX curving down-left into neon-postgres (605, 955)
  const cx3 = midX - 5 * (lobe2Ratio - 1.0);
  const cy3 = midY + dy * 0.16;
  const cx4 = tx - dx * 0.22 + endOx + (bypassDepth * 0.35) * (2 - lobe2Ratio);
  const cy4 = ty - dy * 0.22;

  return `M ${(sx + startOx).toFixed(1)} ${sy.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${ty.toFixed(1)}`;
}

function generateIrregularDashboardSCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 6,
  midSpread: number = 3.6,
  endSpread: number = 0.5,
  baseBowDepth: number = 22,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 6 strands with irregular gaps: tight pairs and open chasms
  const normOffsets = [-2.50, -1.85, -0.40, 0.40, 1.75, 2.50];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand
  const lobe1Ratios = [1.18, 1.12, 0.90, 1.05, 0.85, 1.10];
  const lobe2Ratios = [0.85, 0.90, 1.15, 0.95, 1.18, 0.88];
  const tMids       = [0.46, 0.48, 0.53, 0.50, 0.54, 0.47];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const midX = sx + dx * tMid + normalX * offsetFactor * midSpread;
  const midY = sy + dy * tMid + normalY * offsetFactor * midSpread;

  // Tightly pinched start and end points at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${sx} ${sy} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${tx} ${ty}`;
}

function generateIrregularDashboardToClickhouseCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 6,
  midSpread: number = 3.6,
  endSpread: number = 0.45,
  baseBowDepth: number = 18,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 6 strands with irregular gaps: tight pairs, medium spacing, and open breathing chasms
  const normOffsets = [-2.50, -1.85, -0.40, 0.40, 1.75, 2.50];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.16, 1.10, 0.92, 1.05, 0.88, 1.12];
  const lobe2Ratios = [0.86, 0.92, 1.14, 0.95, 1.16, 0.88];
  const tMids       = [0.47, 0.48, 0.52, 0.50, 0.53, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const midX = sx + dx * tMid + normalX * offsetFactor * midSpread;
  const midY = sy + dy * tMid + normalY * offsetFactor * midSpread;

  // Tightly pinched start and end points at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularClickhouseToRedisTopCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 6,
  midSpread: number = 3.4,
  endSpread: number = 0.45,
  downDip: number = 56
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 6 strands with beautiful, organic irregular gaps (paired styling with breathing channels)
  const normOffsets = [-2.60, -1.80, -0.45, 0.45, 1.80, 2.60];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.12, 1.06, 0.95, 1.04, 0.92, 1.08];
  const lobe2Ratios = [0.90, 0.95, 1.08, 0.96, 1.12, 0.92];
  const tMids       = [0.48, 0.49, 0.52, 0.50, 0.53, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  // Move starting point on ClickHouse slightly to the top (towards ~4:15 position on the rim)
  const startTopShift = -13;
  const effectiveSy = sy + startTopShift;

  // Dip generously below the clickhouse telemetry cluster label (label extends to y≈858)
  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + downDip * 0.82 + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe sweeps out from ~4:15 on ClickHouse rim and swoops smoothly downwards under the label
  const cx1 = sx + dx * 0.22 + startOx + normalX * strandOffset;
  const cy1 = effectiveSy + dy * 0.20 + startOy + (downDip * 0.88) * lobe1Ratio + normalY * strandOffset * 0.5;
  const cx2 = midX - dx * 0.16;
  const cy2 = midY + 12 * lobe1Ratio;

  // Second lobe sweeps gracefully and smoothly upward into redis-top
  const cx3 = midX + dx * 0.18;
  const cy3 = midY - 22 * lobe2Ratio;
  const cx4 = tx - dx * 0.22 + endOx;
  const cy4 = ty - dy * 0.22 + endOy + 16 * lobe2Ratio;

  return `M ${(sx + startOx).toFixed(1)} ${(effectiveSy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularRedisTopToMidCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 4,
  midSpread: number = 4.0,
  endSpread: number = 0.45,
  baseBowDepth: number = 18,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 4 strands with distinct irregular gaps (progressive: small gap, medium gap, large gap)
  const normOffsets = [-1.70, -1.05, 0.15, 1.70];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.14, 1.05, 0.92, 1.10];
  const lobe2Ratios = [0.88, 0.95, 1.12, 0.90];
  const tMids       = [0.47, 0.49, 0.52, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows leftwards into the corridor below clickhouse)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularPostgresToRedisMidCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 5,
  midSpread: number = 3.6,
  endSpread: number = 0.45,
  baseBowDepth: number = 18,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 5 strands with distinct irregular gaps (pairs and breathing channels)
  const normOffsets = [-2.20, -1.55, -0.20, 1.30, 2.20];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.14, 1.08, 0.92, 1.05, 0.88];
  const lobe2Ratios = [0.88, 0.94, 1.12, 0.95, 1.15];
  const tMids       = [0.47, 0.48, 0.52, 0.50, 0.53];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularClickhouseToPostgresCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 7,
  midSpread: number = 3.2,
  endSpread: number = 0.45,
  baseBowDepth: number = 18,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 7 strands with distinct irregular gaps (pairs and breathing channels)
  const normOffsets = [-3.20, -2.40, -1.10, -0.20, 1.10, 2.30, 3.20];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.14, 1.08, 0.95, 1.00, 1.12, 0.92, 1.05];
  const lobe2Ratios = [0.88, 0.94, 1.05, 1.00, 0.90, 1.08, 0.95];
  const tMids       = [0.48, 0.49, 0.52, 0.50, 0.53, 0.47, 0.51];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (passes on below of clickhouse telemetry label)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularPostgresToKafkaCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 5,
  midSpread: number = 3.6,
  endSpread: number = 0.45,
  baseBowDepth: number = 18,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 5 strands with distinct irregular gaps (pairs and breathing channels)
  const normOffsets = [-2.20, -1.50, -0.15, 1.35, 2.20];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.14, 1.08, 0.92, 1.05, 0.88];
  const lobe2Ratios = [0.88, 0.94, 1.12, 0.95, 1.15];
  const tMids       = [0.47, 0.48, 0.52, 0.50, 0.53];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows left into clear open space)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularKafkaToS3Curve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 4,
  midSpread: number = 3.6,
  endSpread: number = 0.35,
  downDip: number = 44
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 4 strands with distinct irregular gaps (tight pair, medium gap, wide open gap)
  const normOffsets = [-1.75, -1.05, 0.20, 1.70];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.14, 1.06, 0.94, 1.08];
  const lobe2Ratios = [0.90, 0.95, 1.08, 0.94];
  const tMids       = [0.47, 0.50, 0.53, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  // Shift start slightly to lower-right quadrant of kafka-pipeline
  const startBottomShift = 10;
  const effectiveSy = sy + startBottomShift;

  // Shift end slightly into lower-left quadrant of s3-store
  const endBottomShift = 8;
  const effectiveTy = ty + endBottomShift;

  // Dip to bottom well below kafka stream label (label baseline is y≈1073, bottom of text y≈1078)
  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + downDip * 0.92 + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe sweeps downward from kafka-pipeline lower rim to pass comfortably beneath kafka label
  const cx1 = sx + dx * 0.22 + startOx + normalX * strandOffset;
  const cy1 = effectiveSy + dy * 0.22 + startOy + downDip * lobe1Ratio + normalY * strandOffset * 0.35;
  const cx2 = midX - dx * 0.16;
  const cy2 = midY + 4 * lobe1Ratio;

  // Second lobe curves back up towards s3-store
  const cx3 = midX + dx * 0.16;
  const cy3 = midY - 6 * lobe2Ratio;
  const cx4 = tx - dx * 0.22 + endOx;
  const cy4 = effectiveTy - dy * 0.22 + endOy + downDip * 0.38 * lobe2Ratio;

  return `M ${(sx + startOx).toFixed(1)} ${(effectiveSy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(effectiveTy + endOy).toFixed(1)}`;
}

function generateIrregularRedisMidToS3Curve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 4,
  midSpread: number = 3.6,
  endSpread: number = 0.35,
  baseBowDepth: number = 22,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 4 strands with distinct irregular gaps (tight pair, medium gap, wide open gap)
  const normOffsets = [-1.75, -1.05, 0.20, 1.70];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.14, 1.08, 0.94, 1.06];
  const lobe2Ratios = [0.90, 0.94, 1.10, 0.95];
  const tMids       = [0.47, 0.50, 0.53, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows into open corridor)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful multi-curve S-flex
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularPostgresToS3Curve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.30,
  baseBowDepth: number = 24,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight inner gap, wide breathing gap)
  const normOffsets = [-1.50, -0.45, 1.35];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.18, 0.90, 1.12];
  const lobe2Ratios = [0.88, 1.15, 0.92];
  const tMids       = [0.46, 0.52, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (sweeps gracefully into upper-right open corridor)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful serpentine flow into s3-store
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularSslToRateLimiterCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.30,
  baseBowDepth: number = 18,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight pair, wide breathing gap)
  const normOffsets = [-1.50, -0.45, 1.35];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.16, 0.92, 1.10];
  const lobe2Ratios = [0.88, 1.15, 0.92];
  const tMids       = [0.47, 0.52, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows left into clear open corridor)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful multi-curve S-flex
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularJwtMidToRateLimiterCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.30,
  baseBowDepth: number = 16,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight pair, wide breathing gap)
  const normOffsets = [-1.50, -0.45, 1.35];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.16, 0.92, 1.10];
  const lobe2Ratios = [0.88, 1.15, 0.92];
  const tMids       = [0.47, 0.52, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows upward into open space)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful multi-curve S-flex into rate-limiter
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularJwtLeftToMidCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.30,
  baseBowDepth: number = 16,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight pair, wide breathing gap)
  const normOffsets = [-1.50, -0.45, 1.35];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.16, 0.92, 1.10];
  const lobe2Ratios = [0.88, 1.15, 0.92];
  const tMids       = [0.47, 0.52, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows upward into open space away from bottom labels)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful multi-curve S-flex into session-auth-guard
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularEdgeHubToSslTerminatorCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.30,
  baseBowDepth: number = 18,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight pair, wide breathing gap)
  const normOffsets = [-1.50, -0.45, 1.35];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.16, 0.92, 1.10];
  const lobe2Ratios = [0.88, 1.15, 0.92];
  const tMids       = [0.47, 0.52, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (gracefully bowing into open clearance away from label)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful multi-curve S-flex into ssl-terminator
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularEdgeHubToCloudflareBotCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 4,
  midSpread: number = 3.8,
  endSpread: number = 0.28,
  baseBowDepth: number = 22,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 4 strands with distinct irregular gaps (pairs and breathing channels)
  const normOffsets = [-1.75, -0.60, 0.50, 1.70];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform breathing gap
  const lobe1Ratios = [1.18, 0.88, 1.12, 0.80];
  const lobe2Ratios = [0.80, 1.15, 0.85, 1.18];
  const tMids       = [0.45, 0.52, 0.47, 0.54];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows gracefully into open space above the diagonal away from label)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful multi-curve S-flex into cloudflare-bot
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularAgentToFrontendLargeCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 13,
  midSpread: number = 5.4,
  endSpread: number = 0.08,
  baseBowDepth: number = 42,
  bendDir: number = 1,
  rightShift: number = 30
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 13 strands: all other strand gaps preserved exactly, only that one broad middle gap reduced to 3.2 units
  const normOffsets = [
    -6.2, -5.2, -4.2, -3.3, -2.4, -1.6,
     1.6,  2.4,  3.3,  4.2,  5.2,  6.2,  7.2
  ];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Harmonious subtle wave variation so ribbons flow in smooth unison
  const bowVariation = [1.04, 0.98, 1.02, 0.96][strandIndex % 4] ?? 1.0;
  const tMid = 0.5 + ([-0.02, 0.02, -0.01, 0.02][strandIndex % 4] ?? 0);

  // Midpoint with reduced central gap, shifted right to clear ssl-cron
  const midX = sx + dx * tMid + normalX * offsetFactor * midSpread + rightShift;
  const midY = sy + dy * tMid + normalY * offsetFactor * midSpread;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread + rightShift * 0.20;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  const strandBow = baseBowDepth * bowVariation;

  // Multi-curve with smooth continuous S-twist
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * 0.80) + rightShift * 0.65;
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * 0.80);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.35);

  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * 0.80) + rightShift * 0.25;
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * 0.80);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularAgentToAppBackendCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 12,
  midSpread: number = 5.2,
  endSpread: number = 0.08,
  baseBowDepth: number = 32,
  bendDir: number = 1,
  leftShift: number = -14
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 12 strands: all other strand gaps preserved exactly, only that one broad middle gap reduced to 3.2 units
  const normOffsets = [
    -6.2, -5.2, -4.2, -3.3, -2.4, -1.6,
     1.6,  2.4,  3.3,  4.2,  5.2,  6.2
  ];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Complex organic twist: per-strand helical twist and wave ratios for braided multi-curve dynamics
  const twist = Math.sin((strandIndex / totalStrands) * Math.PI * 2) * 2.8;
  const strandOffset = offsetFactor * midSpread + twist;

  const bowVariation = [1.14, 0.90, 1.10, 0.86, 1.12, 0.92][strandIndex % 6] ?? 1.0;
  const lobe1Ratio   = [1.12, 0.88, 1.06, 0.92, 1.10, 0.86][strandIndex % 6] ?? 1.0;
  const lobe2Ratio   = [0.88, 1.12, 0.92, 1.06, 0.86, 1.10][strandIndex % 6] ?? 1.0;
  const tMid         = 0.50 + ([-0.03, 0.03, -0.02, 0.02, -0.01, 0.01][strandIndex % 6] ?? 0);

  const strandBow = baseBowDepth * bowVariation;

  // Midpoint with reduced central gap, shifted gently leftward
  const midX = sx + dx * tMid + normalX * strandOffset + leftShift;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread + leftShift * 0.15;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe of the 2-curve: bows gracefully leftward into the corridor with C1 smoothness
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * lobe1Ratio) + leftShift * 0.70;
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.35);

  // Second lobe of the 2-curve: reversing with -bendDir for smooth continuous S-flex into app-backend
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * lobe2Ratio) + leftShift * 0.20;
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularSyntheticToAppBackendCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 6,
  midSpread: number = 4.2,
  endSpread: number = 0.12,
  baseBowDepth: number = 32,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 6 strands with organic ununiform spacing and breathing channels
  const normOffsets = [-2.5, -1.5, -0.6, 0.6, 1.5, 2.5];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  const strandOffset = offsetFactor * midSpread;
  const bowVariation = [1.12, 0.90, 1.08, 0.88, 1.10, 0.92][strandIndex % 6] ?? 1.0;
  const lobe1Ratio   = [1.10, 0.90, 1.05, 0.92, 1.08, 0.88][strandIndex % 6] ?? 1.0;
  const lobe2Ratio   = [0.90, 1.10, 0.92, 1.05, 0.88, 1.08][strandIndex % 6] ?? 1.0;
  const tMid         = 0.50 + ([-0.03, 0.02, -0.02, 0.03, -0.01, 0.02][strandIndex % 6] ?? 0);

  const strandBow = baseBowDepth * bowVariation;

  // Midpoint with organic breathing spread
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe of S-curve: bows gracefully outward with bendDir
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.35);

  // Second lobe of S-curve: reverses with -bendDir for smooth continuous S-flex into app-backend
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularAgentToSyntheticCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 8,
  midSpread: number = 4.0,
  endSpread: number = 0.12,
  baseBowDepth: number = 24,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 8 strands with organic breathing channels and subtle twist
  const normOffsets = [-3.5, -2.5, -1.6, -0.7, 0.7, 1.6, 2.5, 3.5];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  const twist = Math.sin((strandIndex / totalStrands) * Math.PI * 2) * 1.2;
  const strandOffset = offsetFactor * midSpread + twist;

  const bowVariation = [1.12, 0.90, 1.08, 0.88, 1.10, 0.92, 1.05, 0.95][strandIndex % 8] ?? 1.0;
  const lobe1Ratio   = [1.10, 0.88, 1.05, 0.92, 1.08, 0.90, 1.04, 0.92][strandIndex % 8] ?? 1.0;
  const lobe2Ratio   = [0.88, 1.10, 0.92, 1.05, 0.90, 1.08, 0.92, 1.04][strandIndex % 8] ?? 1.0;
  const tMid         = 0.50 + ([-0.03, 0.02, -0.02, 0.03, -0.01, 0.02, -0.02, 0.01][strandIndex % 8] ?? 0);

  const strandBow = baseBowDepth * bowVariation;

  // Organic midpoint of the S-curve
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe of S-curve: graceful upward arch away from straight line
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.35);

  // Second lobe of S-curve: reversing with -bendDir for smooth continuous S-flex into synthetic-check-engine
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularAgentToSslCronCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 2,
  midSpread: number = 4.2,
  endSpread: number = 0.18,
  baseBowDepth: number = 26,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 2 strands with asymmetric offsets for irregular organic breathing gap
  const normOffsets = [-0.85, 0.85];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex === 0 ? -0.85 : 0.85);

  const strandOffset = offsetFactor * midSpread;
  const lobe1Ratio = strandIndex === 0 ? 1.12 : 0.90;
  const lobe2Ratio = strandIndex === 0 ? 0.90 : 1.12;
  const tMid = strandIndex === 0 ? 0.48 : 0.52;
  const strandBow = baseBowDepth * (strandIndex === 0 ? 1.06 : 0.94);

  // Smooth midpoint lying on the natural spine
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe of S-curve: graceful upward arch away from trunk corridor
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.35);

  // Second lobe of S-curve: reverses with -bendDir for smooth continuous S-flex into ssl-expiry-cron
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularFrontendLargeToEdgeHubCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.18,
  baseBowDepth: number = 26,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight pair on one side, breathing channel on the other)
  const normOffsets = [-1.60, -0.50, 1.35];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform breathing gap
  const lobe1Ratios = [1.18, 0.88, 1.12];
  const lobe2Ratios = [0.82, 1.16, 0.88];
  const tMids       = [0.46, 0.52, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex % lobe1Ratios.length] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex % lobe2Ratios.length] ?? 1.0;
  const tMid = tMids[strandIndex % tMids.length] ?? 0.50;

  // Pronounced outward bow into the corridor so it creates an elegant multi-curve arch rather than straight line
  const midBow = baseBowDepth * 0.70;
  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * (bendDir * midBow + strandOffset);
  const midY = sy + dy * tMid + normalY * (bendDir * midBow + strandOffset);

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows gracefully outward into the corridor)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * 1.08 * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * 1.08 * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe continues the graceful curve into edge-ingress-hub with gentle multi-curve flex
  const cx3 = midX + dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.20);
  const cy3 = midY + dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.20);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * 0.32 * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * 0.32 * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularAgentToLogAnalyzerCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 2,
  midSpread: number = 4.2,
  endSpread: number = 0.18,
  baseBowDepth: number = 28,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 2 strands with asymmetric offsets for irregular organic breathing gap
  const normOffsets = [-0.85, 0.85];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex === 0 ? -0.85 : 0.85);

  const strandOffset = offsetFactor * midSpread;
  const lobe1Ratio = strandIndex === 0 ? 1.15 : 0.88;
  const lobe2Ratio = strandIndex === 0 ? 0.88 : 1.15;
  const tMid = strandIndex === 0 ? 0.48 : 0.52;
  const strandBow = baseBowDepth * (strandIndex === 0 ? 1.08 : 0.92);

  // Smooth midpoint lying on the natural spine
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe of S-curve: graceful upward arch into open canvas
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.35);

  // Second lobe of S-curve: reverses with -bendDir for smooth continuous S-flex into log-analyzer-llm
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularAgentToIncidentAutoFixerCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 4,
  midSpread: number = 3.8,
  endSpread: number = 0.18,
  baseBowDepth: number = 32,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 4 strands with distinct irregular gaps (tight pair, breathing channel, and wide outer gap)
  const normOffsets = [-1.85, -1.05, 0.20, 1.75];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform breathing gap
  const lobe1Ratios = [1.18, 0.88, 1.14, 0.82];
  const lobe2Ratios = [0.82, 1.15, 0.85, 1.18];
  const tMids       = [0.46, 0.52, 0.48, 0.53];

  const lobe1Ratio = lobe1Ratios[strandIndex % lobe1Ratios.length] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex % lobe2Ratios.length] ?? 1.0;
  const tMid = tMids[strandIndex % tMids.length] ?? 0.50;

  // Pronounced outward bow into open clearance so it creates an elegant multi-curve arch rather than straight line
  const midBow = baseBowDepth * 0.70;
  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * (bendDir * midBow + strandOffset);
  const midY = sy + dy * tMid + normalY * (bendDir * midBow + strandOffset);

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows gracefully into open canvas)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * 1.08 * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * 1.08 * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe continues the graceful curve into incident-auto-fixer with gentle multi-curve flex
  const cx3 = midX + dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.20);
  const cy3 = midY + dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.20);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * 0.32 * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * 0.32 * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularAgentToGoProbeTopCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.18,
  baseBowDepth: number = 28,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight pair on one side, wide breathing gap on the other)
  const normOffsets = [-1.55, -0.45, 1.40];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform breathing gap
  const lobe1Ratios = [1.18, 0.88, 1.12];
  const lobe2Ratios = [0.82, 1.16, 0.88];
  const tMids       = [0.46, 0.52, 0.48];

  const lobe1Ratio = lobe1Ratios[strandIndex % lobe1Ratios.length] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex % lobe2Ratios.length] ?? 1.0;
  const tMid = tMids[strandIndex % tMids.length] ?? 0.50;

  // Pronounced outward bow into open clearance so it creates an elegant multi-curve arch rather than straight line
  const midBow = baseBowDepth * 0.70;
  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * (bendDir * midBow + strandOffset);
  const midY = sy + dy * tMid + normalY * (bendDir * midBow + strandOffset);

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows gracefully into open canvas)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * 1.08 * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * 1.08 * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe continues the graceful curve into go-uptime-probe-engine with gentle multi-curve flex
  const cx3 = midX + dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.20);
  const cy3 = midY + dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.20);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * 0.32 * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * 0.32 * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularFrontendLargeToCloudflareTopCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 5,
  midSpread: number = 3.6,
  endSpread: number = 0.30,
  baseBowDepth: number = 24,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 5 strands with distinct irregular gaps (pairs and breathing channels)
  const normOffsets = [-2.10, -1.35, -0.15, 1.25, 2.10];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic wave variation per strand for organic non-uniform breathing gap
  const lobe1Ratios = [1.15, 1.05, 0.92, 1.08, 0.88];
  const lobe2Ratios = [0.88, 0.95, 1.14, 0.92, 1.15];
  const tMids       = [0.46, 0.49, 0.52, 0.48, 0.53];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows gracefully into open space up-left)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful multi-curve S-flex into cloudflare-top
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularFrontendLargeToClickhouseCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 8,
  midSpread: number = 5.6,
  endSpread: number = 0.08,
  baseBowDepth: number = 52,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 8 strands with irregular spacing and wide central breathing gap
  const normOffsets = [-4.6, -3.5, -2.4, -1.3, 1.3, 2.4, 3.5, 4.6];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Double twisted helical wave across the bundle (2 full cycles = 4*PI)
  const twist = Math.sin((strandIndex / totalStrands) * Math.PI * 4) * 2.2;
  const strandOffset = offsetFactor * midSpread + twist;

  const bowVariation = [1.10, 0.92, 1.06, 0.90, 1.08, 0.92, 1.05, 0.94][strandIndex % 8] ?? 1.0;
  const lobe1Ratio   = [1.12, 0.88, 1.08, 0.92, 1.06, 0.90, 1.04, 0.92][strandIndex % 8] ?? 1.0;
  const lobe2Ratio   = [0.88, 1.12, 0.92, 1.08, 0.90, 1.06, 0.92, 1.04][strandIndex % 8] ?? 1.0;
  const tMid         = 0.48 + ([-0.02, 0.02, -0.01, 0.02, -0.02, 0.01, -0.01, 0.02][strandIndex % 8] ?? 0);

  const strandBow = baseBowDepth * bowVariation;

  // Midpoint with prominent increased central gap
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Ultra-tight start and end convergence at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe arches upward/top side (bendDir = -1) to safely clear edge-ingress-hub and ssl-terminator
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.35);

  // Second lobe reverses smoothly into clickhouse-telemetry-cluster with C1 collinear continuity
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularFrontendLargeToPostgresCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 10,
  midSpread: number = 5.2,
  endSpread: number = 0.08,
  baseBowDepth: number = 58,
  bendDir: number = -1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 10 strands with irregular spacing and wide central breathing gap
  const normOffsets = [-5.7, -4.6, -3.4, -2.3, -1.3, 1.3, 2.3, 3.4, 4.6, 5.7];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Double twisted helical wave across the bundle (2 full cycles = 4*PI)
  const twist = Math.sin((strandIndex / totalStrands) * Math.PI * 4) * 2.2;
  const strandOffset = offsetFactor * midSpread + twist;

  const bowVariation = [1.12, 0.90, 1.08, 0.88, 1.10, 0.92, 1.06, 0.94, 1.08, 0.90][strandIndex % 10] ?? 1.0;
  const lobe1Ratio   = [1.10, 0.88, 1.06, 0.92, 1.08, 0.90, 1.04, 0.92, 1.06, 0.90][strandIndex % 10] ?? 1.0;
  const lobe2Ratio   = [0.88, 1.10, 0.92, 1.06, 0.90, 1.08, 0.92, 1.04, 0.90, 1.06][strandIndex % 10] ?? 1.0;
  const tMid         = 0.48 + ([-0.02, 0.02, -0.01, 0.02, -0.02, 0.01, -0.01, 0.02, -0.01, 0.01][strandIndex % 10] ?? 0);

  const strandBow = baseBowDepth * bowVariation;

  // Midpoint with prominent increased central gap
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Ultra-tight start and end convergence at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe arches upward/top side (bendDir = -1) to safely clear edge-ingress-hub and ssl-terminator
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (strandBow * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (strandBow * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (strandBow * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (strandBow * 0.35);

  // Second lobe reverses smoothly into neon-postgres-primary with C1 collinear continuity
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (strandBow * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (strandBow * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (strandBow * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (strandBow * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularCloudflareTopToBotCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 2,
  midSpread: number = 3.6,
  endSpread: number = 0.28,
  baseBowDepth: number = 18,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 2 strands with asymmetric offsets for non-uniform spacing
  const normOffsets = [-1.05, 0.90];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex === 0 ? -0.5 : 0.5);

  // Dynamic wave variation per strand for organic non-uniform breathing gap
  const lobe1Ratios = [1.18, 0.74];
  const lobe2Ratios = [0.72, 1.16];
  const tMids       = [0.46, 0.52];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.50;

  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + normalX * strandOffset;
  const midY = sy + dy * tMid + normalY * strandOffset;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe with bendDir (bows gracefully into open clearance)
  const cx1 = sx + dx * 0.22 + startOx + normalX * bendDir * (baseBowDepth * lobe1Ratio);
  const cy1 = sy + dy * 0.22 + startOy + normalY * bendDir * (baseBowDepth * lobe1Ratio);
  const cx2 = midX - dx * 0.16 + normalX * bendDir * (baseBowDepth * 0.35);
  const cy2 = midY - dy * 0.16 + normalY * bendDir * (baseBowDepth * 0.35);

  // Second lobe reversing with -bendDir for graceful multi-curve S-flex into cloudflare-bot
  const cx3 = midX + dx * 0.16 - normalX * bendDir * (baseBowDepth * 0.35);
  const cy3 = midY + dy * 0.16 - normalY * bendDir * (baseBowDepth * 0.35);
  const cx4 = tx - dx * 0.22 + endOx - normalX * bendDir * (baseBowDepth * lobe2Ratio);
  const cy4 = ty - dy * 0.22 + endOy - normalY * bendDir * (baseBowDepth * lobe2Ratio);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularCloudflareTopToJwtVaultCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.22,
  baseBowDepth: number = 26,
  bendDir: number = 1
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight pair, wide breathing gap)
  const normOffsets = [-1.50, -0.45, 1.35];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  const strandOffset = offsetFactor * midSpread;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // Single ultra-smooth cubic bezier arcing gracefully outward to the left
  const cp1X = sx + dx * 0.35 + startOx + normalX * (bendDir * baseBowDepth + strandOffset * 0.90);
  const cp1Y = sy + dy * 0.35 + startOy + normalY * (bendDir * baseBowDepth + strandOffset * 0.90);
  const cp2X = tx - dx * 0.35 + endOx + normalX * (bendDir * baseBowDepth + strandOffset * 0.90);
  const cp2Y = ty - dy * 0.35 + endOy + normalY * (bendDir * baseBowDepth + strandOffset * 0.90);

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cp1X.toFixed(1)} ${cp1Y.toFixed(1)}, ${cp2X.toFixed(1)} ${cp2Y.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
}

function generateIrregularEdgeHubToRateLimiterCurve(
  sx: number, sy: number,
  tx: number, ty: number,
  strandIndex: number,
  totalStrands: number = 3,
  midSpread: number = 3.6,
  endSpread: number = 0.30
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const normalX = -dy / dist;
  const normalY = dx / dist;

  // 3 strands with distinct irregular gaps (tight pair, wide breathing gap)
  const normOffsets = [-1.50, -0.45, 1.35];
  const offsetFactor = normOffsets[strandIndex] ?? (strandIndex - (totalStrands - 1) / 2);

  // Dynamic multi-curve wave variation per strand for organic non-uniform spacing
  const lobe1Ratios = [1.14, 0.92, 1.10];
  const lobe2Ratios = [0.88, 1.14, 0.94];
  const tMids       = [0.43, 0.47, 0.45];

  const lobe1Ratio = lobe1Ratios[strandIndex] ?? 1.0;
  const lobe2Ratio = lobe2Ratios[strandIndex] ?? 1.0;
  const tMid = tMids[strandIndex] ?? 0.45;

  // Midpoint arches gracefully directly above the top edge of global-ssl-terminator (ssl-terminator is at 355, 825, top edge at y≈804)
  const strandOffset = offsetFactor * midSpread;
  const midX = sx + dx * tMid + 24 * lobe1Ratio + normalX * strandOffset * 0.45;
  const midY = sy + dy * tMid - 22 * lobe1Ratio + normalY * strandOffset * 0.45;

  // Tightly pinched start and end points directly at the node rims
  const startOx = normalX * offsetFactor * endSpread;
  const startOy = normalY * offsetFactor * endSpread;
  const endOx = normalX * offsetFactor * endSpread;
  const endOy = normalY * offsetFactor * endSpread;

  // First lobe arches upward and rightward above the global ssl terminator top edge
  const cx1 = sx + dx * 0.18 + startOx + 24 * lobe1Ratio;
  const cy1 = sy + dy * 0.18 + startOy - 12 * lobe1Ratio;
  const cx2 = midX - dx * 0.14 + 8 * lobe1Ratio;
  const cy2 = midY - dy * 0.12 - 6 * lobe1Ratio;

  // Second lobe contours smoothly around ssl terminator flank into rate-limiter
  const cx3 = midX + dx * 0.10 - 20 * lobe2Ratio;
  const cy3 = midY + dy * 0.18 + 12 * lobe2Ratio;
  const cx4 = tx - dx * 0.18 + endOx - 12 * lobe2Ratio;
  const cy4 = ty - dy * 0.18 + endOy + 4 * lobe2Ratio;

  return `M ${(sx + startOx).toFixed(1)} ${(sy + startOy).toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${cx4.toFixed(1)} ${cy4.toFixed(1)}, ${(tx + endOx).toFixed(1)} ${(ty + endOy).toFixed(1)}`;
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
  { from: "ai-agent", to: "incident-auto-fixer", strands: 4,  baseWidth: 0.95, startDelay: 1000, duration: 1900, curvature: 0.32, spread: 3.8, bendDir: -1, bowDepth: 32, curveType: "s-curve" },
  { from: "ai-agent", to: "go-probe-top",        strands: 3,  baseWidth: 0.95, startDelay: 1000, duration: 1900, curvature: 0.30, spread: 3.6, bendDir: -1, bowDepth: 28, curveType: "s-curve" },
  { from: "ai-agent", to: "log-analyzer",        strands: 2,  baseWidth: 0.95, startDelay: 1000, duration: 1900, curvature: 0.30, spread: 4.2, bendDir: 1,  bowDepth: 28, curveType: "s-curve" },
  { from: "ai-agent", to: "ssl-cron",            strands: 2,  baseWidth: 0.95, startDelay: 1100, duration: 1950, curvature: 0.30, spread: 4.2, bendDir: 1,  bowDepth: 24, curveType: "s-curve" },
  { from: "ai-agent", to: "go-probe-right",       strands: 8,  baseWidth: 1.0,  startDelay: 1100, duration: 2000, curvature: 0.30, spread: 4.0, bendDir: -1, bowDepth: 24, curveType: "s-curve" },
  { from: "go-probe-top", to: "go-probe-right",  strands: 2,  baseWidth: 0.9,  startDelay: 2900, duration: 1100, curvature: 0.35, spread: 11, bendDir: -1, bowDepth: 44, curveType: "s-curve" },

  // ── Hub → Main Trunks K & L (Slow, majestic trunk growth across ~2.2s) ──
  { from: "ai-agent", to: "app-backend",         strands: 12, baseWidth: 1.05, startDelay: 1200, duration: 2200, curvature: 0.35, spread: 5.2, bendDir: 1,  bowDepth: 32, curveType: "s-curve" },
  { from: "ai-agent", to: "app-frontend-large",  strands: 13, baseWidth: 1.05, startDelay: 1300, duration: 2300, curvature: 0.35, spread: 5.4, bendDir: 1,  bowDepth: 42, curveType: "s-curve" },
  { from: "go-probe-right", to: "app-backend",   strands: 6,  baseWidth: 1.0,  startDelay: 3100, duration: 1400, curvature: 0.32, spread: 4.2, bendDir: -1, bowDepth: 32, curveType: "s-curve" },
  { from: "go-probe-right", to: "express-gw",    strands: 3,  baseWidth: 0.9,  startDelay: 3100, duration: 1700, curvature: 0.38, spread: 14, bendDir: 1,  bowDepth: 32, curveType: "s-curve" },

  // ── Compute Internal: Parallel sprouts forward from Node K (duration ~1.9s) ──
  { from: "app-backend", to: "app-frontend-large", strands: 11, baseWidth: 0.95, startDelay: 3500, duration: 1900, curvature: 0.35, spread: 7.5, bendDir: 1, bowDepth: 46, curveType: "s-curve" },
  { from: "app-backend", to: "express-gw",         strands: 5,  baseWidth: 0.9, startDelay: 3600, duration: 1900, curvature: 0.30, spread: 6.5, bendDir: 1, bowDepth: 28, curveType: "s-curve" },
  { from: "app-backend", to: "deploy-orch",        strands: 4,  baseWidth: 0.9, startDelay: 3700, duration: 1950, curvature: 0.32, spread: 8.5, bendDir: 1, bowDepth: 36, curveType: "s-curve" },
  { from: "app-backend", to: "docker-kaniko",      strands: 3,  baseWidth: 0.9, startDelay: 3800, duration: 2000, curvature: 0.28, spread: 8.5, bendDir: 1, bowDepth: 26, curveType: "s-curve" },
  { from: "app-backend", to: "app-frontend-small", strands: 6,  baseWidth: 0.95, startDelay: 3700, duration: 1950, curvature: 0.28, spread: 3.6, bendDir: -1, bowDepth: 22, curveType: "s-curve" },
  { from: "app-backend", to: "github-webhook",     strands: 2,  baseWidth: 0.9,  startDelay: 3900, duration: 2050, curvature: 0.28, spread: 8.5, bendDir: -1, bowDepth: 22, curveType: "s-curve" },
  { from: "express-gw", to: "deploy-orch",         strands: 2,  baseWidth: 0.9, startDelay: 5500, duration: 900,  curvature: 0.28, spread: 8,   bendDir: 1, bowDepth: 22, curveType: "s-curve" },
  { from: "deploy-orch", to: "docker-kaniko",      strands: 3,  baseWidth: 0.9, startDelay: 5650, duration: 900,  curvature: 0.28, spread: 8,   bendDir: 1, bowDepth: 20, curveType: "s-curve" },
  { from: "docker-kaniko", to: "github-webhook",   strands: 2,  baseWidth: 0.9, startDelay: 5800, duration: 900,  curvature: 0.28, spread: 8,   bendDir: 1, bowDepth: 18, curveType: "s-curve" },
  { from: "app-frontend-small", to: "github-webhook", strands: 2, baseWidth: 0.9, startDelay: 5650, duration: 900,  curvature: 0.28, spread: 8,   bendDir: -1, bowDepth: 20, curveType: "s-curve" },

  // ── Ingress & Edge Security: Parallel organic arcs from Frontend Node ──
  { from: "app-frontend-large", to: "edge-hub",        strands: 3,  baseWidth: 0.95, startDelay: 3700, duration: 1900, curvature: 0.32, spread: 3.6, bendDir: -1, bowDepth: 26, curveType: "s-curve" },
  { from: "app-frontend-large", to: "cloudflare-top",  strands: 5,  baseWidth: 0.95, startDelay: 3700, duration: 1800, curvature: 0.32, spread: 3.6, bendDir: 1,  bowDepth: 24, curveType: "s-curve" },
  { from: "cloudflare-top", to: "edge-hub",            strands: 4,  baseWidth: 0.85, startDelay: 5650, duration: 900,  curvature: 0.34, spread: 6,  bendDir: 1,  bowDepth: 20, curveType: "arc" },
  { from: "cloudflare-top", to: "cloudflare-bot",      strands: 2,  baseWidth: 0.95, startDelay: 5700, duration: 1800, curvature: 0.30, spread: 3.6, bendDir: 1,  bowDepth: 18, curveType: "s-curve" },
  { from: "cloudflare-top", to: "jwt-vault-left",      strands: 3,  baseWidth: 0.95, startDelay: 5800, duration: 1800, curvature: 0.30, spread: 3.6, bendDir: 1,  bowDepth: 26, curveType: "arc" },
  { from: "edge-hub", to: "ssl-terminator",            strands: 3,  baseWidth: 0.95, startDelay: 5700, duration: 1800, curvature: 0.30, spread: 3.6, bendDir: 1,  bowDepth: 18, curveType: "s-curve" },
  { from: "edge-hub", to: "cloudflare-bot",            strands: 4,  baseWidth: 0.95, startDelay: 5700, duration: 1800, curvature: 0.30, spread: 3.8, bendDir: 1,  bowDepth: 22, curveType: "s-curve" },
  { from: "edge-hub", to: "jwt-vault-mid",             strands: 4,  baseWidth: 0.8,  startDelay: 5800, duration: 1950, curvature: 0.36, spread: 6,  bendDir: -1, bowDepth: 24, curveType: "arc" },
  { from: "edge-hub", to: "rate-limiter",              strands: 3,  baseWidth: 0.95, startDelay: 5900, duration: 1800, curvature: 0.32, spread: 3.6, bendDir: -1, bowDepth: 26, curveType: "s-curve" },
  { from: "jwt-vault-left", to: "jwt-vault-mid",       strands: 3,  baseWidth: 0.95, startDelay: 7750, duration: 900,  curvature: 0.28, spread: 3.6, bendDir: -1, bowDepth: 16, curveType: "s-curve" },
  { from: "jwt-vault-mid", to: "rate-limiter",         strands: 3,  baseWidth: 0.95, startDelay: 7750, duration: 900,  curvature: 0.28, spread: 3.6, bendDir: -1, bowDepth: 16, curveType: "s-curve" },
  { from: "ssl-terminator", to: "rate-limiter",        strands: 3,  baseWidth: 0.95, startDelay: 7550, duration: 950,  curvature: 0.28, spread: 3.6, bendDir: 1,  bowDepth: 18, curveType: "s-curve" },

  // ── Data Fabric Roots: Parallel branches down to ClickHouse & Postgres ──
  { from: "app-backend", to: "clickhouse",        strands: 9,  baseWidth: 0.95, startDelay: 3800, duration: 2200, curvature: 0.32, spread: 4.2, bendDir: -1, bowDepth: 72, curveType: "s-curve" },
  { from: "app-backend", to: "neon-postgres",     strands: 13, baseWidth: 0.95, startDelay: 3900, duration: 2300, curvature: 0.35, spread: 2.2, bendDir: 1,  bowDepth: 96, curveType: "s-curve" },
  { from: "app-frontend-large", to: "clickhouse", strands: 8,  baseWidth: 1.0, startDelay: 3900, duration: 2200, curvature: 0.38, spread: 5.6, bendDir: -1, bowDepth: 52, curveType: "s-curve" },
  { from: "app-frontend-large", to: "neon-postgres", strands: 10, baseWidth: 1.0, startDelay: 4000, duration: 2300, curvature: 0.38, spread: 5.2, bendDir: -1, bowDepth: 58, curveType: "s-curve" },
  { from: "app-frontend-small", to: "clickhouse", strands: 6,  baseWidth: 0.95, startDelay: 5650, duration: 1400, curvature: 0.26, spread: 3.6, bendDir: -1, bowDepth: 18, curveType: "s-curve" },
  { from: "app-frontend-small", to: "neon-postgres", strands: 7, baseWidth: 0.95, startDelay: 5650, duration: 1450, curvature: 0.28, spread: 3.2, bendDir: 1,  bowDepth: 48, curveType: "s-curve" },

  // ── Deep Roots: Persistence to queues & storage (duration ~2.2s) ──
  { from: "clickhouse", to: "redis-top",          strands: 6,  baseWidth: 0.95, startDelay: 6100, duration: 1800, curvature: 0.32, spread: 3.4, bendDir: 1,  bowDepth: 56, curveType: "s-curve" },
  { from: "clickhouse", to: "neon-postgres",      strands: 7,  baseWidth: 0.95, startDelay: 6100, duration: 1600, curvature: 0.28, spread: 3.2, bendDir: -1, bowDepth: 18, curveType: "s-curve" },
  { from: "redis-top", to: "redis-mid",           strands: 4,  baseWidth: 0.9,  startDelay: 8100, duration: 1100, curvature: 0.28, spread: 4.0, bendDir: 1,  bowDepth: 18, curveType: "s-curve" },
  { from: "neon-postgres", to: "redis-mid",       strands: 5,  baseWidth: 0.95, startDelay: 6300, duration: 1800, curvature: 0.28, spread: 3.6, bendDir: 1,  bowDepth: 18, curveType: "s-curve" },
  { from: "neon-postgres", to: "kafka-pipeline",  strands: 5,  baseWidth: 0.95, startDelay: 6400, duration: 1800, curvature: 0.28, spread: 3.6, bendDir: 1,  bowDepth: 18, curveType: "s-curve" },
  { from: "neon-postgres", to: "s3-store",        strands: 3,  baseWidth: 0.95, startDelay: 6500, duration: 2000, curvature: 0.28, spread: 3.6, bendDir: -1, bowDepth: 24, curveType: "s-curve" },
  { from: "redis-mid", to: "s3-store",            strands: 4,  baseWidth: 0.9,  startDelay: 8400, duration: 1100, curvature: 0.28, spread: 3.6, bendDir: 1,  bowDepth: 22, curveType: "s-curve" },
  { from: "kafka-pipeline", to: "s3-store",       strands: 4,  baseWidth: 0.9,  startDelay: 8550, duration: 1000, curvature: 0.28, spread: 3.6, bendDir: 1,  bowDepth: 44, curveType: "s-curve" },
];

function reverseSvgPath(d: string): string {
  const commands: { type: string; points: number[] }[] = [];
  const regex = /([MCQLA])([^MCQLA]*)/gi;
  let match;
  while ((match = regex.exec(d)) !== null) {
    const type = match[1].toUpperCase();
    const numbers = match[2]
      .trim()
      .replace(/([0-9])-/g, "$1 -")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    commands.push({ type, points: numbers });
  }

  if (commands.length < 2 || commands[0].type !== "M") return d;

  let current = [commands[0].points[0], commands[0].points[1]];
  interface Segment {
    type: string;
    from: [number, number];
    to: [number, number];
    controls: number[];
  }
  const segments: Segment[] = [];

  for (let i = 1; i < commands.length; i++) {
    const cmd = commands[i];
    if (cmd.type === "C" && cmd.points.length >= 6) {
      for (let p = 0; p < cmd.points.length; p += 6) {
        const cp1x = cmd.points[p];
        const cp1y = cmd.points[p + 1];
        const cp2x = cmd.points[p + 2];
        const cp2y = cmd.points[p + 3];
        const endX = cmd.points[p + 4];
        const endY = cmd.points[p + 5];
        segments.push({
          type: "C",
          from: [current[0], current[1]],
          to: [endX, endY],
          controls: [cp1x, cp1y, cp2x, cp2y],
        });
        current = [endX, endY];
      }
    } else if (cmd.type === "Q" && cmd.points.length >= 4) {
      const qx = cmd.points[0];
      const qy = cmd.points[1];
      const endX = cmd.points[2];
      const endY = cmd.points[3];
      segments.push({
        type: "Q",
        from: [current[0], current[1]],
        to: [endX, endY],
        controls: [qx, qy],
      });
      current = [endX, endY];
    } else if (cmd.type === "L" && cmd.points.length >= 2) {
      const endX = cmd.points[0];
      const endY = cmd.points[1];
      segments.push({
        type: "L",
        from: [current[0], current[1]],
        to: [endX, endY],
        controls: [],
      });
      current = [endX, endY];
    }
  }

  if (segments.length === 0) return d;

  const newStart = segments[segments.length - 1].to;
  let res = `M ${newStart[0]} ${newStart[1]}`;

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.type === "C") {
      const [cp1x, cp1y, cp2x, cp2y] = seg.controls;
      res += ` C ${cp2x} ${cp2y}, ${cp1x} ${cp1y}, ${seg.from[0]} ${seg.from[1]}`;
    } else if (seg.type === "Q") {
      const [qx, qy] = seg.controls;
      res += ` Q ${qx} ${qy}, ${seg.from[0]} ${seg.from[1]}`;
    } else if (seg.type === "L") {
      res += ` L ${seg.from[0]} ${seg.from[1]}`;
    }
  }

  return res;
}

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
    const isSpecialConnection = conn.from === "go-probe-right" && conn.to === "express-gw";
    const isTopProbeToSynthetic = conn.from === "go-probe-top" && conn.to === "go-probe-right";
    const isBackendToExpress = conn.from === "app-backend" && conn.to === "express-gw";
    const isBackendToDeployOrch = conn.from === "app-backend" && conn.to === "deploy-orch";
    const isExpressToDeployOrch = conn.from === "express-gw" && conn.to === "deploy-orch";
    const isDeployOrchToDockerKaniko = conn.from === "deploy-orch" && conn.to === "docker-kaniko";
    const isBackendToDockerKaniko = conn.from === "app-backend" && conn.to === "docker-kaniko";
    const isBackendToGithub = conn.from === "app-backend" && conn.to === "github-webhook";
    const isDockerKanikoToGithub = conn.from === "docker-kaniko" && conn.to === "github-webhook";
    const isFrontendSmallToGithub = conn.from === "app-frontend-small" && conn.to === "github-webhook";
    const isBackendToFrontendLarge = conn.from === "app-backend" && conn.to === "app-frontend-large";
    const isBackendToClickhouse = conn.from === "app-backend" && conn.to === "clickhouse";
    const isBackendToPostgres = conn.from === "app-backend" && conn.to === "neon-postgres";
    const isFrontendSmallToPostgres = conn.from === "app-frontend-small" && conn.to === "neon-postgres";
    const isBackendToFrontendSmall = conn.from === "app-backend" && conn.to === "app-frontend-small";
    const isFrontendSmallToClickhouse = conn.from === "app-frontend-small" && conn.to === "clickhouse";
    const isClickhouseToRedisTop = conn.from === "clickhouse" && conn.to === "redis-top";
    const isRedisTopToMid = conn.from === "redis-top" && conn.to === "redis-mid";
    const isPostgresToRedisMid = conn.from === "neon-postgres" && conn.to === "redis-mid";
    const isClickhouseToPostgres = conn.from === "clickhouse" && conn.to === "neon-postgres";
    const isPostgresToKafka = conn.from === "neon-postgres" && conn.to === "kafka-pipeline";
    const isKafkaToS3 = conn.from === "kafka-pipeline" && conn.to === "s3-store";
    const isRedisMidToS3 = conn.from === "redis-mid" && conn.to === "s3-store";
    const isPostgresToS3 = conn.from === "neon-postgres" && conn.to === "s3-store";
    const isSslToRateLimiter = conn.from === "ssl-terminator" && conn.to === "rate-limiter";
    const isJwtMidToRateLimiter = conn.from === "jwt-vault-mid" && conn.to === "rate-limiter";
    const isJwtLeftToMid = conn.from === "jwt-vault-left" && conn.to === "jwt-vault-mid";
    const isEdgeHubToRateLimiter = conn.from === "edge-hub" && conn.to === "rate-limiter";
    const isEdgeHubToSslTerminator = conn.from === "edge-hub" && conn.to === "ssl-terminator";
    const isEdgeHubToCloudflareBot = conn.from === "edge-hub" && conn.to === "cloudflare-bot";
    const isCloudflareTopToJwtVault = conn.from === "cloudflare-top" && conn.to === "jwt-vault-left";
    const isCloudflareTopToBot = conn.from === "cloudflare-top" && conn.to === "cloudflare-bot";
    const isFrontendLargeToCloudflareTop = conn.from === "app-frontend-large" && conn.to === "cloudflare-top";
    const isFrontendLargeToEdgeHub = conn.from === "app-frontend-large" && conn.to === "edge-hub";
    const isFrontendLargeToClickhouse = conn.from === "app-frontend-large" && conn.to === "clickhouse";
    const isFrontendLargeToPostgres = conn.from === "app-frontend-large" && conn.to === "neon-postgres";
    const isAgentToFrontendLarge = conn.from === "ai-agent" && conn.to === "app-frontend-large";
    const isAgentToBackend = conn.from === "ai-agent" && conn.to === "app-backend";
    const isAgentToSslCron = conn.from === "ai-agent" && conn.to === "ssl-cron";
    const isAgentToLogAnalyzer = conn.from === "ai-agent" && conn.to === "log-analyzer";
    const isAgentToIncidentAutoFixer = conn.from === "ai-agent" && conn.to === "incident-auto-fixer";
    const isAgentToGoProbeTop = conn.from === "ai-agent" && conn.to === "go-probe-top";
    const isAgentToSynthetic = conn.from === "ai-agent" && conn.to === "go-probe-right";
    const isSyntheticToBackend = conn.from === "go-probe-right" && conn.to === "app-backend";

    for (let i = 0; i < conn.strands; i++) {
      const offsetFactor = i - (conn.strands - 1) / 2;
      const ox = offsetFactor * (spread * 0.7);
      const oy = offsetFactor * (spread * 0.5);

      const isRibbonBand = conn.strands >= 8 && (i === Math.floor(conn.strands / 2) || i === 1);
      const isPrimary = i === Math.floor(conn.strands / 2);
      const w = isBackendToFrontendLarge || isBackendToClickhouse || isBackendToPostgres || isFrontendSmallToPostgres || isBackendToFrontendSmall || isFrontendSmallToClickhouse || isClickhouseToRedisTop || isRedisTopToMid || isPostgresToRedisMid || isClickhouseToPostgres || isPostgresToKafka || isKafkaToS3 || isRedisMidToS3 || isPostgresToS3 || isSslToRateLimiter || isJwtMidToRateLimiter || isJwtLeftToMid || isEdgeHubToRateLimiter || isEdgeHubToSslTerminator || isEdgeHubToCloudflareBot || isCloudflareTopToJwtVault || isCloudflareTopToBot || isFrontendLargeToCloudflareTop || isAgentToFrontendLarge || isAgentToBackend || isAgentToSslCron || isFrontendLargeToEdgeHub || isAgentToLogAnalyzer || isAgentToIncidentAutoFixer || isAgentToGoProbeTop || isAgentToSynthetic || isSyntheticToBackend || isFrontendLargeToClickhouse || isFrontendLargeToPostgres
        ? (isPrimary ? 1.2 : 0.85)
        : isRibbonBand ? 1.8 : 0.85;
      const opacity = isBackendToFrontendLarge || isBackendToClickhouse || isBackendToPostgres || isFrontendSmallToPostgres || isBackendToFrontendSmall || isFrontendSmallToClickhouse || isClickhouseToRedisTop || isRedisTopToMid || isPostgresToRedisMid || isClickhouseToPostgres || isPostgresToKafka || isKafkaToS3 || isRedisMidToS3 || isPostgresToS3 || isSslToRateLimiter || isJwtMidToRateLimiter || isJwtLeftToMid || isEdgeHubToRateLimiter || isEdgeHubToSslTerminator || isEdgeHubToCloudflareBot || isCloudflareTopToJwtVault || isCloudflareTopToBot || isFrontendLargeToCloudflareTop || isAgentToFrontendLarge || isAgentToBackend || isAgentToSslCron || isFrontendLargeToEdgeHub || isAgentToLogAnalyzer || isAgentToIncidentAutoFixer || isAgentToGoProbeTop || isAgentToSynthetic || isSyntheticToBackend || isFrontendLargeToClickhouse || isFrontendLargeToPostgres
        ? (isPrimary ? 0.78 : 0.58 + (i % 3) * 0.08)
        : isRibbonBand ? 0.32 : 0.58 + (i % 3) * 0.08;
      const hasArrow = !isTopProbeToSynthetic && !isBackendToExpress && !isBackendToDeployOrch && !isDeployOrchToDockerKaniko && !isBackendToDockerKaniko && !isBackendToGithub && !isDockerKanikoToGithub && !isFrontendSmallToGithub && !isBackendToFrontendLarge && !isBackendToClickhouse && !isBackendToPostgres && !isFrontendSmallToPostgres && !isBackendToFrontendSmall && !isFrontendSmallToClickhouse && !isClickhouseToRedisTop && !isRedisTopToMid && !isPostgresToRedisMid && !isClickhouseToPostgres && !isPostgresToKafka && !isKafkaToS3 && !isRedisMidToS3 && !isPostgresToS3 && !isSslToRateLimiter && !isJwtMidToRateLimiter && !isJwtLeftToMid && !isEdgeHubToRateLimiter && !isEdgeHubToSslTerminator && !isEdgeHubToCloudflareBot && !isCloudflareTopToJwtVault && !isCloudflareTopToBot && !isFrontendLargeToCloudflareTop && !isAgentToFrontendLarge && !isAgentToBackend && !isAgentToSslCron && !isFrontendLargeToEdgeHub && !isAgentToLogAnalyzer && !isAgentToIncidentAutoFixer && !isAgentToGoProbeTop && !isAgentToSynthetic && !isSyntheticToBackend && !isFrontendLargeToClickhouse && !isFrontendLargeToPostgres && conn.strands >= 5 && isPrimary;

      const path = isSpecialConnection
        ? generatePinchedSCurve(src.x, src.y, tgt.x, tgt.y, offsetFactor, spread, 2.2, bowDepth, bendDir)
        : isTopProbeToSynthetic
        ? generatePinchedSCurve(src.x, src.y, tgt.x, tgt.y, offsetFactor, spread, 1.0, bowDepth, bendDir)
        : isBackendToExpress
        ? generatePinchedSCurve(src.x, src.y, tgt.x, tgt.y, offsetFactor, spread, 1.0, bowDepth, bendDir)
        : isBackendToDeployOrch
        ? generateOrganicTwistedSCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.7, bowDepth, bendDir)
        : isExpressToDeployOrch
        ? generateIrregularTwinSCurve(src.x, src.y, tgt.x, tgt.y, i, spread, 1.0, bowDepth, bendDir)
        : isDeployOrchToDockerKaniko
        ? generateIrregularTrioSCurve(src.x, src.y, tgt.x, tgt.y, i, spread, 0.8, bowDepth, bendDir)
        : isBackendToDockerKaniko
        ? generateIrregularTrioSCurve(src.x, src.y, tgt.x, tgt.y, i, spread, 0.8, bowDepth, bendDir)
        : isBackendToGithub
        ? generateIrregularTwinSCurve(src.x, src.y, tgt.x, tgt.y, i, spread, 0.8, bowDepth, bendDir)
        : isDockerKanikoToGithub
        ? generateIrregularTwinSCurve(src.x, src.y, tgt.x, tgt.y, i, spread, 0.8, bowDepth, bendDir)
        : isFrontendSmallToGithub
        ? generateIrregularTwinSCurve(src.x, src.y, tgt.x, tgt.y, i, spread, 0.8, bowDepth, bendDir)
        : isBackendToFrontendLarge
        ? generateOrganicTwistedSCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.7, bowDepth, bendDir)
        : isBackendToClickhouse
        ? generateIrregularClickhouseSCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.45, bowDepth)
        : isBackendToPostgres
        ? generateIrregularPostgresSCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.35, bowDepth)
        : isFrontendSmallToPostgres
        ? generateIrregularDashboardToPostgresCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.45, bowDepth)
        : isBackendToFrontendSmall
        ? generateIrregularDashboardSCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.5, bowDepth, bendDir)
        : isFrontendSmallToClickhouse
        ? generateIrregularDashboardToClickhouseCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.45, bowDepth, bendDir)
        : isClickhouseToRedisTop
        ? generateIrregularClickhouseToRedisTopCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.45, bowDepth)
        : isRedisTopToMid
        ? generateIrregularRedisTopToMidCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.45, bowDepth, bendDir)
        : isPostgresToRedisMid
        ? generateIrregularPostgresToRedisMidCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.45, bowDepth, bendDir)
        : isClickhouseToPostgres
        ? generateIrregularClickhouseToPostgresCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.45, bowDepth, bendDir)
        : isPostgresToKafka
        ? generateIrregularPostgresToKafkaCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.45, bowDepth, bendDir)
        : isKafkaToS3
        ? generateIrregularKafkaToS3Curve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.35, bowDepth)
        : isRedisMidToS3
        ? generateIrregularRedisMidToS3Curve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.35, bowDepth, bendDir)
        : isPostgresToS3
        ? generateIrregularPostgresToS3Curve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.30, bowDepth, bendDir)
        : isSslToRateLimiter
        ? generateIrregularSslToRateLimiterCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.30, bowDepth, bendDir)
        : isJwtMidToRateLimiter
        ? generateIrregularJwtMidToRateLimiterCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.30, bowDepth, bendDir)
        : isJwtLeftToMid
        ? generateIrregularJwtLeftToMidCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.30, bowDepth, bendDir)
        : isEdgeHubToRateLimiter
        ? generateIrregularEdgeHubToRateLimiterCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.30)
        : isEdgeHubToSslTerminator
        ? generateIrregularEdgeHubToSslTerminatorCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.30, bowDepth, bendDir)
        : isEdgeHubToCloudflareBot
        ? generateIrregularEdgeHubToCloudflareBotCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.28, bowDepth, bendDir)
        : isCloudflareTopToJwtVault
        ? generateIrregularCloudflareTopToJwtVaultCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.30, bowDepth, bendDir)
        : isCloudflareTopToBot
        ? generateIrregularCloudflareTopToBotCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.28, bowDepth, bendDir)
        : isFrontendLargeToCloudflareTop
        ? generateIrregularFrontendLargeToCloudflareTopCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.30, bowDepth, bendDir)
        : isFrontendLargeToEdgeHub
        ? generateIrregularFrontendLargeToEdgeHubCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.18, bowDepth, bendDir)
        : isFrontendLargeToClickhouse
        ? generateIrregularFrontendLargeToClickhouseCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.08, bowDepth, bendDir)
        : isFrontendLargeToPostgres
        ? generateIrregularFrontendLargeToPostgresCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.08, bowDepth, bendDir)
        : isAgentToFrontendLarge
        ? generateIrregularAgentToFrontendLargeCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.08, bowDepth, bendDir, 30)
        : isAgentToBackend
        ? generateIrregularAgentToAppBackendCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.08, bowDepth, bendDir, -14)
        : isAgentToSslCron
        ? generateIrregularAgentToSslCronCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.18, bowDepth, bendDir)
        : isAgentToLogAnalyzer
        ? generateIrregularAgentToLogAnalyzerCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.18, bowDepth, bendDir)
        : isAgentToIncidentAutoFixer
        ? generateIrregularAgentToIncidentAutoFixerCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.18, bowDepth, bendDir)
        : isAgentToGoProbeTop
        ? generateIrregularAgentToGoProbeTopCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.18, bowDepth, bendDir)
        : isAgentToSynthetic
        ? generateIrregularAgentToSyntheticCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.12, bowDepth, bendDir)
        : isSyntheticToBackend
        ? generateIrregularSyntheticToAppBackendCurve(src.x, src.y, tgt.x, tgt.y, i, conn.strands, spread, 0.12, bowDepth, bendDir)
        : generateBezier(src.x, src.y, tgt.x, tgt.y, ox, oy, curv, bendDir, bowDepth, curveType);

      const reversedPath = reverseSvgPath(path);

      ribbons.push({
        id: `ribbon-${counter++}`,
        path,
        reversedPath,
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

          {/* Highlight ribbon gradient - subtle, refined muted emerald stream */}
          <linearGradient id="streamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#047857" stopOpacity="0.75" />
            <stop offset="50%" stopColor="#059669" stopOpacity="0.80" />
            <stop offset="100%" stopColor="#0d9488" stopOpacity="0.72" />
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
            <path d="M 0 1.2 L 4.5 3 L 0 4.8 z" fill="#059669" opacity="0.82" />
          </marker>
        </defs>

        {/* ── CONNECTION RIBBONS (Outward cascading streams) ── */}
        <g className="pointer-events-none" style={{ pointerEvents: "none" }}>
          {ALL_RIBBONS.map((ribbon, idx) => {
            const isForwardHighlighted = activeNode?.id === ribbon.sourceId;
            const isReverseHighlighted = activeNode?.id === ribbon.targetId;
            const isHighlighted = isForwardHighlighted || isReverseHighlighted;

            return (
              <g key={ribbon.id}>
                {/* Physical Branch Stroke Growing Forward slowly and deliberately */}
                <path
                  d={ribbon.path}
                  fill="none"
                  stroke="url(#greyRibbon)"
                  strokeWidth={ribbon.width}
                  strokeLinecap="round"
                  strokeOpacity={animationStarted ? ribbon.opacity : 0}
                  markerEnd={!isHighlighted && ribbon.hasArrow ? "url(#arr)" : undefined}
                  style={{
                    strokeDasharray: ribbon.pathLength,
                    strokeDashoffset: animationStarted ? 0 : ribbon.pathLength,
                    transition: `stroke-dashoffset ${ribbon.duration}ms cubic-bezier(0.25, 0.1, 0.25, 1) ${ribbon.startDelay}ms, stroke-opacity 0.5s ease ${ribbon.startDelay}ms`,
                  }}
                />

                {/* Stage 3: Highlighting Emerald Stream - Forward (starts immediately at 80ms and draws outward slowly over 1.35s) */}
                <path
                  d={ribbon.path}
                  fill="none"
                  stroke="url(#streamGrad)"
                  strokeWidth={ribbon.width + 0.65}
                  strokeLinecap="round"
                  markerEnd={isForwardHighlighted && ribbon.hasArrow ? "url(#arr-emerald)" : undefined}
                  style={{
                    strokeDasharray: ribbon.pathLength,
                    strokeDashoffset: isForwardHighlighted ? 0 : ribbon.pathLength,
                    opacity: isForwardHighlighted ? 0.85 : 0,
                    transition: isForwardHighlighted
                      ? `stroke-dashoffset 1.35s cubic-bezier(0.25, 0.1, 0.25, 1) ${80 + (idx % 3) * 15}ms, opacity 0.25s ease 80ms`
                      : "stroke-dashoffset 0.22s ease-out 0ms, opacity 0.2s ease-out 0ms",
                  }}
                />

                {/* Stage 3: Highlighting Emerald Stream - Reverse (starts immediately at 80ms and draws outward slowly over 1.35s) */}
                <path
                  d={ribbon.reversedPath}
                  fill="none"
                  stroke="url(#streamGrad)"
                  strokeWidth={ribbon.width + 0.65}
                  strokeLinecap="round"
                  style={{
                    strokeDasharray: ribbon.pathLength,
                    strokeDashoffset: isReverseHighlighted ? 0 : ribbon.pathLength,
                    opacity: isReverseHighlighted ? 0.85 : 0,
                    transition: isReverseHighlighted
                      ? `stroke-dashoffset 1.35s cubic-bezier(0.25, 0.1, 0.25, 1) ${80 + (idx % 3) * 15}ms, opacity 0.25s ease 80ms`
                      : "stroke-dashoffset 0.22s ease-out 0ms, opacity 0.2s ease-out 0ms",
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
        <g className="pointer-events-none" style={{ pointerEvents: "none" }}>
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

          {/* Tooltip 2: synthetic-check-engine */}
          <g
            filter="drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
            style={{
              opacity: animationStarted ? 1 : 0,
              transition: "opacity 0.8s ease 3200ms",
            }}
          >
            <line x1="725" y1="188" x2="630" y2="218" stroke="#71717a" strokeWidth="1" strokeDasharray="3 3" opacity="0.8" />
            <circle cx="630" cy="218" r="2.5" fill="#a1a1aa" />
            <rect x="725" y="166" width="174" height="68" rx="3" fill="#141416" stroke="#3f3f46" strokeWidth="1" />
            <rect x="725" y="166" width="174" height="24" rx="3" fill="#1f1f23" />
            <text x="735" y="182" fill="#f4f4f5" fontSize="10" fontFamily="monospace" fontWeight="600">synthetic-check-engine</text>
            <text x="735" y="204" fill="#a1a1aa" fontSize="9.5" fontFamily="monospace">Pings/sec:</text>
            <text x="889" y="204" fill="#f4f4f5" fontSize="9.5" fontFamily="monospace" textAnchor="end">142k</text>
            <text x="735" y="220" fill="#a1a1aa" fontSize="9.5" fontFamily="monospace">Global Latency:</text>
            <text x="889" y="220" fill="#f4f4f5" fontSize="9.5" fontFamily="monospace" textAnchor="end">0.8ms</text>
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
                style={{ pointerEvents: "all" }}
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
                  {/* Dedicated full-disc interactive hit target: guarantees instantaneous, rock-solid hover hit testing */}
                  <circle
                    cx={0}
                    cy={0}
                    r={Math.max(node.r + 6, 22)}
                    fill="#ffffff"
                    fillOpacity={0}
                    className="cursor-pointer"
                    style={{ pointerEvents: "all" }}
                  />
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
                      style={{
                        transition: isHovered
                          ? "stroke 0.4s ease-out 80ms, opacity 0.4s ease-out 80ms, stroke-width 0.4s ease-out 80ms"
                          : "stroke 0.2s ease-out 0ms, opacity 0.2s ease-out 0ms",
                      }}
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
                      style={{
                        transition: isHovered
                          ? "stroke 0.4s ease-out 0ms, opacity 0.4s ease-out 0ms"
                          : "stroke 0.2s ease-out 0ms, opacity 0.2s ease-out 0ms",
                      }}
                    />
                  ))}

                  {/* Stage 2: Active hover rotating orbit ring (starts at 80ms once node turns green) */}
                  {!node.dashedRing && (
                    <circle
                      cx={0}
                      cy={0}
                      r={node.r + 8}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.6"
                      strokeDasharray="5 4"
                      opacity={isHovered ? 0.9 : 0}
                      style={{
                        transition: isHovered
                          ? "opacity 0.4s ease-out 80ms"
                          : "opacity 0.2s ease-out 0ms",
                      }}
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

                  {/* Stage 1: Hover outer glow halo (slow motion bloom 0ms - 400ms) */}
                  <circle
                    cx={0}
                    cy={0}
                    r={node.r + 14}
                    fill="none"
                    stroke="#059669"
                    strokeWidth="1"
                    opacity={isHovered ? 0.32 : 0}
                    style={{
                      transition: isHovered
                        ? "opacity 0.45s ease-out 0ms"
                        : "opacity 0.2s ease-out 0ms",
                    }}
                    className="pointer-events-none select-none"
                  />

                  {/* Stage 4: Dark green accent ring for connected nodes (slow motion unfurl 1430ms once lines arrive) */}
                  <circle
                    cx={0}
                    cy={0}
                    r={node.r + 5}
                    fill="none"
                    stroke="#047857"
                    strokeWidth="1.8"
                    opacity={!isHovered && isConnected ? 0.95 : 0}
                    style={{
                      transform: !isHovered && isConnected ? "scale(1)" : "scale(0.82)",
                      transformOrigin: "0 0",
                      transition: !isHovered && isConnected
                        ? "opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1) 1430ms, transform 0.65s cubic-bezier(0.16, 1, 0.3, 1) 1430ms"
                        : "opacity 0.2s ease-out 0ms, transform 0.2s ease-out 0ms",
                    }}
                  />

                  {/* Base 3D Spherical Volume Body */}
                  <circle
                    cx={0}
                    cy={0}
                    r={node.r}
                    fill="url(#sphereGrad)"
                    stroke="#0f172a"
                    strokeWidth="2.0"
                    className="cursor-pointer select-none"
                    style={{ pointerEvents: "all" }}
                  />

                  {/* Stage 4: 3D Connected Node Accent Sphere Layer (slow motion tint 1430ms) */}
                  <circle
                    cx={0}
                    cy={0}
                    r={node.r}
                    fill="url(#sphereConnectedGrad)"
                    stroke="#065f46"
                    strokeWidth="2.4"
                    opacity={!isHovered && isConnected ? 1 : 0}
                    style={{
                      transition: !isHovered && isConnected
                        ? "opacity 0.65s ease-out 1430ms"
                        : "opacity 0.2s ease-out 0ms",
                    }}
                    className="pointer-events-none select-none"
                  />

                  {/* Stage 1: 3D Hover Emerald Gloss Sphere Layer (slow motion bloom 0ms - 500ms) */}
                  <circle
                    cx={0}
                    cy={0}
                    r={node.r}
                    fill="url(#sphereHoverGrad)"
                    stroke="#047857"
                    strokeWidth="2.8"
                    opacity={isHovered ? 1 : 0}
                    style={{
                      transition: isHovered
                        ? "opacity 0.55s ease-out 0ms"
                        : "opacity 0.25s ease-out 0ms",
                    }}
                    className="pointer-events-none select-none"
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
      {activeNode && activeNode.metrics && activeNode.id !== "go-probe-right" && (
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
