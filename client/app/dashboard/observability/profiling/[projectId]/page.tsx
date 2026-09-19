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
import { Table, Flame, AlertCircle, Terminal, Copy, Check, ExternalLink, Wand2, Loader2, CheckCircle2 } from 'lucide-react';

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
  
  const [aiState, setAiState] = useState<'idle' | 'analyzing' | 'review' | 'injecting' | 'success'>('idle');
  const [prUrl, setPrUrl] = useState('');
  const [prBranch, setPrBranch] = useState('');
  const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
  const [aiError, setAiError] = useState('');
  
  const [activeSetupTab, setActiveSetupTab] = useState<'node' | 'go' | 'python' | 'java'>('node');

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

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Fetch available services for this project
  const checkServices = async (isManualVerify = false) => {
    if (!projectId) return false;
    
    if (isManualVerify) {
      setIsVerifying(true);
      setVerifyError('');
    }
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/profiles/services?projectId=${projectId}`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        const services = data.services || [];
        setAvailableServices(services);
        
        if (services.length > 0) {
          setServiceName(services[0]);
          if (isManualVerify) setIsVerifying(false);
          return true;
        } else if (isManualVerify) {
          setVerifyError('No profiling data received yet. Did you deploy your changes?');
        }
      }
    } catch (err) {
      console.error("Failed to fetch profiling services", err);
      if (isManualVerify) setVerifyError('Failed to check connection. Try again.');
    }
    
    if (isManualVerify) setIsVerifying(false);
    return false;
  };

  useEffect(() => {
    checkServices();
  }, [projectId]);

  const handleAutoInject = async () => {
    setAiState('analyzing');
    setAiError('');
    try {
      // Artificial delay for UI feel
      await new Promise(r => setTimeout(r, 1500));
      setAiState('injecting');
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${projectId}/profiling/auto-inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to auto-inject profiling');
      
      setPrUrl(data.prUrl);
      setPrBranch(data.branch);
      setModifiedFiles(data.files || []);
      setAiState('success');
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'An unexpected error occurred');
      setAiState('idle');
    }
  };
  
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
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Connect Your Profiler</h3>
                <p className="text-zinc-400 text-sm">Send standard pprof profiles to the ingestor to automatically generate Flamegraphs.</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => checkServices(true)}
                  disabled={isVerifying}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Verify Connection
                </button>
                <button 
                  onClick={handleAutoInject}
                  disabled={aiState !== 'idle'}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {aiState === 'idle' ? (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Auto Inject (AI)
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {aiState === 'analyzing' ? 'Analyzing Backend...' : 'Generating PR...'}
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {verifyError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {verifyError}
              </div>
            )}
            
            {aiError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {aiError}
              </div>
            )}
            
            {aiState === 'success' && (
              <div className="mt-6 bg-green-500/10 border border-green-500/20 rounded-lg p-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-4 text-green-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-white font-semibold text-lg mb-2">Pull Request Created!</h4>
                <p className="text-green-400/80 text-sm mb-6 max-w-md">
                  DeployAI has successfully generated the code to instrument profiling and opened a PR on your repository.
                </p>
                <div className="flex gap-4">
                  <a 
                    href={prUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-md font-medium text-sm flex items-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Review Pull Request
                  </a>
                  <button 
                    onClick={() => {
                      setAiState('idle');
                      setPrUrl('');
                      setAiError('');
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-md font-medium text-sm transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 lg:p-8 space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-zinc-800/60">
              <div className="flex items-center gap-2 text-zinc-500 text-[13px] font-medium mr-4">
                <Terminal className="h-4 w-4" />
                MANUAL SETUP
              </div>
              
              <div className="flex bg-zinc-900 rounded-md p-1 border border-zinc-800">
                <button 
                  onClick={() => setActiveSetupTab('node')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-sm transition-colors ${activeSetupTab === 'node' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Node.js
                </button>
                <button 
                  onClick={() => setActiveSetupTab('go')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-sm transition-colors ${activeSetupTab === 'go' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Go
                </button>
                <button 
                  onClick={() => setActiveSetupTab('python')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-sm transition-colors ${activeSetupTab === 'python' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Python
                </button>
                <button 
                  onClick={() => setActiveSetupTab('java')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-sm transition-colors ${activeSetupTab === 'java' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Java
                </button>
              </div>
            </div>

            {activeSetupTab === 'node' && (
              <div className="space-y-4">
                <div className="bg-black border border-zinc-800/80 rounded-lg p-4 font-mono text-sm overflow-x-auto text-zinc-300">
                  <div className="text-zinc-500 mb-2"># Install pprof package</div>
                  <div className="text-zinc-300">npm install @datadog/pprof axios</div>
                  <br/>
                  <div className="text-zinc-500 mb-2">// In your application startup (e.g., server.js or index.js)</div>
                  <div className="text-indigo-400">const pprof = require('@datadog/pprof');</div>
                  <div className="text-indigo-400">const axios = require('axios');</div>
                  <br/>
                  <div className="text-zinc-500 mb-2">// Wrap in an async IIFE to trigger periodically</div>
                  <div>(async function startProfiling() {'{'}</div>
                  <div className="pl-4">async function captureAndSend() {'{'}</div>
                  <div className="pl-8 text-zinc-500">// 1. Capture CPU Profile</div>
                  <div className="pl-8">const cpuProfile = await pprof.time.profile({'{'} durationMillis: 10000 {'}'});</div>
                  <div className="pl-8">const cpuBuf = await pprof.encode(cpuProfile);</div>
                  <div className="pl-8">await sendToIngestor(cpuBuf, 'cpu');</div>
                  <br/>
                  <div className="pl-8 text-zinc-500">// 2. Capture Memory (Heap) Profile</div>
                  <div className="pl-8">const heapProfile = await pprof.heap.profile();</div>
                  <div className="pl-8">const heapBuf = await pprof.encode(heapProfile);</div>
                  <div className="pl-8">await sendToIngestor(heapBuf, 'memory');</div>
                  <div className="pl-4">{'}'}</div>
                  <br/>
                  <div className="pl-4 text-zinc-500">// Start heap profiler before capturing</div>
                  <div className="pl-4">pprof.heap.start(512 * 1024, 64);</div>
                  <br/>
                  <div className="pl-4">async function sendToIngestor(buf, type) {'{'}</div>
                  <div className="pl-8">await axios.post('https://deployraai-56i8.onrender.com/v1/profiles', buf, {'{'}</div>
                  <div className="pl-12">headers: {'{'}</div>
                  <div className="pl-16">'x-project-id': '{projectId}',</div>
                  <div className="pl-16">'x-service-name': 'my-node-service',</div>
                  <div className="pl-16">'x-profile-type': type,</div>
                  <div className="pl-16">'Content-Type': 'application/octet-stream'</div>
                  <div className="pl-12">{'}'}</div>
                  <div className="pl-8">{'}'});</div>
                  <div className="pl-4">{'}'}</div>
                  <br/>
                  <div className="pl-4">await captureAndSend(); // Trigger first profiles immediately</div>
                  <div className="pl-4">setInterval(captureAndSend, 60000);</div>
                  <div>{'}'})();</div>
                </div>
              </div>
            )}

            {activeSetupTab === 'go' && (
              <div className="space-y-4">
                <div className="bg-black border border-zinc-800/80 rounded-lg p-4 font-mono text-sm overflow-x-auto text-zinc-300">
                  <div className="text-zinc-500 mb-2">// Send local pprof buffers to the ingestor periodically</div>
                  <div className="text-indigo-400">import (</div>
                  <div className="text-indigo-400 pl-4">"bytes"</div>
                  <div className="text-indigo-400 pl-4">"net/http"</div>
                  <div className="text-indigo-400 pl-4">"runtime/pprof"</div>
                  <div className="text-indigo-400 pl-4">"time"</div>
                  <div className="text-indigo-400">)</div>
                  <br/>
                  <div>func captureAndSendProfiles() {'{'}</div>
                  <div className="pl-4 text-zinc-500">// 1. Capture CPU</div>
                  <div className="pl-4">var cpuBuf bytes.Buffer</div>
                  <div className="pl-4">pprof.StartCPUProfile(&amp;cpuBuf)</div>
                  <div className="pl-4">time.Sleep(10 * time.Second)</div>
                  <div className="pl-4">pprof.StopCPUProfile()</div>
                  <div className="pl-4">sendToIngestor(&amp;cpuBuf, "cpu")</div>
                  <br/>
                  <div className="pl-4 text-zinc-500">// 2. Capture Memory (Heap)</div>
                  <div className="pl-4">var heapBuf bytes.Buffer</div>
                  <div className="pl-4">pprof.WriteHeapProfile(&amp;heapBuf)</div>
                  <div className="pl-4">sendToIngestor(&amp;heapBuf, "memory")</div>
                  <div>{'}'}</div>
                  <br/>
                  <div>func sendToIngestor(buf *bytes.Buffer, profileType string) {'{'}</div>
                  <div className="pl-4">req, _ := http.NewRequest("POST", "https://deployraai-56i8.onrender.com/v1/profiles", buf)</div>
                  <div className="pl-4">req.Header.Set("x-project-id", "{projectId}")</div>
                  <div className="pl-4">req.Header.Set("x-service-name", "my-go-service")</div>
                  <div className="pl-4">req.Header.Set("x-profile-type", profileType)</div>
                  <div className="pl-4">req.Header.Set("Content-Type", "application/octet-stream")</div>
                  <div className="pl-4">http.DefaultClient.Do(req)</div>
                  <div>{'}'}</div>
                  <br/>
                  <div className="text-zinc-500 mb-2">// Call in your main()</div>
                  <div>func main() {'{'}</div>
                  <div className="pl-4 text-indigo-400">go func() {'{'}</div>
                  <div className="pl-8 text-indigo-400">for {'{'}</div>
                  <div className="pl-12 text-indigo-400">captureAndSendProfiles()</div>
                  <div className="pl-12 text-indigo-400">time.Sleep(50 * time.Second)</div>
                  <div className="pl-8 text-indigo-400">{'}'}</div>
                  <div className="pl-4 text-indigo-400">{'}'}()</div>
                  <div>{'}'}</div>
                </div>
              </div>
            )}

            {activeSetupTab === 'python' && (
              <div className="space-y-4">
                <div className="bg-black border border-zinc-800/80 rounded-lg p-4 font-mono text-sm overflow-x-auto text-zinc-300">
                  <div className="text-zinc-500 mb-2"># Install requirements</div>
                  <div className="text-zinc-300">pip install yappi requests</div>
                  <br/>
                  <div className="text-zinc-500 mb-2"># In your main.py or app.py</div>
                  <div className="text-indigo-400">import yappi</div>
                  <div className="text-indigo-400">import requests</div>
                  <div className="text-indigo-400">import threading</div>
                  <div className="text-indigo-400">import time</div>
                  <br/>
                  <div>def profile_loop():</div>
                  <div className="pl-4">while True:</div>
                  <div className="pl-8">yappi.start()</div>
                  <div className="pl-8">time.sleep(10)</div>
                  <div className="pl-8">yappi.stop()</div>
                  <br/>
                  <div className="pl-8">stats = yappi.get_func_stats()</div>
                  <div className="pl-8 text-zinc-500"># Convert stats to standard format or just send raw output</div>
                  <div className="pl-8">raw_data = stats.as_string()</div>
                  <br/>
                  <div className="pl-8">requests.post(</div>
                  <div className="pl-12">'https://deployraai-56i8.onrender.com/v1/profiles',</div>
                  <div className="pl-12">data=raw_data,</div>
                  <div className="pl-12">headers={'{'}</div>
                  <div className="pl-16">'x-project-id': '{projectId}',</div>
                  <div className="pl-16">'x-service-name': 'my-python-service',</div>
                  <div className="pl-16">'x-profile-type': 'cpu',</div>
                  <div className="pl-16">'Content-Type': 'application/octet-stream'</div>
                  <div className="pl-12">{'}'}</div>
                  <div className="pl-8">)</div>
                  <div className="pl-8">yappi.clear_stats()</div>
                  <div className="pl-8">time.sleep(50)</div>
                  <br/>
                  <div className="text-zinc-500 mb-2"># Start in background on app startup</div>
                  <div>threading.Thread(target=profile_loop, daemon=True).start()</div>
                </div>
              </div>
            )}

            {activeSetupTab === 'java' && (
              <div className="space-y-4">
                <div className="bg-black border border-zinc-800/80 rounded-lg p-4 font-mono text-sm overflow-x-auto text-zinc-300">
                  <div className="text-zinc-500 mb-2">// Using Java Flight Recorder (JFR) + Jcmd</div>
                  <div className="text-zinc-300 mb-4">
                    // Simply start your Java app with JFR enabled and write a shell script<br/>
                    // to periodically dump the profile and HTTP POST it.
                  </div>
                  
                  <div className="text-zinc-500 mb-2"># 1. Start your java app</div>
                  <div>java -XX:StartFlightRecording=disk=true,dumponexit=true,filename=profile.jfr -jar app.jar</div>
                  <br/>
                  <div className="text-zinc-500 mb-2"># 2. Run this cron/script</div>
                  <div>PID=$(jcmd | grep app.jar | awk '{'{'}print $1{'}'}')</div>
                  <div>jcmd $PID JFR.dump name=1 filename=current.jfr</div>
                  <br/>
                  <div>curl -X POST https://deployraai-56i8.onrender.com/v1/profiles \</div>
                  <div className="pl-4">-H "x-project-id: {projectId}" \</div>
                  <div className="pl-4">-H "x-service-name: my-java-service" \</div>
                  <div className="pl-4">-H "x-profile-type: cpu" \</div>
                  <div className="pl-4">-H "Content-Type: application/octet-stream" \</div>
                  <div className="pl-4">--data-binary @current.jfr</div>
                </div>
              </div>
            )}
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
