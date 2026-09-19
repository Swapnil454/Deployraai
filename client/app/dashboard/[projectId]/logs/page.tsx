"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Search, Filter, Play, Square, FileText } from "lucide-react";

export default function LogsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [logs, setLogs] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [search, setSearch] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startStream = () => {
    if (eventSourceRef.current) return;
    
    const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/observability` : "http://localhost:5000/api/observability";
    const es = new EventSource(`${ANALYTICS_API_URL}/logs/stream?projectId=${projectId}`, { withCredentials: true });
    
    es.onmessage = (e) => {
      try {
        const newLogs = JSON.parse(e.data);
        setLogs(prev => {
          // Prepend new logs, keep max 1000 in state
          const combined = [...newLogs, ...prev];
          return combined.slice(0, 1000);
        });
      } catch (err) {
        console.error("Failed to parse log stream", err);
      }
    };

    eventSourceRef.current = es;
    setIsStreaming(true);
  };

  const stopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  };

  useEffect(() => {
    startStream();
    return () => stopStream();
  }, [projectId]);

  // Fetch initial history if needed, but for simplicity we rely on the stream popping in or we can do a fetch
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/observability` : "http://localhost:5000/api/observability";
        const res = await fetch(`${ANALYTICS_API_URL}/logs?projectId=${projectId}&limit=50`, {
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchHistory();
  }, [projectId]);

  const filteredLogs = logs.filter(log => 
    search === "" || log.message?.toLowerCase().includes(search.toLowerCase())
  );

  const getLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'error': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'warn': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'debug': return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
      default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
  };

  return (
    <div className="w-full flex flex-col h-[calc(100vh-64px)] bg-black text-white">
      {/* Header & Controls */}
      <div className="w-full border-b border-zinc-800 p-4 shrink-0">
        <div className="max-w-[1440px] w-full mx-auto flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search logs..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
          
          <button 
            onClick={isStreaming ? stopStream : startStream}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
              isStreaming 
                ? 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20' 
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
          >
            {isStreaming ? (
              <><Square className="h-4 w-4 fill-current" /> Pause Tail</>
            ) : (
              <><Play className="h-4 w-4 fill-current" /> Resume Tail</>
            )}
          </button>
        </div>
      </div>

      {/* Log View */}
      <div className="flex-1 overflow-auto p-4 font-mono text-[13px]">
        <div className="max-w-[1440px] w-full mx-auto">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500">
              <FileText className="h-8 w-8 mb-4 opacity-50" />
              <p>Waiting for logs...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredLogs.map((log, i) => (
                <div key={log.id || i} className="flex gap-4 p-1.5 hover:bg-zinc-900/50 rounded group">
                  <div className="text-zinc-600 shrink-0 w-[140px]">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                  </div>
                  <div className="shrink-0 w-[60px]">
                    <span className={`px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-semibold border ${getLevelColor(log.level)}`}>
                      {log.level || 'info'}
                    </span>
                  </div>
                  <div className="text-zinc-300 break-all flex-1">
                    {log.message}
                  </div>
                  {log.request_id && (
                    <div className="text-zinc-600 shrink-0 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
                      {log.request_id.slice(0, 8)}
                    </div>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
