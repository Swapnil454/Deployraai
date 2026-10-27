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
  Pause,
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
} from "lucide-react";

type StageKey = "deploy" | "network" | "scale" | "monitor" | "evolve";

interface StageInfo {
  id: StageKey;
  label: string;
  icon: React.ElementType;
}

const STAGES: StageInfo[] = [
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "network", label: "Network", icon: Network },
  { id: "scale", label: "Scale", icon: Activity },
  { id: "monitor", label: "Monitor", icon: Eye },
  { id: "evolve", label: "Evolve", icon: Layers },
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
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [stageProgress, setStageProgress] = useState<number>(0);

  // ── Animated Simulated Cursor & Click Ripple System ───────────────────────
  const [cursorPos, setCursorPos] = useState<{ x: string; y: string; opacity: number }>({ x: "50%", y: "50%", opacity: 0 });
  const [isClicking, setIsClicking] = useState<boolean>(false);

  // ── Stage 1: Deploy states (Full-Platform Authentic 10s Showcase)
  const [deployStep, setDeployStep] = useState<
    "select-repo" | "stack-detected" | "configure-platforms" | "live-logs" | "workflow-pipeline" | "success-summary"
  >("select-repo");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [pipelineCompleted, setPipelineCompleted] = useState<boolean>(false);
  const [terminalLogs, setTerminalLogs] = useState<number>(0);
  const [showDeployToast, setShowDeployToast] = useState<boolean>(false);
  const [selectedWorkflowStep, setSelectedWorkflowStep] = useState<WorkflowStepEvent | null>(null);

  // ── Stage 2: Network states
  const [networkStep, setNetworkStep] = useState<"create-menu" | "unapplied" | "applied">("create-menu");
  const [networkTreeGrown, setNetworkTreeGrown] = useState<boolean>(false);

  // ── Stage 3: Scale states
  const [scaleStep, setScaleStep] = useState<"alert" | "menu" | "healthy">("alert");
  const [selectedReplica, setSelectedReplica] = useState<number>(1);

  // ── Stage 4: Monitor states
  const [activeHeaderTab, setActiveHeaderTab] = useState<"Architecture" | "Workflows" | "Observability">("Architecture");
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [showNormalToast, setShowNormalToast] = useState<boolean>(false);
  const [hoveredFlameFrame, setHoveredFlameFrame] = useState<FlameFrame | null>(null);

  // ── Stage 5: Evolve Tree Growing
  const [evolveTreeGrown, setEvolveTreeGrown] = useState<boolean>(false);

  // Dynamic Duration per stage: Exactly 10.0s (10,000ms) for deploy showcase, 7.8s for others
  const getStageDuration = (stage: StageKey) => (stage === "deploy" ? 10000 : 7800);

  // ── Auto Progression Master Loop
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = 40;
    const stageDuration = getStageDuration(activeStage);
    const increment = (intervalMs / stageDuration) * 100;

    const timer = setInterval(() => {
      setStageProgress((prev) => {
        if (prev >= 100) {
          setActiveStage((curr) => {
            const idx = STAGES.findIndex((s) => s.id === curr);
            const nextIdx = (idx + 1) % STAGES.length;
            return STAGES[nextIdx].id;
          });
          return 0;
        }
        return prev + increment;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, activeStage]);

  // Helper to trigger simulated click with ripple
  const triggerClickAt = (x: string, y: string, callback?: () => void) => {
    setCursorPos({ x, y, opacity: 1 });
    const tClick = setTimeout(() => {
      setIsClicking(true);
      if (callback) callback();
      const tRelease = setTimeout(() => setIsClicking(false), 240);
      return () => clearTimeout(tRelease);
    }, 600);
    return tClick;
  };

  // ── Stage Micro-Timeline Sequence Handler (10s Authentic Flow)
  useEffect(() => {
    setStageProgress(0);
    setIsClicking(false);

    // ── STAGE 1: DEPLOY (10.0s Total Duration - Platform Authentic Showcase)
    if (activeStage === "deploy") {
      setActiveHeaderTab("Architecture");
      setDeployStep("select-repo");
      setIsAnalyzing(false);
      setPipelineCompleted(false);
      setTerminalLogs(0);
      setShowDeployToast(false);
      setNetworkTreeGrown(false);
      setEvolveTreeGrown(false);
      setSelectedWorkflowStep(null);

      // 0.3s: Virtual cursor appears and glides to "Analyze Project"
      const t0 = setTimeout(() => {
        setCursorPos({ x: "72%", y: "74%", opacity: 1 });
      }, 300);

      // 1.1s: Click "Analyze Project" button (Step 1 -> Analyzing)
      const t1 = setTimeout(() => {
        triggerClickAt("78%", "74%", () => {
          setIsAnalyzing(true);
        });
      }, 1100);

      // 1.8s: Architecture detected! Show Monorepo, Next.js, Go Gin, PostgreSQL cards (Step 2)
      const t2 = setTimeout(() => {
        setIsAnalyzing(false);
        setDeployStep("stack-detected");
        setCursorPos({ x: "68%", y: "84%", opacity: 1 });
      }, 1800);

      // 2.9s: Click "Continue to Configure" button
      const t3 = setTimeout(() => {
        triggerClickAt("82%", "84%", () => {
          setDeployStep("configure-platforms");
        });
      }, 2900);

      // 3.6s: Glides toward "Deploy Full Stack" (Step 3: Platform Selection)
      const t4 = setTimeout(() => {
        setCursorPos({ x: "74%", y: "68%", opacity: 1 });
      }, 3600);

      // 4.6s: Click "Deploy Full Stack" button
      const t5 = setTimeout(() => {
        triggerClickAt("84%", "68%", () => {
          setDeployStep("live-logs");
          setTerminalLogs(1);
        });
      }, 4600);

      // 5.1s – 6.8s: Authentic streaming incoming logs arrive step-by-step (Step 4)
      const t6 = setTimeout(() => setTerminalLogs(2), 5100);
      const t7 = setTimeout(() => setTerminalLogs(3), 5500);
      const t8 = setTimeout(() => setTerminalLogs(4), 5900);
      const t9 = setTimeout(() => setTerminalLogs(5), 6300);
      const t10 = setTimeout(() => setTerminalLogs(6), 6700);

      // 7.2s: Form actual mock workflow pipeline building with actual nodes (Step 5)
      const t11 = setTimeout(() => {
        setDeployStep("workflow-pipeline");
        setPipelineCompleted(false);
        setCursorPos({ x: "50%", y: "65%", opacity: 0 });
      }, 7200);

      // 8.1s: Pipeline said OK! Final rollout node completes green
      const t12 = setTimeout(() => {
        setPipelineCompleted(true);
      }, 8100);

      // 8.6s: Show deployment successfully toast + authentic final summary & preview card (Step 6)
      const t13 = setTimeout(() => {
        setDeployStep("success-summary");
        setShowDeployToast(true);
      }, 8600);

      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
        clearTimeout(t6);
        clearTimeout(t7);
        clearTimeout(t8);
        clearTimeout(t9);
        clearTimeout(t10);
        clearTimeout(t11);
        clearTimeout(t12);
        clearTimeout(t13);
      };
    }

    // ── STAGE 2: NETWORK
    if (activeStage === "network") {
      setActiveHeaderTab("Architecture");
      setNetworkStep("create-menu");
      setShowDeployToast(false);
      setNetworkTreeGrown(false);

      // 0.5s: Cursor glides to "Database" in menu & clicks
      const t1 = setTimeout(() => {
        triggerClickAt("50%", "48%", () => {
          setNetworkStep("unapplied");
          setTimeout(() => setNetworkTreeGrown(true), 80);
        });
      }, 500);

      // 3.1s: Cursor glides up to "Deploy (1)" in header & clicks
      const t2 = setTimeout(() => {
        triggerClickAt("77%", "22px", () => setNetworkStep("applied"));
      }, 3100);

      const t3 = setTimeout(() => {
        setCursorPos((prev) => ({ ...prev, opacity: 0 }));
      }, 4300);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }

    // ── STAGE 3: SCALE
    if (activeStage === "scale") {
      setActiveHeaderTab("Architecture");
      setScaleStep("alert");
      setSelectedReplica(1);
      setShowDeployToast(false);

      // 1.1s: Cursor glides to "Add Replicas" on top-right alert box & clicks
      const t1 = setTimeout(() => {
        triggerClickAt("88%", "148px", () => setScaleStep("menu"));
      }, 1100);

      // 2.5s: Cursor moves to "2 Replicas" in dropdown & clicks
      const t2 = setTimeout(() => {
        triggerClickAt("50%", "64%", () => {
          setSelectedReplica(2);
          setScaleStep("healthy");
        });
      }, 2500);

      const t3 = setTimeout(() => {
        setCursorPos((prev) => ({ ...prev, opacity: 0 }));
      }, 3800);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }

    // ── STAGE 4: MONITOR
    if (activeStage === "monitor") {
      setShowCommandPalette(false);
      setShowNormalToast(false);
      setShowDeployToast(false);

      // 0.4s: Cursor moves to "Observability" tab in header & clicks
      const t1 = setTimeout(() => {
        triggerClickAt("82%", "22px", () => setActiveHeaderTab("Observability"));
      }, 400);

      // 4.8s: Cursor moves to "Architecture" tab & clicks
      const t2 = setTimeout(() => {
        triggerClickAt("74%", "22px", () => {
          setActiveHeaderTab("Architecture");
          setShowCommandPalette(true);
        });
      }, 4800);

      // 5.8s: Close palette & trigger stabilized toast
      const t3 = setTimeout(() => {
        setShowCommandPalette(false);
        setShowNormalToast(true);
        setCursorPos((prev) => ({ ...prev, opacity: 0 }));
      }, 5800);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }

    // ── STAGE 5: EVOLVE
    if (activeStage === "evolve") {
      setActiveHeaderTab("Architecture");
      setShowDeployToast(false);
      setEvolveTreeGrown(false);
      setCursorPos((prev) => ({ ...prev, opacity: 0 }));
      const t1 = setTimeout(() => setEvolveTreeGrown(true), 150);
      return () => clearTimeout(t1);
    }
  }, [activeStage]);

  // Smooth cinematic camera viewport styling
  const cameraTransform =
    activeStage === "deploy"
      ? "scale(1) translate3d(0px, 0px, 0px)"
      : activeStage === "network"
      ? "scale(1.02) translate3d(0px, -6px, 0px)"
      : activeStage === "scale"
      ? "scale(1.01) translate3d(6px, 0px, 0px)"
      : activeStage === "monitor"
      ? "scale(1) translate3d(0px, 0px, 0px)"
      : "scale(0.85) translate3d(0px, 0px, 0px)";

  const platformIncomingLogs = [
    { time: "14:10:12", tag: "info", text: "Initializing Full-Stack Orchestration (Vercel + Render)..." },
    { time: "14:10:13", tag: "info", text: "[frontend] Turbopack compiling /client Next.js 16 App Router (17 dynamic modules)" },
    { time: "14:10:14", tag: "pass", text: "[frontend] ✓ Compiled static AST bundle in 1,180ms (gzip: 38.4 kB)" },
    { time: "14:10:15", tag: "info", text: "[backend] Kaniko engine baking Go microservice layer (sha256:7fa1e4, cache 94.2%)" },
    { time: "14:10:16", tag: "pass", text: "[orchestrator] Injected NEXT_PUBLIC_API_URL ⟷ https://api.enterprise-core.onrender.com" },
    { time: "14:10:17", tag: "pass", text: "[healthcheck] Synthetic probe /healthz 200 OK (0.8ms) · Handing off to Durable Pipeline" },
  ];

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
      payload: { target: "api.enterprise-core.onrender.com", statusCode: 200, retried: true },
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
    <section className="relative w-full bg-[#0a0b10] text-white py-10 sm:py-16 px-3 sm:px-6 lg:px-8 select-none overflow-hidden font-sans">
      <div className="relative max-w-[1320px] mx-auto">
        
        {/* ═════════════════════════════════════════════════════════════════
            CANVAS SHELL (Video-Grade Precision + Interactive Virtual Pointer)
            ═════════════════════════════════════════════════════════════ */}
        <div className="relative w-full rounded-2xl border border-white/[0.08] bg-[#0c0d14] shadow-[0_25px_80px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col min-h-[600px] sm:min-h-[660px]">
          
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
              <div className="absolute -top-3.5 -left-3.5 w-11 h-11 rounded-full border-2 border-purple-400 bg-purple-500/20 animate-ping pointer-events-none" />
            )}
          </div>

          {/* ── Top Header Navigation Bar ──────────────────────────────── */}
          <div className="h-11 border-b border-white/[0.06] bg-[#0e1017]/90 px-4 sm:px-5 flex items-center justify-between shrink-0 z-30">
            {/* Left Project / Context Label */}
            <div className="flex items-center gap-2 text-xs font-medium">
              {activeStage === "deploy" && deployStep === "select-repo" ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-purple-500/20 flex items-center justify-center text-purple-400">
                    <Rocket className="w-2.5 h-2.5" />
                  </div>
                  <span className="font-semibold text-white">New Deployment</span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-zinc-400 font-mono text-[11px]">organization/enterprise-core</span>
                </div>
              ) : activeStage === "deploy" && deployStep === "stack-detected" ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  </div>
                  <span className="font-semibold text-white">enterprise-core</span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-indigo-400 font-mono text-[11px]">analysis</span>
                </div>
              ) : activeStage === "deploy" && deployStep === "configure-platforms" ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-teal-500/20 flex items-center justify-center text-teal-400">
                    <Server className="w-2.5 h-2.5" />
                  </div>
                  <span className="font-semibold text-white">enterprise-core</span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-teal-400 font-mono text-[11px]">configure</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-medium">
                  <div className="w-4 h-4 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Box className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-zinc-200">enterprise-core</span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-emerald-400 font-mono text-[11px]">production ▾</span>
                </div>
              )}
            </div>

            {/* Right Tab Controls */}
            {activeStage === "deploy" && deployStep === "select-repo" ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 hover:text-white cursor-pointer">Dashboard</span>
                <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-[9px] font-bold">
                  S
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 sm:gap-3 text-xs font-medium text-zinc-400">
                {activeStage === "network" && (
                  <div className="flex items-center gap-2 mr-1 animate-in fade-in">
                    <span className="text-[10px] text-zinc-400 hidden sm:inline">
                      {networkStep === "unapplied" ? "1 unapplied change" : "Changes deployed"}
                    </span>
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded font-semibold text-[10px] shadow-sm transition-all ${
                        networkStep === "unapplied"
                          ? "bg-purple-600 text-white hover:bg-purple-500"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {networkStep === "unapplied" ? "Deploy (1)" : "Deployed ✓"}
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setActiveHeaderTab("Architecture")}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                      activeHeaderTab === "Architecture" ? "bg-white/[0.1] text-white font-semibold" : "hover:text-zinc-200"
                    }`}
                  >
                    Architecture
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveHeaderTab("Workflows")}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors flex items-center gap-1.5 ${
                      activeHeaderTab === "Workflows" ? "bg-white/[0.1] text-white font-semibold" : "hover:text-zinc-200"
                    }`}
                  >
                    <span>Workflows</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveHeaderTab("Observability")}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors flex items-center gap-1 ${
                      activeHeaderTab === "Observability" ? "bg-white/[0.1] text-white font-semibold" : "hover:text-zinc-200"
                    }`}
                  >
                    <span>Observability</span>
                    {activeStage === "monitor" && (
                      <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[9px] font-bold">2</span>
                    )}
                  </button>
                  <span className="px-1.5 py-0.5 text-zinc-500 hidden md:inline text-[11px]">Logs</span>
                  <span className="px-1.5 py-0.5 text-zinc-500 hidden md:inline text-[11px]">Settings</span>
                </div>

                <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
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

            {/* ── Cinematic Camera Container ── */}
            <div
              className="relative w-full h-full flex items-center justify-center p-3 will-change-transform"
              style={{
                transform: activeHeaderTab === "Workflows" ? "none" : cameraTransform,
                transition: "transform 1.1s cubic-bezier(0.16, 1, 0.3, 1)",
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
                      {/* ── STEP 1: Repository & Branch Selection ── */}
                      {deployStep === "select-repo" && (
                        <div className="w-full max-w-xl rounded-2xl bg-[#0f1118]/95 border border-zinc-800 shadow-2xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">
                          {/* Header & Stepper */}
                          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                            <div>
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Rocket className="w-4 h-4 text-purple-400" />
                                New Deployment
                              </h3>
                              <p className="text-[11px] text-zinc-400 mt-0.5">Connect your repository and deploy</p>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono">
                              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">1. Repo</span>
                              <span className="text-zinc-600">→</span>
                              <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-500">2. Branch</span>
                              <span className="text-zinc-600">→</span>
                              <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-500">3. Analysis</span>
                            </div>
                          </div>

                          {/* Search input */}
                          <div className="px-3 py-1.5 rounded-lg bg-[#07080d] border border-white/[0.08] text-[11px] flex items-center gap-2 text-zinc-300">
                            <Search className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="text-white font-mono">organization/enterprise-core</span>
                          </div>

                          {/* Selected Repository Card */}
                          <div className="flex flex-col gap-2">
                            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/40 text-white flex items-center justify-between shadow-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                                  <GitBranch className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="font-semibold text-xs text-white">organization/enterprise-core</div>
                                  <div className="text-[10px] text-zinc-400 flex items-center gap-2 mt-0.5 font-mono">
                                    <span className="text-purple-300">Default branch: main</span>
                                    <span className="w-1 h-1 rounded-full bg-zinc-600" />
                                    <span className="text-emerald-400">TypeScript Monorepo</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold">
                                  main ✓
                                </span>
                                <CheckCircle2 className="w-4 h-4 text-purple-400" />
                              </div>
                            </div>
                          </div>

                          {/* Action Footer */}
                          <div className="pt-2 flex items-center justify-between border-t border-white/[0.06]">
                            <span className="text-[10px] text-zinc-500 font-mono">Target: main (HEAD: commit 23rr2v9)</span>
                            <button
                              type="button"
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-all shadow-md active:scale-95"
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
                        <div className="w-full max-w-2xl rounded-2xl bg-[#0f1118]/95 border border-zinc-800 shadow-2xl p-5 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-300">
                          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                            <div>
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                Project Analysis Complete
                              </h3>
                              <p className="text-[11px] text-zinc-400 mt-0.5">Automatic tech-stack inspection via AST engine</p>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                              AST PARSED ✓
                            </span>
                          </div>

                          {/* Architecture Card */}
                          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
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
                            <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/30 flex flex-col gap-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                                  Frontend Detected
                                </span>
                                <span className="text-[9px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/20">Next.js 16</span>
                              </div>
                              <div className="text-[10.5px] text-zinc-300 font-mono space-y-0.5 mt-0.5">
                                <p><span className="text-zinc-500">Framework:</span> Next.js (App Router)</p>
                                <p><span className="text-zinc-500">Root Path:</span> /client</p>
                                <p><span className="text-zinc-500">Build:</span> pnpm build (Turbopack)</p>
                              </div>
                            </div>

                            {/* Backend Detected */}
                            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col gap-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  Backend Detected
                                </span>
                                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Go Gin</span>
                              </div>
                              <div className="text-[10.5px] text-zinc-300 font-mono space-y-0.5 mt-0.5">
                                <p><span className="text-zinc-500">Framework:</span> Go Gin + AST Engine</p>
                                <p><span className="text-zinc-500">Root Path:</span> /server</p>
                                <p><span className="text-zinc-500">Start:</span> go run main.go</p>
                              </div>
                            </div>
                          </div>

                          {/* Database Detected */}
                          <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <Database className="w-3.5 h-3.5 text-amber-400" />
                              <span className="font-semibold text-amber-300">Database Detected:</span>
                              <span className="text-zinc-300 font-mono text-[11px]">PostgreSQL (Prisma ORM)</span>
                            </div>
                            <span className="text-[10px] text-amber-400/80 font-mono">Neon Serverless</span>
                          </div>

                          {/* Continue to Configure Button */}
                          <div className="pt-2 flex justify-end border-t border-white/[0.06]">
                            <button
                              type="button"
                              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                            >
                              <span>Continue to Configure</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── STEP 3: Platform Selection & Configuration ── */}
                      {deployStep === "configure-platforms" && (
                        <div className="w-full max-w-2xl rounded-2xl bg-[#0f1118]/95 border border-zinc-800 shadow-2xl p-5 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-300">
                          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                            <div>
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Server className="w-4 h-4 text-teal-400" />
                                Platform Selection &amp; Routing
                              </h3>
                              <p className="text-[11px] text-zinc-400 mt-0.5">Select hosting platforms for frontend and backend microservices</p>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">enterprise-core</span>
                          </div>

                          {/* Platform Selectors Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Frontend Selector: Vercel vs Netlify */}
                            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col gap-1.5">
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Frontend Hosting</span>
                              <div className="p-2.5 rounded-lg bg-black/60 border border-zinc-700 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-white font-medium">
                                  <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 116 100"><polygon points="58 0 116 100 0 100" /></svg>
                                  <span>Vercel (Recommended)</span>
                                </div>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              </div>
                              <span className="text-[9px] text-zinc-500 font-mono">Alternative: Netlify Edge</span>
                            </div>

                            {/* Backend Selector: Render vs Railway */}
                            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col gap-1.5">
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Backend Hosting</span>
                              <div className="p-2.5 rounded-lg bg-black/60 border border-zinc-700 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-white font-medium">
                                  <div className="w-3.5 h-3.5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[9px]">R</div>
                                  <span>Render (Recommended)</span>
                                </div>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              </div>
                              <span className="text-[9px] text-zinc-500 font-mono">Alternative: Railway Container</span>
                            </div>
                          </div>

                          {/* Full Stack Orchestration Trigger Card */}
                          <div className="rounded-xl border border-teal-500/40 bg-gradient-to-r from-teal-950/30 to-[#0a0f16] p-4 relative overflow-hidden shadow-[0_0_30px_rgba(20,184,166,0.15)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 font-bold text-xs shrink-0 shadow-[0_0_15px_rgba(20,184,166,0.4)]">
                                ⚡
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">Full Stack Orchestration</span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-teal-500/20 text-teal-300 border border-teal-500/30 font-mono font-bold">
                                    Vercel + Render
                                  </span>
                                </div>
                                <p className="text-[10px] text-zinc-400 mt-0.5">
                                  Deploy frontend &amp; backend simultaneously · Auto-injected NEXT_PUBLIC_API_URL
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold hover:from-teal-400 hover:to-emerald-500 transition-all shadow-[0_0_20px_rgba(20,184,166,0.4)] shrink-0 active:scale-95"
                            >
                              <Rocket className="w-3.5 h-3.5" />
                              <span>Deploy Full Stack</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── STEP 4: Live Incoming Build Logs ── */}
                      {deployStep === "live-logs" && (
                        <div className="w-full max-w-2xl rounded-2xl bg-[#090a10] border border-zinc-800 shadow-2xl p-4 flex flex-col gap-2.5 font-mono text-[11px] animate-in fade-in zoom-in-95 duration-300">
                          {/* Terminal Chrome Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                              <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                              <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                              <span className="ml-2 text-xs font-bold text-zinc-300">terminal ~ deploy (Vercel + Render)</span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                              Current Step: {terminalLogs <= 3 ? "turbopack_build" : "kaniko_bake"}
                            </span>
                          </div>

                          {/* Real Terminal Stream Logs */}
                          <div className="bg-[#050505] p-3.5 rounded-xl border border-zinc-800/60 h-44 overflow-y-auto space-y-2">
                            {platformIncomingLogs.slice(0, terminalLogs).map((l, i) => (
                              <div key={i} className="flex gap-2.5 items-start text-xs leading-relaxed animate-in fade-in duration-200">
                                <span className="text-zinc-600 shrink-0 select-none">[{l.time}]</span>
                                <span className={l.tag === "pass" ? "text-emerald-400 font-semibold" : "text-zinc-300"}>
                                  {l.text}
                                </span>
                              </div>
                            ))}
                            {terminalLogs < platformIncomingLogs.length && (
                              <div className="flex items-center gap-2 text-zinc-500 text-xs animate-pulse pt-1">
                                <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
                                <span>Streaming container execution logs...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── STEP 5: Mock Workflow Pipeline Building with Actual Nodes ── */}
                      {deployStep === "workflow-pipeline" && (
                        <div className="w-full max-w-4xl flex flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
                          {/* Header Bar */}
                          <div className="w-full max-w-2xl flex items-center justify-between p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                                <GitBranch className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-white">Full-Stack Execution Pipeline</span>
                                  <span className="font-mono text-[10px] text-zinc-500">commit 23rr2v9</span>
                                </div>
                                <p className="text-[10px] text-zinc-400 mt-0.5">
                                  Deterministic execution · AST route verification · Auto-healing socket timeout
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border flex items-center gap-1.5 ${
                                pipelineCompleted
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${pipelineCompleted ? "bg-emerald-400" : "bg-blue-400 animate-ping"}`} />
                                {pipelineCompleted ? "Pipeline OK · 5/5 Nodes Verified" : "Pipeline Building Nodes..."}
                              </span>
                            </div>
                          </div>

                          {/* 3D Infographic Snake Pipeline */}
                          <div className="w-full flex justify-center items-center overflow-x-auto py-1">
                            {renderInfographicSnakePipeline(getLiveWorkflowSteps(pipelineCompleted), true)}
                          </div>
                        </div>
                      )}

                      {/* ── STEP 6: Deployment Success & Live App Preview ── */}
                      {deployStep === "success-summary" && (
                        <div className="w-full max-w-3xl rounded-2xl bg-[#0c1015] border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden animate-in fade-in zoom-in-95 duration-400 relative">
                          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />

                          {/* Success Header */}
                          <div className="px-5 py-3.5 border-b border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                                <CheckCircle2 className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-white">Deployment Completed Successfully</h3>
                                <p className="text-[10px] text-zinc-400">All full-stack services are live and healthy</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                ONLINE (28ms)
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
                                  https://enterprise-core.vercel.app
                                </div>
                              </div>
                              {/* Mock Live App Screen */}
                              <div className="p-3 flex-1 flex flex-col justify-between bg-gradient-to-b from-zinc-950 to-black text-white">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                  <span className="font-bold text-xs tracking-tight">Enterprise Core</span>
                                  <span className="text-[9px] text-emerald-400 font-mono">Status: 100% Up</span>
                                </div>
                                <div className="py-2.5 space-y-1.5">
                                  <div className="h-2 w-3/4 rounded bg-white/[0.1]" />
                                  <div className="h-2 w-1/2 rounded bg-purple-500/30" />
                                  <div className="h-10 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-around px-2 text-[10px]">
                                    <div className="text-center"><span className="text-zinc-500 block text-[8px]">RPS</span> 1,420</div>
                                    <div className="text-center"><span className="text-zinc-500 block text-[8px]">LATENCY</span> 28ms</div>
                                    <div className="text-center"><span className="text-zinc-500 block text-[8px]">ERRORS</span> 0.00%</div>
                                  </div>
                                </div>
                                <div className="text-[9px] text-zinc-500 font-mono">Render microservice backend paired</div>
                              </div>
                            </div>

                            {/* Right: Endpoints & Health Checks */}
                            <div className="flex flex-col justify-between gap-3 text-xs">
                              <div className="space-y-2">
                                <div className="p-2.5 rounded-lg border border-zinc-800 bg-black/40">
                                  <div className="text-[10px] text-zinc-500 font-mono uppercase mb-0.5">Frontend Domain</div>
                                  <div className="text-indigo-400 font-semibold text-[11px] flex items-center justify-between">
                                    <span>enterprise-core.vercel.app</span>
                                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-lg border border-zinc-800 bg-black/40">
                                  <div className="text-[10px] text-zinc-500 font-mono uppercase mb-0.5">Backend API Domain</div>
                                  <div className="text-emerald-400 font-semibold text-[11px] flex items-center justify-between">
                                    <span>api.enterprise-core.onrender.com</span>
                                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                                  </div>
                                </div>
                              </div>

                              {/* 4 Health Checks */}
                              <div className="p-2.5 rounded-lg bg-[#050508] border border-zinc-800/80 font-mono text-[10px] space-y-1">
                                <div className="flex items-center justify-between text-zinc-300">
                                  <span>Backend Connection</span>
                                  <span className="text-emerald-400 font-bold">200 OK</span>
                                </div>
                                <div className="flex items-center justify-between text-zinc-300">
                                  <span>Frontend Edge</span>
                                  <span className="text-emerald-400 font-bold">RESOLVED</span>
                                </div>
                                <div className="flex items-center justify-between text-zinc-300">
                                  <span>CORS Policy</span>
                                  <span className="text-emerald-400 font-bold">MATCHED</span>
                                </div>
                                <div className="flex items-center justify-between text-zinc-300">
                                  <span>Database Ping</span>
                                  <span className="text-emerald-400 font-bold">0.4ms</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

              {/* ═════════════════════════════════════════════════════════════
                  STAGE 2: NETWORK (Frames 00:05 - 00:09)
                  ═════════════════════════════════════════════════════════════ */}
              {activeStage === "network" && (
                <div className="relative z-10 w-full flex flex-col items-center justify-center px-4 animate-in fade-in duration-300">
                  {/* Frame 00:05: Create Menu */}
                  {networkStep === "create-menu" ? (
                    <div className="w-56 rounded-xl bg-[#12141c] border border-white/[0.1] shadow-2xl p-2.5 flex flex-col gap-1 text-xs">
                      <span className="text-[9px] font-mono text-zinc-500 px-2 py-0.5">Create ▾</span>
                      <div className="px-2 py-1 rounded bg-[#0a0b10] text-zinc-500 text-[10px] mb-1">What do you need?</div>
                      <div className="p-1.5 rounded-lg text-zinc-400 flex items-center justify-between text-[11px]">
                        <span>GitHub Repo</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                      <div className="p-1.5 rounded-lg text-zinc-400 flex items-center justify-between text-[11px]">
                        <span>Template</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                      <div className="p-1.5 rounded-lg bg-white/[0.08] text-white font-medium flex items-center justify-between text-[11px] shadow-sm">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3 h-3 text-purple-400" />
                          <span>Database</span>
                        </div>
                        <ChevronRight className="w-3 h-3 text-zinc-400" />
                      </div>
                    </div>
                  ) : (
                    /* Frames 00:07 - 00:09: backend & postgres connected via mTLS bridge */
                    <div className="flex flex-col items-center relative">
                      {/* Top: backend node */}
                      <div className="w-52 p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl flex items-center gap-2.5 z-10">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-zinc-300">
                          <GitBranch className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-white">backend</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          </div>
                          <p className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Just deployed via GitHub</span>
                          </p>
                        </div>
                      </div>

                      {/* Living Organic Tree Branch Connection Line */}
                      <div className="flex flex-col items-center my-0.5 z-10">
                        <div
                          className="w-0.5 bg-gradient-to-b from-purple-500 to-indigo-500 transition-all duration-700 ease-out"
                          style={{ height: networkTreeGrown ? "24px" : "0px", opacity: networkTreeGrown ? 1 : 0 }}
                        />
                        <div
                          className="px-2.5 py-0.5 rounded-full bg-[#131522] border border-purple-500/40 text-[10px] font-mono text-zinc-300 flex items-center gap-1.5 shadow-lg transition-all duration-500"
                          style={{
                            opacity: networkTreeGrown ? 1 : 0,
                            transform: networkTreeGrown ? "scale(1)" : "scale(0.8)",
                          }}
                        >
                          <span className="text-purple-300">postgres.railway</span>
                          <Shield className="w-3 h-3 text-purple-400" />
                          <span className="text-zinc-500">172.31.255.255</span>
                        </div>
                        <div
                          className="w-0.5 bg-gradient-to-b from-indigo-500 to-emerald-500 transition-all duration-700 ease-out"
                          style={{ height: networkTreeGrown ? "24px" : "0px", opacity: networkTreeGrown ? 1 : 0 }}
                        />
                      </div>

                      {/* Bottom: postgres node */}
                      <div
                        className="w-52 p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl flex items-center gap-2.5 z-10 transition-all duration-500"
                        style={{
                          opacity: networkTreeGrown ? 1 : 0,
                          transform: networkTreeGrown ? "translateY(0)" : "translateY(12px)",
                        }}
                      >
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-[11px]">
                          🐘
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-white">postgres</span>
                            <span className="px-1.5 py-0.2 rounded text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                              New
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">Ready to be deployed</p>
                          <p className="text-[9px] text-zinc-500 font-mono">pg-data</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  STAGE 3: SCALE (Frames 00:10 - 00:15)
                  ═════════════════════════════════════════════════════════════ */}
              {activeStage === "scale" && (
                <div className="relative z-10 w-full flex items-center justify-center px-4 animate-in fade-in duration-300">
                  <div className="flex flex-col items-center gap-4">
                    {/* Backend Card */}
                    <div
                      className={`w-52 p-3 rounded-xl shadow-xl flex items-center gap-2.5 transition-colors ${
                        scaleStep === "alert"
                          ? "bg-[#181216] border border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                          : "bg-[#13151f] border border-white/[0.12]"
                      }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-zinc-300">
                        <GitBranch className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-white">backend</span>
                          {scaleStep === "healthy" && (
                            <span className="text-[9px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.2 rounded">
                              {selectedReplica} Replicas
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-[10px] flex items-center gap-1 mt-0.5 ${
                            scaleStep === "alert" ? "text-red-400" : "text-zinc-400"
                          }`}
                        >
                          {scaleStep === "alert" ? (
                            <>
                              <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                              <span>High CPU usage</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Just deployed via GitHub</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Postgres Card below */}
                    <div className="w-52 p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-[11px]">
                        🐘
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">postgres</div>
                        <p className="text-[10px] text-zinc-400">Just deployed</p>
                      </div>
                    </div>

                    {/* Replica Picker Dropdown attached directly beneath backend */}
                    {scaleStep === "menu" && (
                      <div className="w-52 rounded-xl bg-[#12141c] border border-white/[0.12] shadow-2xl p-2.5 flex flex-col gap-1 text-[11px] animate-in fade-in zoom-in-95">
                        <div className="text-[10px] text-zinc-400 pb-1 border-b border-white/[0.06] flex items-center justify-between">
                          <span>backend Replicas</span>
                          <span className="text-[9px] text-zinc-500">What do you need?</span>
                        </div>
                        <div className="p-1.5 rounded-lg text-zinc-400 flex items-center justify-between">
                          <span>1 Replica</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-purple-600/20 text-purple-300 font-semibold border border-purple-500/30 flex items-center justify-between">
                          <span>2 Replicas</span>
                          <CheckCircle2 className="w-3 h-3 text-purple-400" />
                        </div>
                        <div className="p-1.5 rounded-lg text-zinc-400">3 Replicas</div>
                        <div className="p-1.5 rounded-lg text-zinc-400">4 Replicas</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  STAGE 4: MONITOR — REAL OBSERVABILITY & FLAME GRAPH (Frame 00:18)
                  ═════════════════════════════════════════════════════════════ */}
              {activeStage === "monitor" && (
                <div className="relative z-10 w-full h-full flex flex-col justify-between p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-300">
                  {activeHeaderTab === "Observability" ? (
                    <div className="w-full flex-1 flex flex-col gap-2.5 font-mono">
                      {/* Sub-header Toolbar */}
                      <div className="flex items-center justify-between pb-0.5 text-xs">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#161822] border border-white/[0.08] text-zinc-300 text-[11px]"
                        >
                          <span>Last 15 min</span>
                          <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
                        </button>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 hidden sm:inline">184k traces indexed · 0% drop</span>
                          <button
                            type="button"
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#161822] border border-white/[0.08] text-zinc-300 text-[11px]"
                          >
                            <Pencil className="w-2.5 h-2.5 text-zinc-400" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </div>

                      {/* 6-Panel Real Analytics Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {/* Panel 1: Memory Usage */}
                        <div className="p-3 rounded-xl bg-[#11131c] border border-white/[0.08] flex flex-col justify-between h-40 shadow-lg group">
                          <div className="flex items-center justify-between text-xs text-zinc-400 pb-0.5">
                            <span className="font-semibold text-zinc-200">Memory Usage</span>
                            <span className="text-purple-300 text-[10px]">284 MB / 512 MB</span>
                          </div>
                          
                          <div className="relative w-full flex-1 flex items-stretch">
                            <div className="w-10 flex flex-col justify-between text-[8px] text-zinc-600 font-mono pr-1 select-none">
                              <span>300 MB</span>
                              <span>200 MB</span>
                              <span>100 MB</span>
                              <span>0 MB</span>
                            </div>

                            <div className="flex-1 relative h-full">
                              <svg className="w-full h-full" viewBox="0 0 200 70" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                <line x1="0" y1="5" x2="200" y2="5" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="25" x2="200" y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="46" x2="200" y2="46" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="66" x2="200" y2="66" stroke="rgba(255,255,255,0.08)" />

                                <polygon
                                  points="0,60 15,58 30,56 45,52 60,48 75,44 90,40 105,38 120,32 135,26 150,22 165,18 180,14 200,10 200,66 0,66"
                                  fill="url(#memGrad)"
                                />
                                <path
                                  d="M0,60 L15,58 L30,56 L45,52 L60,48 L75,44 L90,40 L105,38 L120,32 L135,26 L150,22 L165,18 L180,14 L200,10"
                                  fill="none"
                                  stroke="#d946ef"
                                  strokeWidth="1.8"
                                />
                                <circle cx="200" cy="10" r="2.5" fill="#d946ef" className="animate-pulse" />
                              </svg>
                            </div>
                          </div>

                          <div className="flex justify-between pl-10 text-[8px] text-zinc-600 pt-0.5 border-t border-white/[0.04]">
                            <span>15:50</span>
                            <span>16:00</span>
                            <span>16:10</span>
                            <span>16:20</span>
                          </div>
                        </div>

                        {/* Panel 2: Request Latency */}
                        <div className="p-3 rounded-xl bg-[#11131c] border border-white/[0.08] flex flex-col justify-between h-40 shadow-lg group">
                          <div className="flex items-center justify-between text-xs text-zinc-400 pb-0.5">
                            <span className="font-semibold text-zinc-200">Request Latency</span>
                            <span className="text-indigo-400 text-[10px]">p99: 14.8ms · p50: 0.9ms</span>
                          </div>

                          <div className="relative w-full flex-1 flex items-stretch">
                            <div className="w-10 flex flex-col justify-between text-[8px] text-zinc-600 font-mono pr-1 select-none">
                              <span>800 ms</span>
                              <span>400 ms</span>
                              <span>200 ms</span>
                              <span>0 ms</span>
                            </div>

                            <div className="flex-1 relative h-full">
                              <svg className="w-full h-full" viewBox="0 0 200 70" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                <line x1="0" y1="5" x2="200" y2="5" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="25" x2="200" y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="46" x2="200" y2="46" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="66" x2="200" y2="66" stroke="rgba(255,255,255,0.08)" />

                                <polygon
                                  points="0,58 10,56 20,60 30,50 40,56 50,42 60,54 70,30 80,48 90,38 100,44 110,26 120,40 130,22 140,36 150,18 160,32 170,14 180,26 190,10 200,18 200,66 0,66"
                                  fill="url(#latGrad)"
                                />
                                <path
                                  d="M0,58 L10,56 L20,60 L30,50 L40,56 L50,42 L60,54 L70,30 L80,48 L90,38 L100,44 L110,26 L120,40 L130,22 L140,36 L150,18 L160,32 L170,14 L180,26 L190,10 L200,18"
                                  fill="none"
                                  stroke="#818cf8"
                                  strokeWidth="1.6"
                                />
                                <circle cx="200" cy="18" r="2.5" fill="#818cf8" className="animate-pulse" />
                              </svg>
                            </div>
                          </div>

                          <div className="flex justify-between pl-10 text-[8px] text-zinc-600 pt-0.5 border-t border-white/[0.04]">
                            <span>15:50</span>
                            <span>16:00</span>
                            <span>16:10</span>
                            <span>16:20</span>
                          </div>
                        </div>

                        {/* Panel 3: CONTINUOUS PROFILING FLAME GRAPH */}
                        <div className="p-3 rounded-xl bg-[#11131c] border border-orange-500/30 flex flex-col justify-between h-40 shadow-lg group relative overflow-hidden">
                          <div className="flex items-center justify-between text-xs text-zinc-400 pb-0.5">
                            <div className="flex items-center gap-1 font-semibold text-orange-400">
                              <Flame className="w-3 h-3" />
                              <span>Flame Graph</span>
                            </div>
                            <span className="text-[9px] text-zinc-400 font-mono">CPU Call Stacks</span>
                          </div>

                          {/* Stacked Flame Graph Bars */}
                          <div className="flex-1 w-full flex flex-col justify-end gap-0.5 py-0.5 select-none">
                            {/* Level 5 */}
                            <div className="w-full flex h-3 relative gap-0.5 text-[7.5px] font-mono leading-none">
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[10])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[24.1%] rounded-sm bg-red-600 text-white px-0.5 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all shadow-sm"
                              >
                                lz4.Compress
                              </div>
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[11])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[12.3%] rounded-sm bg-orange-700 text-white px-0.5 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all"
                              >
                                net.write
                              </div>
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[12])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[14.2%] rounded-sm bg-rose-600 text-white px-0.5 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all font-bold shadow-sm"
                              >
                                mallocgc
                              </div>
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[13])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[3.6%] rounded-sm bg-amber-800 text-amber-200 flex items-center justify-center truncate cursor-pointer"
                              >
                                ·
                              </div>
                            </div>

                            {/* Level 4 */}
                            <div className="w-full flex h-3 relative gap-0.5 text-[7.5px] font-mono leading-none">
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[8])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[36.4%] rounded-sm bg-red-800 text-white px-1 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all"
                              >
                                clickhouse.BatchInsert (36%)
                              </div>
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[9])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[17.8%] rounded-sm bg-rose-800 text-rose-100 px-1 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all"
                              >
                                json.Unmarshal (18%)
                              </div>
                            </div>

                            {/* Level 3 */}
                            <div className="w-full flex h-3 relative gap-0.5 text-[7.5px] font-mono leading-none">
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[5])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[54.2%] rounded-sm bg-rose-900/90 text-rose-200 px-1 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all"
                              >
                                api.IngestTelemetryHandler (54%)
                              </div>
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[6])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[14.2%] rounded-sm bg-amber-800/80 text-amber-200 px-1 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all"
                              >
                                auth.Verify
                              </div>
                            </div>

                            {/* Level 2 */}
                            <div className="w-full flex h-3 relative gap-0.5 text-[7.5px] font-mono leading-none">
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[3])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[76.8%] rounded-sm bg-amber-900/90 text-amber-100 px-1 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all"
                              >
                                gin.Engine.handleHTTPRequest (77%)
                              </div>
                            </div>

                            {/* Level 1 */}
                            <div className="w-full flex h-3 relative gap-0.5 text-[7.5px] font-mono leading-none">
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[1])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[82.4%] rounded-sm bg-orange-950 text-orange-200 px-1 flex items-center justify-center truncate cursor-pointer hover:brightness-125 transition-all"
                              >
                                net/http.(*conn).serve (82.4%)
                              </div>
                              <div
                                onMouseEnter={() => setHoveredFlameFrame(PROFILING_FLAME_FRAMES[2])}
                                onMouseLeave={() => setHoveredFlameFrame(null)}
                                className="w-[17.6%] rounded-sm bg-red-950 text-red-300 px-1 flex items-center justify-center truncate cursor-pointer"
                              >
                                gc (18%)
                              </div>
                            </div>
                          </div>

                          <div className="pt-0.5 border-t border-white/[0.04] text-[8px] font-mono text-zinc-400 flex items-center justify-between">
                            {hoveredFlameFrame ? (
                              <div className="flex items-center gap-1.5 text-orange-300 animate-in fade-in">
                                <span className="font-bold text-white">{hoveredFlameFrame.name}</span>
                                <span>{hoveredFlameFrame.timeStr} ({hoveredFlameFrame.pct}%)</span>
                              </div>
                            ) : (
                              <>
                                <span>99Hz Sampling trace</span>
                                <span className="text-orange-400">Hot path: mallocgc</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Panel 4: CPU Usage */}
                        <div className="p-3 rounded-xl bg-[#11131c] border border-white/[0.08] flex flex-col justify-between h-40 shadow-lg group">
                          <div className="flex items-center justify-between text-xs text-zinc-400 pb-0.5">
                            <span className="font-semibold text-zinc-200">CPU Usage</span>
                            <span className="text-emerald-400 text-[10px]">18.4% · 0.38 cores</span>
                          </div>

                          <div className="relative w-full flex-1 flex items-stretch">
                            <div className="w-10 flex flex-col justify-between text-[8px] text-zinc-600 font-mono pr-1 select-none">
                              <span>2.0x</span>
                              <span>1.5x</span>
                              <span>1.0x</span>
                              <span>0.0x</span>
                            </div>

                            <div className="flex-1 relative h-full">
                              <svg className="w-full h-full" viewBox="0 0 200 70" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                <line x1="0" y1="5" x2="200" y2="5" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="25" x2="200" y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="46" x2="200" y2="46" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="66" x2="200" y2="66" stroke="rgba(255,255,255,0.08)" />

                                <polygon
                                  points="0,58 20,54 40,56 60,46 80,48 100,40 120,36 140,28 160,30 180,20 200,24 200,66 0,66"
                                  fill="url(#cpuGrad)"
                                />
                                <path
                                  d="M0,58 L20,54 L40,56 L60,46 L80,48 L100,40 L120,36 L140,28 L160,30 L180,20 L200,24"
                                  fill="none"
                                  stroke="#10b981"
                                  strokeWidth="1.8"
                                />
                                <circle cx="200" cy="24" r="2.5" fill="#10b981" className="animate-pulse" />
                              </svg>
                            </div>
                          </div>

                          <div className="flex justify-between pl-10 text-[8px] text-zinc-600 pt-0.5 border-t border-white/[0.04]">
                            <span>15:50</span>
                            <span>16:00</span>
                            <span>16:10</span>
                            <span>16:20</span>
                          </div>
                        </div>

                        {/* Panel 5: Network Egress */}
                        <div className="p-3 rounded-xl bg-[#11131c] border border-white/[0.08] flex flex-col justify-between h-40 shadow-lg group">
                          <div className="flex items-center justify-between text-xs text-zinc-400 pb-0.5">
                            <span className="font-semibold text-zinc-200">Network egress</span>
                            <span className="text-amber-400 text-[10px]">48.2 MB/s · 1.4 GB</span>
                          </div>

                          <div className="relative w-full flex-1 flex items-stretch">
                            <div className="w-10 flex flex-col justify-between text-[8px] text-zinc-600 font-mono pr-1 select-none">
                              <span>150 MB</span>
                              <span>100 MB</span>
                              <span>50 MB</span>
                              <span>0 MB</span>
                            </div>

                            <div className="flex-1 relative h-full">
                              <svg className="w-full h-full" viewBox="0 0 200 70" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                <line x1="0" y1="5" x2="200" y2="5" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="25" x2="200" y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="46" x2="200" y2="46" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                                <line x1="0" y1="66" x2="200" y2="66" stroke="rgba(255,255,255,0.08)" />

                                <polygon
                                  points="0,60 20,57 40,50 60,52 80,40 100,44 120,32 140,34 160,26 180,22 200,18 200,66 0,66"
                                  fill="url(#netGrad)"
                                />
                                <path
                                  d="M0,60 L20,57 L40,50 L60,52 L80,40 L100,44 L120,32 L140,34 L160,26 L180,22 L200,18"
                                  fill="none"
                                  stroke="#f59e0b"
                                  strokeWidth="1.8"
                                />
                                <circle cx="200" cy="18" r="2.5" fill="#f59e0b" className="animate-pulse" />
                              </svg>
                            </div>
                          </div>

                          <div className="flex justify-between pl-10 text-[8px] text-zinc-600 pt-0.5 border-t border-white/[0.04]">
                            <span>15:50</span>
                            <span>16:00</span>
                            <span>16:10</span>
                            <span>16:20</span>
                          </div>
                        </div>

                        {/* Panel 6: Error Logs */}
                        <div className="p-3 rounded-xl bg-[#11131c] border border-white/[0.08] flex flex-col justify-between h-40 shadow-lg overflow-hidden">
                          <div className="flex items-center justify-between text-xs text-zinc-400 pb-0.5">
                            <span className="font-semibold text-zinc-200">Error logs</span>
                            <span className="text-[9px] text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>Live tail</span>
                            </span>
                          </div>

                          <div className="flex-1 w-full overflow-y-auto text-[9px] font-mono flex flex-col gap-1 pr-1">
                            <div className="grid grid-cols-12 text-zinc-500 pb-0.5 border-b border-white/[0.06] text-[8px]">
                              <span className="col-span-3">Date</span>
                              <span className="col-span-3">Service</span>
                              <span className="col-span-6">Message</span>
                            </div>

                            <div className="grid grid-cols-12 text-zinc-300 py-0.5 border-b border-white/[0.02]">
                              <span className="col-span-3 text-zinc-500">Sep 11 02:41</span>
                              <span className="col-span-3 text-purple-300">backend</span>
                              <span className="col-span-6 truncate text-zinc-400">GET /health 200 OK (0.8ms)</span>
                            </div>

                            <div className="grid grid-cols-12 text-zinc-300 py-0.5 border-b border-white/[0.02]">
                              <span className="col-span-3 text-zinc-500">Sep 11 02:40</span>
                              <span className="col-span-3 text-blue-400">postgres</span>
                              <span className="col-span-6 truncate text-zinc-400">checkpoint: wrote 894 buffers</span>
                            </div>

                            <div className="grid grid-cols-12 text-zinc-300 py-0.5 border-b border-white/[0.02]">
                              <span className="col-span-3 text-zinc-500">Sep 11 02:39</span>
                              <span className="col-span-3 text-red-400">redis</span>
                              <span className="col-span-6 truncate text-zinc-400">DB 0: 4,120 keys synced</span>
                            </div>
                          </div>

                          <div className="pt-0.5 border-t border-white/[0.04] text-[8px] text-zinc-500 flex items-center justify-between">
                            <span>0 unhandled errors</span>
                            <span className="text-purple-400">100% nominal</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-4">
                      <div className="w-48 p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-zinc-300">
                          <GitBranch className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-mono text-xs font-bold text-white">backend</div>
                          <p className="text-[10px] text-zinc-400">Just deployed via GitHub</p>
                        </div>
                      </div>

                      <div className="w-48 p-3 rounded-xl bg-[#13151f] border border-white/[0.12] shadow-xl flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center text-xs">
                          🔴
                        </div>
                        <div>
                          <div className="font-mono text-xs font-bold text-white">redis</div>
                          <p className="text-[10px] text-zinc-400">redis-volume</p>
                        </div>
                      </div>

                      {showCommandPalette && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 rounded-xl bg-[#131522] border border-white/[0.14] shadow-2xl p-3.5 flex flex-col gap-2 animate-in fade-in zoom-in-95">
                          <div className="text-[9px] text-zinc-500 font-mono">Search &gt; backend</div>
                          <div className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/[0.08] text-xs font-mono text-white flex items-center gap-2">
                            <span className="text-purple-400">/</span>
                            <span>search projects...</span>
                          </div>
                          <div className="flex flex-col gap-1 text-[11px]">
                            <div className="px-2 py-1 rounded bg-purple-600/20 text-purple-300 font-mono">
                              computer-rebellion
                            </div>
                            <div className="px-2 py-1 rounded text-zinc-400 font-mono">powerful-art</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  STAGE 5: EVOLVE — TREE GROWING MULTI-SERVICE FLEET (Frames 00:25 - 00:28)
                  ═════════════════════════════════════════════════════════════ */}
              {activeStage === "evolve" && (
                <div className="relative z-10 w-full flex items-center justify-center p-3">
                  {/* Organic Circuit Tree Branches Overlay */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 800 400" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="treeBranchGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.7" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 280,120 Q 340,120 400,120 T 520,120"
                      fill="none"
                      stroke="url(#treeBranchGrad)"
                      strokeWidth="1.5"
                      strokeDasharray="400"
                      strokeDashoffset={evolveTreeGrown ? "0" : "400"}
                      className="transition-all duration-1000 ease-out"
                    />
                    <path
                      d="M 400,120 Q 400,200 400,280"
                      fill="none"
                      stroke="url(#treeBranchGrad)"
                      strokeWidth="1.5"
                      strokeDasharray="300"
                      strokeDashoffset={evolveTreeGrown ? "0" : "300"}
                      className="transition-all duration-1000 ease-out delay-200"
                    />
                    <path
                      d="M 400,120 Q 560,120 640,240"
                      fill="none"
                      stroke="url(#treeBranchGrad)"
                      strokeWidth="1.5"
                      strokeDasharray="500"
                      strokeDashoffset={evolveTreeGrown ? "0" : "500"}
                      className="transition-all duration-1000 ease-out delay-300"
                    />
                    <path
                      d="M 400,120 Q 240,120 160,240"
                      fill="none"
                      stroke="url(#treeBranchGrad)"
                      strokeWidth="1.5"
                      strokeDasharray="500"
                      strokeDashoffset={evolveTreeGrown ? "0" : "500"}
                      className="transition-all duration-1000 ease-out delay-300"
                    />
                  </svg>

                  {/* Compact Fleet Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl w-full z-10">
                    {/* Node 1: frontend */}
                    <div className="p-3 rounded-xl bg-[#13151f] border border-white/[0.1] shadow-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-[10px]">
                        ▲
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">frontend</div>
                        <p className="text-[9px] text-zinc-400">Next.js 16 SSR</p>
                      </div>
                    </div>

                    {/* Node 2: backend */}
                    <div className="p-3 rounded-xl bg-[#13151f] border border-purple-500/40 shadow-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-300 flex items-center justify-center text-[10px]">
                        ⚙️
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">backend</div>
                        <p className="text-[9px] text-zinc-400">Go API &amp; AST</p>
                      </div>
                    </div>

                    {/* Node 3: redis */}
                    <div className="p-3 rounded-xl bg-[#13151f] border border-white/[0.1] shadow-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center text-xs">
                        🔴
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">redis</div>
                        <p className="text-[9px] text-zinc-400">In-Memory Cache</p>
                      </div>
                    </div>

                    {/* Node 4: batch-upload */}
                    <div className="p-3 rounded-xl bg-[#13151f] border border-white/[0.1] shadow-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-[10px]">
                        📦
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">batch-upload</div>
                        <p className="text-[9px] text-zinc-400">S3 SQS Workers</p>
                      </div>
                    </div>

                    {/* Node 5: postgres */}
                    <div className="p-3 rounded-xl bg-[#13151f] border border-emerald-500/30 shadow-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-[10px]">
                        🐘
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">postgres</div>
                        <p className="text-[9px] text-zinc-400">Neon Serverless</p>
                      </div>
                    </div>

                    {/* Node 6: clickhouse */}
                    <div className="p-3 rounded-xl bg-[#13151f] border border-white/[0.1] shadow-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-yellow-500/10 text-yellow-400 flex items-center justify-center text-[10px]">
                        📊
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">clickhouse</div>
                        <p className="text-[9px] text-zinc-400">184k traces/s</p>
                      </div>
                    </div>

                    {/* Node 7: temporal */}
                    <div className="p-3 rounded-xl bg-[#13151f] border border-white/[0.1] shadow-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center text-[10px]">
                        ⏱️
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">temporal</div>
                        <p className="text-[9px] text-zinc-400">Distributed Orchestrator</p>
                      </div>
                    </div>

                    {/* Node 8: ai-remediation */}
                    <div className="p-3 rounded-xl bg-[#161828] border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.25)] flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center text-[10px]">
                        🤖
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-purple-300">ai-sre-agent</div>
                        <p className="text-[9px] text-zinc-400">Autonomous Healing</p>
                      </div>
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
            
            {/* 1. Deployment Successful Toast (Anchored to true BOTTOM-RIGHT CORNER) */}
            {activeStage === "deploy" && showDeployToast && (
              <div className="absolute bottom-5 right-5 p-3.5 rounded-xl bg-[#0f131a]/95 border border-emerald-500/50 shadow-[0_15px_40px_rgba(16,185,129,0.25)] flex items-center gap-3 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300 backdrop-blur-md">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Deployment Successful!</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <div className="text-[10px] text-zinc-400">All full-stack services are up and running</div>
                </div>
              </div>
            )}

            {/* 2. High CPU Alert Card with Real Flame Waveform (Anchored to true TOP-RIGHT CORNER) */}
            {activeStage === "scale" && scaleStep === "alert" && (
              <div className="absolute top-5 right-5 w-72 rounded-xl bg-[#181116]/95 border border-red-500/40 p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex flex-col gap-2 z-40 animate-in fade-in slide-in-from-top-3 duration-300 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>High CPU Usage</span>
                  </div>
                  <X className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-pointer" />
                </div>

                <p className="text-[10.5px] text-zinc-300 leading-snug">
                  backend&apos;s CPU is close to maximum capacity—service may crash.
                </p>

                {/* CPU Flame Spike Profile */}
                <div className="w-full h-12 bg-red-950/40 rounded-lg p-1.5 border border-red-500/20 flex flex-col justify-end overflow-hidden relative font-mono text-[8px]">
                  <div className="absolute top-1 left-2 text-red-400/80 font-bold flex items-center gap-1">
                    <Flame className="w-2.5 h-2.5 text-red-400" />
                    <span>Hot Frame: runtime.mallocgc (89.2% CPU)</span>
                  </div>
                  <svg className="w-full h-7" viewBox="0 0 100 24" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="flameSpikeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <polygon
                      points="0,20 10,19 20,20 30,17 40,15 50,11 60,6 70,3 80,4 90,2 100,4 100,24 0,24"
                      fill="url(#flameSpikeGrad)"
                    />
                    <path
                      d="M0,20 L10,19 L20,20 L30,17 L40,15 L50,11 L60,6 L70,3 L80,4 L90,2 L100,4"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="1.8"
                    />
                  </svg>
                </div>

                <button
                  type="button"
                  className="w-full py-1 rounded-lg bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-[11px] font-semibold text-red-200 transition-colors"
                >
                  Add Replicas
                </button>
              </div>
            )}

            {/* 3. Stabilized Toast (Anchored to true TOP-RIGHT CORNER) */}
            {activeStage === "monitor" && showNormalToast && (
              <div className="absolute top-5 right-5 p-3 rounded-xl bg-[#12141c]/95 border border-emerald-500/40 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center gap-2 z-40 animate-in fade-in slide-in-from-top-3 backdrop-blur-md">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <div className="text-[11px] text-white">
                  <span className="font-semibold text-purple-300">backend</span> CPU usage back to normal
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              BOTTOM FLOATING DOCK NAVIGATOR
              ═════════════════════════════════════════════════════════════ */}
          <div className="h-12 border-t border-white/[0.06] bg-[#0c0d14]/95 px-4 sm:px-6 flex items-center justify-center relative shrink-0 z-30">
            {/* Centered Floating Pill Dock */}
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-[#141622] border border-white/[0.1] shadow-xl">
              {STAGES.map((stage) => {
                const Icon = stage.icon;
                const isActive = activeStage === stage.id;

                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => {
                      setActiveStage(stage.id);
                      setStageProgress(0);
                    }}
                    className={`relative px-3 sm:px-3.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all duration-300 ${
                      isActive
                        ? "bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]"
                        : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{stage.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Play/Pause Controller & Micro Progress Bar */}
            <div className="absolute right-4 sm:right-6 hidden sm:flex items-center gap-2.5">
              <div className="w-12 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-purple-400 transition-all duration-75"
                  style={{ width: `${stageProgress}%` }}
                />
              </div>

              <button
                type="button"
                aria-label={isPlaying ? "Pause auto walkthrough" : "Resume auto walkthrough"}
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-6 h-6 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
              >
                {isPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
