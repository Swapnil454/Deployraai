"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Activity, Server, Cpu, Database, Network, Calendar, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ObservabilitySetup } from "@/components/observability/ObservabilitySetup";

// Highly contrasting colors WITHIN each chart so overlapping lines never blend
const CPU_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
const MEM_COLORS = ['#06b6d4', '#d9f99d', '#ec4899', '#818cf8', '#f97316'];
const NET_COLORS = ['#8b5cf6', '#eab308', '#10b981', '#38bdf8', '#fb7185'];
const INITIAL_REPLICA_COUNT = 5;

export default function InfrastructurePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [timeRange, setTimeRange] = useState(24); // hours
  const [groupBy, setGroupBy] = useState('k8s_pod_name');
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [showAllReplicas, setShowAllReplicas] = useState(false);

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
      
      const metrics = 'system.cpu.utilization,system.memory.usage,http.throughput';
      
      const [res, projectRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/observability/infrastructure/metrics?projectId=${projectId}&start=${start}&end=${end}&metrics=${metrics}&groupBy=${groupBy}`, { 
          credentials: "include" 
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}`, { credentials: "include" })
      ]);
      
      if (res.ok) {
        const json = await res.json();
        setMetricsData(json.data || []);
      }
      if (projectRes.ok) {
        setProject(await projectRes.json());
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
        const timeKey = d.time; // string from ClickHouse, often missing 'Z'
        
        let dateObj = new Date(timeKey);
        if (typeof timeKey === 'string' && !timeKey.endsWith('Z')) {
          // Force UTC parsing for ClickHouse strings like "2026-09-18 14:48:00"
          dateObj = new Date(timeKey.replace(' ', 'T') + 'Z');
        }

        if (!timeMap.has(timeKey)) {
          timeMap.set(timeKey, { 
            time: timeKey, 
            formattedTime: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            rawTime: dateObj.getTime()
          });
        }
        
        const groupVal = d.group_val || 'unknown';
        groups.add(groupVal);
        
        let value = d.avg_value;
        // Normalize values for charts
        if (metricName === 'system.memory.usage') {
          value = value / (1024 * 1024); // Bytes to MB
        } else if (metricName === 'system.cpu.utilization') {
          // Note: since the backend averages all states (including idle), this is just an approximation for now.
          // We multiply by 100 to make it a percentage.
          value = (value * 100); 
        }

        timeMap.get(timeKey)[groupVal] = value;
      }
    });

    const sortedData = Array.from(timeMap.values()).sort((a, b) => a.rawTime - b.rawTime);
    return { data: sortedData, groups: Array.from(groups) };
  };

  const cpuChart = useMemo(() => processChartData('system.cpu.utilization'), [metricsData]);
  const memChart = useMemo(() => processChartData('system.memory.usage'), [metricsData]);
  const netChart = useMemo(() => processChartData('http.throughput'), [metricsData]);

  const renderLineChart = (chartInfo: { data: any[], groups: string[] }, yAxisLabel: string, colors: string[]) => {
    if (chartInfo.data.length === 0) {
      return (
        <div className="flex h-[350px] items-center justify-center rounded-sm border-t border-zinc-800 bg-[#0a0a0a] text-zinc-500">
          No data available for this time range.
        </div>
      );
    }

    const visibleGroups = showAllReplicas ? chartInfo.groups : chartInfo.groups.slice(0, INITIAL_REPLICA_COUNT);
    const hiddenReplicaCount = Math.max(chartInfo.groups.length - INITIAL_REPLICA_COUNT, 0);

    return (
      <div className="w-full">
        <div className="h-[305px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartInfo.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="formattedTime" 
              stroke="#52525b" 
              fontSize={11} 
              tickLine={false}
              axisLine={{ stroke: '#27272a' }}
              tickMargin={12}
              minTickGap={80}
            />
            <YAxis 
              orientation="right"
              stroke="#52525b" 
              fontSize={11} 
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => {
                if (yAxisLabel.trim() === 'MB' && val > 999) return `${(val / 1024).toFixed(1)} GB`;
                return `${val}${yAxisLabel}`;
              }}
              tickMargin={12}
            />
            <Tooltip 
              formatter={(value: any, name: any) => {
                const num = Number(value || 0);
                if (yAxisLabel.trim() === 'MB' && num > 999) return [`${(num / 1024).toFixed(2)} GB`, name];
                return [`${num.toFixed(2)}${yAxisLabel}`, name];
              }}
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '4px', color: '#fff' }}
              itemStyle={{ color: '#e4e4e7', fontWeight: 500 }}
              labelStyle={{ color: '#a1a1aa', marginBottom: '0.25rem', fontWeight: 600, fontSize: '12px' }}
            />
            {visibleGroups.map((group, i) => (
              <Line 
                key={group}
                type="linear" 
                dataKey={group} 
                stroke={colors[i % colors.length]} 
                dot={false}
                strokeWidth={1.8}
                isAnimationActive={false}
              />
            ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-900 pt-3">
          {visibleGroups.map((group, i) => (
            <div key={group} className="flex max-w-[210px] items-center gap-1.5" title={group}>
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="truncate text-[11px] text-zinc-400">{group}</span>
            </div>
          ))}
          {hiddenReplicaCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllReplicas(!showAllReplicas)}
              aria-expanded={showAllReplicas}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
            >
              {showAllReplicas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAllReplicas ? 'Show fewer' : `Show ${hiddenReplicaCount} more`}
            </button>
          )}
          {chartInfo.groups.length > INITIAL_REPLICA_COUNT && showAllReplicas && (
            <span className="text-[11px] text-zinc-500">Showing all {chartInfo.groups.length} replicas</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black p-6 pb-24">
      <div className="mx-auto max-w-7xl space-y-6">
        {project && !project.observability?.verified ? (
          <div className="mt-8">
            <ObservabilitySetup project={project} onVerified={fetchMetrics} />
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
              <div>
                <h1 className="mb-2 text-2xl font-bold text-white flex items-center gap-3">
              <Server className="h-6 w-6 text-white" />
              Infrastructure Metrics
            </h1>
            <p className="text-zinc-400 text-sm max-w-xl">High-resolution hardware and container telemetry.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button 
                onClick={() => { setIsGroupDropdownOpen(!isGroupDropdownOpen); setIsTimeDropdownOpen(false); }}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 shadow-xl text-sm text-zinc-300 font-medium hover:text-white hover:border-zinc-700 transition-colors"
              >
                <Filter className="h-4 w-4 text-zinc-500" />
                {groupBy === 'k8s_pod_name' ? 'Group by Pod' : groupBy === 'host_name' ? 'Group by Host' : groupBy === 'container_name' ? 'Group by Container' : 'Group by Namespace'}
              </button>
              
              {isGroupDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsGroupDropdownOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden z-50 py-1">
                    {[
                      { value: 'k8s_pod_name', label: 'Group by Pod' },
                      { value: 'host_name', label: 'Group by Host' },
                      { value: 'container_name', label: 'Group by Container' },
                      { value: 'k8s_namespace_name', label: 'Group by Namespace' },
                    ].map(option => (
                      <button
                        key={option.value}
                        onClick={() => { setGroupBy(option.value); setIsGroupDropdownOpen(false); }}
                        className={`block w-full text-left px-4 py-2 text-sm transition-colors ${groupBy === option.value ? 'bg-indigo-500/10 text-indigo-400 font-medium' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button 
                onClick={() => { setIsTimeDropdownOpen(!isTimeDropdownOpen); setIsGroupDropdownOpen(false); }}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 shadow-xl text-sm text-zinc-300 font-medium hover:text-white hover:border-zinc-700 transition-colors"
              >
                <Calendar className="h-4 w-4 text-zinc-500" />
                {timeRange === 1 ? 'Last 1 Hour' : timeRange === 6 ? 'Last 6 Hours' : timeRange === 24 ? 'Last 24 Hours' : 'Last 7 Days'}
              </button>
              
              {isTimeDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsTimeDropdownOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-40 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden z-50 py-1">
                    {[
                      { value: 1, label: 'Last 1 Hour' },
                      { value: 6, label: 'Last 6 Hours' },
                      { value: 24, label: 'Last 24 Hours' },
                      { value: 168, label: 'Last 7 Days' },
                    ].map(option => (
                      <button
                        key={option.value}
                        onClick={() => { setTimeRange(Number(option.value)); setIsTimeDropdownOpen(false); }}
                        className={`block w-full text-left px-4 py-2 text-sm transition-colors ${timeRange === option.value ? 'bg-indigo-500/10 text-indigo-400 font-medium' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {loading && metricsData.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="space-y-12">
            {/* CPU Chart */}
            <div className="bg-transparent border-t border-zinc-800 pt-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-white">Average CPU Utilization</h2>
                <p className="text-sm text-zinc-400 mt-1">Showing {showAllReplicas ? 'all' : `up to ${INITIAL_REPLICA_COUNT}`} replicas</p>
              </div>
              <div>
                {renderLineChart(cpuChart, '%', CPU_COLORS)}
              </div>
            </div>

            {/* Memory Chart */}
            <div className="bg-transparent border-t border-zinc-800 pt-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-white">Average Memory Utilization</h2>
                <p className="text-sm text-zinc-400 mt-1">Showing {showAllReplicas ? 'all' : `up to ${INITIAL_REPLICA_COUNT}`} replicas</p>
              </div>
              <div>
                {renderLineChart(memChart, ' MB', MEM_COLORS)}
              </div>
            </div>

            {/* Network Chart */}
            <div className="bg-transparent border-y border-zinc-800 pt-6 pb-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-white">HTTPS Requests</h2>
                <p className="text-sm text-zinc-400 mt-1">Showing {showAllReplicas ? 'all' : `up to ${INITIAL_REPLICA_COUNT}`} replicas</p>
              </div>
              <div>
                {renderLineChart(netChart, ' Req/Min', NET_COLORS)}
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </div>
    </div>
  );
}
