import React from 'react';

export default async function StatusPage({ params }: { params: { slug: string } }) {
  const data = await fetch(
    `${process.env.ANALYTICS_API_URL || 'http://localhost:3001'}/public/status/${params.slug}`,
    { next: { revalidate: 60 } } // ISR — revalidate every 60s
  ).then(r => r.json()).catch(() => null);

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-semibold text-slate-200">Status Page Not Found</h1>
        <p className="text-slate-400 mt-2">The requested project could not be found or has not enabled public status pages.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-16 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-3 h-3 rounded-full ${data.status === 'operational' ? 'bg-green-500' : 'bg-red-500'}`} />
        <h1 className="text-2xl font-semibold text-slate-200">{data.name}</h1>
        <span className="text-slate-400 text-sm">
          {data.status === 'operational' ? 'All systems operational' : 'Service disruption'}
        </span>
      </div>

      {/* 90-day uptime bars */}
      <div className="mb-8">
        <h2 className="text-lg font-medium text-slate-300 mb-4">Uptime History (90 Days)</h2>
        <div className="flex gap-0.5">
          {data.uptime?.map((day: any) => (
            <div
              key={day.day}
              className="flex-1 h-8 rounded-sm cursor-pointer transition-opacity hover:opacity-80"
              style={{
                background: day.uptime_pct >= 99.9 ? '#22c55e'
                  : day.uptime_pct >= 95 ? '#eab308'
                  : '#ef4444'
              }}
              title={`${new Date(day.day).toLocaleDateString()}: ${day.uptime_pct}% uptime`}
            />
          ))}
          {(!data.uptime || data.uptime.length === 0) && (
             <div className="text-slate-500 text-sm italic">Not enough data to display 90-day history.</div>
          )}
        </div>
        {data.uptime && data.uptime.length > 0 && (
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
           <p className="text-slate-400 text-sm">Current Latency</p>
           <p className="text-2xl font-semibold text-slate-200">{Math.round(data.currentLatencyMs)}ms</p>
        </div>
      </div>
    </div>
  );
}
