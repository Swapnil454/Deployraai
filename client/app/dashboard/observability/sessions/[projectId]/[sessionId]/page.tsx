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
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Session Replay</h1>
          <p className="text-zinc-500 mt-0.5 font-mono text-xs">{sessionId}</p>
        </div>
        <span className="ml-auto text-xs text-zinc-500">{events.length.toLocaleString()} events</span>
      </div>

      <SessionReplayPlayer events={events} />
    </div>
  );
}
