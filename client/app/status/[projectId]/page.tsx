"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Activity, Server } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function PublicStatusPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/observability";
        const res = await fetch(`${ANALYTICS_API_URL}/public/status/${projectId}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch status page data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center items-center h-screen bg-black text-white">
        <p>Project status not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto mt-12">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-8 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{data.project}</h1>
            <p className="text-zinc-400">System Status & Uptime History</p>
          </div>
          <div className="flex items-center gap-2">
            {data.isUp ? (
              <span className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-full font-medium">
                <CheckCircle2 className="h-5 w-5" />
                All Systems Operational
              </span>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 rounded-full font-medium">
                <XCircle className="h-5 w-5" />
                Major Outage
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {data.regions.map((region: any) => (
            <div key={region.name} className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                  <h3 className="text-sm font-medium text-zinc-400">Region</h3>
                  <p className="font-semibold text-lg">{region.name}</p>
                </div>
                {region.isUp ? (
                  <Activity className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Server className="h-5 w-5 text-red-500" />
                )}
              </div>
              <div className="flex justify-between items-end mt-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Uptime</p>
                  <p className="text-2xl font-bold">{region.uptimePercentage}%</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1 text-right">Latency</p>
                  <p className="text-2xl font-bold text-right">{region.currentLatency} <span className="text-sm text-zinc-500">ms</span></p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {data.regions.map((region: any) => (
          <div key={\`timeline-\${region.name}\`} className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-medium mb-6">Uptime Timeline ({region.name})</h3>
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={region.checks}>
                  <XAxis dataKey="time" hide={true} />
                  <YAxis hide={true} domain={[0, 1]} />
                  <Tooltip 
                    cursor={{fill: '#27272a'}}
                    contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', color: '#fff' }}
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                    formatter={(value: any, name: any, props: any) => [props.payload.isUp ? 'Operational' : 'Down', 'Status']}
                  />
                  <Bar dataKey="isUp" radius={[2, 2, 0, 0]}>
                    {region.checks.map((entry: any, index: number) => (
                      <Cell key={\`cell-\${index}\`} fill={entry.isUp ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
