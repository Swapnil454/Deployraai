"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Activity, Layout, MousePointer2, AlertTriangle, MonitorPlay, X } from "lucide-react";
import Script from "next/script";
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";
import { WebVitalsDashboard } from "@/components/observability/WebVitalsDashboard";

export default function RumDashboard() {
  const { projectId } = useParams();
  const router = useRouter();

  const [window, setWindow] = useState('24h');
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vitalsRes, routeVitalsRes, timeseriesRes, sessionsRes, projectRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/vitals?projectId=${projectId}&window=${window}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/vitals/routes?projectId=${projectId}&window=${window}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/vitals/timeseries?projectId=${projectId}&window=${window}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/sessions?projectId=${projectId}&window=${window}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" })
      ]);

      // Try to parse JSON regardless of status — the API returns empty arrays when Clickhouse is offline
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
  }, [projectId, window]);

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
    // Mount rrweb-player when events are loaded
    if (playing && sessionEvents.length > 2 && containerRef.current) {
      // Clear previous player
      containerRef.current.innerHTML = '';
      
      // Use window.rrwebPlayer loaded from CDN
      const Player = (window as any).rrwebPlayer;
      if (Player) {
        playerRef.current = new Player({
          target: containerRef.current!,
          props: {
            events: sessionEvents,
            width: 800,
            height: 600,
            autoPlay: true,
          },
        });
      } else {
        console.error("rrwebPlayer is not loaded on window");
      }
    }
  }, [playing, sessionEvents]);

  if (loading && !vitals.length && !project) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-[#050505]">
        <div className="animate-spin h-8 w-8 text-indigo-500 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full" />
      </div>
    );
  }

  if (project && !project.analytics?.verified) {
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
      
      <Script src="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/index.js" strategy="lazyOnload" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/style.css" />
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <MonitorPlay className="h-6 w-6 text-indigo-400" /> Real User Monitoring
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Web Vitals and Session Replays for your application.</p>
        </div>
        <div className="flex items-center gap-2 bg-[#0f0f11] border border-zinc-800/60 rounded-md p-1">
          {['1h', '24h', '7d'].map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                window === w 
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
        <div className="p-5 border-b border-zinc-800/60">
          <h2 className="text-lg font-medium text-white">Recent User Sessions</h2>
        </div>
        <div className="divide-y divide-zinc-800/60">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">No RUM sessions found in this window.</div>
          ) : (
            sessions.map((session, i) => (
              <div key={session.session_id} className="p-4 flex items-center justify-between hover:bg-zinc-900/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400">
                    S{i+1}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white font-mono">{session.session_id}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {new Date(session.start_time).toLocaleString()} • {session.event_count} events
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => loadSession(session.session_id)}
                  className="px-4 py-1.5 bg-indigo-500/10 text-indigo-400 text-sm font-medium rounded-md hover:bg-indigo-500/20 transition-colors"
                >
                  Play Session
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {playing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-[#050505] border border-zinc-800 rounded-xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#0a0a0a]">
              <div className="text-sm font-medium text-white flex items-center gap-2">
                <MonitorPlay className="h-4 w-4 text-indigo-400" />
                Session Replay: <span className="font-mono text-zinc-400">{activeSession}</span>
              </div>
              <button 
                onClick={() => { setPlaying(false); setActiveSession(null); setSessionEvents([]); }}
                className="text-zinc-500 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 flex-1 flex items-center justify-center bg-zinc-900/50 relative min-w-[800px] min-h-[600px]">
              {sessionEvents.length === 0 ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin h-6 w-6 text-indigo-500 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full" />
                  <div className="text-sm text-zinc-500">Loading events...</div>
                </div>
              ) : sessionEvents.length < 2 ? (
                <div className="text-sm text-zinc-500">Not enough events to replay this session.</div>
              ) : (
                <div ref={containerRef} className="rounded overflow-hidden" />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
