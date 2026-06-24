"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertCircle, AlertOctagon } from "lucide-react";

export default function ErrorsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchErrors = async () => {
      try {
        const ANALYTICS_API_URL = "http://localhost:4318";
        // Query logs for 'error' level
        const res = await fetch(`${ANALYTICS_API_URL}/logs?projectId=${projectId}&level=error&limit=50`, {
          headers: { 'Authorization': 'Bearer demo-token' }
        });
        if (res.ok) {
          const data = await res.json();
          setErrors(data.logs || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchErrors();
  }, [projectId]);

  return (
    <div className="w-full flex flex-col min-h-full bg-black text-white p-8">
      <div className="max-w-[1440px] w-full mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <AlertOctagon className="h-6 w-6 text-red-500" /> Errors & Exceptions
        </h1>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
        ) : (
          <div className="flex flex-col gap-4">
            {errors.length === 0 ? (
               <div className="p-12 text-center text-zinc-500 flex flex-col items-center border border-zinc-800 rounded-xl bg-[#0a0a0a]">
                 <AlertCircle className="h-12 w-12 mb-4 text-emerald-500 opacity-80" />
                 <h3 className="text-lg font-medium text-white mb-2">No errors recorded</h3>
                 <p>Everything is running smoothly! No recent errors found in logs.</p>
               </div>
            ) : (
              errors.map((error, i) => (
                <div key={i} className="bg-[#0a0a0a] border border-red-500/20 rounded-xl overflow-hidden hover:border-red-500/40 transition-colors">
                  <div className="p-4 border-b border-zinc-800/50 flex justify-between items-start bg-red-500/5">
                    <div className="flex flex-col">
                      <span className="font-mono text-sm text-red-400 break-all">{error.message}</span>
                      <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                        <span>{new Date(error.timestamp).toLocaleString()}</span>
                        {error.source && <span>Source: {error.source}</span>}
                        {error.request_id && <span>Request ID: {error.request_id}</span>}
                      </div>
                    </div>
                  </div>
                  {/* If there was a stack trace in the raw log, we'd render it here */}
                  {error.raw?.stack && (
                    <div className="p-4 bg-[#050505] overflow-x-auto">
                      <pre className="text-xs font-mono text-zinc-400">
                        {error.raw.stack}
                      </pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
