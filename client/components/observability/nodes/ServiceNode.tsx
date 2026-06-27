import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Database, Server, Globe, Box } from 'lucide-react';

interface ServiceNodeData {
  label: string;
  serviceType: 'service' | 'database' | 'frontend';
  errorRate: number;
  avgLatency: number;
  requestCount: number;
}

export function ServiceNode({ data }: { data: ServiceNodeData }) {
  const isHighError = data.errorRate > 0.05; // > 5% errors
  const isHighLatency = data.avgLatency > 1000; // > 1s avg latency
  const isUnhealthy = isHighError || isHighLatency;

  const Icon = data.serviceType === 'database' ? Database : 
               data.serviceType === 'frontend' ? Globe : 
               data.label.includes('api') ? Server : Box;

  return (
    <div className={`px-4 py-3 rounded-xl border-2 bg-zinc-950 shadow-xl min-w-[180px] transition-all
      ${isUnhealthy ? 'border-red-500/80 shadow-red-900/20' : 'border-zinc-800 shadow-black/50'}
    `}>
      {/* Handles for connections */}
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-zinc-600 border-none" />
      
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${isUnhealthy ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-zinc-100 text-sm tracking-tight">{data.label}</h3>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mt-0.5">{data.serviceType}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-zinc-900 rounded p-1.5 flex flex-col items-center">
          <span className="text-zinc-500 mb-0.5">Latency</span>
          <span className={`font-mono font-medium ${isHighLatency ? 'text-red-400' : 'text-zinc-300'}`}>
            {Math.round(data.avgLatency)}ms
          </span>
        </div>
        <div className="bg-zinc-900 rounded p-1.5 flex flex-col items-center">
          <span className="text-zinc-500 mb-0.5">Errors</span>
          <span className={`font-mono font-medium ${isHighError ? 'text-red-400' : 'text-zinc-300'}`}>
            {(data.errorRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {isUnhealthy && (
        <div className="absolute -inset-1 bg-red-500/20 rounded-xl blur-md -z-10 animate-pulse" />
      )}

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-zinc-600 border-none" />
    </div>
  );
}
