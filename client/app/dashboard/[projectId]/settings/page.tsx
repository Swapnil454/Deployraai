"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Bell, Database, Save, Check } from "lucide-react";

export default function SettingsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="w-full flex flex-col min-h-full bg-black text-white p-8">
      <div className="max-w-[1440px] w-full mx-auto">
        <h1 className="text-2xl font-bold mb-8">Observability Settings</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Alerts */}
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Bell className="h-5 w-5 text-zinc-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium">Alert Rules</h2>
                <p className="text-sm text-zinc-500">Configure notifications for anomalies</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Error Rate Threshold (%)</label>
                <input type="number" defaultValue={5} className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-zinc-600" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">P99 Latency Alert (ms)</label>
                <input type="number" defaultValue={2000} className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-zinc-600" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Notification Channels</label>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="slack" defaultChecked className="rounded border-zinc-800 bg-black" />
                  <label htmlFor="slack" className="text-sm text-zinc-300">Slack Webhook</label>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="checkbox" id="email" defaultChecked className="rounded border-zinc-800 bg-black" />
                  <label htmlFor="email" className="text-sm text-zinc-300">Email Alerts</label>
                </div>
              </div>
            </div>
          </div>

          {/* Retention */}
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Database className="h-5 w-5 text-zinc-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium">Data Retention</h2>
                <p className="text-sm text-zinc-500">Manage telemetry storage lifecycles</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Distributed Traces</h4>
                  <p className="text-xs text-zinc-500">Detailed span data</p>
                </div>
                <select className="bg-black border border-zinc-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-600">
                  <option>14 days</option>
                  <option selected>30 days</option>
                  <option>90 days</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Application Logs</h4>
                  <p className="text-xs text-zinc-500">Raw stdout/stderr</p>
                </div>
                <select className="bg-black border border-zinc-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-600">
                  <option>7 days</option>
                  <option selected>14 days</option>
                  <option>30 days</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Aggregated Metrics</h4>
                  <p className="text-xs text-zinc-500">Pre-computed timeseries</p>
                </div>
                <select className="bg-black border border-zinc-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-600" disabled>
                  <option selected>90 days (Fixed)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button 
            onClick={handleSave}
            className="bg-white text-black hover:bg-zinc-200 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {saved ? <><Check className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}
