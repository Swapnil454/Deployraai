"use client";

import { useEffect, useState, useMemo, use, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layers, HardDrive } from 'lucide-react';
import * as d3 from 'd3';
import flamegraph from 'd3-flame-graph';
import './d3-flamegraph.css';
import { ProfilingTable } from '@/components/observability/ProfilingTable';
import { Table, Flame } from 'lucide-react';

function D3Flamegraph({ data }: { data: any }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && data) {
      ref.current.innerHTML = ''; // clear previous
      
      const chart = flamegraph()
        .width(1200)
        .cellHeight(24)
        .transitionDuration(750)
        .minFrameSize(5)
        .transitionEase(d3.easeCubic)
        .sort(true)
        .getName((d: any) => {
          const name = d.data.n || d.data.name;
          const val = d.value || d.v || d.data.value || 0;
          const rootVal = data.value || val;
          const pct = rootVal > 0 ? (val / rootVal) * 100 : 0;
          return `${name} (${val.toLocaleString()} samples, ${pct.toFixed(1)}%)`;
        })
        .title("")
        .selfValue(false);

      d3.select(ref.current).datum(data).call(chart);
    }
  }, [data]);

  return <div ref={ref} className="w-full h-full overflow-y-auto" />;
}

export default function ProfilingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serviceName, setServiceName] = useState('go-profiler-test');
  const [profileType, setProfileType] = useState('cpu');
  const [viewMode, setViewMode] = useState<'table' | 'flamegraph'>('table');
  
  const fetchProfile = async () => {
    if (!projectId) {
      setError('No project selected');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // 30 min window
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 60 * 1000);
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/profiles/flamegraph?projectId=${projectId}&serviceName=${serviceName}&profileType=${profileType}&startTime=${start.toISOString()}&endTime=${end.toISOString()}`, {
        credentials: "include"
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch profile: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (!data || data.value === 0) {
        setError('No profiling data found for this service in the last 30 minutes.');
        setProfile(null);
      } else {
        // Pyroscope renderer expects the standard flamegraph JSON node format
        // Our backend generates exactly this format.
        setProfile(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchProfile();
    }
  }, [projectId, serviceName, profileType]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Continuous Profiling</h1>
          <p className="text-muted-foreground mt-2">
            Analyze {profileType === 'cpu' ? 'CPU' : 'Memory'} flamegraphs to find performance bottlenecks in your code.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          
          {/* Custom Toggle for Profile Type */}
          <div className="flex items-center p-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg">
            <button
              onClick={() => setProfileType('cpu')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                profileType === 'cpu' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              CPU
            </button>
            <button
              onClick={() => setProfileType('memory')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                profileType === 'memory' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-white'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              Memory
            </button>
          </div>

          <div className="relative">
            <select
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="flex h-10 w-[220px] appearance-none items-center justify-between rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 pr-8 text-sm text-white focus:outline-none"
            >
              <option value="go-profiler-test">go-profiler-test (Demo)</option>
              <option value="frontend">frontend</option>
              <option value="backend">backend</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          <Button onClick={fetchProfile} variant="outline" disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>

          <div className="flex items-center space-x-2 border-l border-white/10 pl-4 ml-2">
            <Button 
              variant={viewMode === 'table' ? 'secondary' : 'ghost'} 
              size="sm" 
              onClick={() => setViewMode('table')}
              className="gap-2"
            >
              <Table className="w-4 h-4" /> Table
            </Button>
            <Button 
              variant={viewMode === 'flamegraph' ? 'secondary' : 'ghost'} 
              size="sm" 
              onClick={() => setViewMode('flamegraph')}
              className="gap-2"
            >
              <Flame className="w-4 h-4" /> Flamegraph
            </Button>
          </div>
        </div>
      </div>

      <Card className="p-6 min-h-[600px] flex flex-col">
        {loading && <div className="text-center py-10">Loading profile data...</div>}
        
        {error && !loading && (
          <div className="text-center text-red-500 py-10">{error}</div>
        )}
        
        
        {!loading && !error && profile && (
          <div className="flex-1 w-full relative">
            {viewMode === 'table' ? (
              <ProfilingTable data={profile} profileType={profileType} />
            ) : (
              <D3Flamegraph data={profile} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
