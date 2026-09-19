'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PlayCircle, Plus, Trash2, Save, FileText, CheckCircle2, AlertCircle, Filter, Activity, Server, Cpu } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function LogSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();

  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // New pipeline form
  const [name, setName] = useState('');
  const [patternType, setPatternType] = useState('regex');
  const [pattern, setPattern] = useState('');

  // Testing Sandbox
  const [testLog, setTestLog] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState('');

  useEffect(() => {
    fetchPipelines();
  }, [projectId]);

  const fetchPipelines = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/observability/projects/${projectId}/pipelines`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const addPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !pattern) return;
    try {
      setSaving(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/observability/projects/${projectId}/pipelines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, patternType, pattern })
      });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
        setName('');
        setPattern('');
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to save pipeline');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const deletePipeline = async (pipelineId: string) => {
    if (!confirm('Delete this pipeline?')) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/observability/projects/${projectId}/pipelines/${pipelineId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data.logPipelines);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const testPattern = () => {
    setTestError('');
    setTestResult(null);
    if (!pattern) return setTestError('Pattern is empty');
    if (!testLog) return setTestError('Log sample is empty');

    try {
      if (patternType === 'regex') {
        const regex = new RegExp(pattern);
        const match = testLog.match(regex);
        if (match && match.groups) {
          setTestResult(match.groups);
        } else {
          setTestError('Regex matched, but no Named Capture Groups (e.g. ?<field>...) were found.');
        }
      } else {
        setTestError('Grok testing locally in browser is not supported yet. Please save and test by sending a real log.');
      }
    } catch (e: any) {
      setTestError(e.message || 'Invalid pattern');
    }
  };

  if (loading) return <div className="p-8 text-zinc-400">Loading settings...</div>;

  return (
    <div className="min-h-screen bg-black p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="mb-6">
          <h1 className="mb-2 text-2xl font-bold text-white flex items-center gap-3">
            <Filter className="h-6 w-6 text-white" />
            Log Parsing Pipelines
          </h1>
          <p className="text-zinc-400 text-sm max-w-xl">
            Define custom Regex or Grok patterns to extract structured fields from raw text logs before they hit ClickHouse.
          </p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Col: Existing Pipelines & Add Form */}
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800/60 bg-gradient-to-b from-zinc-800/40 to-zinc-900/80 backdrop-blur-xl shadow-xl relative overflow-hidden group p-5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-all duration-700 group-hover:bg-indigo-500/10"></div>
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2 relative z-10">
              <Server className="w-5 h-5 text-white" />
              Active Pipelines
            </h2>
            <div className="space-y-4 relative z-10">
              {pipelines.length === 0 ? (
                <div className="text-sm text-zinc-500 bg-black/40 p-6 rounded-xl border border-zinc-800/60 text-center">No pipelines defined. Logs will be stored as raw text.</div>
              ) : (
                pipelines.map(p => (
                  <div key={p._id} className="p-5 rounded-xl border border-zinc-800/60 bg-black/40 flex flex-col gap-3 transition-colors hover:border-zinc-700/60">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-white text-base flex items-center gap-2">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400">{p.patternType}</span>
                        <button onClick={() => deletePipeline(p._id)} className="text-zinc-500 hover:text-red-400 transition-colors bg-zinc-900/50 hover:bg-red-500/10 p-1.5 rounded-md">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <code className="text-xs text-indigo-300/80 bg-zinc-900/80 p-3 rounded-lg block break-all font-mono border border-zinc-800/50 shadow-inner">{p.pattern}</code>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/60 bg-gradient-to-b from-zinc-800/40 to-zinc-900/80 backdrop-blur-xl shadow-xl relative overflow-hidden group p-5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-all duration-700 group-hover:bg-purple-500/10"></div>
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2 relative z-10">
              <Plus className="w-5 h-5 text-white" />
              Create New Pipeline
            </h2>
            <div className="relative z-10">
              <form onSubmit={addPipeline} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Pipeline Name</label>
                  <input required value={name} onChange={e => setName(e.target.value)} type="text" className="w-full bg-black/40 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all" placeholder="e.g. Nginx Access Logs" />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Pattern Type</label>
                  <select value={patternType} onChange={e => setPatternType(e.target.value)} className="w-full bg-black/40 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all appearance-none cursor-pointer">
                    <option value="regex">Native Regex (Named Groups)</option>
                    <option value="grok">Grok Syntax</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Pattern</label>
                  <textarea required value={pattern} onChange={e => setPattern(e.target.value)} className="w-full h-20 bg-black/40 border border-zinc-800/60 rounded-xl px-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none shadow-inner" placeholder={patternType === 'regex' ? "^(?<ip>\\S+) \\S+ \\S+ \\[(?<time>[^\\]]+)\\] \"(?<method>\\S+)" : "%{IP:client} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:timestamp}\\]"} />
                  <p className="text-[11px] text-zinc-500 mt-1.5 font-medium">
                    {patternType === 'regex' ? 'Use (?<field_name>...) syntax to extract named fields.' : 'Use %{PATTERN:field_name} syntax.'}
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-indigo-500/25">
                    <Save className="w-4 h-4" /> Save
                  </button>
                  <button type="button" onClick={testPattern} className="flex-1 flex items-center justify-center gap-2 bg-zinc-800/80 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl text-sm font-semibold border border-zinc-700/50 transition-all shadow-lg hover:shadow-zinc-900/50">
                    <PlayCircle className="w-4 h-4 text-emerald-400" /> Test
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Col: Sandbox */}
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800/60 bg-gradient-to-b from-zinc-800/40 to-zinc-900/80 backdrop-blur-xl shadow-xl relative overflow-hidden group p-5 h-full flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-all duration-700 group-hover:bg-emerald-500/10"></div>
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2 relative z-10">
              <FileText className="w-5 h-5 text-white" />
              Pipeline Sandbox
            </h2>
            <div className="relative z-10 flex-1 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Sample Raw Log Line</label>
                <textarea value={testLog} onChange={e => setTestLog(e.target.value)} className="w-full h-24 bg-black/40 border border-zinc-800/60 rounded-xl px-4 py-3 text-zinc-300 font-mono text-xs focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none shadow-inner" placeholder='127.0.0.1 - - [12/Dec/2026:10:00:00 +0000] "GET /api/users HTTP/1.1" 200' />
              </div>

              <div className="pt-6 border-t border-zinc-800/60 flex-1 flex flex-col">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Extracted JSON Result</h3>
                
                {testError && (
                  <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 flex items-start gap-3 backdrop-blur-sm shadow-sm">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-red-400/90 leading-relaxed font-medium">{testError}</div>
                  </div>
                )}

                {testResult && (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2 text-sm text-emerald-400 font-medium shadow-sm">
                      <CheckCircle2 className="w-5 h-5" /> Successfully extracted {Object.keys(testResult).length} fields!
                    </div>
                    <pre className="flex-1 p-5 rounded-xl bg-black/60 border border-zinc-800/60 text-xs text-emerald-300/90 font-mono overflow-auto max-h-[400px] shadow-inner">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </div>
                )}

                {!testError && !testResult && (
                  <div className="flex-1 p-8 rounded-xl border border-dashed border-zinc-700/50 bg-black/20 flex flex-col items-center justify-center text-center min-h-[200px]">
                    <Activity className="w-8 h-8 text-zinc-700 mb-3" />
                    <div className="text-zinc-500 text-sm font-medium max-w-[200px]">Hit "Test Pattern" to see the extracted JSON structure before saving.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
    </div>
  );
}
