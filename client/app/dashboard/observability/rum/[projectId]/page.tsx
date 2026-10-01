"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, MonitorPlay, X, Play, Pause } from "lucide-react";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";
import { WebVitalsDashboard } from "@/components/observability/WebVitalsDashboard";

// Dynamically loads the rrweb-player script from CDN exactly once and resolves
// when `globalThis.rrwebPlayer` is available. Safe to call multiple times.
let _rrwebLoaderPromise: Promise<void> | null = null;
function loadRRWebPlayer(): Promise<void> {
  if (typeof (globalThis as any).rrwebPlayer !== 'undefined') return Promise.resolve();
  if (_rrwebLoaderPromise) return _rrwebLoaderPromise;
  _rrwebLoaderPromise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/style.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/index.js';
    script.async = true;
    script.onload = () => {
      injectRRWebDarkTheme();
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load rrweb-player from CDN'));
    document.head.appendChild(script);
  });
  return _rrwebLoaderPromise;
}

// Overrides the rrweb-player's default white UI with a fully custom dark theme.
// We now use a pure React controller to guarantee pixel-perfect styling without Svelte conflicts.
function injectRRWebDarkTheme() {
  const existing = document.getElementById('rrweb-dark-theme');
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = 'rrweb-dark-theme';
  style.textContent = `
    .rr-player { background: #0a0a0a !important; border: none !important; border-radius: 0 !important; display: block !important; }
    .rr-player__frame { background: #0a0a0a !important; }
  `;
  document.head.appendChild(style);
}

export default function RumDashboard() {
  const { projectId } = useParams();
  const router = useRouter();

  const [timeWindow, setTimeWindow] = useState('24h');
  const [vitals, setVitals] = useState<any[]>([]);
  const [routeVitals, setRouteVitals] = useState<any[]>([]);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = useState<any[]>([]);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Custom Player State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(true);

  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vitalsRes, routeVitalsRes, timeseriesRes, sessionsRes, projectRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/vitals?projectId=${projectId}&window=${timeWindow}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/vitals/routes?projectId=${projectId}&window=${timeWindow}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/vitals/timeseries?projectId=${projectId}&window=${timeWindow}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/sessions?projectId=${projectId}&window=${timeWindow}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" })
      ]);

      const vitalsData = vitalsRes.ok ? await vitalsRes.json() : { vitals: [] };
      const routeVitalsData = routeVitalsRes.ok ? await routeVitalsRes.json() : { routes: [] };
      const timeseriesData = timeseriesRes.ok ? await timeseriesRes.json() : { timeseries: [] };
      const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };
      const projectData = projectRes.ok ? await projectRes.json() : null;
      
      setVitals(vitalsData.vitals || []);
      setRouteVitals(routeVitalsData.routes || []);
      setTimeseries(timeseriesData.timeseries || []);
      setSessions(sessionsData.sessions || []);
      setProject(projectData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [projectId, timeWindow]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadSession = async (sessionId: string) => {
    setActiveSession(sessionId);
    setPlaying(true);
    setSessionEvents([]);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/sessions/${sessionId}/events?projectId=${projectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSessionEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to load session events', err);
    }
  };

  useEffect(() => {
    if (!playing || sessionEvents.length <= 2 || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';
    setCurrentTime(0);
    setDuration(0);
    setIsPlayerPlaying(true);

    injectRRWebDarkTheme();

    const modalWidth = Math.min(container.offsetWidth || 900, 900);
    const playerHeight = Math.round(modalWidth * 0.5625);

    loadRRWebPlayer()
      .then(() => {
        if (!container) return;
        injectRRWebDarkTheme();
        const Player = (globalThis as any).rrwebPlayer;
        if (!Player) return;
        
        playerRef.current = new Player({
          target: container,
          props: {
            events: sessionEvents,
            width: modalWidth,
            height: playerHeight,
            autoPlay: true,
            showController: false, // COMPLETELY DISABLE RRWEB CONTROLLER
            skipInactive: true,
            speed: 1,
          },
        });

        // Initialize state from player
        const replayer = playerRef.current.getReplayer();
        if (replayer) {
          const meta = replayer.getMetaData();
          setDuration(meta.totalTime || 0);
          
          // rrweb events can sometimes be inconsistent, so we'll rely on the onClick handler 
          // to aggressively sync state, but we can keep these as fallbacks
          replayer.on('play', () => setIsPlayerPlaying(true));
          replayer.on('pause', () => setIsPlayerPlaying(false));
        }

      })
      .catch((err) => {
        console.error('[RUM] Failed to load rrweb-player:', err.message);
      });
  }, [playing, sessionEvents]);

  // Global interval to sync time for custom controller
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      if (playerRef.current && isPlayerPlaying) {
        try {
          const replayer = playerRef.current.getReplayer();
          if (replayer && replayer.timer) {
            setCurrentTime(replayer.timer.timeOffset);
          }
        } catch (e) {}
      }
    }, 50);
    return () => clearInterval(interval);
  }, [playing, isPlayerPlaying]);

  if (loading && !vitals.length && !project) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#050505] pb-20 font-sans">
        {/* HEADER SKELETON */}
        <div className="sticky top-0 z-20 bg-[#050505]/80 backdrop-blur-xl pt-6">
          <div className="max-w-[1400px] mx-auto px-8 border-b border-white/10 pb-4 flex items-center justify-between">
            <div>
              <div className="h-8 w-64 bg-zinc-800/50 rounded animate-pulse mb-2" />
              <div className="h-4 w-96 bg-zinc-800/30 rounded animate-pulse" />
            </div>
            <div className="h-8 w-48 bg-zinc-800/50 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* CONTENT SKELETON */}
        <div className="max-w-[1400px] mx-auto w-full px-6 mt-8 space-y-6">
          {/* Vitals Cards Skeleton */}
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[120px] bg-[#0a0a0a] border border-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
          
          {/* Chart Skeleton */}
          <div className="h-[400px] bg-[#0a0a0a] border border-white/5 rounded-xl animate-pulse" />
          
          {/* Table Skeleton */}
          <div className="h-[300px] bg-[#0a0a0a] border border-white/5 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // Show setup wizard only when the project has never sent any data.
  // If there IS data but the project isn't marked verified, we still show the dashboard.
  const hasAnyData = vitals.length > 0 || sessions.length > 0;
  if (project && !project.observability?.verified && !hasAnyData && !loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#050505] text-zinc-200 font-sans p-6 pt-12">
        <ObservabilitySetup project={project} onVerified={fetchData} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)] items-center justify-center bg-[#050505] text-zinc-400 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-500/50" />
        <p className="text-sm">Database connection failed. Please ensure your PostgreSQL database is running.</p>
        {error && <p className="text-xs text-red-400/80 font-mono bg-red-500/10 px-3 py-1.5 rounded">{error}</p>}
      </div>
    );
  }

  // Using the new WebVitalsDashboard instead of inline cards

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#050505] text-zinc-200 font-sans p-6">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <MonitorPlay className="h-6 w-6 text-white" /> Real User Monitoring
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Web Vitals and Session Replays for your application.</p>
        </div>
        <div className="flex items-center gap-2 bg-[#0f0f11] border border-zinc-800/60 rounded-md p-1">
          {['1h', '24h', '7d'].map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                timeWindow === w 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <WebVitalsDashboard vitals={vitals} routeVitals={routeVitals} timeseries={timeseries} />

      <div className="bg-[#0a0a0a] border border-zinc-800/60 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Recent User Sessions</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{sessions.length} session{sessions.length !== 1 ? 's' : ''} in this window</p>
          </div>
        </div>
        <div className="divide-y divide-zinc-800/40">
          {sessions.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-600">
              <MonitorPlay className="h-8 w-8 opacity-30" />
              <p className="text-sm">No sessions recorded in this window.</p>
            </div>
          ) : (
            sessions.map((session: any, i: number) => {
              const isActive = activeSession === session.session_id;
              const durationSec = Math.round((session.duration_ms || 0) / 1000);
              return (
                <div
                  key={session.session_id}
                  className={`group px-5 py-3.5 flex items-center justify-between transition-colors ${
                    isActive ? 'bg-white/[0.03]' : 'hover:bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Session avatar */}
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-zinc-800/80 flex items-center justify-center text-[11px] font-semibold text-zinc-400 border border-zinc-700/50">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-mono text-zinc-200 truncate max-w-[340px]">{session.session_id}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-zinc-500">{new Date(session.start_time).toLocaleString()}</span>
                        <span className="text-zinc-700">·</span>
                        <span className="text-[11px] text-zinc-500">{session.event_count ?? 0} events</span>
                        {durationSec > 0 && (
                          <><span className="text-zinc-700">·</span>
                          <span className="text-[11px] text-zinc-500">{durationSec}s</span></>
                        )}
                        {(session.error_count ?? 0) > 0 && (
                          <span className="text-[10px] font-medium text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">{session.error_count} error{session.error_count > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => loadSession(session.session_id)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/50 hover:border-zinc-600 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <MonitorPlay className="h-3.5 w-3.5" />
                    Replay
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setPlaying(false); setActiveSession(null); setSessionEvents([]); } }}
        >
          <div className="w-full max-w-5xl bg-[#0a0a0a] border border-zinc-800/70 rounded-2xl overflow-hidden flex flex-col shadow-[0_40px_100px_-10px_rgba(0,0,0,0.9)]">

            {/* Header bar */}
            <div className="px-5 py-3 border-b border-zinc-800/70 flex items-center justify-between bg-[#080808] shrink-0">
              <div className="flex items-center gap-3">
                {/* Traffic lights */}
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-zinc-700" />
                  <div className="h-3 w-3 rounded-full bg-zinc-700" />
                  <div className="h-3 w-3 rounded-full bg-zinc-700" />
                </div>
                <div className="h-4 w-px bg-zinc-800" />
                <div>
                  <span className="text-[13px] font-medium text-zinc-200">Session Replay</span>
                  <span className="ml-2 text-[11px] font-mono text-zinc-600 truncate max-w-[400px] inline-block align-middle">{activeSession?.slice(0, 24)}…</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {sessionEvents.length > 2 && (
                  <span className="text-[10px] font-medium text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {sessionEvents.length} events
                  </span>
                )}
                <button
                  onClick={() => { setPlaying(false); setActiveSession(null); setSessionEvents([]); }}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Player / loading / empty */}
            {sessionEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 bg-[#070707]">
                <div className="relative">
                  <div className="h-9 w-9 rounded-full border-2 border-zinc-800 border-t-zinc-500 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-300">Loading session…</p>
                  <p className="text-xs text-zinc-600 mt-1">Fetching events from database</p>
                </div>
              </div>
            ) : sessionEvents.length < 2 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 bg-[#070707]">
                <MonitorPlay className="h-8 w-8 text-zinc-700" />
                <p className="text-sm font-medium text-zinc-400">Not enough data to replay</p>
                <p className="text-xs text-zinc-600">This session captured fewer than 2 events</p>
              </div>
            ) : (
              /* The rrweb player frame */
              <div className="flex flex-col bg-[#0a0a0a]">
                <div ref={containerRef} className="overflow-hidden leading-none" />
                
                {/* CUSTOM REACT CONTROLLER BAR */}
                <div className="flex items-center h-14 bg-[#0a0a0a] border-t border-[#1f1f1f] px-4 gap-6">
                  {/* Play / Pause Toggle */}
                  <button 
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-zinc-200 hover:text-white transition-colors"
                    onClick={() => {
                      if (!playerRef.current) return;
                      const replayer = playerRef.current.getReplayer();
                      if (replayer) {
                        if (isPlayerPlaying) {
                          replayer.pause();
                          setIsPlayerPlaying(false);
                        } else {
                          // Pass currentTime so it resumes exactly from where it left off
                          replayer.play(currentTime);
                          setIsPlayerPlaying(true);
                        }
                      }
                    }}
                  >
                    {isPlayerPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                  </button>

                  {/* Progress Bar */}
                  <div 
                    className="flex-1 relative h-1.5 bg-zinc-800 rounded-full cursor-pointer group"
                    onClick={(e) => {
                      if (!playerRef.current || duration === 0) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const targetTime = percent * duration;
                      
                      const replayer = playerRef.current.getReplayer();
                      if (replayer) {
                        replayer.pause();
                        replayer.play(targetTime);
                        if (!isPlayerPlaying) replayer.pause();
                      }
                      
                      setCurrentTime(targetTime);
                    }}
                  >
                    {/* Active Track */}
                    <div 
                      className="absolute top-0 left-0 h-full bg-blue-600 rounded-full" 
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} 
                    />
                    {/* Scrubber Handle */}
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-blue-600 rounded-full shadow border-2 border-[#0a0a0a]" 
                      style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 7px)` }} 
                    />
                  </div>

                  {/* Time Indicator */}
                  <div className="flex-shrink-0 text-zinc-300 text-[13px] font-mono tracking-wide">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

        {/* Spacer to ensure the page's own background color extends to the bottom */}
        <div className="h-24 shrink-0 w-full" />
    </div>
  );
}
