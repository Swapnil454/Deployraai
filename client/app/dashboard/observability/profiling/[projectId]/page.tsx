"use client";

import { useEffect, useState, useMemo, use, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layers, HardDrive, RefreshCw, Activity, Cpu, ChevronDown } from 'lucide-react';
import * as d3 from 'd3';
import flamegraph from 'd3-flame-graph';
import './d3-flamegraph.css';
import { ProfilingTable } from '@/components/observability/ProfilingTable';
import { Table, Flame, AlertCircle, Terminal, Copy, Check, ExternalLink } from 'lucide-react';

function D3Flamegraph({ data, profileType }: { data: any, profileType: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && data) {
      ref.current.innerHTML = ''; // clear previous
      
      // dynamically get width of container to make it responsive
      const containerWidth = ref.current.clientWidth || 1200;
      
      const chart = flamegraph()
        .width(containerWidth)
        .cellHeight(26)
        .transitionDuration(750)
        .minFrameSize(1)
        .transitionEase(d3.easeCubic)
        .sort(true)
        .setColorMapper((d: any, originalColor: string) => {
          const name = d.data.n || d.data.name || '';
          let hash = 0;
          for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
          }
          
          if (profileType === 'memory') {
            // Enterprise Cool colors (Blues/Teals/Indigos) for Memory
            const h = Math.abs(hash % 60) + 200; // 200-260 range
            const s = 65 + Math.abs(hash % 25);
            const l = 45 + Math.abs(hash % 15);
            return `hsl(${h}, ${s}%, ${l}%)`;
          } else {
            // Enterprise Warm colors (Reds/Oranges/Yellows) for CPU (like reference)
            const h = Math.abs(hash % 45); // 0-45 range
            const s = 75 + Math.abs(hash % 25);
            const l = 45 + Math.abs(hash % 15);
            return `hsl(${h}, ${s}%, ${l}%)`;
          }
        })
        .title("");

      d3.select(ref.current).datum(data).call(chart);
    }
  }, [data, profileType]);

  return (
    <div className="w-full h-full relative group">
      <style>{`
        .d3-flame-graph rect {
          stroke: #09090b !important;
          stroke-width: 1.5px !important;
          rx: 3px;
          ry: 3px;
          transition: all 0.2s ease-in-out;
          cursor: pointer;
        }
        .d3-flame-graph rect:hover {
          opacity: 0.85;
          stroke: #ffffff !important;
          stroke-width: 1.5px !important;
          filter: brightness(1.2);
        }
        .d3-flame-graph text {
          fill: #ffffff !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
          font-size: 11.5px !important;
          font-weight: 500;
          pointer-events: none;
          text-shadow: 0 1px 3px rgba(0,0,0,0.6);
        }
        .d3-flame-graph-tip {
          background: rgba(9, 9, 11, 0.95) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 8px !important;
          color: #fff !important;
          padding: 8px 12px !important;
          font-family: inherit !important;
          font-size: 12px !important;
          backdrop-filter: blur(12px) !important;
          z-index: 100 !important;
          box-shadow: 0 10px 40px -10px rgba(0,0,0,0.5) !important;
        }
      `}</style>
      <div ref={ref} className="w-full h-full overflow-y-auto px-2 py-4" />
    </div>
  );
}

export default function ProfilingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [serviceName, setServiceName] = useState('');
  const [profileType, setProfileType] = useState('cpu');
  const [viewMode, setViewMode] = useState<'table' | 'flamegraph'>('table');
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  // Fetch available services for this project
  useEffect(() => {
    async function fetchServices() {
      if (!projectId) return;
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/profiles/services?projectId=${projectId}`, {
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableServices(data.services || []);
          if (data.services && data.services.length > 0) {
            setServiceName(data.services[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch profiling services", err);
      }
    }
    fetchServices();
  }, [projectId]);
  
  const fetchProfile = async () => {
    if (!projectId || !serviceName) {
      if (!serviceName && !loading && availableServices.length === 0) {
        setError('No services have emitted profiling data yet.');
      }
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
        setProfile(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId && serviceName) {
      fetchProfile();
    }
  }, [projectId, serviceName, profileType]);
  if (availableServices.length === 0) {
    return (
      <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-indigo-400" />
            Continuous Profiling
          </h1>
          <p className="text-zinc-400 mt-2 max-w-2xl text-sm leading-relaxed">
            Discover performance bottlenecks, optimize resource usage, and lower cloud costs with production-grade CPU and Memory flamegraphs.
          </p>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl">
          <div className="border-b border-zinc-800/60 bg-zinc-900/40 p-6 lg:p-8">
            <h3 className="text-xl font-semibold text-white mb-2">Connect Your Profiler</h3>
            <p className="text-zinc-400 text-sm">Send standard pprof profiles to the ingestor to automatically generate Flamegraphs.</p>
          </div>

          <div className="p-6 lg:p-8 space-y-8">
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs">1</div>
                Node.js (Using pprof)
              </h4>
              <div className="bg-black border border-zinc-800/80 rounded-lg p-4 font-mono text-sm overflow-x-auto text-zinc-300">
                <div className="text-zinc-500 mb-2"># Install pprof package</div>
                <div className="text-zinc-300">npm install @datadog/pprof</div>
                <br/>
                <div className="text-zinc-500 mb-2">// In your application startup</div>
                <div className="text-indigo-400">const pprof = require('@datadog/pprof');</div>
                <div className="text-indigo-400">const axios = require('axios');</div>
                <br/>
                <div>setInterval(async () =&gt; {'{'}</div>
                <div className="pl-4">const profile = await pprof.time.profile({'{'} durationMillis: 10000 {'}'});</div>
                <div className="pl-4">const buf = await pprof.encode(profile);</div>
                <div className="pl-4 mt-2 text-zinc-500">// Send to DeployRAAI Ingestor</div>
                <div className="pl-4">await axios.post('https://deployraai-ingestor.yourdomain.com/v1/profiles', buf, {'{'}</div>
                <div className="pl-8">headers: {'{'}</div>
                <div className="pl-12">'x-project-id': '{projectId}',</div>
                <div className="pl-12">'x-service-name': 'my-node-service',</div>
                <div className="pl-12">'x-profile-type': 'cpu',</div>
                <div className="pl-12">'Content-Type': 'application/octet-stream'</div>
                <div className="pl-8">{'}'}</div>
                <div className="pl-4">{'}'});</div>
                <div>{'}'}, 60000);</div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-800/60">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs">2</div>
                Golang (Using net/http/pprof)
              </h4>
              <div className="bg-black border border-zinc-800/80 rounded-lg p-4 font-mono text-sm overflow-x-auto text-zinc-300">
                <div className="text-zinc-500 mb-2">// Send a local pprof buffer to the ingestor periodically</div>
                <div className="text-indigo-400">import "runtime/pprof"</div>
                <br/>
                <div>func captureAndSendProfile() {'{'}</div>
                <div className="pl-4">var buf bytes.Buffer</div>
                <div className="pl-4">pprof.StartCPUProfile(&amp;buf)</div>
                <div className="pl-4">time.Sleep(10 * time.Second)</div>
                <div className="pl-4">pprof.StopCPUProfile()</div>
                <br/>
                <div className="pl-4">req, _ := http.NewRequest("POST", "https://deployraai-ingestor.yourdomain.com/v1/profiles", &amp;buf)</div>
                <div className="pl-4">req.Header.Set("x-project-id", "{projectId}")</div>
                <div className="pl-4">req.Header.Set("x-service-name", "my-go-service")</div>
                <div className="pl-4">req.Header.Set("x-profile-type", "cpu")</div>
                <div className="pl-4">req.Header.Set("Content-Type", "application/octet-stream")</div>
                <div className="pl-4">http.DefaultClient.Do(req)</div>
                <div>{'}'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-white" />
            Continuous Profiling
          </h1>
          <p className="text-zinc-400 mt-2 max-w-xl text-sm leading-relaxed">
            Analyze {profileType === 'cpu' ? 'CPU' : 'Memory'} flamegraphs to find performance bottlenecks in your code.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-zinc-900/40 p-1.5 rounded-xl border border-zinc-800/60 backdrop-blur-xl shadow-lg relative z-50">
          
          {/* Custom Toggle for Profile Type */}
          <div className="flex items-center bg-zinc-950/80 rounded-lg p-0.5 border border-zinc-800/50 shadow-inner">
            <button
              onClick={() => setProfileType('cpu')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                profileType === 'cpu' 
                  ? 'bg-indigo-500/10 text-indigo-400 shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Cpu className="w-4 h-4" />
              CPU
            </button>
            <button
              onClick={() => setProfileType('memory')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                profileType === 'memory' 
                  ? 'bg-indigo-500/10 text-indigo-400 shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              Memory
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-800/60 mx-0.5"></div>

          {/* Custom Built Service Selector */}
          <div className="relative w-[220px]" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between w-full h-9 px-3 bg-zinc-950/80 border border-zinc-800/50 rounded-md text-sm text-zinc-100 hover:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 shadow-inner transition-colors"
            >
              <span className="truncate">
                {serviceName}
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-full bg-zinc-900 border border-zinc-700/80 rounded-md shadow-xl overflow-hidden z-50 backdrop-blur-2xl">
                {availableServices.map((svc) => (
                  <button
                    key={svc}
                    onClick={() => {
                      setServiceName(svc);
                      setIsDropdownOpen(false);
                    }}
                    className={`flex items-center w-full px-3 py-2 text-sm transition-colors ${
                      serviceName === svc 
                        ? 'bg-indigo-500/10 text-indigo-400 font-medium' 
                        : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                    }`}
                  >
                    {svc}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <Button 
            onClick={fetchProfile} 
            variant="outline" 
            size="sm"
            disabled={loading}
            className="h-9 bg-zinc-950/80 border-zinc-800/50 hover:bg-zinc-900 hover:text-white transition-all shadow-inner text-zinc-300"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin text-indigo-400' : 'text-zinc-400'}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <div className="h-6 w-px bg-zinc-800/60 mx-0.5"></div>

          <div className="flex items-center bg-zinc-950/80 rounded-lg p-0.5 border border-zinc-800/50 shadow-inner">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center justify-center p-1.5 rounded-md transition-all duration-200 ${
                viewMode === 'table' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title="Table View"
            >
              <Table className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('flamegraph')}
              className={`flex items-center justify-center p-1.5 rounded-md transition-all duration-200 ${
                viewMode === 'flamegraph' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title="Flamegraph View"
            >
              <Flame className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-[600px] flex flex-col bg-zinc-950/40 border border-zinc-800/40 rounded-xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl">
        {loading && (
          <div className="flex-1 w-full p-6 animate-pulse">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-8 w-32 bg-zinc-800/50 rounded-md"></div>
              <div className="h-8 w-40 bg-zinc-800/50 rounded-md"></div>
            </div>
            <div className="h-10 w-full bg-zinc-800/50 rounded-md mb-4"></div>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex justify-between items-center py-4 border-b border-zinc-800/40">
                <div className="h-5 bg-zinc-800/50 rounded w-1/3"></div>
                <div className="h-5 bg-zinc-800/50 rounded w-1/4"></div>
                <div className="h-5 bg-zinc-800/50 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        )}
        
        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">No Profiling Data</h3>
            <p className="text-zinc-400 max-w-md mx-auto">{error}</p>
            <Button 
              onClick={fetchProfile} 
              variant="outline"
              className="mt-6 bg-zinc-900 border-zinc-700 hover:bg-zinc-800"
            >
              <RefreshCw className="w-4 h-4 mr-2 text-zinc-400" />
              Try Again
            </Button>
          </div>
        )}
        
        {!loading && !error && profile && (
          <div className="flex-1 w-full relative">
            {viewMode === 'table' ? (
              <ProfilingTable data={profile} profileType={profileType} />
            ) : (
              <D3Flamegraph data={profile} profileType={profileType} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
