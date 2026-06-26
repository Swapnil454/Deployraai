import React from 'react';
import Link from 'next/link';

export default function SLODashboard() {
  return (
    <div className="p-8 max-w-6xl mx-auto text-white">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Service Level Objectives</h1>
          <p className="text-gray-400 mt-1">Track your error budgets and burn rates across services.</p>
        </div>
        <Link href="/dashboard/slos/create">
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md font-medium transition-colors">
            Create SLO
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mock SLO Card */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold">API Gateway Uptime</h3>
              <p className="text-sm text-gray-400">Target: 99.9% / 30 days</p>
            </div>
            <span className="bg-green-900 text-green-300 text-xs font-medium px-2.5 py-0.5 rounded border border-green-700">
              Healthy
            </span>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Error Budget Remaining</span>
                <span className="font-mono text-green-400">87.5%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '87.5%' }}></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Burn Rate</p>
                <p className="text-lg font-semibold font-mono mt-1">0.8x</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Budget Exhaustion</p>
                <p className="text-lg font-semibold mt-1">~38 days</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold">Database Latency &lt; 200ms</h3>
              <p className="text-sm text-gray-400">Target: 99.0% / 30 days</p>
            </div>
            <span className="bg-yellow-900 text-yellow-300 text-xs font-medium px-2.5 py-0.5 rounded border border-yellow-700">
              Warning
            </span>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Error Budget Remaining</span>
                <span className="font-mono text-yellow-400">32.1%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '32.1%' }}></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Burn Rate</p>
                <p className="text-lg font-semibold font-mono text-yellow-400 mt-1">2.4x</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Budget Exhaustion</p>
                <p className="text-lg font-semibold mt-1">~12 days</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
