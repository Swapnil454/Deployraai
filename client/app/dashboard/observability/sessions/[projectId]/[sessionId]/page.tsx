'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, MonitorPlay } from 'lucide-react';
import { SessionReplayPlayer } from '@/components/observability/SessionReplayPlayer';

export default function SessionReplayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const sessionId = params.sessionId as string;
  const projectId = params.projectId as string;

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !sessionId) return;
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/sessions/${sessionId}/events?projectId=${projectId}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [projectId, sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-400 flex flex-col items-center gap-4">
          <MonitorPlay className="w-8 h-8 animate-pulse text-indigo-500" />
          <p>Loading session replay...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center max-w-lg mx-auto">
          <p className="text-red-400 font-medium mb-4">{error}</p>
          <button 
            onClick={() => router.back()}
            className="text-white hover:underline text-sm"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col min-h-full overflow-clip bg-[#050505] pb-24">
      {/* Page Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 p-6 pt-6 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8 border-b border-zinc-800/60 pb-6">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800/50 hover:border-zinc-700/50 shadow-sm"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">Session Replay</h1>
              <p className="text-zinc-500 mt-1 font-mono text-xs">{sessionId}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-800/50 text-zinc-300 border border-zinc-700/50 shadow-sm">
                <MonitorPlay className="w-4 h-4 text-indigo-400" />
                {events.length.toLocaleString()} events
              </span>
            </div>
          </div>

          {/* Player Container */}
          <div className="w-full max-w-5xl mx-auto shadow-2xl shadow-indigo-900/10 rounded-xl overflow-hidden ring-1 ring-zinc-700/50 bg-zinc-950/50 backdrop-blur-sm">
            <SessionReplayPlayer events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
