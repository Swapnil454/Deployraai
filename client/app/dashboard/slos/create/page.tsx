'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateSLO() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Mock submit
    setTimeout(() => {
      setLoading(false);
      router.push('/dashboard/slos');
    }, 1000);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create New SLO</h1>
        <p className="text-gray-400 mt-1">Define an objective and track your error budget.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800 p-6 rounded-xl border border-gray-700">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">SLO Name</label>
          <input type="text" required placeholder="e.g. API Gateway Uptime" className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Metric Source</label>
          <select className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="uptime">Synthetic Uptime</option>
            <option value="error_rate">HTTP Error Rate</option>
            <option value="p99_latency">p99 Latency</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Target Percentage</label>
            <div className="relative">
              <input type="number" step="0.01" min="0" max="100" required defaultValue="99.9" className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-400">%</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Rolling Window</label>
            <div className="relative">
              <select className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-700 flex justify-end space-x-4">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Objective'}
          </button>
        </div>
      </form>
    </div>
  );
}
