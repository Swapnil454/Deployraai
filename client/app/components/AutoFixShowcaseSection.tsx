"use client";

import React, { useRef, useState, useEffect } from "react";

// ── MULTI-LINE CYBER CONNECTOR BETWEEN STAGE 1 AND STAGE 2 ──
function Stage1ToStage2Connector({
  width = 64,
  height = 475,
}: {
  width?: number;
  height?: number;
}) {
  const w = Math.max(width, 48);
  const t1X = 11; // Track 1 (leftmost, through Capsule 1)
  const t2X = 20; // Track 2 (main arrow & flare)
  const t3X = 29; // Track 3 (inner bus with D4-D0)
  const t4X = Math.min(w - 18, 44); // Track 4 (hugs Stage 4, through Capsule 2)
  const capsule2X = t4X - 7;
  const dataX = Math.round((t2X + t4X) / 2) + 2;
  const targetX = w; // Exact right edge touching Stage 2

  // Subtle shift from mint-green (#00f5c4) to sleek cyber cyan (#00e8d8)
  const pcbColor = "#00e8d8";

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      style={{ width: `${w}px`, height: `${height}px` }}
      className="overflow-visible select-none pointer-events-none"
      fill="none"
    >
      <defs>
        {/* Radial bloom for intense lower cyan flare */}
        <radialGradient id="flare-radial" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="25%" stopColor={pcbColor} stopOpacity="0.9" />
          <stop offset="55%" stopColor={pcbColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={pcbColor} stopOpacity="0" />
        </radialGradient>

        {/* Soft aura at Stage 2 entry point */}
        <radialGradient id="entry-glow" cx="100%" cy="50%" r="65%">
          <stop offset="0%" stopColor={pcbColor} stopOpacity="0.6" />
          <stop offset="100%" stopColor={pcbColor} stopOpacity="0" />
        </radialGradient>

        {/* Neon Drop Shadow Filter */}
        <filter id="pcb-neon-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <style>{`
          @keyframes s1-flare-pulse {
            0%, 100% { opacity: 0.45; }
            50% { opacity: 1; }
          }
        `}</style>
      </defs>

      {/* ── BACKGROUND SUBTLE CIRCUIT BUS TRACKS (Faint PCB lines for high-tech depth) ── */}
      <path
        d={`M ${t1X - 4} 340 V 40 M ${t3X + 4} 240 V 90 M ${t4X + 6} 290 V 170`}
        stroke={pcbColor}
        strokeWidth="0.75"
        strokeOpacity="0.12"
        strokeDasharray="2 3"
      />

      {/* ── HORIZONTAL LEAD-INS FROM STAGE 1 (Left Edge) ── */}
      {/* Lead-in 1: y = 162 */}
      <path
        d={`M 0 162 H ${t1X}`}
        stroke={pcbColor}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
      <circle cx="3.5" cy="162" r="1.8" fill={pcbColor} />
      <circle cx="3.5" cy="162" r="0.8" fill="#091b24" />

      {/* Lead-in 2: y = 255 */}
      <path
        d={`M 0 255 H ${t1X}`}
        stroke={pcbColor}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
      <circle cx="3.5" cy="255" r="1.8" fill={pcbColor} />
      <circle cx="3.5" cy="255" r="0.8" fill="#091b24" />

      {/* ── TRACK 1: LEFTMOST TRACE & CAPSULE 1 (ISO 8135) ── */}
      {/* Lower segment up to Capsule 1 */}
      <path
        d={`M ${t1X} 290 V 142`}
        stroke={pcbColor}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
      <circle cx={t1X} cy="290" r="1.5" fill={pcbColor} />

      {/* Capsule 1: Vertical Pill Badge */}
      <g>
        <rect
          x={t1X - 6}
          y="96"
          width="12"
          height="46"
          rx="6"
          fill="#091b24"
          stroke={pcbColor}
          strokeWidth="1.2"
          strokeOpacity="0.85"
          filter="url(#pcb-neon-glow)"
        />
        {["I", "S", "O", "8", "1", "3", "5"].map((char, i) => (
          <text
            key={i}
            x={t1X}
            y={105 + i * 5.8}
            fill={pcbColor}
            fontSize="5.2"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {char}
          </text>
        ))}
      </g>

      {/* Upper segment from Capsule 1 turning 90° right into Stage 2 */}
      <path
        d={`M ${t1X} 96 V 56 Q ${t1X} 48 ${t1X + 8} 48 H ${targetX}`}
        stroke={pcbColor}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.85"
      />

      {/* Stepped decorative PCB trace above Track 1 curve */}
      <path
        d={`M ${t1X + 8} 38 H ${targetX - 10} Q ${targetX - 4} 38 ${targetX - 4} 44 V 48`}
        stroke={pcbColor}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.6"
      />
      <circle cx={t1X + 8} cy="38" r="1.5" fill={pcbColor} />

      {/* ── TRACK 3: INNER TRACE WITH 45° JOG & VERTICAL D4-D0 DATA COLUMN ── */}
      {/* Lower segment with 45° jog */}
      <path
        d={`M ${t3X - 4} 310 V 224 L ${t3X} 216 V 155`}
        stroke={pcbColor}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.6"
      />

      {/* Vertical D4-D0 Monospace Labels */}
      <g>
        {["D4", "D3", "D2", "D1", "D0"].map((label, idx) => (
          <text
            key={label}
            x={dataX}
            y={98 + idx * 9.5}
            fill={pcbColor}
            fillOpacity="0.8"
            fontSize="5.8"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {label}
          </text>
        ))}
      </g>

      {/* Upper segment curving 90° right into Stage 2 */}
      <path
        d={`M ${t3X} 155 V 90 Q ${t3X} 82 ${t3X + 8} 82 H ${targetX}`}
        stroke={pcbColor}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.6"
      />

      {/* ── TRACK 4: RIGHT TRACE, CAPSULE 2 (CH: 039802) & BOTTOM LOOP PAD ── */}
      {/* Lead into Capsule 2 */}
      <path
        d={`M ${t3X + 2} 142 Q ${t4X} 152 ${t4X} 166 V 202`}
        stroke={pcbColor}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />

      {/* Capsule 2: Vertical Channel ID Pill */}
      <g>
        <rect
          x={capsule2X}
          y="202"
          width="14"
          height="58"
          rx="7"
          fill="#071722"
          stroke={pcbColor}
          strokeWidth="1.2"
          strokeOpacity="0.85"
          filter="url(#pcb-neon-glow)"
        />
        {["C", "H", ":", "0", "3", "9", "8", "0", "2"].map((char, i) => (
          <text
            key={i}
            x={t4X}
            y={211 + i * 5.2}
            fill={pcbColor}
            fontSize="4.8"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {char}
          </text>
        ))}
      </g>

      {/* Path exiting Capsule 2 towards bottom loop */}
      <path
        d={`M ${t4X} 260 V 282 Q ${t4X} 290 ${t4X - 7} 297 L ${t2X + 7} 306 V 324`}
        stroke={pcbColor}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.8"
      />

      {/* Bottom square terminal loop & wrap trace */}
      <g>
        {/* Terminal Pad Box */}
        <rect
          x={t1X - 3}
          y="324"
          width="8"
          height="8"
          rx="2.5"
          fill="#071722"
          stroke={pcbColor}
          strokeWidth="1.2"
          strokeOpacity="0.85"
        />
        <circle cx={t1X + 1} cy="328" r="1.5" fill={pcbColor} />

        {/* Trace wrapping around loop box */}
        <path
          d={`M ${t2X + 7} 324 V 336 Q ${t2X + 7} 340 ${t2X + 2} 340 H ${t1X - 3} Q ${t1X - 8} 340 ${t1X - 8} 335 V 324 Q ${t1X - 8} 319 ${t1X - 3} 319 H ${t1X + 1}`}
          stroke={pcbColor}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.75"
        />
      </g>

      {/* ── TRACK 2: MAIN FLOW TRACE WITH FLARE, CHEVRON & SHARP ARROWHEAD ── */}
      {/* Lower trace segment up to the flare */}
      <path
        d={`M ${t2X} 328 V 292`}
        stroke={pcbColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.9"
        filter="url(#pcb-neon-glow)"
      />

      {/* ── INTENSE GLOWING CYAN FLARE NODE (y = 285) ── */}
      <g>
        {/* Diffuse radial flare aura – GPU-only opacity pulse */}
        <circle
          cx={t2X}
          cy="285"
          r="18"
          fill="url(#flare-radial)"
          style={{
            animation: "s1-flare-pulse 2.8s ease-in-out infinite",
            willChange: "opacity",
          }}
        />
        {/* Optical flare cross lines */}
        <line
          x1={t2X - 14}
          y1="285"
          x2={t2X + 14}
          y2="285"
          stroke={pcbColor}
          strokeWidth="0.8"
          strokeOpacity="0.85"
        />
        <line
          x1={t2X}
          y1="271"
          x2={t2X}
          y2="299"
          stroke={pcbColor}
          strokeWidth="0.8"
          strokeOpacity="0.85"
        />
        {/* Core glowing node */}
        <circle
          cx={t2X}
          cy="285"
          r="3.5"
          fill={pcbColor}
          filter="url(#pcb-neon-glow)"
        />
        <circle cx={t2X} cy="285" r="1.6" fill="#ffffff" />
      </g>

      {/* Mid trace segment from Flare to Directional Arrow */}
      <path
        d={`M ${t2X} 285 V 180`}
        stroke={pcbColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />

      {/* Inline Upward Directional Chevron & Data Packet (y = 175) */}
      <g>
        <polygon
          points={`${t2X},168 ${t2X - 3},174 ${t2X + 3},174`}
          fill={pcbColor}
        />
        <rect
          x={t2X - 1.5}
          y="177"
          width="3"
          height="8"
          rx="1.5"
          fill={pcbColor}
          fillOpacity="0.9"
        />
      </g>

      {/* Secondary micro chevron along Track 1 */}
      <polygon
        points={`${t1X},212 ${t1X - 2.5},217 ${t1X + 2.5},217`}
        fill={pcbColor}
        fillOpacity="0.75"
      />

      {/* Upper trace segment: curves 90° right and terminates into Stage 2 */}
      <path
        d={`M ${t2X} 168 V 76 Q ${t2X} 66 ${t2X + 8} 66 H ${targetX - 2}`}
        stroke={pcbColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Entry glow bloom right behind the arrowhead */}
      <circle cx={targetX - 2} cy="66" r="10" fill="url(#entry-glow)" />

      {/* Sharp Cyan Arrowhead hitting Stage 2 */}
      <polygon
        points={`${targetX},66 ${targetX - 8.5},61 ${targetX - 8.5},71`}
        fill={pcbColor}
      />

    </svg>
  );
}

// ── MULTI-LINE CYBER CONNECTOR BETWEEN STAGE 2 AND STAGE 3 ──
function Stage2ToStage3Connector({
  width = 64,
  height = 200,
}: {
  width?: number;
  height?: number;
}) {
  const w = Math.max(width, 40);
  const midX = w * 0.46;
  const pcbColor = "#00e8d8";

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes s2s3-flare-pulse {
        0%, 100% { opacity: 0.45; }
        50% { opacity: 1; }
      }
    ` }} />
    <svg
      viewBox={`0 0 ${w} ${height}`}
      style={{ width: `${w}px`, height: `${height}px` }}
      className="overflow-visible select-none pointer-events-none"
      fill="none"
    >
      <defs>
        {/* Flare radial gradient for central glowing orb - cooler ice-cyan, slightly less green */}
        <radialGradient id="s2s3-flare-radial" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="35%" stopColor="#22d3ee" stopOpacity="0.8" />
          <stop offset="70%" stopColor="#0ea5e9" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>

        {/* Soft entry glow entering Stage 3 */}
        <radialGradient id="s2s3-entry-glow" cx="100%" cy="50%" r="65%">
          <stop offset="0%" stopColor={pcbColor} stopOpacity="0.6" />
          <stop offset="100%" stopColor={pcbColor} stopOpacity="0" />
        </radialGradient>

        {/* Neon Drop Shadow Filter */}
        <filter id="s2s3-pcb-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── "Data Flow" Centered Header Label ── */}
      <g>
        <text
          x={w / 2}
          y="40"
          fill={pcbColor}
          fontSize="10"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="600"
          textAnchor="middle"
          letterSpacing="0.01em"
          className="drop-shadow-[0_0_8px_rgba(0,232,216,0.65)]"
        >
          Data
        </text>
        <text
          x={w / 2}
          y="52"
          fill={pcbColor}
          fontSize="10"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="600"
          textAnchor="middle"
          letterSpacing="0.01em"
          className="drop-shadow-[0_0_8px_rgba(0,232,216,0.65)]"
        >
          Flow
        </text>
      </g>

      {/* ── LINE 1: TOP BOUNDARY HORIZONTAL TRACE (y = 65) ── */}
      <path
        d={`M 0 65 H ${w}`}
        stroke={pcbColor}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <circle cx={midX + 2} cy="65" r="1.3" fill={pcbColor} fillOpacity="0.9" />

      {/* ── LINE 2: FAINT MICRO-DASHED TRACK (y = 69) ── */}
      <path
        d={`M 0 69 H ${w}`}
        stroke={pcbColor}
        strokeWidth="0.8"
        strokeOpacity="0.28"
        strokeDasharray="2 3"
      />

      {/* ── LINE 3: PRIMARY GLOWING LASER ARROW (y = 75) ── */}
      <path
        d={`M 0 75 H ${w - 3}`}
        stroke={pcbColor}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Central Glowing Lens Flare Node – GPU-only opacity pulse */}
      <circle
        cx={midX - 2}
        cy="75"
        r="9"
        fill="url(#s2s3-flare-radial)"
        style={{
          animation: "s2s3-flare-pulse 2.8s ease-in-out infinite",
          willChange: "opacity",
        }}
      />
      <circle
        cx={midX - 2}
        cy="75"
        r="2.6"
        fill="#22d3ee"
        filter="url(#s2s3-pcb-glow)"
      />
      <circle cx={midX - 2} cy="75" r="1.3" fill="#ffffff" />

      {/* Entry Aura behind Arrowhead (shifted slightly top to match pipeline) */}
      <circle cx={w - 1} cy="71" r="9" fill="url(#s2s3-entry-glow)" />

      {/* Sharp Cyan Arrowhead hitting Stage 3 */}
      <polygon
        points={`${w},75 ${w - 7},70.5 ${w - 7},79.5`}
        fill={pcbColor}
      />

      {/* ── LINE 4: STEPPED PCB TRACE WITH VERTICAL TICK (y = 80) ── */}
      <path
        d={`M 0 80 H ${midX - 7} V 83 H ${midX + 3} L ${midX + 7} 80 H ${w}`}
        stroke={pcbColor}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.7"
      />

      {/* ── LINE 5: LOWER S-CURVE DIAGONAL TRANSITION TRACE ── */}
      {/* Via Pad on the left */}
      <g>
        <circle
          cx={midX - 12}
          cy="89"
          r="2.2"
          fill="#071722"
          stroke={pcbColor}
          strokeWidth="1.1"
          strokeOpacity="0.9"
        />
        <circle cx={midX - 12} cy="89" r="1" fill={pcbColor} />
      </g>

      {/* Smooth diagonal S-curve trace swooping from notch level down to y=89 */}
      <path
        d={`M ${midX - 4} 83 C ${midX + 4} 83, ${midX + 10} 89, ${midX + 20} 89 H ${w}`}
        stroke={pcbColor}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />

    </svg>
    </>
  );
}

// ── MULTI-LINE CYBER CONNECTOR BETWEEN STAGE 3 AND STAGE 4 ──
function Stage3ToStage4Connector({
  width = 440,
  height = 50,
}: {
  width?: number;
  height?: number;
}) {
  const w = Math.max(width, 240);
  const h = Math.max(height, 40);
  const pcbColor = "#00e8d8";
  const laserColor = "#00e599";

  // Arrow drop coordinates on Stage 4 (centered at x = 35)
  const arr1X = 28; // Outer track drop (left)
  const arr2X = 42; // Inner primary laser drop (right)
  const arrTipY = h - 1; // Touches the Stage 4 card border precisely

  // Horizontal track levels
  const track1Y = Math.max(Math.round(h * 0.26), 11); // Upper line (y ≈ 12-13)
  const track2Y = Math.max(Math.round(h * 0.48), 21); // Primary laser bus (y ≈ 22-24)

  // Exit coordinates on Stage 3 (centered at x = w - 35)
  const exitX = w - 35;
  const exit1X = exitX - 7; // Outer track exit (left)
  const exit2X = exitX + 7; // Inner primary laser exit (right)

  // Features positioning along the horizontal corridor
  const pillW = 76;
  const pillH = 16;
  const pillX = Math.round((arr2X + exit2X) / 2);
  const jog1X = Math.round(arr1X + (pillX - arr1X) * 0.45);
  const ringX = jog1X + 24;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: `${w}px`, height: `${h}px` }}
      className="overflow-visible select-none pointer-events-none"
      fill="none"
    >
      <defs>
        {/* Pill background gradient */}
        <linearGradient id="s3s4-pill-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#081815" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#0b241e" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#081815" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* ── TRACK 1: UPPER TRACE (Straight vertical exit -> 90° corner -> centered C-ring -> straight trace -> 90° corner -> straight drop) ── */}
      {/* Right segment from Stage 3 exit to C-ring */}
      <path
        d={`M ${exit1X} 0 V ${track1Y - 8} Q ${exit1X} ${track1Y} ${exit1X - 8} ${track1Y} H ${ringX + 6}`}
        stroke={pcbColor}
        strokeWidth="1.1"
        strokeOpacity="0.75"
      />

      {/* Circular Via Ring ⊂ • (centered precisely at track1Y) */}
      <g>
        <path
          d={`M ${ringX + 3.5} ${track1Y - 3.2} A 3.2 3.2 0 1 0 ${ringX + 3.5} ${track1Y + 3.2}`}
          fill="none"
          stroke={pcbColor}
          strokeWidth="1.15"
          strokeLinecap="round"
        />
        <circle cx={ringX + 1.8} cy={track1Y} r="1" fill={pcbColor} />
      </g>

      {/* Left segment from C-ring to Stage 4 drop (straight, proper, centered line) */}
      <path
        d={`M ${ringX + 0.3} ${track1Y} H ${arr1X + 8} Q ${arr1X} ${track1Y} ${arr1X} ${track1Y + 8} V ${arrTipY - 6.5}`}
        stroke={pcbColor}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.85"
      />

      {/* Outer Downward Arrowhead 1 (Clean vector tip, no overglow) */}
      <polygon
        points={`${arr1X},${arrTipY} ${arr1X - 3.5},${arrTipY - 6.5} ${arr1X + 3.5},${arrTipY - 6.5}`}
        fill={pcbColor}
      />

      {/* ── TRACK 2: PRIMARY GLOWING LASER BUS (Straight vertical exit -> 90° corner -> horizontal pill -> 90° corner -> straight drop) ── */}
      <path
        d={`M ${exit2X} 0 V ${track2Y - 10} Q ${exit2X} ${track2Y} ${exit2X - 10} ${track2Y} H ${arr2X + 10} Q ${arr2X} ${track2Y} ${arr2X} ${track2Y + 10} V ${arrTipY - 7}`}
        stroke={laserColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drop-shadow-[0_0_2px_rgba(0,229,153,0.55)]"
      />

      {/* Inner Downward Arrowhead 2 (Clean vector tip, no overglow) */}
      <polygon
        points={`${arr2X},${arrTipY} ${arr2X - 3.8},${arrTipY - 7} ${arr2X + 3.8},${arrTipY - 7}`}
        fill={laserColor}
      />

      {/* ── CAPSULE PILL BADGE ON TRACK 2: [ FY:4140·PTN ] ── */}
      <g>
        {/* Crisp capsule border and backing */}
        <rect
          x={pillX - pillW / 2}
          y={track2Y - pillH / 2}
          width={pillW}
          height={pillH}
          rx={pillH / 2}
          fill="url(#s3s4-pill-grad)"
          stroke={laserColor}
          strokeWidth="1.1"
          className="drop-shadow-[0_0_3px_rgba(0,229,153,0.35)]"
        />
        {/* Inner subtle border sheen */}
        <rect
          x={pillX - pillW / 2 + 1}
          y={track2Y - pillH / 2 + 1}
          width={pillW - 2}
          height={pillH - 2}
          rx={(pillH - 2) / 2}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.6"
        />
        {/* Monospaced cyber code text */}
        <text
          x={pillX}
          y={track2Y + 3.2}
          fill={laserColor}
          fontSize="8.5"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fontWeight="700"
          textAnchor="middle"
          letterSpacing="0.08em"
        >
          [ FY:4140·PTN ]
        </text>
      </g>

      {/* ── TRACK 3: LOWER ACCENTS & MICRO-PILLS (Below Track 2) ── */}
      {/* Horizontal fine line below inner corner */}
      <path
        d={`M ${arr2X + 12} ${track2Y + 9} H ${arr2X + 80}`}
        stroke={pcbColor}
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      {/* Micro-pill 1: [ • 0101 • ] */}
      <rect
        x={arr2X + 22}
        y={track2Y + 5.5}
        width="26"
        height="6.5"
        rx="3.25"
        fill="#08181d"
        stroke={pcbColor}
        strokeWidth="0.75"
        strokeOpacity="0.55"
      />
      <circle cx={arr2X + 26.5} cy={track2Y + 8.75} r="0.85" fill={pcbColor} />
      <line
        x1={arr2X + 30.5}
        y1={track2Y + 8.75}
        x2={arr2X + 39.5}
        y2={track2Y + 8.75}
        stroke={pcbColor}
        strokeWidth="0.7"
        strokeOpacity="0.7"
      />
      <circle cx={arr2X + 43.5} cy={track2Y + 8.75} r="0.85" fill={pcbColor} />

      {/* Micro-pill 2: ( - ) */}
      <rect
        x={arr2X + 54}
        y={track2Y + 5.5}
        width="16"
        height="6.5"
        rx="3.25"
        fill="#08181d"
        stroke={pcbColor}
        strokeWidth="0.75"
        strokeOpacity="0.4"
      />
      <line
        x1={arr2X + 58}
        y1={track2Y + 8.75}
        x2={arr2X + 66}
        y2={track2Y + 8.75}
        stroke={pcbColor}
        strokeWidth="0.7"
        strokeOpacity="0.55"
      />

    </svg>
  );
}

// ── MULTI-LINE CYBER CONNECTOR BETWEEN STAGE 4 AND STAGE 5 (Patch PR) ──
function Stage4ToStage5Connector({
  width = 60,
  height = 220,
}: {
  width?: number;
  height?: number;
}) {
  const w = Math.max(width, 40);
  const midX = w * 0.48;
  const pcbColor = "#00e8d8"; // Cool cyber cyan/teal, less green and matching the system conduits
  const cyanAccent = "#22d3ee";

  // Vertical placement of the corridor aligned with the code diff patch output in Stage 4 and PR preview in Stage 5
  const corridorTop = 72;
  const laserY = corridorTop + 10; // y = 82

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      style={{ width: `${w}px`, height: `${height}px` }}
      className="overflow-visible select-none pointer-events-none"
      fill="none"
    >
      <defs>
        {/* Flare radial gradient for central glowing orb - cooler ice-cyan */}
        <radialGradient id="s4s5-flare-radial" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="35%" stopColor={cyanAccent} stopOpacity="0.8" />
          <stop offset="70%" stopColor="#0ea5e9" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>

        {/* Soft entry glow entering Stage 5 (cooler cyan/teal, less green) */}
        <radialGradient id="s4s5-entry-glow" cx="100%" cy="50%" r="65%">
          <stop offset="0%" stopColor={pcbColor} stopOpacity="0.55" />
          <stop offset="100%" stopColor={pcbColor} stopOpacity="0" />
        </radialGradient>

        {/* Neon Drop Shadow Filter */}
        <filter id="s4s5-pcb-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── "Patch PR" Centered Header Label & Chevron Icon ── */}
      <g>
        <text
          x={midX}
          y="42"
          fill={pcbColor}
          fontSize="10"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="600"
          textAnchor="middle"
          letterSpacing="0.01em"
          className="drop-shadow-[0_0_8px_rgba(0,232,216,0.65)]"
        >
          Patch
        </text>
        <text
          x={midX}
          y="54"
          fill={pcbColor}
          fontSize="10"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="600"
          textAnchor="middle"
          letterSpacing="0.01em"
          className="drop-shadow-[0_0_8px_rgba(0,232,216,0.65)]"
        >
          PR
        </text>

        {/* High-tech downward indicator chevron icon ▼ */}
        <polygon
          points={`${midX},65.5 ${midX - 4.5},60.5 ${midX + 4.5},60.5`}
          fill="none"
          stroke={pcbColor}
          strokeWidth="1.1"
          strokeLinejoin="round"
          className="drop-shadow-[0_0_4px_rgba(0,232,216,0.6)]"
        />
        <polygon
          points={`${midX},64 ${midX - 2.5},61.5 ${midX + 2.5},61.5`}
          fill={pcbColor}
        />
      </g>

      {/* ── CORRIDOR BOUNDED CHANNEL (Exact visual frame from reference image) ── */}
      {/* Subtle translucent corridor backing */}
      <rect
        x="0"
        y={corridorTop}
        width={w}
        height="20"
        rx="1"
        fill="#041410"
        fillOpacity="0.45"
      />

      {/* ── LINE 1: TOP BOUNDARY HORIZONTAL TRACE (y = corridorTop = 72) ── */}
      <path
        d={`M 0 ${corridorTop} H ${w}`}
        stroke={pcbColor}
        strokeWidth="1"
        strokeOpacity="0.6"
      />
      <circle cx={midX - 6} cy={corridorTop} r="1.2" fill={pcbColor} fillOpacity="0.8" />

      {/* ── LINE 2: FAINT MICRO-DASHED TRACK (y = 76) ── */}
      <path
        d={`M 0 ${corridorTop + 4} H ${w}`}
        stroke={pcbColor}
        strokeWidth="0.8"
        strokeOpacity="0.32"
        strokeDasharray="2 3"
      />

      {/* ── LINE 3: PRIMARY GLOWING LASER ARROW (y = 82) ── */}
      <path
        d={`M 0 ${laserY} H ${w - 3}`}
        stroke={pcbColor}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Central Glowing Lens Flare Node – GPU-only opacity pulse */}
      <circle
        cx={midX - 2}
        cy={laserY}
        r="8.5"
        fill="url(#s4s5-flare-radial)"
        style={{ willChange: "opacity" }}
      >
        <animate attributeName="opacity" values="0.45;1;0.45" dur="2.8s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </circle>
      <circle
        cx={midX - 2}
        cy={laserY}
        r="2.5"
        fill={cyanAccent}
        filter="url(#s4s5-pcb-glow)"
      />
      <circle cx={midX - 2} cy={laserY} r="1.3" fill="#ffffff" />

      {/* Entry Aura behind Arrowhead hitting Stage 5 (moved slightly top to align with pipeline) */}
      <circle cx={w - 1} cy={laserY - 4} r="8.5" fill="url(#s4s5-entry-glow)" />

      {/* Sharp Cyan Arrowhead hitting Stage 5 */}
      <polygon
        points={`${w},${laserY} ${w - 7},${laserY - 4.5} ${w - 7},${laserY + 4.5}`}
        fill={pcbColor}
      />

      {/* ── LINE 4: STEPPED PCB TRACE WITH VIA JOG (y = 87) ── */}
      <path
        d={`M 0 ${corridorTop + 15} H ${midX - 7} V ${corridorTop + 17.5} H ${midX + 2} L ${midX + 6} ${corridorTop + 15} H ${w}`}
        stroke={pcbColor}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.75"
      />
      {/* Via pad on stepped trace */}
      <circle
        cx={midX - 7}
        cy={corridorTop + 15}
        r="1.8"
        fill="#041410"
        stroke={pcbColor}
        strokeWidth="0.9"
      />
      <circle cx={midX - 7} cy={corridorTop + 15} r="0.8" fill={pcbColor} />

      {/* ── LINE 5: BOTTOM BOUNDARY HORIZONTAL TRACE (y = corridorTop + 20 = 92) ── */}
      <path
        d={`M 0 ${corridorTop + 20} H ${w}`}
        stroke={pcbColor}
        strokeWidth="1"
        strokeOpacity="0.6"
      />
      <circle cx={midX + 8} cy={corridorTop + 20} r="1.2" fill={pcbColor} fillOpacity="0.8" />

    </svg>
  );
}

export default function AutoFixShowcaseSection() {
  // References for dynamic, pixel-perfect orthogonal conduit wiring
  const stagesContainerRef = useRef<HTMLDivElement>(null);
  const stage1Ref = useRef<HTMLDivElement>(null);
  const stage2Ref = useRef<HTMLDivElement>(null);
  const stage3Ref = useRef<HTMLDivElement>(null);
  const stage4Ref = useRef<HTMLDivElement>(null);
  const stage5Ref = useRef<HTMLDivElement>(null);
  const cardInnerRef = useRef<HTMLDivElement>(null);
  const geminiProRef = useRef<HTMLDivElement>(null);
  const geminiFlashRef = useRef<HTMLDivElement>(null);
  const utilsApiDotRef = useRef<HTMLSpanElement>(null);
  const dashboardTargetRef = useRef<HTMLSpanElement>(null);

  const [coords, setCoords] = useState({
    cyan: { x1: 215, y1: 38, midX: 170, x2: 104, y2: 99 },
    red: { x1: 215, y1: 72, midX: 188, y2: 117, x2: 126 },
  });

  const [connectorLayout, setConnectorLayout] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
    ready: boolean;
  }>({
    left: 338,
    width: 68,
    top: 0,
    height: 475,
    ready: false,
  });

  const [connector2to3Layout, setConnector2to3Layout] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
    ready: boolean;
  }>({
    left: 770,
    width: 60,
    top: 0,
    height: 200,
    ready: false,
  });

  const [connector3to4Layout, setConnector3to4Layout] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
    ready: boolean;
  }>({
    left: 420,
    width: 440,
    top: 198,
    height: 44,
    ready: false,
  });

  const [connector4to5Layout, setConnector4to5Layout] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
    ready: boolean;
  }>({
    left: 820,
    width: 60,
    top: 250,
    height: 220,
    ready: false,
  });

  useEffect(() => {
    const updateConduits = () => {
      // 1. Stage 1 to Stage 2 multi-line connector calculation
      if (
        stagesContainerRef.current &&
        stage1Ref.current &&
        stage2Ref.current
      ) {
        const containerRect = stagesContainerRef.current.getBoundingClientRect();
        const s1Rect = stage1Ref.current.getBoundingClientRect();
        const s2Rect = stage2Ref.current.getBoundingClientRect();

        const left = s1Rect.right - containerRect.left;
        const width = Math.max(s2Rect.left - s1Rect.right, 42);
        const top = s1Rect.top - containerRect.top;
        const height = s1Rect.height || 475;

        setConnectorLayout({ left, width, top, height, ready: true });
      }

      // 2. Stage 2 to Stage 3 multi-line connector calculation
      if (
        stagesContainerRef.current &&
        stage2Ref.current &&
        stage3Ref.current
      ) {
        const containerRect = stagesContainerRef.current.getBoundingClientRect();
        const s2Rect = stage2Ref.current.getBoundingClientRect();
        const s3Rect = stage3Ref.current.getBoundingClientRect();

        const left = s2Rect.right - containerRect.left;
        const width = Math.max(s3Rect.left - s2Rect.right, 36);
        const top = s2Rect.top - containerRect.top;
        const height = s2Rect.height || 200;

        setConnector2to3Layout({ left, width, top, height, ready: true });
      }

      // 3. Stage 3 to Stage 4 multi-line connector calculation
      if (
        stagesContainerRef.current &&
        stage3Ref.current &&
        stage4Ref.current
      ) {
        const containerRect = stagesContainerRef.current.getBoundingClientRect();
        const s3Rect = stage3Ref.current.getBoundingClientRect();
        const s4Rect = stage4Ref.current.getBoundingClientRect();

        // 100% Genuine geometric center of Stage 4 card width
        const s4CenterX = (s4Rect.left - containerRect.left) + s4Rect.width / 2;

        // 100% Genuine geometric center of Stage 3 card width
        const s3CenterX = (s3Rect.left - containerRect.left) + s3Rect.width / 2;

        // Dual arrows in Stage3ToStage4Connector are centered at x = 35 (arr1X = 28, arr2X = 42).
        // Setting left = s4CenterX - 35 aligns the entry arrows dead-center on Stage 4 card width.
        const left = Math.max(s4CenterX - 35, 0);

        // Exit lines in Stage3ToStage4Connector are centered at x = width - 35 (exit1X = exitX - 7, exit2X = exitX + 7).
        // Setting right = s3CenterX + 35 aligns the exit lines dead-center on Stage 3 card width.
        const right = s3CenterX + 35;
        const width = Math.max(right - left, 180);

        // Top aligns precisely with Stage 3's bottom edge
        const top = s3Rect.bottom - containerRect.top - 1;

        // Height spans down to Stage 4's top border
        const height = Math.max((s4Rect.top - containerRect.top) - top + 1, 44);

        setConnector3to4Layout({ left, width, top, height, ready: true });
      }

      // 4. Stage 4 to Stage 5 multi-line connector calculation (Patch PR)
      if (
        stagesContainerRef.current &&
        stage4Ref.current &&
        stage5Ref.current
      ) {
        const containerRect = stagesContainerRef.current.getBoundingClientRect();
        const s4Rect = stage4Ref.current.getBoundingClientRect();
        const s5Rect = stage5Ref.current.getBoundingClientRect();

        const left = s4Rect.right - containerRect.left;
        const width = Math.max(s5Rect.left - s4Rect.right, 36);
        const top = s4Rect.top - containerRect.top;
        const height = s4Rect.height || 220;

        setConnector4to5Layout({ left, width, top, height, ready: true });
      }

      // 5. Internal Stage 2 conduits calculation
      if (
        !cardInnerRef.current ||
        !geminiProRef.current ||
        !geminiFlashRef.current ||
        !utilsApiDotRef.current ||
        !dashboardTargetRef.current
      )
        return;

      const cardRect = cardInnerRef.current.getBoundingClientRect();
      const proRect = geminiProRef.current.getBoundingClientRect();
      const flashRect = geminiFlashRef.current.getBoundingClientRect();
      const dotRect = utilsApiDotRef.current.getBoundingClientRect();
      const dashRect = dashboardTargetRef.current.getBoundingClientRect();

      // Cyan conduit:
      // Exits horizontally from the left edge of Gemini 2.5 Pro (exact vertical center)
      const cyanX1 = proRect.left - cardRect.left;
      const cyanY1 = proRect.top + proRect.height / 2 - cardRect.top;

      // Terminates squarely at the right edge of utils/api cyan dot (exact vertical center)
      const cyanX2 = dotRect.right - cardRect.left;
      const cyanY2 = dotRect.top + dotRect.height / 2 - cardRect.top;

      // The 90-degree corner vertical segment runs between the dot and the capsule
      const cyanMidX = cyanX2 + (cyanX1 - cyanX2) * 0.42;

      // Red dotted conduit:
      // Exits horizontally from the left edge of Gemini 3.6 Flash (exact vertical center)
      const redX1 = flashRect.left - cardRect.left;
      const redY1 = flashRect.top + flashRect.height / 2 - cardRect.top;

      // Terminates at Dashboard.tsx target node (exact vertical center)
      const redX2 = dashRect.right - cardRect.left;
      const redY2 = dashRect.top + dashRect.height / 2 - cardRect.top;

      // The vertical drop for the red line runs parallel to the cyan line, slightly to the right of it
      const redMidX = redX2 + (redX1 - redX2) * 0.58;

      setCoords({
        cyan: {
          x1: cyanX1,
          y1: cyanY1,
          midX: cyanMidX,
          x2: cyanX2,
          y2: cyanY2,
        },
        red: {
          x1: redX1,
          y1: redY1,
          midX: redMidX,
          y2: redY2,
          x2: redX2,
        },
      });
    };

    updateConduits();
    window.addEventListener("resize", updateConduits);
    const ro = new ResizeObserver(updateConduits);
    if (cardInnerRef.current) ro.observe(cardInnerRef.current);
    if (stagesContainerRef.current) ro.observe(stagesContainerRef.current);
    if (stage1Ref.current) ro.observe(stage1Ref.current);
    if (stage2Ref.current) ro.observe(stage2Ref.current);
    if (stage3Ref.current) ro.observe(stage3Ref.current);
    if (stage4Ref.current) ro.observe(stage4Ref.current);
    if (stage5Ref.current) ro.observe(stage5Ref.current);

    return () => {
      window.removeEventListener("resize", updateConduits);
      ro.disconnect();
    };
  }, []);

  return (
    <section className="relative w-full bg-transparent pt-4 sm:pt-6 lg:pt-8 pb-16 sm:pb-20 overflow-hidden z-10">
      <div className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12">
        {/* ── Top Header Section (Aligned strictly to max container width) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 xl:gap-12 items-start mb-8 sm:mb-12">
          {/* Left Title Column - Strictly 2 lines */}
          <div className="lg:col-span-7 xl:col-span-7 text-center lg:text-left">
            <h2 className="font-serif-display text-[26px] sm:text-[34px] md:text-[40px] lg:text-[34px] xl:text-[40px] 2xl:text-[46px] font-normal text-white leading-[1.15] tracking-[-0.02em]">
              <span className="block whitespace-nowrap">Self-Healing Deployments</span>
              <span className="block text-zinc-100 whitespace-nowrap mt-1">
                with Instant AI Code Repair<span className="text-emerald-400">.</span>
              </span>
            </h2>
          </div>

          {/* Right Subtitle / Description Column - Aligned to right edge */}
          <div className="lg:col-span-5 xl:col-span-5 lg:pt-2 xl:pt-2.5 text-center lg:text-left flex lg:justify-end">
            <p className="text-[14px] sm:text-[15px] lg:text-[14.5px] xl:text-[15.5px] text-zinc-400 font-normal leading-[1.65] tracking-tight max-w-xl text-left">
              AI writes the precise code fix, replaces broken dependencies or routes, and tests the patch safely in isolation and verified Pull Request is delivered directly to your GitHub repo so your pipeline never stays blocked.
            </p>
          </div>
        </div>

        {/* ── STAGES PIPELINE ASSEMBLED (Exact 3-Column Panorama Layout) ── */}
        <div
          ref={stagesContainerRef}
          className="relative flex flex-col min-[1140px]:flex-row items-center min-[1140px]:items-start justify-between gap-6 min-[1140px]:gap-2 xl:gap-3 2xl:gap-6 pt-1 w-full max-w-full overflow-x-auto min-[1140px]:overflow-visible pb-4 min-[1140px]:pb-0"
        >
          {/* ── MULTI-LINE CYBER CONNECTOR (STAGE 1 -> STAGE 2) ── */}
          <div
            className="hidden min-[1140px]:block absolute pointer-events-none z-30"
            style={{
              left: `${connectorLayout.left}px`,
              top: `${connectorLayout.top + 24}px`,
              width: `${connectorLayout.width}px`,
              height: `${connectorLayout.height}px`,
              opacity: connectorLayout.ready ? 1 : 0,
              willChange: 'transform',
            }}
          >
            <Stage1ToStage2Connector
              width={connectorLayout.width}
              height={connectorLayout.height}
            />
          </div>

          {/* ── MULTI-LINE CYBER CONNECTOR (STAGE 2 -> STAGE 3) ── */}
          <div
            className="hidden min-[1140px]:block absolute pointer-events-none z-30"
            style={{
              left: `${connector2to3Layout.left}px`,
              top: `${connector2to3Layout.top + 4}px`,
              width: `${connector2to3Layout.width}px`,
              height: `${connector2to3Layout.height}px`,
              opacity: connector2to3Layout.ready ? 1 : 0,
              willChange: 'transform',
            }}
          >
            <Stage2ToStage3Connector
              width={connector2to3Layout.width}
              height={connector2to3Layout.height}
            />
          </div>

          {/* ── MULTI-LINE CYBER CONNECTOR (STAGE 3 -> STAGE 4) ── */}
          <div
            className="hidden min-[1140px]:block absolute pointer-events-none z-30"
            style={{
              left: `${connector3to4Layout.left}px`,
              top: `${connector3to4Layout.top}px`,
              width: `${connector3to4Layout.width}px`,
              height: `${connector3to4Layout.height}px`,
              opacity: connector3to4Layout.ready ? 1 : 0,
              willChange: 'transform',
            }}
          >
            <Stage3ToStage4Connector
              width={connector3to4Layout.width}
              height={connector3to4Layout.height}
            />
          </div>

          {/* ── MULTI-LINE CYBER CONNECTOR (STAGE 4 -> STAGE 5: PATCH PR) ── */}
          <div
            className="hidden min-[1140px]:block absolute pointer-events-none z-30"
            style={{
              left: `${connector4to5Layout.left}px`,
              top: `${connector4to5Layout.top}px`,
              width: `${connector4to5Layout.width}px`,
              height: `${connector4to5Layout.height}px`,
              opacity: connector4to5Layout.ready ? 1 : 0,
              willChange: 'transform',
            }}
          >
            <Stage4ToStage5Connector
              width={connector4to5Layout.width}
              height={connector4to5Layout.height}
            />
          </div>

          {/* ── COLUMN 1: STAGE 1 (Failure Ingestion) ── */}
          <div
            ref={stage1Ref}
            className="relative order-1 min-[1140px]:order-1 w-full min-[1140px]:w-[260px] xl:w-[280px] 2xl:w-[325px] max-w-[330px] min-h-[450px] min-[1140px]:h-[475px] shrink-0 flex flex-col justify-between rounded-[18px] bg-[#1a1f29] border border-white/[0.18] shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] p-3 sm:p-3.5 select-none overflow-hidden group"
          >
            {/* Custom embedded keyframe for ultra-slow, elegant breathing pulse */}
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  @keyframes softBreathe {
                    0%, 100% {
                      opacity: 0.45;
                      transform: scale(0.92);
                    }
                    50% {
                      opacity: 1;
                      transform: scale(1.08);
                    }
                  }
                  @keyframes slowRadarEcho {
                    0% {
                      transform: scale(0.85);
                      opacity: 0.55;
                    }
                    60% {
                      opacity: 0.12;
                    }
                    100% {
                      transform: scale(2.3);
                      opacity: 0;
                    }
                  }
                `,
              }}
            />

            {/* Top Crisp White Edge Sheen */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />

            {/* Stage Title: Crisp white text */}
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-white text-[14.5px] sm:text-[15px] font-semibold tracking-tight">
                Stage 1: Failure Ingestion
              </h3>
            </div>

            {/* Sub-label: Pulsing Telemetry */}
            <div className="text-center mb-2">
              <span className="text-zinc-300 text-[10.5px] font-medium tracking-tight">
                Pulsing telemetry
              </span>
            </div>

            {/* Refined Error Badge: Docker Build Exit Code 1 with solid lighter container */}
            <div className="relative rounded-xl py-2.5 px-3 bg-[#242b38] border border-white/[0.16] shadow-[0_2px_10px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.14)] flex items-center justify-center gap-2.5 transition-all duration-300 hover:border-white/30">
              {/* Slow, gentle glowing red droplet / beacon */}
              <div className="relative w-3.5 h-3.5 flex items-center justify-center shrink-0">
                {/* Slow outer radar ripple */}
                <span
                  className="absolute inset-0 rounded-full border border-red-400/50 pointer-events-none"
                  style={{ animation: "slowRadarEcho 3.2s cubic-bezier(0.2, 0.6, 0.35, 1) infinite" }}
                />
                {/* Slow breathing glowing red core */}
                <div
                  className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
                  style={{ animation: "softBreathe 2.8s ease-in-out infinite" }}
                />
              </div>

              <span className="text-white font-mono text-[11.5px] sm:text-[12px] font-medium tracking-tight">
                Docker Build Exit Code 1
              </span>
            </div>

            {/* ── Perfectly Proportioned Circuit Conduit & Improved Arrow ── */}
            <div className="relative h-12 flex items-center justify-center my-0.5">
              {/* SVG Conduit Architecture with clean high-tech lines */}
              <svg
                className="w-full h-full overflow-visible"
                viewBox="0 0 200 48"
                fill="none"
              >
                {/* Subtle PCB circuit stepped line */}
                <path
                  d="M80 0 V14 H66 V32 H100"
                  stroke="rgba(255, 255, 255, 0.12)"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="66" cy="22" r="1.25" fill="rgba(255, 255, 255, 0.25)" />

                {/* Main vertical laser wire with subtle glow */}
                <path
                  d="M100 0 V38"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"
                />

                {/* Sharp, beautiful arrowhead with filled core */}
                <path
                  d="M96 34 L100 42 L104 34"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="rgba(239, 68, 68, 0.2)"
                />
                <circle cx="100" cy="42" r="1" fill="#ef4444" />
              </svg>

              {/* Perfectly positioned labels */}
              <span className="absolute left-6 top-3.5 text-zinc-500 text-[10px] font-mono tracking-tight">
                Nested
              </span>
              <span className="absolute right-5 top-3.5 text-zinc-400 text-[10.5px] font-medium tracking-tight">
                Log stream
              </span>
            </div>

            {/* Nested Log Stream Window (Solid refined terminal window) */}
            <div className="rounded-xl bg-[#11151e] border border-white/[0.14] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] overflow-hidden flex-1 flex flex-col mt-1">
              {/* Terminal Titlebar with solid lighter slate finish */}
              <div className="flex items-center justify-between px-3.5 py-2 bg-[#181d28] border-b border-white/[0.1] shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-100 text-[11.5px] sm:text-[12px] font-medium tracking-tight">
                    Log stream
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                {/* Close 'X' icon */}
                <button
                  type="button"
                  aria-label="Close terminal"
                  className="text-zinc-400 hover:text-white transition-colors p-0.5"
                >
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 4L12 12M12 4L4 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Terminal Content: Extended ANSI stack trace cleanly filling taller card */}
              <div className="p-3.5 font-mono text-[9.5px] sm:text-[10px] leading-[1.68] text-zinc-300 flex-1 overflow-hidden select-text flex flex-col justify-between">
                <div>
                  <p className="text-red-400 font-medium">
                    Error: Cannot find module &apos;./utils/api&apos;
                  </p>
                  <p className="text-zinc-500 pl-2">
                    at Function.Module._resolveFilename
                  </p>
                  <p className="text-zinc-600 pl-2 text-[9px]">
                    (node:internal/modules/cjs/loader:1140:15)
                  </p>
                  <p className="text-zinc-500 pl-2">
                    at /app/src/components/Dashboard.tsx:5:10
                  </p>
                  <p className="text-zinc-600 pl-2 text-[9px]">
                    at /app/src/internal/loader.cjs:1148:23
                  </p>
                  <p className="text-zinc-500 pl-2">
                    at discmodule.tsx:333
                  </p>
                  <p className="text-zinc-600 pl-2 text-[9px]">
                    at Function.Module._resolveFilename
                  </p>
                  <p className="text-zinc-500 pl-2">
                    at /app/src/components/Dashboard.tsx:5:10
                  </p>
                  <p className="text-zinc-600 pl-2 text-[9px]">
                    at Module._compile (loader.cjs:1198:14)
                  </p>
                  <p className="text-zinc-500 pl-2">
                    at Object.require.extensions..tsx
                  </p>
                  <p className="text-zinc-600 pl-2 text-[9px]">
                    at internal/modules/cjs/loader.js:1248:12
                  </p>
                  <p className="text-zinc-500 pl-2">
                    at Module.load (loader.cjs:1037:32)
                  </p>
                  <p className="text-zinc-600 pl-2 text-[9px]">
                    at Function.Module._load (loader.cjs:878:12)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── COLUMN 2: Stage 2 on Top, Stage 4 Pushed to Bottom Baseline ── */}
          <div className="contents min-[1140px]:flex min-[1140px]:flex-col min-[1140px]:order-2 min-[1140px]:w-auto shrink-0 min-[1140px]:items-start min-[1140px]:justify-between min-[1140px]:h-[475px]">
            {/* ── STAGE 2: AI AST & REPO TREE ANALYSIS CARD (Reduced Compact Height) ── */}
            <div
              ref={stage2Ref}
              className="relative order-2 w-full min-[1140px]:w-[320px] xl:w-[345px] 2xl:w-[380px] max-w-[380px] h-[200px] rounded-[18px] bg-[#1a1f29] border border-white/[0.18] shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] p-2.5 sm:p-3 select-none overflow-hidden group"
            >
              {/* Top Crisp White Edge Sheen */}
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent pointer-events-none" />

            {/* Stage Title */}
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white text-[13px] sm:text-[13.5px] font-semibold tracking-tight">
                Stage 2: AI AST &amp; Repo Tree Analysis
              </h3>
            </div>

            {/* Two-Column Internal Layout: Tight, compact height proportion matching reference */}
            <div ref={cardInnerRef} className="relative grid grid-cols-12 gap-2 items-start">
              {/* Left Column (58% width): Repository Directory File Tree */}
              <div className="col-span-7 flex flex-col font-mono text-[8.5px] sm:text-[9px] text-zinc-300 z-10">
                {/* Row 0: Repository directory header */}
                <div className="h-[15.5px] flex items-center gap-1.5 text-zinc-400 text-[8.5px] font-sans font-medium">
                  <svg className="w-2.5 h-2.5 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span>Repository directory</span>
                </div>

                {/* Row 1: file tree */}
                <div className="h-[15.5px] flex items-center gap-1 text-zinc-300 pl-0.5">
                  <span className="text-zinc-500 text-[8.5px]">└─</span>
                  <svg className="w-2.5 h-2.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                  <span className="text-zinc-200 font-semibold">file tree</span>
                </div>

                {/* Row 2: project */}
                <div className="h-[15.5px] flex items-center gap-1 pl-3 text-zinc-400">
                  <svg className="w-2.5 h-2.5 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                  <span>project</span>
                </div>

                {/* Row 3: src (highlighted emerald folder) */}
                <div className="h-[15.5px] flex items-center gap-1 pl-3 text-[#00e599]">
                  <svg className="w-2.5 h-2.5 text-[#00e599] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                  <span>src</span>
                </div>

                {/* Row 4: scanner */}
                <div className="h-[15.5px] flex items-center gap-1 pl-6 text-zinc-400">
                  <svg className="w-2.5 h-2.5 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                  <span>scanner</span>
                </div>

                {/* Row 5: utils/api (highlighted emerald folder with cyan target dot) */}
                <div className="h-[15.5px] flex items-center gap-1.5 pl-6 text-[#00e599] font-semibold relative">
                  <svg className="w-2.5 h-2.5 text-[#00e599] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                  <span>utils/api</span>
                  {/* Glowing Cyan Target Node (exact anchor for straight 90° line) */}
                  <span
                    ref={utilsApiDotRef}
                    className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] shrink-0 ml-0.5"
                  />
                </div>

                {/* Row 6: Dashboard.tsx (Faulty import target with red anchor node) */}
                <div className="h-[15.5px] flex items-center gap-1.5 pl-6 text-emerald-300 relative">
                  <svg className="w-2.5 h-2.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>Dashboard.tsx</span>
                  {/* Glowing Red Fault Target Node (exact anchor for red dashed line) */}
                  <span
                    ref={dashboardTargetRef}
                    className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] shrink-0 ml-0.5"
                  />
                </div>

                {/* Row 7: package.json */}
                <div className="h-[15.5px] flex items-center gap-1 pl-3 text-zinc-400">
                  <svg className="w-2.5 h-2.5 text-amber-400/80 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>package.json</span>
                </div>

                {/* Row 8: apm_init.ts */}
                <div className="h-[15.5px] flex items-center gap-1 pl-3 text-zinc-500">
                  <svg className="w-2.5 h-2.5 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  </svg>
                  <span>apm_init.ts</span>
                </div>
              </div>

              {/* Right Column (42% width): Multi-model Fallback Capsules */}
              <div className="col-span-5 flex flex-col pl-0.5 z-10">
                {/* Header label */}
                <div className="h-[15.5px] flex items-center justify-end text-[8px] text-zinc-400 font-sans font-medium tracking-tight">
                  Multi-model fallback capsules
                </div>

                {/* AI Capsules Stack with compact row heights */}
                <div className="flex flex-col gap-1 mt-0.5">
                  {/* Capsule 1: Gemini 2.5 Pro (Target origin for straight 90° Cyan Conduit) */}
                  <div
                    ref={geminiProRef}
                    className="relative rounded-lg py-0.5 px-2 bg-[#132232] border border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] flex items-center gap-1"
                  >
                    <svg className="w-2.5 h-2.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z" />
                    </svg>
                    <span className="text-white text-[9.5px] font-semibold tracking-tight whitespace-nowrap">
                      Gemini 2.5 Pro
                    </span>
                  </div>

                  {/* Capsule 2: Gemini 3.6 Flash (Target origin for straight 90° Red Conduit) */}
                  <div
                    ref={geminiFlashRef}
                    className="relative rounded-lg py-0.5 px-2 bg-[#1e2634] border border-white/[0.16] shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] flex items-center gap-1"
                  >
                    <svg className="w-2.5 h-2.5 text-zinc-300 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z" />
                    </svg>
                    <span className="text-zinc-100 text-[9.5px] font-semibold tracking-tight whitespace-nowrap">
                      Gemini 3.6 Flash
                    </span>
                  </div>
                </div>

                {/* Bottom Subtitle / Analysis Notice */}
                <div className="mt-1 text-right">
                  <p className="text-[8px] leading-tight text-zinc-400 font-sans tracking-tight">
                    Faulty import path
                  </p>
                  <p className="text-[8px] leading-tight text-red-400 font-sans font-medium tracking-tight mt-0.5">
                    pointing from hitting utils/api
                  </p>
                </div>
              </div>

              {/* ── DYNAMIC ORTHOGONAL 90° CONDUITS (STRICTLY STRAIGHT WITH 90° TURNS, NO CURVES) ── */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
                fill="none"
              >
                {/* Cyan Conduit:
                    1. Straight horizontal left from Gemini 2.5 Pro
                    2. 90-degree corner turn straight down
                    3. 90-degree corner turn straight horizontal left into utils/api cyan dot */}
                <path
                  d={`M ${coords.cyan.x1} ${coords.cyan.y1} H ${coords.cyan.midX + 3} Q ${coords.cyan.midX} ${coords.cyan.y1} ${coords.cyan.midX} ${coords.cyan.y1 + 3} V ${coords.cyan.y2 - 3} Q ${coords.cyan.midX} ${coords.cyan.y2} ${coords.cyan.midX - 3} ${coords.cyan.y2} H ${coords.cyan.x2}`}
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_6px_rgba(34,211,238,0.9)]"
                />

                {/* Red Dotted Conduit:
                    1. Straight horizontal left from left edge of Gemini 3.6 Flash
                    2. 90-degree corner turn straight down (running clear of the text)
                    3. 90-degree corner turn straight horizontal left terminating with arrowhead into Dashboard.tsx */}
                <path
                  d={`M ${coords.red.x1} ${coords.red.y1} H ${coords.red.midX + 3} Q ${coords.red.midX} ${coords.red.y1} ${coords.red.midX} ${coords.red.y1 + 3} V ${coords.red.y2 - 3} Q ${coords.red.midX} ${coords.red.y2} ${coords.red.midX - 3} ${coords.red.y2} H ${coords.red.x2 + 4}`}
                  stroke="#ef4444"
                  strokeWidth="1.25"
                  strokeDasharray="2.5 2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]"
                />

                {/* Sharp left-pointing arrowhead directly hitting Dashboard.tsx red node */}
                <polygon
                  points={`${coords.red.x2},${coords.red.y2} ${coords.red.x2 + 5},${coords.red.y2 - 3} ${coords.red.x2 + 5},${coords.red.y2 + 3}`}
                  fill="#ef4444"
                />
              </svg>
            </div>
          </div>

          {/* ── STAGE 4: SEMANTIC CODE DIFF & AST PATCH CARD (Reduced Compact Height) ── */}
          <div
            ref={stage4Ref}
            className="relative order-4 w-full min-w-0 min-[1140px]:w-[365px] xl:w-[395px] 2xl:w-[465px] max-w-[475px] rounded-[18px] bg-[#1a1f29] border border-white/[0.18] shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] p-2.5 sm:p-3 select-none overflow-hidden group"
          >
            {/* Top Crisp White Edge Sheen */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent pointer-events-none" />

            {/* Stage Title */}
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-white text-[13px] sm:text-[13.5px] font-semibold tracking-tight">
                Stage 4: Semantic Code Diff &amp; AST Patch
              </h3>
            </div>

            {/* Outer Editor Window Frame */}
            <div className="relative rounded-xl bg-[#10141d] border border-white/[0.12] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] overflow-hidden">
              {/* Tab Header Bar */}
              <div className="flex items-center px-2.5 pt-1.5 border-b border-white/[0.08] bg-[#141923]">
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-t-md bg-[#10141d] border-t border-l border-r border-white/[0.12] -mb-[1px]">
                  {/* React/Component Atom Icon */}
                  <svg className="w-3 h-3 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)" />
                    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(90 12 12)" />
                    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(150 12 12)" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  </svg>
                  <span className="text-zinc-200 font-mono text-[9px] sm:text-[9.5px] font-medium tracking-tight">
                    src/components/Dashboard.tsx
                  </span>
                  <button type="button" aria-label="Close file" className="text-zinc-400 hover:text-white transition-colors ml-1 p-0.5">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 4L12 12M12 4L4 12" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Floating AST Validation Status Overlay (Right side with extensive horizontal clearance) */}
              <div className="absolute top-6 right-3 z-20 rounded-xl bg-[#161d28]/95 backdrop-blur-md border border-white/[0.14] shadow-[0_8px_24px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.12)] py-1.5 px-3 flex flex-col gap-1 pointer-events-none">
                {/* Row 1: Syntax tokens, and commit guards */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-300 text-[8px] font-sans font-medium tracking-tight whitespace-nowrap">
                    Syntax tokens, and commitemards
                  </span>
                  <svg className="w-3 h-3 text-zinc-400 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 8 6 11 13 4" />
                  </svg>
                </div>

                {/* Row 2: Patch validation... */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white text-[8.5px] font-sans font-semibold tracking-tight whitespace-nowrap">
                    Patch validation...
                  </span>
                  <svg className="w-3 h-3 text-[#00e599] shrink-0 drop-shadow-[0_0_8px_rgba(0,229,153,0.9)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 8 6 11 13 4" />
                  </svg>
                </div>
              </div>

              {/* Code Diff Buffer (Lines 1 to 10 - Clear, compact content) */}
              <div className="py-1.5 font-mono text-[8.5px] sm:text-[9px] leading-[1.48] select-text">
                {/* Line 1 */}
                <div className="flex items-center px-2 hover:bg-white/[0.02]">
                  <span className="w-5 text-right text-zinc-600 select-none pr-2 shrink-0 text-[8px]">1</span>
                  <span className="text-purple-400">import</span>
                  <span className="text-zinc-300">&nbsp;&#123;&nbsp;api&nbsp;&#125;&nbsp;</span>
                  <span className="text-purple-400">from</span>
                  <span className="text-amber-300/90">&nbsp;&quot;.maut&quot;;</span>
                </div>

                {/* Line 2 */}
                <div className="flex items-center px-2 hover:bg-white/[0.02]">
                  <span className="w-5 text-right text-zinc-600 select-none pr-2 shrink-0 text-[8px]">2</span>
                  <span className="text-purple-400">import</span>
                  <span className="text-zinc-500">&nbsp;...</span>
                </div>

                {/* Line 3 */}
                <div className="flex items-center px-2 min-h-[8px]">
                  <span className="w-5 text-right text-zinc-600 select-none pr-2 shrink-0 text-[8px]">3</span>
                </div>

                {/* Line 4 */}
                <div className="flex items-center px-2 hover:bg-white/[0.02]">
                  <span className="w-5 text-right text-zinc-600 select-none pr-2 shrink-0 text-[8px]">4</span>
                  <span className="text-purple-400">export default</span>
                  <span className="text-zinc-300">&nbsp;api&#41;&nbsp;&#123;</span>
                </div>

                {/* Line 5 */}
                <div className="flex items-center px-2 hover:bg-white/[0.02]">
                  <span className="w-5 text-right text-zinc-600 select-none pr-2 shrink-0 text-[8px]">5</span>
                  <span className="text-zinc-500 pl-2.5">import &#123; api &#125; from &quot;./utils/api&quot;</span>
                </div>

                {/* Line 6: Red Deleted Line */}
                <div className="flex items-center px-2 bg-[#3b1219]/70 border-l-2 border-red-500">
                  <span className="w-5 text-right text-red-400/80 select-none pr-1 shrink-0 text-[8px]">6</span>
                  <span className="w-3 text-center text-red-400 select-none font-bold shrink-0">-</span>
                  <span className="text-red-300 pl-1 font-medium">import &#123; api &#125; from &quot;./utils/api&quot;</span>
                </div>

                {/* Line 7: Green Added Line (Highlighted & Glowing) */}
                <div className="flex items-center px-2 bg-[#0c2e22]/90 border-l-2 border-[#00e599] shadow-[inset_0_0_12px_rgba(0,229,153,0.15)]">
                  <span className="w-5 text-right text-emerald-400/80 select-none pr-1 shrink-0 text-[8px]">7</span>
                  <span className="w-3 text-center text-[#00e599] select-none font-bold shrink-0">+</span>
                  <span className="text-[#00e599] pl-1 font-semibold drop-shadow-[0_0_6px_rgba(0,229,153,0.5)]">
                    import &#123; api &#125; from &quot;../services/api&quot;
                  </span>
                </div>

                {/* Line 8 */}
                <div className="flex items-center px-2 hover:bg-white/[0.02]">
                  <span className="w-5 text-right text-zinc-600 select-none pr-2 shrink-0 text-[8px]">8</span>
                  <span className="text-purple-400 pl-2.5">import</span>
                  <span className="text-zinc-400">&nbsp;txiaertiast&#40;none/service&#41;;</span>
                </div>

                {/* Line 9 */}
                <div className="flex items-center px-2 hover:bg-white/[0.02]">
                  <span className="w-5 text-right text-zinc-600 select-none pr-2 shrink-0 text-[8px]">9</span>
                  <span className="text-zinc-300">&nbsp;&nbsp;&#125;;</span>
                </div>

                {/* Line 10 */}
                <div className="flex items-center px-2 min-h-[8px]">
                  <span className="w-5 text-right text-zinc-600 select-none pr-2 shrink-0 text-[8px]">10</span>
                </div>
              </div>
            </div>
          </div>
        </div>

          {/* ── COLUMN 3: Stage 3 on Top, Stage 5 Pushed to Bottom Baseline ── */}
          <div className="contents min-[1140px]:flex min-[1140px]:flex-col min-[1140px]:order-3 min-[1140px]:w-auto shrink-0 min-[1140px]:items-start min-[1140px]:justify-between min-[1140px]:h-[475px]">
            {/* ── STAGE 3: ISOLATED GIT BRANCHING CARD (Reduced Height Match with Stage 2) ── */}
            <div
              ref={stage3Ref}
              className="relative order-3 w-full min-[1140px]:w-[305px] xl:w-[325px] 2xl:w-[355px] max-w-[360px] h-[200px] flex flex-col justify-between rounded-[18px] bg-[#1a1f29] border border-white/[0.18] shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] p-2.5 sm:p-3 select-none overflow-hidden group"
            >
              {/* Top Crisp White Edge Sheen */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent pointer-events-none" />

            {/* Stage Title */}
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white text-[13px] sm:text-[13.5px] font-semibold tracking-tight">
                Stage 3: Isolated Git Branching
              </h3>
            </div>

            {/* Inner Header Pill: Git commit graph */}
            <div className="rounded-xl py-1 px-2.5 bg-[#131720]/90 border border-white/[0.1] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] flex items-center justify-between mb-1">
              <span className="text-zinc-200 text-[10.5px] font-medium tracking-tight">
                Git commit graph
              </span>
              <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[8.5px] tracking-tight">
                {/* Branch icon */}
                <svg className="w-3 h-3 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <span>commit graph</span>
              </div>
            </div>

            {/* Git Commit Graph Interactive SVG Architecture - Tightened height */}
            <div className="relative w-full">
              <svg
                className="w-full h-auto overflow-visible select-none"
                viewBox="0 0 320 72"
                fill="none"
              >
                {/* "main" Branch Label */}
                <text
                  x="26"
                  y="10"
                  fill="#38bdf8"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  main
                </text>

                {/* "Failed commit" Warning Label (soft muted red) */}
                <text
                  x="154"
                  y="10"
                  fill="#f87171"
                  fontSize="9"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  Failed commit
                </text>

                {/* ── MAIN BRANCH LINE SEGMENTS ── */}
                {/* Segment 1: Node 1 to Node 2 */}
                <line
                  x1="33"
                  y1="23"
                  x2="69"
                  y2="23"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                {/* Segment 2: Node 2 to Node 3 */}
                <line
                  x1="83"
                  y1="23"
                  x2="117"
                  y2="23"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                {/* Segment 3: Node 3 to Failed Commit (muted slate) */}
                <line
                  x1="131"
                  y1="23"
                  x2="142"
                  y2="23"
                  stroke="#475569"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />

                {/* Segment 4: Failed Commit to Merge Node (muted slate) */}
                <line
                  x1="166"
                  y1="23"
                  x2="241"
                  y2="23"
                  stroke="#475569"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />

                {/* Segment 5: Merge Node to Right Arrowhead */}
                <line
                  x1="255"
                  y1="23"
                  x2="284"
                  y2="23"
                  stroke="#475569"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                {/* Sleek Right Arrowhead */}
                <polygon
                  points="282,19.5 290,23 282,26.5"
                  fill="#475569"
                />

                {/* ── ISOLATED GREEN REPAIR BRANCH (S-Curves smoothly down and back up) ── */}
                <path
                  d="M 124 23 C 138 23, 146 57, 164 57 H 210 C 228 57, 234 23, 248 23"
                  stroke="#00e599"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_8px_rgba(0,229,153,0.85)]"
                />

                {/* ── MAIN BRANCH COMMIT NODES ── */}
                {/* Node 1: Head Commit (glowing cyan circle) */}
                <circle
                  cx="26"
                  cy="23"
                  r="6.5"
                  fill="#38bdf8"
                  className="drop-shadow-[0_0_10px_#38bdf8]"
                />
                <circle cx="26" cy="23" r="3" fill="#ffffff" />

                {/* Node 2: Commit on Main */}
                <circle
                  cx="76"
                  cy="23"
                  r="6"
                  fill="#151b24"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />

                {/* Node 3: Branching Origin Commit */}
                <circle
                  cx="124"
                  cy="23"
                  r="6"
                  fill="#151b24"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />

                {/* ── FAILED COMMIT BADGE (Soft Muted Red with Subdued Glow) ── */}
                <circle
                  cx="154"
                  cy="23"
                  r="10.5"
                  fill="#221416"
                  stroke="#f87171"
                  strokeWidth="1.6"
                  className="drop-shadow-[0_0_6px_rgba(239,68,68,0.35)]"
                />
                {/* Warning Triangle Icon */}
                <path
                  d="M154 16.5 L159.5 26.5 H148.5 Z"
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                {/* Exclamation point inside triangle */}
                <line
                  x1="154"
                  y1="19.5"
                  x2="154"
                  y2="22.8"
                  stroke="#f87171"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <circle cx="154" cy="24.8" r="0.65" fill="#f87171" />

                {/* Node 5: Merge Node on Main (after repair) */}
                <circle
                  cx="248"
                  cy="23"
                  r="6"
                  fill="#151b24"
                  stroke="#64748b"
                  strokeWidth="2"
                />

                {/* ── ISOLATED BRANCH COMMIT NODE (Emerald Glowing Node) ── */}
                <circle
                  cx="192"
                  cy="57"
                  r="6"
                  fill="#0c241c"
                  stroke="#00e599"
                  strokeWidth="2"
                  className="drop-shadow-[0_0_8px_rgba(0,229,153,0.8)]"
                />
                <circle cx="192" cy="57" r="2.2" fill="#00e599" />
              </svg>

              {/* Branch Name Tag (Pill Container below the commit node) */}
              <div className="flex justify-center mt-1">
                <div className="rounded-lg py-0.5 px-2.5 bg-[#0a1f18] border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)] flex items-center gap-1.5">
                  <span className="text-emerald-400 font-mono text-[9px] sm:text-[9.5px] font-semibold tracking-tight">
                    deployai/fix-build-17929
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── STAGE 5: AUTONOMOUS GITHUB PR & VERIFICATION CARD (Reduced Compact Height) ── */}
          <div
            ref={stage5Ref}
            className="relative order-5 w-full min-[1140px]:w-[295px] xl:w-[315px] 2xl:w-[335px] max-w-[340px] rounded-[18px] bg-[#1a1f29] border border-white/[0.18] shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] p-2.5 sm:p-3 select-none overflow-hidden group"
          >
            {/* Top Crisp White Edge Sheen */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent pointer-events-none" />

            {/* Stage Title */}
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-white text-[13px] sm:text-[13.5px] font-semibold tracking-tight">
                Stage 5: Autonomous GitHub PR &amp; Verification
              </h3>
            </div>

            {/* Inner GitHub PR Preview Container */}
            <div className="rounded-xl bg-[#111620] border border-white/[0.12] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] p-2.5 sm:p-3">
              {/* Header Row: Octocat + GitHub PR ... Preview */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* GitHub Octocat Icon */}
                  <svg className="w-3.5 h-3.5 text-white fill-current shrink-0" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span className="text-zinc-200 text-[10.5px] font-medium tracking-tight">
                    GitHub PR
                  </span>
                </div>
                <span className="text-zinc-400 text-[9.5px] font-sans font-medium">
                  Preview
                </span>
              </div>

              {/* PR Title */}
              <h4 className="text-white text-[12.5px] sm:text-[13px] font-semibold leading-snug tracking-tight mt-1.5">
                Fix: Correct broken API import path
              </h4>

              {/* Commit Hash Row with commit icon */}
              <div className="flex items-center gap-1.5 mt-1.5 text-zinc-400 font-mono text-[9.5px]">
                {/* Git commit icon */}
                <svg className="w-3 h-3 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <line x1="2" y1="12" x2="8" y2="12" />
                  <line x1="16" y1="12" x2="22" y2="12" />
                </svg>
                <span>cf9a21b</span>
              </div>

              {/* Checks Passing Pill */}
              <div className="mt-2.5 py-1 px-2.5 rounded-lg bg-[#0e1816] border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full border border-emerald-400/80 flex items-center justify-center text-emerald-400">
                    <svg className="w-2 h-2" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 8 6 11 13 4" />
                    </svg>
                  </div>
                  <span className="text-zinc-200 text-[10px] font-medium tracking-tight">
                    Checks Passing
                  </span>
                </div>
                <span className="text-emerald-400 font-mono text-[10px] font-semibold">
                  4/4
                </span>
              </div>
            </div>

            {/* Merge PR #142 Primary Button */}
            <button
              type="button"
              className="w-full mt-2.5 py-1.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 via-[#00c878] to-emerald-600 hover:from-emerald-500 hover:via-[#00e599] hover:to-emerald-500 text-white font-semibold text-[11.5px] tracking-tight shadow-[0_0_20px_rgba(0,200,120,0.35),inset_0_1px_1px_rgba(255,255,255,0.4)] border border-emerald-400/50 transition-all duration-300 hover:shadow-[0_0_25px_rgba(0,229,153,0.5)] active:scale-[0.98] cursor-pointer"
            >
              Merge PR #142
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
);
}


