"use client";

import { useEffect, useState, useMemo, use } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// FlamegraphRenderer needs to be imported dynamically since it relies on window/document
const FlamegraphRenderer = dynamic(
  () => import('@pyroscope/flamegraph').then((mod) => mod.FlamegraphRenderer),
  { ssr: false, loading: () => <div>Loading flamegraph...</div> }
);

import '@pyroscope/flamegraph/dist/index.css';

export default function ProfilingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serviceName, setServiceName] = useState('go-profiler-test');
  
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
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/profiles/flamegraph?projectId=${projectId}&serviceName=${serviceName}&startTime=${start.toISOString()}&endTime=${end.toISOString()}`, {
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
  }, [projectId, serviceName]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Continuous Profiling</h1>
          <p className="text-muted-foreground mt-2">
            Analyze CPU flamegraphs to find performance bottlenecks in your code.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Select value={serviceName} onValueChange={setServiceName}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="go-profiler-test">go-profiler-test (Demo)</SelectItem>
              <SelectItem value="frontend">frontend</SelectItem>
              <SelectItem value="backend">backend</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={fetchProfile} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <Card className="p-6 min-h-[600px] flex flex-col">
        {loading && <div className="text-center py-10">Loading profile data...</div>}
        
        {error && !loading && (
          <div className="text-center text-red-500 py-10">{error}</div>
        )}
        
        {!loading && !error && profile && (
          <div className="flex-1 w-full relative">
            <FlamegraphRenderer
              profile={profile}
              colorMode="dark"
            />
          </div>
        )}
      </Card>
    </div>
  );
}
