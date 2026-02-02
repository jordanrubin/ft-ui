import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { CanvasNode as CanvasNodeType } from '../types/canvas';
import { stripMarkdown } from '../utils/markdown';

export interface CanvasNodeData extends Record<string, unknown> {
  node: CanvasNodeType;
  isActive: boolean;
  isFocused: boolean;
  hasLinks: boolean;
  isSelected: boolean;
}

export type CanvasNodeType2 = Node<CanvasNodeData, 'canvas'>;

const typeColors: Record<string, { bg: string; border: string; text: string }> = {
  root: { bg: '#1a1a2e', border: '#4a4a6a', text: '#ffffff' },
  operation: { bg: '#16213e', border: '#0f3460', text: '#e0e0e0' },
  user: { bg: '#1a1a1a', border: '#3a3a3a', text: '#d0d0d0' },
};

const operationColors: Record<string, string> = {
  '@excavate': '#e74c3c',
  '@antithesize': '#9b59b6',
  '@synthesize': '#3498db',
  '@stressify': '#e67e22',
  '@simulate': '#1abc9c',
  '@diverge': '#2ecc71',
  '@dimensionalize': '#f39c12',
  '@negspace': '#95a5a6',
  '@metaphorize': '#e91e63',
  '@rhyme': '#00bcd4',
  chat: '#607d8b',
};

function CanvasNodeComponent({ data, selected }: NodeProps<CanvasNodeType2>) {
  const { node, isActive, isFocused, hasLinks, isSelected } = data as CanvasNodeData;
  const colors = typeColors[node.type] || typeColors.user;
  const operationColor = node.operation ? operationColors[node.operation] || '#666' : null;

  // Determine border color: multi-selected > focused > active > default
  const borderColor = isSelected ? '#22c55e' : isFocused ? '#ffd700' : isActive ? '#4dabf7' : colors.border;

  // Determine box shadow: multi-selected gets green glow
  const boxShadow = isSelected
    ? '0 0 12px rgba(34, 197, 94, 0.5), 0 0 0 2px #22c55e'
    : selected
    ? '0 0 0 2px #fff'
    : isFocused
    ? '0 0 12px rgba(255, 215, 0, 0.4)'
    : 'none';

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        background: isSelected ? '#0d2818' : colors.bg,
        border: `2px solid ${borderColor}`,
        color: colors.text,
        minWidth: '180px',
        maxWidth: '280px',
        boxShadow,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Top handle for incoming edges */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555', width: 8, height: 8 }}
      />

      {/* Operation badge */}
      {node.operation && (
        <div
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            background: operationColor || '#666',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: '6px',
            textTransform: 'lowercase',
          }}
        >
          {node.operation}
        </div>
      )}

      {/* Node type badge for non-operation nodes */}
      {!node.operation && (
        <div
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            background: node.type === 'root' ? '#4a4a6a' : '#3a3a3a',
            color: '#aaa',
            fontSize: '10px',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}
        >
          {node.type}
        </div>
      )}

      {/* Content */}
      <div
        style={{
          fontSize: '13px',
          lineHeight: '1.4',
          wordWrap: 'break-word',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {stripMarkdown(node.content_compressed)}
      </div>

      {/* Links indicator */}
      {hasLinks && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#9b59b6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: '#fff',
          }}
        >

        </div>
      )}

      {/* Bottom handle for outgoing edges */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#555', width: 8, height: 8 }}
      />

      {/* Left handle for cross-links */}
      <Handle
        type="source"
        position={Position.Left}
        id="link-source"
        style={{ background: '#9b59b6', width: 6, height: 6 }}
      />

      {/* Right handle for cross-links */}
      <Handle
        type="target"
        position={Position.Right}
        id="link-target"
        style={{ background: '#9b59b6', width: 6, height: 6 }}
      />
    </div>
  );
}

export default memo(CanvasNodeComponent);
