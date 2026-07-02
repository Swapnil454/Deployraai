import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

export function AnimatedEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isHighError = data?.errorRate > 0.05;
  const strokeColor = isHighError ? '#ef4444' : '#6366f1'; // red-500 or indigo-500

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeWidth: 2,
          stroke: strokeColor,
          opacity: 0.6,
        }} 
      />
      {/* The animated particle line on top */}
      <BaseEdge 
        path={edgePath} 
        style={{
          ...style,
          strokeWidth: 2,
          stroke: strokeColor,
          strokeDasharray: '5, 5',
          animation: 'dashdraw 1s linear infinite',
        }} 
      />
      <style>{`
        @keyframes dashdraw {
          from {
            stroke-dashoffset: 10;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </>
  );
}
