"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, ArrowLeft, Clock } from "lucide-react";
import { useRouter } from "next/navigation";

export default function TraceDetail() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const traceId = params.traceId as string;
  const [traceData, setTraceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrace = async () => {
      try {
        const ANALYTICS_API_URL = "http://localhost:4318";
        const res = await fetch(`${ANALYTICS_API_URL}/traces/${traceId}?projectId=${projectId}`, {
          headers: { 'Authorization': 'Bearer demo-token' }
        });
        if (res.ok) {
          const data = await res.json();
          setTraceData(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrace();
  }, [projectId, traceId]);

  return (
    <div className="w-full flex flex-col min-h-full bg-black text-white p-8">
      <div className="max-w-[1440px] w-full mx-auto">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Traces
        </button>

        <h1 className="text-2xl font-bold mb-2">Trace: <span className="font-mono text-zinc-400">{traceId}</span></h1>
        
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
        ) : !traceData || !traceData.spans ? (
           <div className="p-8 border border-zinc-800 rounded-xl bg-[#0a0a0a] text-center text-zinc-500">
             Trace not found or no spans available.
           </div>
        ) : (
          <div className="mt-8">
             <div className="p-4 border border-zinc-800 rounded-xl bg-[#0a0a0a]">
               <h3 className="text-sm font-medium text-zinc-400 mb-4">Waterfall View (Demo)</h3>
               {traceData.spans.map((span: any) => (
                 <div key={span.span_id} className="mb-2">
                   <div className="flex items-center gap-4 p-2 bg-zinc-900 rounded">
                     <span className="font-mono text-xs text-zinc-400">{span.span_id}</span>
                     <span className="font-medium text-sm">{span.name}</span>
                     <span className="ml-auto text-xs font-mono text-amber-500">{span.duration_ms} ms</span>
                   </div>
                   {/* Recursively render children here in a real implementation */}
                   {span.children && span.children.map((child: any) => (
                     <div key={child.span_id} className="ml-8 mt-2 flex items-center gap-4 p-2 bg-zinc-900/50 rounded border-l-2 border-zinc-800">
                       <span className="font-mono text-xs text-zinc-500">{child.span_id}</span>
                       <span className="font-medium text-sm text-zinc-300">{child.name}</span>
                       <span className="ml-auto text-xs font-mono text-amber-500/80">{child.duration_ms} ms</span>
                     </div>
                   ))}
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
