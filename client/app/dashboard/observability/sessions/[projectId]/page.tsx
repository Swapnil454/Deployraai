'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PlayCircle, Clock, AlertTriangle, Monitor, LayoutGrid, List } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function SessionsListPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  useEffect(() => {
    const savedMode = localStorage.getItem('deployai_sessions_view_mode') as 'grid' | 'list';
    if (savedMode === 'grid' || savedMode === 'list') {
      setViewMode(savedMode);
    }
  }, []);

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('deployai_sessions_view_mode', mode);
  };

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

  const loadMore = useCallback(() => {
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
  }, [projectId, nextCursor, loadingMore]);

  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && nextCursor && !loadingMore) {
        loadMore();
      }
    }, { rootMargin: '200px' });
    
    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }
    
    return () => observer.disconnect();
  }, [loadMore, nextCursor, loadingMore]);

  if (loading) {
    return (
      <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0">
        {/* Page Ambient Glows */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 p-6 pt-6 w-full flex-1">
          <div className="max-w-[1440px] w-full mx-auto">
            {/* Toolbar Skeleton */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 border-b border-zinc-800/60 pb-4">
              <div>
                <div className="h-8 w-56 bg-zinc-800/50 rounded-lg animate-pulse mb-2.5" />
                <div className="h-4 w-72 bg-zinc-800/30 rounded animate-pulse" />
              </div>
              <div className="h-12 w-[100px] bg-zinc-800/40 backdrop-blur-md border border-zinc-700/50 rounded-xl animate-pulse shrink-0" />
            </div>

            {/* Content Skeleton */}
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "flex flex-col rounded-xl border border-zinc-700/50 bg-zinc-800/20 backdrop-blur-md overflow-hidden shadow-xl"}>
              {[1, 2, 3, 4, 5, 6].map(i => 
                viewMode === 'grid' ? (
                  <div key={i} className="flex flex-col border border-zinc-700/50 bg-zinc-800/20 rounded-2xl h-[180px]">
                    <div className="p-5 flex-1 flex flex-col animate-pulse">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-zinc-700/50 shrink-0" />
                          <div className="h-5 w-48 bg-zinc-700/50 rounded" />
                        </div>
                      </div>
                      <div className="mt-3 h-3.5 w-2/3 bg-zinc-700/30 rounded" />
                      <div className="mt-auto pt-4 border-t border-zinc-700/50 flex justify-between items-center">
                        <div className="h-4 w-24 bg-zinc-700/30 rounded" />
                        <div className="h-4 w-32 bg-zinc-700/30 rounded" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex items-center justify-between border-b border-zinc-700/50 bg-transparent px-6 py-5 last:border-b-0">
                    <div className="flex items-center gap-4 w-[40%] animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-zinc-700/50 shrink-0" />
                      <div className="flex-1">
                        <div className="h-5 w-48 bg-zinc-700/50 rounded mb-1.5" />
                        <div className="h-3.5 w-64 bg-zinc-700/30 rounded" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 w-[40%] animate-pulse">
                      <div className="h-4 w-24 bg-zinc-700/30 rounded" />
                      <div className="w-1 h-1 rounded-full bg-zinc-600" />
                      <div className="h-4 w-16 bg-zinc-700/30 rounded" />
                      <div className="w-1 h-1 rounded-full bg-zinc-600" />
                      <div className="h-4 w-20 bg-zinc-700/30 rounded" />
                    </div>
                    <div className="flex items-center justify-end gap-6 w-[20%] shrink-0">
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col min-h-[calc(100vh-64px)] overflow-clip bg-[#050505] pb-24 shrink-0">
      {/* Page Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 p-6 pt-6 w-full flex-1">
        <div className="max-w-[1440px] w-full mx-auto">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 border-b border-zinc-800/60 pb-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">Session Replays</h1>
              <p className="text-zinc-400">Watch video-like recordings of user sessions.</p>
            </div>
            
            <div className="flex items-center p-1 bg-zinc-800/40 backdrop-blur-md border border-zinc-700/50 rounded-xl h-12 shrink-0">
              <button
                onClick={() => handleViewModeChange('grid')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'}`}
              >
                <LayoutGrid className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={() => handleViewModeChange('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'}`}
              >
                <List className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="w-full">
            {sessions.length === 0 ? (
              <div className="w-full relative flex flex-col items-center justify-center py-24 px-4 text-center overflow-hidden bg-transparent border border-zinc-800/50 rounded-2xl">
                <Monitor className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No sessions recorded</h3>
                <p className="text-zinc-400">Configure your tracepilot SDK with enableSessionReplay to see data here.</p>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "flex flex-col rounded-xl border border-zinc-700/50 bg-zinc-800/20 backdrop-blur-md overflow-hidden shadow-xl"}>
                {sessions.map((s, idx) => {
                  const start = new Date(s.start_time);
                  const duration = s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)}s` : 'Unknown';
                  const errorCount = parseInt(s.error_count) || 0;
                  
                  return viewMode === 'grid' ? (
                    <div 
                      key={s.session_id || idx} 
                      className="group flex flex-col border border-zinc-700/50 bg-gradient-to-b from-zinc-800/40 to-zinc-900/60 backdrop-blur-xl rounded-2xl hover:border-zinc-600/80 hover:from-zinc-700/40 hover:to-zinc-800/60 transition-all duration-300 cursor-pointer overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:-translate-y-1"
                      onClick={() => router.push(`/dashboard/observability/sessions/${projectId}/${s.session_id}`)}
                    >
                      <div className="p-5 flex-1 flex flex-col">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3 pr-2">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 shadow-inner border border-zinc-600/50 shrink-0">
                              <PlayCircle className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-white text-[15px] group-hover:text-indigo-400 transition-colors drop-shadow-sm line-clamp-1 break-all">
                              {s.url || 'Unknown Page'}
                            </h3>
                          </div>
                          {errorCount > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider">
                              <AlertTriangle className="w-3 h-3" />
                              {errorCount}
                            </span>
                          )}
                        </div>
                        
                        <div className="mb-2">
                          <p className="text-[12px] text-zinc-400 leading-relaxed break-words">
                            {s.user_agent || 'Unknown Browser'}
                          </p>
                        </div>
                        
                        <div className="mt-2 pt-4 border-t border-zinc-700/50 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDistanceToNow(start, { addSuffix: true })}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-400">
                            <span>{duration}</span>
                            <span>•</span>
                            <span className="text-zinc-300">{s.event_count} events</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      key={s.session_id || idx} 
                      className="group flex items-center justify-between border-b border-zinc-700/50 bg-transparent px-6 py-5 hover:bg-gradient-to-r hover:from-zinc-800/60 hover:to-transparent transition-all duration-300 cursor-pointer last:border-b-0 relative overflow-hidden"
                      onClick={() => router.push(`/dashboard/observability/sessions/${projectId}/${s.session_id}`)}
                    >
                      {/* Hover Highlight Bar */}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                      
                      <div className="flex items-center gap-4 w-[40%] min-w-0 transition-transform duration-300 group-hover:translate-x-1">
                        <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-indigo-500/10 text-indigo-400 shadow-inner border border-zinc-600/50">
                          <PlayCircle className="w-5 h-5" />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-bold text-white text-[15px] truncate group-hover:text-indigo-400 transition-colors drop-shadow-sm">{s.url || 'Unknown Page'}</h3>
                          <p className="text-[13px] text-zinc-400 truncate font-medium mt-0.5">{s.user_agent || 'Unknown Browser'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-[13px] text-zinc-400 font-medium w-[40%] transition-transform duration-300 group-hover:translate-x-1">
                        <div className="flex items-center gap-1.5 text-zinc-300">
                          <Clock className="w-4 h-4" />
                          {formatDistanceToNow(start, { addSuffix: true })}
                        </div>
                        <div className="w-1 h-1 rounded-full bg-zinc-600" />
                        <div>{duration}</div>
                        <div className="w-1 h-1 rounded-full bg-zinc-600" />
                        <div>{s.event_count} events</div>
                      </div>

                      <div className="flex items-center justify-end gap-6 w-[20%] shrink-0">
                        {errorCount > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {nextCursor && (
            <div ref={loaderRef} className="flex justify-center mt-10 h-10">
              {loadingMore && (
                <div className="flex items-center gap-3 text-zinc-400">
                  <div className="w-4 h-4 border-2 border-indigo-500/80 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Loading more sessions...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Spacer */}
      <div className="h-24 shrink-0 w-full" />
    </div>
  );
}
