"use client";

import React from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

interface CheckData {
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  checkedAt: string;
  responseTimeMs?: number;
  errorMessage?: string;
}

interface Uptime3DLineProps {
  data: CheckData[];
}

export function Uptime3DLine({ data }: Uptime3DLineProps) {
  // Ensure we always have some bars to show, even if empty, pad with "unknown"
  const MAX_BARS = 45;
  const displayData = [...data];
  
  if (displayData.length < MAX_BARS) {
    const padding = Array(MAX_BARS - displayData.length).fill({ status: 'unknown', checkedAt: new Date().toISOString() });
    displayData.unshift(...padding);
  } else if (displayData.length > MAX_BARS) {
    displayData.splice(0, displayData.length - MAX_BARS);
  }

  const getGradientId = (status: string, index: number) => `grad-${status}-${index}`;

  const getColors = (status: string) => {
    switch (status) {
      case 'online': return { main: '#10b981', dark: '#047857' }; // Emerald
      case 'degraded': return { main: '#f59e0b', dark: '#b45309' }; // Amber
      case 'offline': return { main: '#ef4444', dark: '#b91c1c' }; // Red
      default: return { main: '#3f3f46', dark: '#27272a' }; // Zinc
    }
  };

  return (
    <Tooltip.Provider delayDuration={100}>
      <div className="w-full flex h-20 items-end gap-1 justify-between group">
        <svg width="0" height="0">
          <defs>
            {displayData.map((d, i) => {
              const colors = getColors(d.status);
              return (
                <linearGradient key={i} id={getGradientId(d.status, i)} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={colors.dark} />
                  <stop offset="40%" stopColor={colors.main} />
                  <stop offset="60%" stopColor={colors.main} />
                  <stop offset="100%" stopColor={colors.dark} />
                </linearGradient>
              );
            })}
            <filter id="glow-online" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-offline" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
        </svg>

        {displayData.map((check, i) => {
          const isDown = check.status === 'offline';
          const isUnknown = check.status === 'unknown';
          const height = isDown ? '100%' : isUnknown ? '20%' : '60%'; // Varied height for visual interest
          const filter = isDown ? 'url(#glow-offline)' : check.status === 'online' ? 'url(#glow-online)' : 'none';

          return (
            <Tooltip.Root key={i}>
              <Tooltip.Trigger asChild>
                <div 
                  className="relative flex-1 flex flex-col justify-end h-full hover:scale-x-150 hover:z-20 transition-transform duration-200 cursor-crosshair z-10"
                >
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 14 100">
                    <rect 
                      x="1" 
                      y={isDown ? "0" : isUnknown ? "80" : "40"} 
                      width="12" 
                      height={isDown ? "100" : isUnknown ? "20" : "60"} 
                      rx="6" 
                      fill={`url(#${getGradientId(check.status, i)})`}
                      filter={filter}
                      className="transition-all duration-300"
                    />
                  </svg>
                </div>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="z-50 bg-zinc-900 border border-zinc-700/50 shadow-xl shadow-black rounded-lg px-3 py-2 text-xs text-white max-w-[200px]"
                  sideOffset={8}
                >
                  <div className="font-semibold mb-1">
                    {new Date(check.checkedAt).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2 mb-1 text-zinc-300">
                    <div className="flex-1 capitalize">Status:</div>
                    <div className={check.status === 'online' ? 'text-emerald-400' : check.status === 'degraded' ? 'text-amber-400' : check.status === 'offline' ? 'text-red-400' : 'text-zinc-500 font-bold'}>
                      {check.status}
                    </div>
                  </div>
                  {check.responseTimeMs && (
                    <div className="flex items-center gap-2 text-zinc-300">
                      <div className="flex-1">Response:</div>
                      <div className="font-mono">{check.responseTimeMs}ms</div>
                    </div>
                  )}
                  {check.errorMessage && (
                    <div className="mt-2 text-red-400 break-words leading-tight">
                      {check.errorMessage}
                    </div>
                  )}
                  <Tooltip.Arrow className="fill-zinc-900" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </div>
    </Tooltip.Provider>
  );
}
