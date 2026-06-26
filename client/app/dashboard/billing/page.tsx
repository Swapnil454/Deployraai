import React from 'react';

export default function BillingDashboard() {
  return (
    <div className="p-8 max-w-5xl mx-auto text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Billing & Usage</h1>
        <p className="text-gray-400 mt-1">Manage your plan, limits, and view invoice history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Usage Card */}
        <div className="md:col-span-2 bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-6">Current Month Usage</h3>
          
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-4xl font-bold font-mono">14.2M <span className="text-base text-gray-400 font-sans">spans</span></p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Limit: 50M</p>
            </div>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3 mb-6">
            <div className="bg-indigo-500 h-3 rounded-full" style={{ width: '28.4%' }}></div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
            <div>
              <p className="text-sm text-gray-400">Current Cost</p>
              <p className="text-2xl font-bold mt-1">$7.10</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Projected Month End</p>
              <p className="text-2xl font-bold mt-1">$15.20</p>
            </div>
          </div>
        </div>

        {/* Plan Card */}
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-xl p-6 border border-indigo-700 flex flex-col">
          <h3 className="text-lg font-semibold text-indigo-200 mb-2">Current Plan</h3>
          <p className="text-3xl font-bold mb-4">Pro</p>
          <ul className="space-y-2 text-sm text-indigo-100 flex-grow">
            <li className="flex items-center">✓ 50M Spans included</li>
            <li className="flex items-center">✓ 30 day retention</li>
            <li className="flex items-center">✓ Advanced Alerting</li>
            <li className="flex items-center">✓ Custom SLOs</li>
          </ul>
          <button className="mt-6 w-full bg-white text-indigo-900 font-semibold py-2 rounded-md hover:bg-gray-100 transition-colors">
            Manage via Stripe
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold">Invoice History</h3>
        </div>
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-gray-900/50 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Amount</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Receipt</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-700">
              <td className="px-6 py-4 font-medium text-white">May 01, 2026</td>
              <td className="px-6 py-4">$12.50</td>
              <td className="px-6 py-4"><span className="text-green-400">Paid</span></td>
              <td className="px-6 py-4 text-right"><a href="#" className="text-indigo-400 hover:underline">Download</a></td>
            </tr>
            <tr className="border-b border-gray-700">
              <td className="px-6 py-4 font-medium text-white">Apr 01, 2026</td>
              <td className="px-6 py-4">$10.00</td>
              <td className="px-6 py-4"><span className="text-green-400">Paid</span></td>
              <td className="px-6 py-4 text-right"><a href="#" className="text-indigo-400 hover:underline">Download</a></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
