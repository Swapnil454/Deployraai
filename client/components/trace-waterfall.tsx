'use client';

import React, { useState } from 'react';

interface Span {
  span_id: string;
  name: string;
  start_time: string;
  duration_ms: number;
  status_code: number;
  attributes: Record<string, any>;
  children?: Span[];
}

interface TraceWaterfallProps {
  traceStartMs: number;
  traceDurationMs: number;
  spans: Span[];
}

function SpanBar({
  span,
  traceStartMs,
  traceDurationMs,
  depth,
  onSelect
}: {
  span: Span;
  traceStartMs: number;
  traceDurationMs: number;
  depth: number;
  onSelect: (span: Span) => void;
}) {
  const spanStartMs = new Date(span.start_time).getTime();
  
  // Calculate relative position and width
  const leftPct = ((spanStartMs - traceStartMs) / traceDurationMs) * 100;
  // Use a minimum width of 0.5% so extremely fast spans are still visible
  const widthPct = Math.max((span.duration_ms / traceDurationMs) * 100, 0.5);

  // Determine span color based on semantic attributes
  const color = 
    span.status_code === 2 ? '#ef4444'        // Error -> Red
    : span.attributes['db.system'] ? '#f97316' // Database -> Orange
    : span.attributes['http.url'] ? '#3b82f6'  // External HTTP -> Blue
    : '#8b5cf6';                               // Internal operation -> Purple

  return (
    <div>
      <div 
        style={{ paddingLeft: depth * 16, cursor: 'pointer' }} 
        onClick={() => onSelect(span)}
        className="hover:bg-slate-800 transition-colors py-1 rounded"
      >
        <div style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
          <span className="font-medium truncate pr-4">{span.name}</span>
          <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>
            {span.duration_ms.toFixed(2)}ms
          </span>
        </div>
        
        {/* The Gantt bar track */}
        <div style={{ 
          position: 'relative', 
          height: 12, 
          background: '#334155', // Slate 700 background track
          borderRadius: 4, 
          margin: '4px 0',
          width: '100%',
          overflow: 'hidden'
        }}>
          {/* The colored bar representing span duration */}
          <div style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(leftPct, 99.5))}%`,
            width: `${Math.min(widthPct, 100 - leftPct)}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
            boxShadow: '0 0 8px rgba(0,0,0,0.2)'
          }} />
        </div>
      </div>
      
      {/* Recursively render children */}
      {span.children?.map(child => (
        <SpanBar 
          key={child.span_id} 
          span={child}
          traceStartMs={traceStartMs} 
          traceDurationMs={traceDurationMs}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function TraceWaterfall({ traceStartMs, traceDurationMs, spans }: TraceWaterfallProps) {
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);

  return (
    <div className="flex flex-col md:flex-row gap-6 mt-6">
      {/* Waterfall Visualization */}
      <div className="flex-1 bg-slate-900 rounded-lg p-4 border border-slate-800 overflow-x-auto">
        <h3 className="text-lg font-semibold text-slate-200 mb-4 border-b border-slate-800 pb-2">
          Trace Timeline
        </h3>
        <div className="min-w-[600px]">
          {spans.map((span) => (
            <SpanBar
              key={span.span_id}
              span={span}
              traceStartMs={traceStartMs}
              traceDurationMs={traceDurationMs}
              depth={0}
              onSelect={setSelectedSpan}
            />
          ))}
        </div>
      </div>

      {/* Span Details Sidebar */}
      {selectedSpan && (
        <div className="w-full md:w-80 bg-slate-900 rounded-lg p-4 border border-slate-800">
          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
            <h3 className="text-lg font-semibold text-slate-200">Span Details</h3>
            <button 
              onClick={() => setSelectedSpan(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Operation</p>
              <p className="text-slate-200 font-mono text-sm break-all">{selectedSpan.name}</p>
            </div>
            
            <div className="flex justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Duration</p>
                <p className="text-slate-200 text-sm">{selectedSpan.duration_ms.toFixed(2)}ms</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Status</p>
                <p className={`text-sm ${selectedSpan.status_code === 2 ? 'text-red-400 font-bold' : 'text-green-400'}`}>
                  {selectedSpan.status_code === 2 ? 'ERROR' : 'OK'}
                </p>
              </div>
            </div>

            {Object.keys(selectedSpan.attributes).length > 0 && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Attributes</p>
                <div className="bg-slate-950 rounded p-2 overflow-x-auto border border-slate-800">
                  <pre className="text-xs text-slate-300 font-mono">
                    {JSON.stringify(selectedSpan.attributes, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
