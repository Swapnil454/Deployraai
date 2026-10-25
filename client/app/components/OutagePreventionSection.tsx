"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Globe,
  Key,
  Radio,
  Server,
  Clock,
  Network,
  Zap,
  ShieldCheck,
} from "lucide-react";

interface MonitorType {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Exactly 8 monitor types matching the Deployra Uptime Cron Job monitor dashboard in sequence
const MONITOR_TYPES: MonitorType[] = [
  { id: "http", name: "HTTP / website monitoring", icon: Globe },
  { id: "keyword", name: "Keyword monitoring", icon: Key },
  { id: "ping", name: "Ping monitoring", icon: Radio },
  { id: "port", name: "Port monitoring", icon: Server },
  { id: "cron", name: "Cron job / Heartbeat monitoring", icon: Clock },
  { id: "dns", name: "DNS monitoring", icon: Network },
  { id: "api", name: "API monitoring", icon: Zap },
  { id: "udp", name: "UDP monitoring", icon: ShieldCheck },
];

// Target Y percentages (0 to 100) exactly aligned with the 8 items in a justify-between container
const TARGET_Y_PERCENTS = [5.0, 17.86, 30.71, 43.57, 56.43, 69.29, 82.14, 95.0];

// High-performance canvas component rendering a circular stardust ring that scales with its container
function BroadMicroDotRing({ size: defaultSize = 316 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState(defaultSize);

  // Dynamically adapt canvas resolution to parent container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const handleResize = () => {
      const parentWidth = canvas.parentElement?.clientWidth || defaultSize;
      if (parentWidth > 0 && Math.abs(parentWidth - size) > 4) {
        setSize(parentWidth);
      }
    };

    handleResize();
    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [defaultSize, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 2, 2.5) : 2;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    // Proportional geometric radius and band thickness
    const midR = size * 0.335;
    const halfThickness = size * 0.057;
    const dotCount = Math.round(size * 10.7);

    interface MicroDot {
      r: number;
      angle: number;
      speed: number;
      size: number;
      baseAlpha: number;
      shimmerPhase: number;
      shimmerSpeed: number;
      colorBase: string;
    }

    const colorBases = [
      "0, 255, 110",
      "16, 235, 130",
      "0, 240, 95",
      "52, 250, 160",
      "0, 255, 150",
    ];

    const dots: MicroDot[] = [];

    for (let i = 0; i < dotCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const bell = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      const r = midR + bell * halfThickness + (Math.random() - 0.5) * (size * 0.012);

      const baseSpeed = 0.00085 * (100 / r);
      const speed = baseSpeed * (0.9 + Math.random() * 0.2);
      const dotSize = Math.max(0.7, (size / 316) * (0.9 + Math.random() * 0.8));

      const baseAlpha = 0.72 + Math.random() * 0.28;
      const shimmerPhase = Math.random() * Math.PI * 2;
      const shimmerSpeed = 0.02 + Math.random() * 0.03;
      const colorBase = colorBases[Math.floor(Math.random() * colorBases.length)];

      dots.push({
        r,
        angle,
        speed,
        size: dotSize,
        baseAlpha,
        shimmerPhase,
        shimmerSpeed,
        colorBase,
      });
    }

    let animId: number;

    const render = () => {
      ctx.clearRect(0, 0, size, size);

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        d.angle += d.speed;
        d.shimmerPhase += d.shimmerSpeed;

        const x = cx + Math.cos(d.angle) * d.r;
        const y = cy + Math.sin(d.angle) * d.r;

        const dynamicAlpha = d.baseAlpha * (0.82 + 0.18 * Math.sin(d.shimmerPhase));

        ctx.fillStyle = `rgba(${d.colorBase}, ${dynamicAlpha})`;
        ctx.beginPath();
        ctx.arc(x, y, d.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${size}px`, height: `${size}px` }}
      className="absolute inset-0 pointer-events-none select-none"
    />
  );
}

export default function OutagePreventionSection() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  const activeIndex = activeId !== null ? MONITOR_TYPES.findIndex((n) => n.id === activeId) : -1;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative w-full bg-[#111111] pt-8 sm:pt-10 pb-4 sm:pb-6 lg:pb-8 overflow-hidden z-10"
    >
      {/* Background Matrix Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2820_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2820_1px,transparent_1px)] bg-[size:76px_76px] pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-14">
        {/* ── Top Header Section (Centered on mobile, 2-column on desktop) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start mb-8 sm:mb-12">
          {/* Left Title Column */}
          <div className="lg:col-span-6 text-center lg:text-left">
            <h2 className="font-serif-display text-[28px] sm:text-[36px] md:text-[42px] lg:text-[40px] xl:text-[48px] 2xl:text-[56px] font-normal text-white leading-[1.1] tracking-[-0.02em]">
              Stay Ahead of Every Outage
              <span className="text-emerald-400">.</span>
            </h2>
          </div>

          {/* Right Subtitle / Description Column */}
          <div className="lg:col-span-6 lg:pt-2 xl:pt-3 text-center lg:text-left">
            <p className="text-[14px] sm:text-[15.5px] lg:text-[15px] xl:text-[16px] text-zinc-400 font-normal leading-[1.65] tracking-tight max-w-xl mx-auto lg:mx-0">
              Gain complete visibility into your infrastructure with continuous uptime,
              SSL, port, and cron job monitoring. Detect disruptions early, receive
              actionable alerts, and streamline incident response with integrations built
              for your workflow.
            </p>
          </div>
        </div>

        {/* ── Seamless Connected Architecture Stage (Centered on ALL screen sizes) ── */}
        <div className="relative w-full mx-auto flex flex-col md:flex-row items-center justify-center min-h-[400px] md:min-h-[440px] -mt-2 sm:-mt-4">
          {/* ── LEFT / TOP: 3D Iridescent Alabaster Pearl with Balanced Circular Green Dot Ring ── */}
          <div
            className="relative flex items-center justify-center shrink-0 w-[230px] h-[230px] sm:w-[260px] sm:h-[260px] md:w-[270px] md:h-[270px] lg:w-[290px] lg:h-[290px] xl:w-[316px] xl:h-[316px] select-none transition-all duration-700 ease-out"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "scale(1)" : "scale(0.88)",
            }}
          >
            {/* Pure Circular Dot Ring with Ununiform Outer & Inner Edges */}
            <BroadMicroDotRing size={316} />

            {/* Glossy 3D Iridescent Alabaster Pearl Sphere */}
            <div
              className="relative z-10 w-[100px] h-[100px] sm:w-[112px] sm:h-[112px] md:w-[116px] md:h-[116px] lg:w-[124px] lg:h-[124px] xl:w-[134px] xl:h-[134px] rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer group"
              style={{
                background:
                  "radial-gradient(circle at 35% 26%, #ffffff 0%, #fafffd 28%, #eef5f2 50%, #d8e2de 72%, #b4c2bc 88%, #8d9c96 100%)",
                boxShadow:
                  "inset -9px -11px 24px rgba(15, 30, 24, 0.28), inset 0 0 20px rgba(255, 255, 255, 0.95), inset 3px 4px 10px rgba(255, 255, 255, 1), 0 16px 36px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.45)",
              }}
              onClick={() => {
                const nextIdx = activeIndex === -1 ? 0 : (activeIndex + 1) % MONITOR_TYPES.length;
                setActiveId(MONITOR_TYPES[nextIdx].id);
              }}
            >
              {/* Natural Curved Specular Glass Sheen */}
              <div className="absolute top-2.5 left-4.5 w-8 h-4.5 sm:w-9 sm:h-5 rounded-full bg-gradient-to-b from-white/95 via-white/35 to-transparent blur-[0.6px] rotate-[-22deg] pointer-events-none" />

              {/* Secondary Soft Rim Reflection */}
              <div className="absolute bottom-2.5 inset-x-6 h-2 sm:h-2.5 rounded-full bg-gradient-to-t from-white/30 to-transparent blur-[1.5px] pointer-events-none" />

              {/* Static Types of Monitors Title */}
              <div className="relative z-10 flex flex-col items-center justify-center text-center select-none px-2 pointer-events-none">
                <span className="text-[10px] sm:text-[10.5px] lg:text-[11px] xl:text-[11.5px] font-semibold text-zinc-500 tracking-[0.14em] uppercase leading-tight">
                  Types of
                </span>
                <span className="text-[13px] sm:text-[14px] lg:text-[15px] xl:text-[16px] font-black text-zinc-950 tracking-tight uppercase leading-tight mt-0.5">
                  Monitors
                </span>
              </div>
            </div>
          </div>

          {/* ── MOBILE ONLY CONNECTOR STEM (< 768px): Vertical luminous pulse link ── */}
          <div className="md:hidden flex flex-col items-center justify-center my-3 select-none">
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,1)]" />
            <div className="w-[1.5px] h-7 bg-gradient-to-b from-white/70 via-emerald-400/70 to-white/40" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
          </div>

          {/* ── TABLET & DESKTOP CONNECTORS (>= 768px): SVG Clean Precision Hairlines ── */}
          <div className="hidden md:block w-[150px] lg:w-[210px] xl:w-[270px] 2xl:w-[310px] h-[360px] md:h-[380px] lg:h-[400px] relative pointer-events-none -ml-6 lg:-ml-7 xl:-ml-8 -mr-0.5 shrink-0">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-full overflow-visible"
            >
              {TARGET_Y_PERCENTS.map((targetY, i) => {
                const isActive = i === activeIndex;
                const startX = 0;
                const startY = 50;
                const endX = 100;
                const endY = targetY;

                const cp1X = 38;
                const cp1Y = startY;
                const cp2X = 66;
                const cp2Y = endY;

                const pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, 95 ${endY} L ${endX} ${endY}`;
                const lineDelayMs = 200 + i * 40;

                return (
                  <path
                    key={i}
                    d={pathData}
                    fill="none"
                    pathLength={100}
                    stroke={isActive ? "rgba(255, 255, 255, 0.45)" : "rgba(255, 255, 255, 0.08)"}
                    strokeWidth={isActive ? 0.7 : 0.35}
                    style={{
                      strokeDasharray: 100,
                      strokeDashoffset: isVisible ? 0 : 100,
                      transition: `stroke-dashoffset 0.85s cubic-bezier(0.16, 1, 0.3, 1) ${lineDelayMs}ms, stroke 0.2s, stroke-width 0.2s`,
                    }}
                  />
                );
              })}
            </svg>
          </div>

          {/* ── RIGHT / BOTTOM: 8 Monitor Items (w-fit auto-tightness ensures exact horizontal centering) ── */}
          <div
            onMouseLeave={() => setActiveId(null)}
            className="h-auto md:h-[360px] lg:h-[380px] xl:h-[400px] flex flex-col justify-between shrink-0 w-fit mx-auto md:mx-0 gap-2 md:gap-0"
          >
            {MONITOR_TYPES.map((node, i) => {
              const isActive = node.id === activeId;
              const IconComponent = node.icon;
              const rowDelayMs = 450 + i * 45;

              return (
                <div
                  key={node.id}
                  onClick={() => setActiveId(node.id)}
                  onMouseEnter={() => setActiveId(node.id)}
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? "translateX(0)" : "translateX(16px)",
                    transition: `opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1) ${rowDelayMs}ms, transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) ${rowDelayMs}ms, color 0.2s`,
                  }}
                  className="group relative flex items-center gap-3 sm:gap-3.5 xl:gap-4 px-1 py-1.5 md:py-0 md:h-[36px] lg:h-[38px] xl:h-[40px] cursor-pointer select-none bg-transparent border-none"
                >
                  {/* Clean White Indicator Node */}
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 transition-all duration-200 ${
                      isActive
                        ? "bg-white shadow-[0_0_8px_rgba(255,255,255,1)] scale-125"
                        : "bg-white/40 group-hover:bg-white scale-100"
                    }`}
                  />

                  {/* Icon */}
                  <div
                    className={`w-[17px] h-[17px] sm:w-[18px] sm:h-[18px] xl:w-[20px] xl:h-[20px] flex items-center justify-center shrink-0 transition-all duration-200 ${
                      isActive ? "text-white scale-105" : "text-white/65 group-hover:text-white"
                    }`}
                  >
                    <IconComponent className="w-[17px] h-[17px] sm:w-[18px] sm:h-[18px] xl:w-[20px] xl:h-[20px]" />
                  </div>

                  {/* Monitor Name (Noticeably Crisp, High Contrast White Typography) */}
                  <span
                    className={`text-[15px] sm:text-[15.5px] lg:text-[16.5px] xl:text-[18px] 2xl:text-[18.5px] tracking-tight transition-all duration-200 leading-none whitespace-nowrap ${
                      isActive
                        ? "text-white font-bold"
                        : "text-white/85 group-hover:text-white font-medium"
                    }`}
                  >
                    {node.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
