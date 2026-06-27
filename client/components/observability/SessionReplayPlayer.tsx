'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Monitor } from 'lucide-react';

interface SessionReplayPlayerProps {
  events: any[];
}

export function SessionReplayPlayer({ events }: SessionReplayPlayerProps) {
  const outerRef = useRef<HTMLDivElement>(null);   // measured for container width
  const mountRef = useRef<HTMLDivElement>(null);   // rrweb mounts here
  const replayerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'playing' | 'paused' | 'done' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [curMs, setCurMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  // viewport dimensions from rrweb resize event
  const [vpH, setVpH] = useState(0);     // scaled height to give the outer div

  useEffect(() => {
    if (events?.length >= 2) {
      setTotalMs(events[events.length - 1].timestamp - events[0].timestamp);
    }
  }, [events]);

  useEffect(() => {
    if (!mountRef.current || !events || events.length < 2) {
      setErrMsg(`Not enough events (${events?.length ?? 0}). Open localhost:3000/test-session and interact for ~10s first.`);
      setStatus('error');
      return;
    }

    let dead = false;

    import('rrweb').then(({ Replayer }) => {
      if (dead || !mountRef.current) return;
      mountRef.current.innerHTML = '';

      const replayer = new Replayer(events, {
        root: mountRef.current,
        speed: 1,
        showWarning: false,
        showDebug: false,
        UNSAFE_replayCanvas: true,
      });
      replayerRef.current = replayer;

      // rrweb fires 'resize' with the original recorded viewport dimensions
      replayer.on('resize', ({ width, height }: { width: number; height: number }) => {
        if (!outerRef.current || !mountRef.current) return;

        const containerW = outerRef.current.clientWidth;
        const s = Math.min(containerW / width, 1); // never upscale
        const scaledW = Math.round(width * s);
        const scaledH = Math.round(height * s);

        const wrapper = mountRef.current.querySelector('.replayer-wrapper') as HTMLElement | null;
        if (wrapper) {
          // Force absolute positioning at top-left to prevent any margin/centering offsets
          wrapper.style.position = 'absolute';
          wrapper.style.top = '0';
          wrapper.style.left = '0';
          wrapper.style.margin = '0';
          wrapper.style.transformOrigin = 'top left';
          wrapper.style.transform = `scale(${s})`;
        }
        
        // mountRef acts as a tight bounding box for the scaled content
        mountRef.current.style.width = `${scaledW}px`;
        mountRef.current.style.height = `${scaledH}px`;
        
        // outerRef gets the height of the scaled content
        outerRef.current.style.height = `${scaledH}px`;
        setVpH(scaledH);
      });

      replayer.on('finish', () => {
        setStatus('done');
        clearInterval(timerRef.current);
      });

      setStatus('ready');
    }).catch(err => {
      if (!dead) { setErrMsg('Failed to load rrweb: ' + err.message); setStatus('error'); }
    });

    return () => {
      dead = true;
      clearInterval(timerRef.current);
      try { replayerRef.current?.pause(); } catch {}
      replayerRef.current = null;
    };
  }, [events]);

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      try {
        const ms = replayerRef.current?.getCurrentTime?.() ?? 0;
        setCurMs(ms);
        if (totalMs > 0) setProgress(Math.min(ms / totalMs * 100, 100));
      } catch {}
    }, 200);
  };

  const doPlay = (from?: number) => {
    if (from !== undefined) {
      replayerRef.current?.play(from);
      setCurMs(from);
      setProgress(totalMs > 0 ? from / totalMs * 100 : 0);
    } else {
      replayerRef.current?.play();
    }
    setStatus('playing');
    startTimer();
  };

  const doPause = () => {
    replayerRef.current?.pause();
    setStatus('paused');
    clearInterval(timerRef.current);
  };

  const doSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    doPlay(pct * totalMs);
  };

  const setSpd = (s: number) => { setSpeed(s); replayerRef.current?.setConfig({ speed: s }); };

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  if (status === 'error') {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-14 text-center">
        <Monitor className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-300 font-semibold mb-2">Cannot replay this session</p>
        <p className="text-zinc-600 text-sm max-w-md mx-auto">{errMsg}</p>
      </div>
    );
  }

  const playing = status === 'playing';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">

      {/* ── Player viewport ──────────────────────────────── */}
      {/* outerRef: clips to scaled size, hides overflow    */}
      <div
        ref={outerRef}
        className="relative w-full overflow-hidden bg-zinc-900"
        style={{ height: vpH > 0 ? vpH : 480 }}
      >
        {/* Loading state */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500 z-20">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Initialising replay engine…</span>
          </div>
        )}

        {/* Big play overlay (shown when ready or done) */}
        {(status === 'ready' || status === 'done') && (
          <button
            onClick={() => doPlay(status === 'done' ? 0 : undefined)}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm hover:bg-black/50 transition-colors group"
          >
            <div className="w-20 h-20 rounded-full bg-indigo-600 shadow-2xl shadow-indigo-900/60 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Play className="w-9 h-9 text-white ml-1" fill="white" />
            </div>
            <span className="text-sm text-zinc-300 font-medium">
              {status === 'done' ? 'Replay again' : `Play  ·  ${fmt(totalMs)}`}
            </span>
          </button>
        )}

        {/*
          mountRef: Acts as the scaled bounding box.
          Centered inside outerRef using flex/mx-auto.
        */}
        <div className="w-full h-full flex items-center justify-center">
          <div ref={mountRef} className="relative overflow-hidden" />
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────── */}
      <div className="bg-zinc-950 border-t border-zinc-800 px-4 pt-2.5 pb-3 flex flex-col gap-2">

        {/* Seekbar */}
        <div
          className="w-full h-1.5 bg-zinc-800 rounded-full cursor-pointer relative group"
          onClick={doSeek}
        >
          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${progress}%`, transform: 'translate(-50%,-50%)' }}
          />
        </div>

        {/* Button row */}
        <div className="flex items-center gap-2">
          <button onClick={() => doPlay(0)} title="Restart" className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={playing ? doPause : () => doPlay()}
            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            {playing
              ? <Pause className="w-4 h-4" fill="white" />
              : <Play  className="w-4 h-4 ml-0.5" fill="white" />
            }
          </button>

          <span className="text-[11px] tabular-nums text-zinc-500 ml-1 select-none">
            <span className="text-zinc-300">{fmt(curMs)}</span>
            {' / '}
            {fmt(totalMs)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            {[0.5, 1, 1.5, 2].map(s => (
              <button key={s} onClick={() => setSpd(s)} className={`px-2 py-0.5 text-[11px] rounded transition-colors ${speed === s ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
