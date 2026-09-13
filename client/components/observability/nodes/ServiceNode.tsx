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

export function ServiceNode({ data, targetPosition = Position.Left, sourcePosition = Position.Right }: any) {
  const isHighError = data.errorRate > 0.05;
  const isHighLatency = data.avgLatency > 1000;
  const isUnhealthy = isHighError || isHighLatency;

  const Icon = data.serviceType === 'database' ? Database : 
               data.serviceType === 'frontend' ? Globe : 
               data.label.includes('api') ? Server : Box;

  return (
    <div className="flex flex-col p-6 bg-[#0a0a0a] border border-[#222] rounded-2xl w-[240px] h-[200px] shadow-2xl relative">
      <Handle type="target" position={targetPosition} className="w-2 h-2 bg-zinc-700 border-none opacity-0" />
      
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2.5 rounded-xl ${isUnhealthy ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-[#111] text-zinc-300 border border-[#333]'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <h3 className="font-semibold text-zinc-100 text-[15px] tracking-tight">{data.label}</h3>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium mt-0.5">{data.serviceType}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-end gap-3 mt-2">
        <div className="flex justify-between items-center text-sm border-b border-[#222] pb-2">
          <span className="text-[11px] text-zinc-500 font-medium tracking-wide">Requests</span>
          <span className="font-mono text-zinc-300 font-medium text-[13px]">{data.requestCount?.toLocaleString() || 0}</span>
        </div>
        <div className="flex justify-between items-center text-sm border-b border-[#222] pb-2">
          <span className="text-[11px] text-zinc-500 font-medium tracking-wide">Latency</span>
          <span className={`font-mono font-medium text-[13px] ${isHighLatency ? 'text-red-400' : 'text-zinc-300'}`}>
            {Math.round(data.avgLatency)}ms
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-[11px] text-zinc-500 font-medium tracking-wide">Errors</span>
          <span className={`font-mono font-medium text-[13px] ${isHighError ? 'text-red-400' : 'text-zinc-300'}`}>
            {(data.errorRate * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      {isUnhealthy && (
        <div className="absolute -inset-[1px] border border-red-500/30 rounded-2xl -z-10 bg-red-500/5 animate-pulse" />
      )}

      <Handle type="source" position={sourcePosition} className="w-2 h-2 bg-zinc-700 border-none opacity-0" />
    </div>
  );
}
