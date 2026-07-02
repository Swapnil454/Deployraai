'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PlayCircle, Clock, AlertTriangle, Monitor, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';

export default function SessionsListPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/sessions?projectId=${projectId}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setSessions(data.sessions || []);
        setNextCursor(data.nextCursor || null);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [projectId]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/rum/sessions?projectId=${projectId}&cursor=${encodeURIComponent(nextCursor)}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setSessions(prev => [...prev, ...(data.sessions || [])]);
        setNextCursor(data.nextCursor || null);
        setLoadingMore(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingMore(false);
      });
  };

  if (loading) {
    return <div className="p-8 text-zinc-400">Loading sessions...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Session Replays</h1>
          <p className="text-zinc-400 mt-1">Watch video-like recordings of user sessions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sessions.length === 0 ? (
          <div className="p-12 border border-zinc-800 rounded-xl text-center bg-zinc-900/20">
            <Monitor className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No sessions recorded</h3>
            <p className="text-zinc-400">Configure your tracepilot SDK with enableSessionReplay to see data here.</p>
          </div>
        ) : (
          sessions.map((s, idx) => {
            const start = new Date(s.start_time);
            const duration = s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)}s` : 'Unknown';
            const errorCount = parseInt(s.error_count) || 0;
            
            return (
              <Card key={s.session_id || idx} className="bg-black border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between p-4 sm:p-6">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400">
                        <PlayCircle className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium text-zinc-200 truncate max-w-md">
                            {s.url || 'Unknown Page'}
                          </h3>
                          {errorCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-zinc-500">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {formatDistanceToNow(start, { addSuffix: true })}
                          </div>
                          <div className="w-1 h-1 rounded-full bg-zinc-700" />
                          <div>{duration}</div>
                          <div className="w-1 h-1 rounded-full bg-zinc-700" />
                          <div className="truncate max-w-[200px]" title={s.user_agent}>{s.user_agent || 'Unknown Browser'}</div>
                          <div className="w-1 h-1 rounded-full bg-zinc-700" />
                          <div>{s.event_count} events</div>
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => router.push(`/dashboard/observability/sessions/${projectId}/${s.session_id}`)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors"
                    >
                      Watch <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {nextCursor && (
        <div className="flex justify-center mt-6">
          <button 
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
