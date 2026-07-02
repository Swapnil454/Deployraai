'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Edge,
  ReactFlow,
  Node,
  useNodesState,
  useEdgesState,
  Background,
  MarkerType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { ServiceNode } from './nodes/ServiceNode';
import { AnimatedEdge } from './edges/AnimatedEdge';

const nodeTypes = {
  serviceNode: ServiceNode,
};

const edgeTypes = {
  animated: AnimatedEdge,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 200;
const nodeHeight = 120;

interface ServiceNodeData extends Record<string, unknown> {
  label: string;
  serviceType: 'service' | 'database' | 'frontend';
  errorRate: number;
  avgLatency: number;
  requestCount: number;
}

interface TopologyEdgeData extends Record<string, unknown> {
  errorRate?: number;
}

type TopologyNode = Node<ServiceNodeData>;
type TopologyEdge = Edge<TopologyEdgeData>;

const getLayoutedElements = (nodes: TopologyNode[], edges: TopologyEdge[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      // Shift to center the node based on its size
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
};

export function TopologyMap({ projectId }: { projectId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEdge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/topology?projectId=${projectId}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.nodes && data.edges) {
          // Add markerEnd to all edges
          const mappedEdges: TopologyEdge[] = data.edges.map((e: TopologyEdge) => ({
            ...e,
            type: 'animated',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: (e.data?.errorRate ?? 0) > 0.05 ? '#ef4444' : '#6366f1',
            }
          }));

          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            data.nodes as TopologyNode[],
            mappedEdges,
            'TB'
          );

          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-red-500/10 border border-red-500/20 rounded-xl max-w-lg mx-auto">
        <p className="text-red-400 font-medium mb-2">Failed to load topology map</p>
        <p className="text-sm text-red-400/80">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[600px] border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        className="bg-zinc-950"
      >
        <Background color="#27272a" gap={24} />
      </ReactFlow>
    </div>
  );
}
