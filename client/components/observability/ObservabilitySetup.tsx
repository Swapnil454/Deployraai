import React, { useState } from 'react';
import { Check, Copy, Wand2, Loader2, ArrowRight } from 'lucide-react';

export function ObservabilitySetup({ 
  project, 
  onVerified 
}: {
  project: any;
  onVerified: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedBackend, setCopiedBackend] = useState(false);
  const [activeTab, setActiveTab] = useState<'frontend' | 'backend'>('frontend');
  const [verifying, setVerifying] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<any>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${project._id}/analytics/verify`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        onVerified();
      } else {
        setVerifyError(data.message || "No data detected yet. Please ensure you have deployed your changes and visited the site.");
      }
    } catch (err: any) {
      setVerifyError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleAutoInject = async () => {
    setInjecting(true);
    setInjectResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects/${project._id}/analytics/auto-inject`, {
        method: 'POST',
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok) {
        setInjectResult({ success: true, ...data });
      } else {
        setInjectResult({ success: false, error: data.error || "Failed to auto inject." });
      }
    } catch (err: any) {
      setInjectResult({ success: false, error: err.message });
    } finally {
      setInjecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full mx-auto">
      <div className="w-full">
        <h3 className="text-xl font-semibold text-white mb-2">Get Started with Observability</h3>
        <p className="text-zinc-400 text-[14px] mb-8">
          Follow the manual instructions below, or use the AI Agent to configure both automatically.
        </p>

        <div className="flex border-b border-zinc-800 mb-6 gap-6">
          <button 
            onClick={() => setActiveTab('frontend')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'frontend' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Frontend (Analytics & RUM)
          </button>
          <button 
            onClick={() => setActiveTab('backend')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'backend' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Backend (Traces & Logs)
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {activeTab === 'frontend' ? (
            <>
              <div className="bg-[#111] border border-zinc-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">1</div>
              <h4 className="text-white font-medium">Copy our script</h4>
            </div>
            <p className="text-[13px] text-zinc-400 mb-4 flex-1">Start by copying the DeployAI tracking script for your project.</p>
            
            <div className="bg-black border border-zinc-800 rounded-md overflow-hidden mt-auto">
              <div className="flex items-center bg-[#1a1a1a] px-3 py-2 border-b border-zinc-800">
                <span className="text-[12px] text-zinc-400 font-medium bg-zinc-800/50 px-2 py-0.5 rounded">HTML</span>
                <button onClick={() => {
                  navigator.clipboard.writeText(`<script defer src="${process.env.NEXT_PUBLIC_API_URL || "https://api.deployai.in"}/analytics.js" data-tracking-id="${project?.analytics?.trackingId || ''}"></script>`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }} className="ml-auto text-zinc-400 hover:text-white transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="p-3 overflow-x-auto text-[12px] font-mono text-zinc-300 whitespace-nowrap">
                {`<script defer src="..." data-tracking-id="${project?.analytics?.trackingId || ''}"></script>`}
              </div>
            </div>
          </div>

          <div className="bg-[#111] border border-zinc-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">2</div>
              <h4 className="text-white font-medium">Add to your layout</h4>
            </div>
            <p className="text-[13px] text-zinc-400 mb-4 flex-1">Inject the script into the <code>&lt;head&gt;</code> of your app's layout file.</p>
            
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
            </div>
          </div>
            </>
          ) : (
            <>
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
                      navigator.clipboard.writeText(`npm install @swapnil454/tracepilot`);
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
                <p className="text-[13px] text-zinc-400 mb-4 flex-1">Create an <code>instrumentation.ts</code> file in the root of your project.</p>
                
                <div className="bg-black border border-zinc-800 rounded-md overflow-hidden mt-auto">
                   <div className="p-3 text-[12px] font-mono text-zinc-300 leading-loose">
                     <span className="text-purple-400">Next.js (instrumentation.ts):</span><br/>
                     import &#123; registerOTel &#125; from '@swapnil454/tracepilot/next';<br/>
                     export function register() &#123; registerOTel(); &#125;
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
            </>
          )}
        </div>

        <div className="pt-8 mt-6 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 mb-4 text-zinc-500 text-[13px]">
            Or, install automatically with AI Agent (free).
          </div>

          {/* Auto Inject Box */}
          <div className="bg-[#111] border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
            {injectResult?.success ? (
              <div className="p-6 lg:p-8 flex flex-col">
                <p className="text-white font-medium mb-6">Generated Observability Pull Request for this project</p>
                <h4 className="text-[14px] font-semibold text-white mb-3">Changes Proposed</h4>
                <p className="text-[14px] text-zinc-400 mb-10">
                  1. Added frontend tracking script into {injectResult.file || 'layout file'}.<br/>
                  2. Installed and configured <code>@swapnil454/tracepilot</code> for backend observability.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-zinc-800 pt-6 mt-auto gap-4">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-white">Generation Complete</span>
                    <span className="bg-purple-500/20 text-purple-400 text-[10px] px-1.5 py-0.5 rounded font-medium ml-1">Beta</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3 ml-auto">
                      <a 
                        href={injectResult.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-zinc-800 text-white hover:bg-zinc-700 text-sm font-medium px-4 py-2 rounded-md transition-colors text-center"
                      >
                        View Pull Request
                      </a>
                      <button 
                        onClick={handleVerify} 
                        disabled={verifying}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors flex items-center justify-center gap-2 min-w-[160px]"
                      >
                        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {verifying ? 'Verifying...' : 'Verify (After Merge)'}
                      </button>
                    </div>
                    {verifyError && (
                      <div className="text-red-400 text-[13px] bg-red-500/10 p-2 px-3 rounded-md border border-red-500/20 text-right ml-auto">
                        {verifyError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 flex flex-col items-center justify-center min-h-[250px]">
                <button
                  onClick={handleAutoInject}
                  disabled={injecting}
                  className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-md transition-colors flex items-center gap-2"
                >
                  {injecting ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <Wand2 className="h-4 w-4 text-zinc-400" />}
                  <span className="text-[13px]">{injecting ? 'Generating Pull Request...' : 'Implement with AI Agent'}</span>
                </button>
                <p className="text-[13px] text-zinc-400 mt-6 max-w-md text-center">
                  Automatically generate a pull request with <strong>Web Analytics & Observability</strong> configured for your project — at no charge.
                </p>
                {injectResult?.error && (
                   <div className="mt-4 text-red-400 text-[13px] bg-red-500/10 p-3 px-5 rounded-md border border-red-500/20 text-center max-w-lg">
                     {injectResult.error}
                   </div>
                )}
              </div>
            )}
            {!injectResult?.success && (
              <div className="bg-black border-t border-zinc-800 px-6 py-4 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-400">AI Agent</span>
                <span className="bg-zinc-800 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded font-medium ml-1">Beta</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
