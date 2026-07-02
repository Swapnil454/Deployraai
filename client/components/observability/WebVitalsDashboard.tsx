"use client";

import React from "react";
import { Layout, MousePointer2, Activity, Timer, Zap } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface VitalScore {
  metric: string;
  p75_value: number;
  sample_count: number;
}

interface RouteVital {
  route: string;
  metrics: Record<string, { p75_value: number; sample_count: number }>;
}

export function WebVitalsDashboard({ 
  vitals, 
  routeVitals, 
  timeseries = []
}: { 
  vitals: VitalScore[], 
  routeVitals: RouteVital[],
  timeseries?: any[]
}) {
  
  const getVitalScore = (name: string): VitalScore | undefined => {
    return vitals.find(v => v.metric === name);
  };

  const getGrade = (metricName: string, value: number) => {
    if (metricName === 'LCP') {
      if (value <= 2500) return 'good';
      if (value <= 4000) return 'needs-improvement';
      return 'poor';
    }
    if (metricName === 'INP') {
      if (value <= 200) return 'good';
      if (value <= 500) return 'needs-improvement';
      return 'poor';
    }
    if (metricName === 'FCP') {
      if (value <= 1800) return 'good';
      if (value <= 3000) return 'needs-improvement';
      return 'poor';
    }
    if (metricName === 'TTFB') {
      if (value <= 800) return 'good';
      if (value <= 1800) return 'needs-improvement';
      return 'poor';
    }
    if (metricName === 'CLS') {
      if (value <= 0.1) return 'good';
      if (value <= 0.25) return 'needs-improvement';
      return 'poor';
    }
    return 'unknown';
  };

  const getGradeColor = (grade: string) => {
    if (grade === 'good') return 'text-emerald-400';
    if (grade === 'needs-improvement') return 'text-amber-400';
    if (grade === 'poor') return 'text-rose-400';
    return 'text-zinc-500';
  };

  const getGradeBg = (grade: string) => {
    if (grade === 'good') return 'bg-emerald-500/10 border-emerald-500/20';
    if (grade === 'needs-improvement') return 'bg-amber-500/10 border-amber-500/20';
    if (grade === 'poor') return 'bg-rose-500/10 border-rose-500/20';
    return 'bg-zinc-800/50 border-zinc-800';
  };

  const formatValue = (metric: string, value: number) => {
    if (metric === 'CLS') return value.toFixed(3);
    return Math.round(value) + 'ms';
  };

  const renderSummaryCard = (
    name: string, 
    label: string, 
    icon: React.ReactNode, 
    iconColorClass: string,
    isTimeBased: boolean = true
  ) => {
    const data = getVitalScore(name);
    
    if (!data || data.sample_count < 100) {
      return (
        <div className="bg-[#0a0a0a] border border-zinc-800/60 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconColorClass}`}>
              {icon}
            </div>
            <h3 className="font-medium text-zinc-300">{label}</h3>
          </div>
          <div className="flex items-center">
            <span className="px-2 py-1 bg-zinc-800/50 text-zinc-400 text-xs rounded-md border border-zinc-800">
              Insufficient data ({data ? data.sample_count : 0} samples)
            </span>
          </div>
        </div>
      );
    }

    const grade = getGrade(name, data.p75_value);
    const gradeColor = getGradeColor(grade);
    const gradeBg = getGradeBg(grade);
    
    const formatted = isTimeBased ? Math.round(data.p75_value) : data.p75_value.toFixed(3);
    const unit = isTimeBased ? 'ms' : '';

    return (
      <div className="bg-[#0a0a0a] border border-zinc-800/60 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconColorClass}`}>
            {icon}
          </div>
          <h3 className="font-medium text-zinc-300">{label}</h3>
        </div>
        
        <div className="mt-2 flex items-end justify-between">
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-semibold ${gradeColor}`}>{formatted}</span>
            <span className="text-sm text-zinc-500">{unit}</span>
          </div>
          <div className={`px-2.5 py-1 text-xs font-medium rounded-md border capitalize ${gradeBg} ${gradeColor}`}>
            {grade.replace('-', ' ')}
          </div>
        </div>

        {/* Visual Bar Indicator */}
        <div className="mt-4 w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden flex relative">
          {name === 'CLS' ? (
             // Horizontal Threshold Bar for CLS
             <>
               <div className="h-full bg-emerald-500" style={{ width: '33.33%' }}></div>
               <div className="h-full bg-amber-500" style={{ width: '50%' }}></div>
               <div className="h-full bg-rose-500" style={{ width: '16.67%' }}></div>
               {/* Marker */}
               <div className="absolute top-0 bottom-0 w-1 bg-white border-x border-black z-10" 
                    style={{ left: `${Math.min((data.p75_value / 0.3) * 100, 100)}%` }}></div>
             </>
          ) : (
            // Gauge bar for time-based metrics
            <>
               <div className="h-full bg-emerald-500" style={{ width: '33.33%' }}></div>
               <div className="h-full bg-amber-500" style={{ width: '33.33%' }}></div>
               <div className="h-full bg-rose-500" style={{ width: '33.33%' }}></div>
               {/* Marker (normalized against upper boundary of poor roughly) */}
               <div className="absolute top-0 bottom-0 w-1 bg-white border-x border-black z-10" 
                    style={{ 
                      left: `${Math.min(
                        (data.p75_value / (name === 'INP' ? 750 : name === 'TTFB' ? 2500 : 6000)) * 100, 
                        98
                      )}%` 
                    }}></div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Process route breakdown
  const routeRows = routeVitals.map(r => {
    const lcp = r.metrics['LCP'];
    const inp = r.metrics['INP'];
    const cls = r.metrics['CLS'];
    
    // Sum samples to roughly determine route traffic (using LCP as proxy since it fires reliably)
    const samples = (lcp?.sample_count || 0) + (inp?.sample_count || 0) + (cls?.sample_count || 0);
    
    let routeGrade = 'good';
    let hasData = false;

    if (samples < 10) {
      routeGrade = 'insufficient';
    } else {
      hasData = true;
      const grades = [];
      if (lcp) grades.push(getGrade('LCP', lcp.p75_value));
      if (inp) grades.push(getGrade('INP', inp.p75_value));
      if (cls) grades.push(getGrade('CLS', cls.p75_value));

      if (grades.includes('poor')) routeGrade = 'poor';
      else if (grades.includes('needs-improvement')) routeGrade = 'needs-improvement';
    }

    return { ...r, samples, routeGrade, lcp, inp, cls, hasData };
  }).sort((a, b) => b.samples - a.samples);

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {renderSummaryCard('LCP', 'Largest Contentful Paint', <Layout className="h-4 w-4 text-emerald-400" />, 'bg-emerald-500/10')}
        {renderSummaryCard('INP', 'Interaction to Next Paint', <MousePointer2 className="h-4 w-4 text-blue-400" />, 'bg-blue-500/10')}
        {renderSummaryCard('CLS', 'Cumulative Layout Shift', <Activity className="h-4 w-4 text-amber-400" />, 'bg-amber-500/10', false)}
        {renderSummaryCard('FCP', 'First Contentful Paint', <Timer className="h-4 w-4 text-purple-400" />, 'bg-purple-500/10')}
        {renderSummaryCard('TTFB', 'Time to First Byte', <Zap className="h-4 w-4 text-pink-400" />, 'bg-pink-500/10')}
      </div>

      <div className="bg-[#0a0a0a] border border-zinc-800/60 rounded-xl overflow-hidden mb-8">
        <div className="p-5 border-b border-zinc-800/60">
          <h2 className="text-lg font-medium text-white">Vitals Overview</h2>
        </div>
        <div className="p-5 h-[300px] relative">
          {timeseries.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
              No timeseries data recorded in this window yet.
            </div>
          ) : null}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis 
                  dataKey="timestamp" 
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(unixTime) => {
                    const d = new Date(unixTime);
                    // Determine format based on timespan (roughly check if range is > 24h)
                    const range = timeseries[timeseries.length - 1].timestamp - timeseries[0].timestamp;
                    if (range > 24 * 60 * 60 * 1000) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                  }}
                  stroke="#52525b" 
                  tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                  minTickGap={30}
                />
                
                {/* Left Axis for LCP/INP (ms) */}
                <YAxis 
                  yAxisId="time" 
                  orientation="left" 
                  stroke="#52525b" 
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  tickFormatter={(val) => `${val}ms`}
                />
                
                {/* Right Axis for CLS (score) */}
                <YAxis 
                  yAxisId="score" 
                  orientation="right" 
                  stroke="#52525b" 
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  tickFormatter={(val) => val.toFixed(2)}
                  domain={[0, (dataMax: number) => Math.max(0.25, dataMax * 1.2)]}
                />
                
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                  labelFormatter={(label) => new Date(label).toLocaleString()}
                  formatter={(value: any, name: any) => {
                    if (name === 'CLS') return [Number(value).toFixed(3), name];
                    return [`${Math.round(value)}ms`, name];
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                
                <Line 
                  yAxisId="time"
                  type="monotone" 
                  dataKey="LCP.p75_value" 
                  name="LCP" 
                  stroke="#34d399" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#34d399' }}
                  connectNulls
                />
                <Line 
                  yAxisId="time"
                  type="monotone" 
                  dataKey="INP.p75_value" 
                  name="INP" 
                  stroke="#60a5fa" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#60a5fa' }}
                  connectNulls
                />
                <Line 
                  yAxisId="score"
                  type="monotone" 
                  dataKey="CLS.p75_value" 
                  name="CLS" 
                  stroke="#fbbf24" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#fbbf24' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      <div className="bg-[#0a0a0a] border border-zinc-800/60 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Route Breakdown (p75)</h2>
          <span className="text-xs text-zinc-500">Excludes TTFB & FCP</span>
        </div>
        
        {routeRows.length === 0 ? (
           <div className="p-8 text-center text-zinc-500">No route vitals recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/50 border-b border-zinc-800/60 text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Route</th>
                  <th className="px-5 py-3 font-medium">LCP</th>
                  <th className="px-5 py-3 font-medium">INP</th>
                  <th className="px-5 py-3 font-medium">CLS</th>
                  <th className="px-5 py-3 font-medium">Overall Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {routeRows.map(row => (
                  <tr key={row.route} className="hover:bg-zinc-900/30 transition-colors group">
                    <td className="px-5 py-4 font-mono text-zinc-300 group-hover:text-white">
                      {row.route || '/'}
                    </td>
                    <td className="px-5 py-4">
                      {row.lcp && row.hasData ? (
                        <span className={getGradeColor(getGrade('LCP', row.lcp.p75_value))}>
                          {formatValue('LCP', row.lcp.p75_value)}
                        </span>
                      ) : <span className="text-zinc-600">-</span>}
                    </td>
                    <td className="px-5 py-4">
                      {row.inp && row.hasData ? (
                        <span className={getGradeColor(getGrade('INP', row.inp.p75_value))}>
                          {formatValue('INP', row.inp.p75_value)}
                        </span>
                      ) : <span className="text-zinc-600">-</span>}
                    </td>
                    <td className="px-5 py-4">
                      {row.cls && row.hasData ? (
                        <span className={getGradeColor(getGrade('CLS', row.cls.p75_value))}>
                          {formatValue('CLS', row.cls.p75_value)}
                        </span>
                      ) : <span className="text-zinc-600">-</span>}
                    </td>
                    <td className="px-5 py-4">
                      {row.routeGrade === 'insufficient' ? (
                        <span className="px-2 py-1 bg-zinc-800/50 text-zinc-400 text-xs rounded-md border border-zinc-800">
                          Insufficient Data
                        </span>
                      ) : (
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-md border capitalize ${getGradeBg(row.routeGrade)} ${getGradeColor(row.routeGrade)}`}>
                          {row.routeGrade.replace('-', ' ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
