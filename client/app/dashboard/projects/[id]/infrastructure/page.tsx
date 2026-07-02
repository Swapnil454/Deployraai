"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Activity, Server, Cpu, Database, Network } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Distinct colors for different series
const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#0ea5e9'];

export default function InfrastructurePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState(24); // hours
  const [groupBy, setGroupBy] = useState('k8s_pod_name');

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [projectId, timeRange, groupBy]);

  const fetchMetrics = async () => {
    if (document.visibilityState !== 'visible') return;
    
    try {
      setLoading(true);
      const end = Date.now();
      const start = end - timeRange * 60 * 60 * 1000;
      
      const metrics = 'system.cpu.utilization,system.memory.usage,network.io';
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/observability/infrastructure/metrics?projectId=${projectId}&start=${start}&end=${end}&metrics=${metrics}&groupBy=${groupBy}`, { 
        credentials: "include" 
      });
      
      if (res.ok) {
        const json = await res.json();
        setMetricsData(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Pivot data for Recharts
  const processChartData = (metricName: string) => {
    const timeMap = new Map<string, any>();
    const groups = new Set<string>();

    metricsData.forEach(d => {
      if (d.metric_name === metricName) {
        const timeKey = d.time; // ISO string from ClickHouse
        if (!timeMap.has(timeKey)) {
          timeMap.set(timeKey, { 
            time: timeKey, 
            formattedTime: new Date(timeKey).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            rawTime: new Date(timeKey).getTime()
          });
        }
        
        const groupVal = d.group_val || 'unknown';
        groups.add(groupVal);
        
        timeMap.get(timeKey)[groupVal] = d.avg_value;
      }
    });

    const sortedData = Array.from(timeMap.values()).sort((a, b) => a.rawTime - b.rawTime);
    return { data: sortedData, groups: Array.from(groups) };
  };

  const cpuChart = useMemo(() => processChartData('system.cpu.utilization'), [metricsData]);
  const memChart = useMemo(() => processChartData('system.memory.usage'), [metricsData]);
  const netChart = useMemo(() => processChartData('network.io'), [metricsData]);

  const renderAreaChart = (chartInfo: { data: any[], groups: string[] }, yAxisLabel: string) => {
    if (chartInfo.data.length === 0) {
      return (
        <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-500">
          No data available for this time range.
        </div>
      );
    }

    return (
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartInfo.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {chartInfo.groups.map((group, i) => (
                <linearGradient key={`grad-${group}`} id={`color-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="formattedTime" 
              stroke="#52525b" 
              fontSize={12} 
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="#52525b" 
              fontSize={12} 
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `${val}${yAxisLabel}`}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.5rem', color: '#fff' }}
              itemStyle={{ color: '#e4e4e7' }}
              labelStyle={{ color: '#a1a1aa', marginBottom: '0.25rem' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} iconType="circle" />
            {chartInfo.groups.map((group, i) => (
              <Area 
                key={group}
                type="monotone" 
                dataKey={group} 
                stroke={COLORS[i % COLORS.length]} 
                fillOpacity={1} 
                fill={`url(#color-${i})`}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
              </AreaChart>
          </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <button 
              onClick={() => router.push(`/dashboard/projects/${projectId}/deploy`)}
              className="mb-4 flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Deployments
            </button>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Server className="h-6 w-6 text-indigo-400" />
              Infrastructure Metrics
            </h1>
            <p className="mt-1 text-zinc-400">High-resolution hardware and container telemetry.</p>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="k8s_pod_name">Group by Pod</option>
              <option value="host_name">Group by Host</option>
              <option value="container_name">Group by Container</option>
              <option value="k8s_namespace_name">Group by Namespace</option>
            </select>
            
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={1}>Last 1 Hour</option>
              <option value={6}>Last 6 Hours</option>
              <option value={24}>Last 24 Hours</option>
              <option value={168}>Last 7 Days</option>
            </select>
          </div>
        </div>

        {loading && metricsData.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* CPU Chart */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Cpu className="h-5 w-5 text-indigo-400" />
                <h2 className="text-lg font-semibold text-white">CPU Utilization</h2>
              </div>
              {renderAreaChart(cpuChart, '%')}
            </div>

            {/* Memory Chart */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Database className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">Memory Usage</h2>
              </div>
              {renderAreaChart(memChart, ' MB')}
            </div>

            {/* Network Chart */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Network className="h-5 w-5 text-sky-400" />
                <h2 className="text-lg font-semibold text-white">Network I/O</h2>
              </div>
              {renderAreaChart(netChart, ' KB/s')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
