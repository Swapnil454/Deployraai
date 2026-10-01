const fs = require('fs');

const content = `"use client";

import { useState } from 'react';
import { Check, Copy, Terminal, ExternalLink, Loader2, ArrowRight, Play, Eye } from 'lucide-react';

export function ObservabilitySetup({ 
  project, 
  onVerified 
}: { 
  project: any, 
  onVerified: () => void 
}) {
  const [copiedBackend, setCopiedBackend] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  
  // Tabs for different framework instructions
  const [activeTab, setActiveTab] = useState<'next' | 'express'>('next');
  
  // AI Flow States: idle -> analyzing -> review -> injecting -> success
  const [aiState, setAiState] = useState<'idle' | 'analyzing' | 'review' | 'injecting' | 'success'>('idle');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [injectResult, setInjectResult] = useState<any>(null);
  const [aiError, setAiError] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyError('');
    try {
      const res = await fetch(\`\${apiUrl}/api/projects/\${project._id}/analytics/verify\`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        onVerified();
      } else {
        setVerifyError(data.message || "Verification failed. Please ensure your backend is deployed and receiving traffic.");
      }
    } catch (err: any) {
      setVerifyError(err.message || "An error occurred during verification.");
    } finally {
      setVerifying(false);
    }
  };

  const handleAnalyze = async () => {
    setAiState('analyzing');
    setAiError('');
    try {
      const res = await fetch(\`\${apiUrl}/api/projects/\${project._id}/observability/analyze\`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok) {
        setAnalysisResult(data);
        setAiState('review');
      } else {
        setAiError(data.error || "Failed to analyze project.");
        setAiState('idle');
      }
    } catch (err: any) {
      setAiError(err.message);
      setAiState('idle');
    }
  };

  const handleAutoInject = async () => {
    setAiState('injecting');
    setAiError('');
    try {
      const res = await fetch(\`\${apiUrl}/api/projects/\${project._id}/observability/auto-inject\`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok) {
        setInjectResult({ success: true, ...data });
        setAiState('success');
      } else {
        setAiError(data.error || "Failed to auto inject.");
        setAiState('review');
      }
    } catch (err: any) {
      setAiError(err.message);
      setAiState('review');
    }
  };

  return (
    <div className="bg-black border border-zinc-800 rounded-lg overflow-hidden">
      <div className="border-b border-zinc-800 bg-[#111] p-6 lg:p-8">
        <h3 className="text-xl font-semibold text-white mb-2">Setup Observability SDK</h3>
        <p className="text-zinc-400 text-[14px]">Install the Tracepilot SDK to collect Traces, Logs, and Infrastructure metrics.</p>
      </div>

      <div className="p-6 lg:p-8">
        
        {/* Manual Instructions */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-500 text-[13px] font-medium">
            <Terminal className="h-4 w-4" />
            MANUAL SETUP
          </div>
          
          <div className="flex bg-zinc-900 rounded-md p-1 border border-zinc-800">
            <button 
              onClick={() => setActiveTab('next')}
              className={\`px-4 py-1.5 text-xs font-medium rounded-sm transition-colors \${activeTab === 'next' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}\`}
            >
              Next.js
            </button>
            <button 
              onClick={() => setActiveTab('express')}
              className={\`px-4 py-1.5 text-xs font-medium rounded-sm transition-colors \${activeTab === 'express' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}\`}
            >
              Node.js / Express
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#111] border border-zinc-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">1</div>
              <h4 className="text-white font-medium">Install SDK</h4>
            </div>
            <p className="text-[13px] text-zinc-400 mb-4 flex-1">Install the tracepilot package using npm, yarn, or pnpm.</p>
            
            <div className="bg-black border border-zinc-800 rounded-md overflow-hidden mt-auto">
              <div className="flex items-center bg-[#1a1a1a] px-3 py-2 border-b border-zinc-800">
                <span className="text-[12px] text-zinc-400 font-medium bg-zinc-800/50 px-2 py-0.5 rounded">Terminal</span>
                <button onClick={() => {
                  navigator.clipboard.writeText(\`npm install @swapnil454/tracepilot\`);
                  setCopiedBackend(true);
                  setTimeout(() => setCopiedBackend(false), 2000);
                }} className="ml-auto text-zinc-400 hover:text-white transition-colors">
                  {copiedBackend ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="p-3 overflow-x-auto text-[12px] font-mono text-zinc-300 whitespace-nowrap">
                npm install @swapnil454/tracepilot
              </div>
            </div>
          </div>

          <div className="bg-[#111] border border-zinc-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">2</div>
              <h4 className="text-white font-medium">Configure SDK</h4>
            </div>
            <p className="text-[13px] text-zinc-400 mb-4 flex-1">
              {activeTab === 'next' ? (
                <span>Create an <code>instrumentation.ts</code> file in the root of your project.</span>
              ) : (
                <span>Add this to the very top of your <code>index.js</code> or <code>app.js</code> file.</span>
              )}
            </p>
            
            <div className="bg-black border border-zinc-800 rounded-md overflow-hidden mt-auto">
               <div className="p-3 text-[12px] font-mono text-zinc-300 leading-loose">
                 {activeTab === 'next' ? (
                   <>
                     <span className="text-purple-400">instrumentation.ts:</span><br/>
                     import &#123; registerOTel &#125; from '@swapnil454/tracepilot/next';<br/>
                     export function register() &#123; registerOTel(); &#125;
                   </>
                 ) : (
                   <>
                     <span className="text-purple-400">index.js:</span><br/>
                     const &#123; registerOTel &#125; = require('@swapnil454/tracepilot/node');<br/>
                     registerOTel();
                   </>
                 )}
               </div>
            </div>
          </div>

          <div className="bg-[#111] border border-zinc-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">3</div>
              <h4 className="text-white font-medium">Deploy & Verify</h4>
            </div>
            <p className="text-[13px] text-zinc-400 leading-relaxed mb-6 flex-1">
              Deploy your changes and visit the deployment to start collecting traces and logs.<br/>
            </p>
            <div className="mt-auto">
              <button 
                onClick={handleVerify} 
                disabled={verifying}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-md transition-colors text-[13px]"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {verifying ? 'Verifying...' : 'Verify Installation'}
              </button>
              {verifyError && (
                <div className="mt-4 text-red-400 text-[13px] bg-red-500/10 p-2 px-3 rounded-md border border-red-500/20 text-center">
                  {verifyError}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-8 mt-6 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 mb-4 text-zinc-500 text-[13px] font-medium">
            <img src="/ai-icon.svg" alt="AI" className="w-4 h-4 object-contain opacity-50" />
            AI AGENT SETUP (FREE)
          </div>

          {/* Auto Inject Box */}
          <div className="bg-[#111] border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
            
            {aiState === 'idle' && (
               <div className="p-8 flex flex-col items-center justify-center min-h-[250px]">
                  <button
                    onClick={handleAnalyze}
                    className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-md transition-colors flex items-center gap-2"
                  >
                    <img src="/ai-icon.svg" alt="AI" className="w-5 h-5 object-contain" />
                    <span className="text-[13px]">Analyze Backend Project</span>
                  </button>
                  <p className="text-[13px] text-zinc-400 mt-6 max-w-md text-center">
                    Let DeployAI analyze your repository and automatically add the <strong>@swapnil454/tracepilot</strong> dependency and configuration to your backend.
                  </p>
                  {aiError && (
                     <div className="mt-4 text-red-400 text-[13px] bg-red-500/10 p-3 px-5 rounded-md border border-red-500/20 text-center max-w-lg">
                       {aiError}
                     </div>
                  )}
               </div>
            )}

            {aiState === 'analyzing' && (
              <div className="p-8 flex flex-col items-center justify-center min-h-[250px]">
                 <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mb-4" />
                 <p className="text-zinc-300 font-medium text-sm">Analyzing Backend Configuration...</p>
                 <p className="text-zinc-500 text-xs mt-2">Detecting framework and package.json location</p>
              </div>
            )}

            {aiState === 'review' && (
              <div className="p-6 lg:p-8 flex flex-col">
                <p className="text-white font-medium mb-4 flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" /> Analysis Complete
                </p>
                <div className="bg-black border border-zinc-800 p-4 rounded-md mb-6">
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <span className="text-zinc-500 text-xs block mb-1">Detected Framework</span>
                       <span className="text-zinc-200 text-sm font-medium capitalize">{analysisResult?.framework}</span>
                     </div>
                     <div>
                       <span className="text-zinc-500 text-xs block mb-1">Planned Action</span>
                       <span className="text-zinc-200 text-sm font-medium">{analysisResult?.action}</span>
                     </div>
                   </div>
                   <p className="text-sm text-zinc-400 mt-4 pt-4 border-t border-zinc-800">
                     {analysisResult?.message}
                   </p>
                </div>
                
                {aiError && (
                   <div className="mb-4 text-red-400 text-[13px] bg-red-500/10 p-3 px-5 rounded-md border border-red-500/20">
                     {aiError}
                   </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleAutoInject}
                    className="bg-zinc-100 hover:bg-white text-black font-medium px-4 py-2 rounded-md transition-colors flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    <span className="text-[13px]">Proceed & Generate PR</span>
                  </button>
                  <button
                    onClick={() => setAiState('idle')}
                    className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-md transition-colors"
                  >
                    <span className="text-[13px]">Cancel</span>
                  </button>
                </div>
              </div>
            )}

            {aiState === 'injecting' && (
              <div className="p-8 flex flex-col items-center justify-center min-h-[250px]">
                 <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mb-4" />
                 <p className="text-zinc-300 font-medium text-sm">Generating Pull Request...</p>
                 <p className="text-zinc-500 text-xs mt-2">Writing code modifications and pushing to a new branch</p>
              </div>
            )}

            {aiState === 'success' && injectResult && (
              <div className="p-6 lg:p-8 flex flex-col">
                <p className="text-white font-medium mb-6 flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" /> Generated Pull Request
                </p>
                <div className="bg-black border border-zinc-800 p-4 rounded-md mb-6">
                  <p className="text-[14px] text-zinc-400">
                    Successfully injected SDK code into <code className="text-zinc-200">{injectResult.file}</code>.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-zinc-800 pt-6 mt-auto gap-4">
                  <div className="flex items-center gap-2">
                    <img src="/ai-icon.svg" alt="AI" className="w-6 h-6 object-contain" />
                    <span className="text-sm font-medium text-white">Injection Complete</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3 ml-auto">
                      <a 
                        href={injectResult.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-zinc-800 text-white hover:bg-zinc-700 text-sm font-medium px-4 py-2 rounded-md transition-colors flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" /> View Pull Request
                      </a>
                      <button 
                        onClick={handleVerify} 
                        disabled={verifying}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors flex items-center gap-2"
                      >
                        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                        {verifying ? 'Verifying...' : 'Verify Installation'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
          </div>
        </div>

      </div>
    </div>
  );
}
`;

fs.writeFileSync('client/components/observability/ObservabilitySetup.tsx', content);
