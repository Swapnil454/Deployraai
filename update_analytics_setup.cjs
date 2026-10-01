const fs = require('fs');

const content = `"use client";

import { useState } from 'react';
import { Check, Copy, Terminal, ExternalLink, Loader2, ArrowRight, Play, Eye } from 'lucide-react';

export function AnalyticsSetup({ 
  project, 
  onVerified 
}: { 
  project: any, 
  onVerified: () => void 
}) {
  const [copiedFrontend, setCopiedFrontend] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  
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
        setVerifyError(data.message || "Verification failed. Please ensure the code is deployed and you've visited the site.");
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
      const res = await fetch(\`\${apiUrl}/api/projects/\${project._id}/analytics/analyze\`, {
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
      const res = await fetch(\`\${apiUrl}/api/projects/\${project._id}/analytics/auto-inject\`, {
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
        <h3 className="text-xl font-semibold text-white mb-2">Setup Web Analytics</h3>
        <p className="text-zinc-400 text-[14px]">Choose how you want to install the tracking script.</p>
      </div>

      <div className="p-6 lg:p-8">
        
        {/* Manual Instructions */}
        <div className="mb-6 flex items-center gap-2 text-zinc-500 text-[13px] font-medium">
          <Terminal className="h-4 w-4" />
          MANUAL SETUP
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#111] border border-zinc-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">1</div>
              <h4 className="text-white font-medium">Add Script Tag</h4>
            </div>
            <p className="text-[13px] text-zinc-400 mb-4 flex-1">Copy and paste this script into the <code>&lt;head&gt;</code> of your application's layout file.</p>
            
            <div className="bg-black border border-zinc-800 rounded-md overflow-hidden mt-auto">
              <div className="flex items-center bg-[#1a1a1a] px-3 py-2 border-b border-zinc-800">
                <span className="text-[12px] text-zinc-400 font-medium bg-zinc-800/50 px-2 py-0.5 rounded">HTML</span>
                <button onClick={() => {
                  navigator.clipboard.writeText(\`<script defer src="\${window.location.origin}/analytics.js" data-tracking-id="\${project.analytics?.trackingId}"></script>\`);
                  setCopiedFrontend(true);
                  setTimeout(() => setCopiedFrontend(false), 2000);
                }} className="ml-auto text-zinc-400 hover:text-white transition-colors">
                  {copiedFrontend ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="p-3 overflow-x-auto text-[12px] font-mono text-zinc-300">
                &lt;script defer src="{window.location.origin}/analytics.js" data-tracking-id="{project.analytics?.trackingId}"&gt;&lt;/script&gt;
              </div>
            </div>
          </div>

          <div className="bg-[#111] border border-zinc-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">2</div>
              <h4 className="text-white font-medium">Find your layout</h4>
            </div>
            <p className="text-[13px] text-zinc-400 mb-4 flex-1">Depending on your framework, the layout file is usually located at:</p>
            
            <div className="bg-black border border-zinc-800 rounded-md overflow-hidden mt-auto">
               <div className="p-3 text-[12px] font-mono text-zinc-300 leading-loose">
                 <span className="text-purple-400">Next.js (App Router):</span> app/layout.tsx<br/>
                 <span className="text-purple-400">Next.js (Pages Router):</span> pages/_document.tsx<br/>
                 <span className="text-purple-400">React/Vite/Other:</span> index.html
               </div>
            </div>
          </div>

          <div className="bg-[#111] border border-zinc-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">3</div>
              <h4 className="text-white font-medium">Deploy & Verify</h4>
            </div>
            <p className="text-[13px] text-zinc-400 leading-relaxed mb-6 flex-1">
              Deploy your changes and visit the deployment to start collecting data.<br/>
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
                    <span className="text-[13px]">Analyze Project</span>
                  </button>
                  <p className="text-[13px] text-zinc-400 mt-6 max-w-md text-center">
                    Let DeployAI analyze your repository and figure out the exact entry point to automatically configure Web Analytics for you.
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
                 <p className="text-zinc-300 font-medium text-sm">Analyzing Project Structure...</p>
                 <p className="text-zinc-500 text-xs mt-2">Connecting to GitHub to detect framework and layout files</p>
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
                    Successfully injected Web Analytics script into <code className="text-zinc-200">{injectResult.file}</code>.
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

fs.writeFileSync('client/components/analytics/AnalyticsSetup.tsx', content);
