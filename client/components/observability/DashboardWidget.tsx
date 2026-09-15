"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export interface WidgetDef {
  id: string;
  title: string;
  chartType: 'line' | 'bar' | 'number';
  eventName: string;
  aggregation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  property?: string;
  window: '1h' | '24h' | '7d';
}

export function DashboardWidget({ projectId, widget }: { projectId: string; widget: WidgetDef }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/custom-dashboards/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            projectId,
            eventName: widget.eventName,
            aggregation: widget.aggregation,
            property: widget.property,
            window: widget.window
          })
        });
        
        if (!res.ok) throw new Error("Failed to load data");
        const json = await res.json();
        if (isMounted) {
          setData(json.data || []);
          setError("");
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchData();
    return () => { isMounted = false; };
  }, [projectId, widget]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a] rounded-xl border border-[#222]">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full p-6 flex flex-col items-center justify-center bg-[#0a0a0a] rounded-xl border border-red-900/30">
        <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
          <span className="text-red-400 font-bold text-lg">!</span>
        </div>
        <h3 className="text-[14px] font-semibold text-white mb-1">Widget Error</h3>
        <p className="text-xs text-zinc-400 text-center max-w-[200px] break-words">{error}</p>
      </div>
    );
  }

  // Handle Empty State
  if (data.length === 0) {
    return (
      <div className="w-full h-full p-6 flex flex-col items-center justify-center bg-[#0a0a0a] rounded-xl border border-[#222] overflow-y-auto custom-scrollbar">
        <h3 className="text-[15px] font-semibold text-white mb-2 text-center tracking-tight">No data for "{widget.eventName}"</h3>
        <p className="text-[13px] text-zinc-400 mb-2 text-center max-w-[280px]">
          Make sure you're calling the tracking code in your application:
        </p>
        <div className="w-full px-4">
          <pre className="bg-[#111] border border-[#333] rounded-lg p-3.5 text-[12px] text-zinc-300 overflow-x-auto w-full font-mono shadow-inner mt-2">
            <code>
tracepilot.track('{widget.eventName}'{widget.property ? `, {\n  ${widget.property}: 123\n}` : `, {}`})
            </code>
          </pre>
        </div>
        <p className="text-[11px] font-medium text-zinc-500 mt-5 text-center tracking-wide uppercase">Events appear within 30 seconds</p>
      </div>
    );
  }

  // Format timestamp for X-Axis based on window
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    if (widget.window === '1h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (widget.window === '7d') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const ChartContainer = ({ children }: { children: React.ReactNode }) => (
    <div className="w-full h-full bg-[#0a0a0a] border border-[#222] hover:border-[#333] transition-colors rounded-xl p-5 flex flex-col shadow-sm">
      <h3 className="text-[15px] font-semibold text-white mb-4 tracking-tight">{widget.title}</h3>
      <div className="flex-1 min-h-0 w-full">
        {children}
      </div>
    </div>
  );

  if (widget.chartType === 'number') {
    // Sum up or take latest depending on aggregation? For COUNT/SUM, sum it up. For AVG/MIN/MAX, might need logic, but let's do a simple sum for the number display
    const total = data.reduce((acc, curr) => acc + curr.value, 0);
    const avg = data.length > 0 ? total / data.length : 0;
    const displayValue = ['AVG'].includes(widget.aggregation) ? avg : total;
    
    // Format large numbers nicely
    const formatted = new Intl.NumberFormat('en-US', { 
      maximumFractionDigits: 1,
      notation: displayValue > 9999 ? "compact" : "standard" 
    }).format(displayValue);

    return (
      <ChartContainer>
        <div className="flex items-center justify-center h-full">
          <span className="text-4xl font-bold text-indigo-400">{formatted}</span>
        </div>
      </ChartContainer>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs">
          <p className="text-zinc-400 mb-1">{formatTime(label)}</p>
          <p className="text-white font-medium">{payload[0].value.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ChartContainer>
      <ResponsiveContainer width="100%" height="100%">
        {widget.chartType === 'bar' ? (
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="timestamp" tickFormatter={formatTime} stroke="#52525b" fontSize={11} tickMargin={8} minTickGap={20} />
            <YAxis stroke="#52525b" fontSize={11} tickFormatter={(v) => new Intl.NumberFormat('en-US', { notation: "compact" }).format(v)} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill="#818cf8" radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="timestamp" tickFormatter={formatTime} stroke="#52525b" fontSize={11} tickMargin={8} minTickGap={20} />
            <YAxis stroke="#52525b" fontSize={11} tickFormatter={(v) => new Intl.NumberFormat('en-US', { notation: "compact" }).format(v)} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#818cf8', stroke: '#000' }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </ChartContainer>
  );
}
