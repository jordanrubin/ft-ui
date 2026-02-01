import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  MarkerType,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

import CanvasNodeComponent, { type CanvasNodeData } from './CanvasNode';
import type { Canvas, CanvasNode } from '../types/canvas';

const nodeTypes = {
  canvas: CanvasNodeComponent,
};

interface CanvasViewProps {
  canvas: Canvas | null;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
}

// Use dagre for automatic layout
function getLayoutedElements(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  direction = 'TB'
): { nodes: Node<CanvasNodeData>[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

  const nodeWidth = 220;
  const nodeHeight = 80;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  // Only use hierarchy edges for layout (not cross-links)
  edges
    .filter((e) => e.type !== 'crosslink')
    .forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function canvasToFlow(canvas: Canvas): { nodes: Node<CanvasNodeData>[]; edges: Edge[] } {
  const activePath = new Set(canvas.active_path);
  const focusId = canvas.active_path[canvas.active_path.length - 1];

  const nodes: Node<CanvasNodeData>[] = Object.values(canvas.nodes).map((node) => ({
    id: node.id,
    type: 'canvas',
    position: { x: 0, y: 0 }, // Will be set by dagre
    data: {
      node,
      isActive: activePath.has(node.id),
      isFocused: node.id === focusId,
      hasLinks: node.links_to.length > 0,
    },
  }));

  const edges: Edge[] = [];

  // Hierarchy edges (parent -> child)
  Object.values(canvas.nodes).forEach((node) => {
    node.children_ids.forEach((childId) => {
      edges.push({
        id: `h-${node.id}-${childId}`,
        source: node.id,
        target: childId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#4a5568', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#4a5568',
        },
      });
    });

    // Cross-link edges (dotted)
    node.links_to.forEach((linkId) => {
      if (canvas.nodes[linkId]) {
        edges.push({
          id: `l-${node.id}-${linkId}`,
          source: node.id,
          target: linkId,
          sourceHandle: 'link-source',
          targetHandle: 'link-target',
          type: 'default',
          animated: true,
          style: {
            stroke: '#9b59b6',
            strokeWidth: 2,
            strokeDasharray: '5,5',
          },
          markerEnd: {
            type: MarkerType.Arrow,
            color: '#9b59b6',
          },
          data: { type: 'crosslink' },
        });
      }
    });
  });

  // Apply dagre layout
  return getLayoutedElements(nodes, edges);
}

export default function CanvasView({ canvas, onNodeClick, onNodeDoubleClick }: CanvasViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes/edges when canvas changes
  useEffect(() => {
    if (canvas && Object.keys(canvas.nodes).length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = canvasToFlow(canvas);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [canvas, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<CanvasNodeData>) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<CanvasNodeData>) => {
      onNodeDoubleClick(node.id);
    },
    [onNodeDoubleClick]
  );

  // Custom minimap node color
  const minimapNodeColor = useCallback((node: Node<CanvasNodeData>) => {
    if (node.data.isFocused) return '#ffd700';
    if (node.data.isActive) return '#4dabf7';
    switch (node.data.node.type) {
      case 'root':
        return '#4a4a6a';
      case 'operation':
        return '#0f3460';
      default:
        return '#3a3a3a';
    }
  }, []);

  if (!canvas || !canvas.root_id) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
          fontSize: '18px',
        }}
      >
        No canvas loaded. Create one to get started.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onNodeDoubleClick={handleNodeDoubleClick}
      nodeTypes={nodeTypes}
      connectionMode={ConnectionMode.Loose}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{
        type: 'smoothstep',
      }}
      style={{ background: '#0d1117' }}
    >
      <Background color="#21262d" gap={20} />
      <Controls
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '6px',
        }}
      />
      <MiniMap
        nodeColor={minimapNodeColor}
        nodeStrokeWidth={3}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '6px',
        }}
        maskColor="rgba(0, 0, 0, 0.7)"
      />
    </ReactFlow>
  );
}
