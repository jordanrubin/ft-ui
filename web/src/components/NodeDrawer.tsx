import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { CanvasNode, SkillInfo } from '../types/canvas';
import SubsectionViewer from './SubsectionViewer';
import { isStructuredResponse } from '../utils/responseParser';
import { Markdown } from '../utils/markdown';

interface NodeDrawerProps {
  node: CanvasNode | null;
  parentNode: CanvasNode | null;
  skills: SkillInfo[];
  onClose: () => void;
  onSkillRun: (skillName: string) => void;
  onSkillRunOnSelection: (skillName: string, content: string) => void;
  onChatSubmit: (prompt: string) => void;
  webSearchEnabled: boolean;
  onNodeEdit: (content: string) => void;
  onNodeDelete: () => void;
  onLinkCreate: (targetId: string) => void;
  onToggleExclude: () => void;
  onAnswerSave?: (nodeId: string, answers: Record<string, string>) => void;
  onSubsectionSelect?: (content: string | undefined) => void;
  linkedNodes: CanvasNode[];
  backlinks: CanvasNode[];
  isRunning: boolean;
  selectedNodeIds: Set<string>;
  allNodes: Record<string, CanvasNode>;
  onSkillRunOnMultiple: (skillName: string) => void;
  onClearMultiSelection: () => void;
  mobile?: boolean;
  skillsPane?: ReactNode;
}

export default function NodeDrawer({
  node,
  parentNode,
  skills,
  onClose,
  onSkillRun: _onSkillRun,
  onSkillRunOnSelection: _onSkillRunOnSelection,
  onChatSubmit,
  webSearchEnabled: _webSearchEnabled,
  onNodeEdit,
  onNodeDelete,
  onLinkCreate: _onLinkCreate,
  onToggleExclude,
  onAnswerSave,
  onSubsectionSelect,
  linkedNodes: _linkedNodes,
  backlinks: _backlinks,
  isRunning,
  selectedNodeIds,
  allNodes,
  onSkillRunOnMultiple,
  onClearMultiSelection,
  mobile = false,
  skillsPane,
}: NodeDrawerProps) {
  // Unused props - kept for API compatibility
  void _onSkillRun;
  void _onLinkCreate;
  void _linkedNodes;
  void _backlinks;
  void _webSearchEnabled;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [showFullParent, setShowFullParent] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [showMobileSkills, setShowMobileSkills] = useState(false);

  const hasMultiSelection = selectedNodeIds.size > 0;
  const selectedNodes = Array.from(selectedNodeIds).map((id) => allNodes[id]).filter(Boolean);

  useEffect(() => {
    if (node) {
      setEditContent(node.content_full);
      setIsEditing(false);
    }
  }, [node]);

  // Show multi-selection UI if nodes are selected
  if (hasMultiSelection) {
    return (
      <div
        style={mobile ? {
          position: 'fixed',
          top: 0,
          right: 0,
          width: '100vw',
          height: '100dvh',
          background: '#161b22',
          borderLeft: '1px solid #30363d',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
          overscrollBehavior: 'contain',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        } : {
          flex: 6,
          height: '100%',
          background: '#161b22',
          borderLeft: '1px solid #30363d',
          display: 'flex',
          flexDirection: 'column',
          overscrollBehavior: 'contain',
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid #30363d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '4px',
                background: '#22c55e',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {selectedNodeIds.size} nodes selected
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClearMultiSelection}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
              }}
            >
              Clear
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              x
            </button>
          </div>
        </div>

        {/* Selected nodes list */}
        <div style={{ padding: '16px', borderBottom: '1px solid #30363d', maxHeight: '200px', overflow: 'auto' }}>
          <h4 style={{ margin: '0 0 12px', color: '#22c55e', fontSize: '12px', textTransform: 'uppercase' }}>
            Selected Nodes
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {selectedNodes.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '8px 10px',
                  background: '#0d2818',
                  borderRadius: '4px',
                  borderLeft: '3px solid #22c55e',
                }}
              >
                <div style={{ fontSize: '11px', color: '#22c55e', marginBottom: '2px' }}>
                  {n.operation || n.type} ({n.id})
                </div>
                <div style={{ color: '#c9d1d9', fontSize: '12px' }}>
                  {n.content_compressed}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Skills section */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
          <h4 style={{ margin: '0 0 12px', color: '#c9d1d9', fontSize: '14px' }}>
            Run skill on all selected nodes
          </h4>
          <p style={{ color: '#666', fontSize: '12px', marginBottom: '16px' }}>
            The skill will be run using context from all {selectedNodeIds.size} selected nodes combined.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {skills.map((skill) => (
              <button
                key={skill.name}
                onClick={() => onSkillRunOnMultiple(skill.name)}
                disabled={isRunning}
                style={{
                  padding: '12px',
                  background: '#21262d',
                  border: '1px solid #22c55e',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: isRunning ? 0.6 : 1,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '4px', color: '#22c55e' }}>{skill.display_name}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>{skill.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Loading indicator */}
        {isRunning && (
          <div
            style={{
              padding: '12px 16px',
              background: '#21262d',
              borderTop: '1px solid #30363d',
              color: '#22c55e',
              fontSize: '13px',
              textAlign: 'center',
            }}
          >
            Running skill on {selectedNodeIds.size} nodes...
          </div>
        )}
      </div>
    );
  }

  if (!node) return null;

  const handleSaveEdit = () => {
    onNodeEdit(editContent);
    setIsEditing(false);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onChatSubmit(chatInput.trim());
      setChatInput('');
    }
  };


  return (
    <div
      style={mobile ? {
        position: 'fixed',
        top: 0,
        right: 0,
        width: '100vw',
        height: '100dvh',
        background: '#161b22',
        borderLeft: '1px solid #30363d',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
        overscrollBehavior: 'contain',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      } : {
        flex: 6,
        height: '100%',
        background: '#161b22',
        borderLeft: '1px solid #30363d',
        display: 'flex',
        flexDirection: 'column',
        overscrollBehavior: 'contain',
        minWidth: 0,
      }}
    >
      {/* Header - compact */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: '4px',
              background: node.excluded ? '#7f1d1d' : (node.operation ? '#0f3460' : '#3a3a3a'),
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {node.excluded && '✗ '}{node.operation || node.type}
          </span>
          {node.used_web_search && (
            <span
              style={{
                padding: '3px 6px',
                borderRadius: '4px',
                background: '#1d4ed8',
                color: '#fff',
                fontSize: '10px',
              }}
              title="Used web search"
            >
              web
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {mobile && skillsPane && (
            <button
              onClick={() => setShowMobileSkills(!showMobileSkills)}
              title="Toggle skills panel"
              style={{
                background: showMobileSkills ? '#8b5cf6' : '#21262d',
                border: '1px solid #30363d',
                color: showMobileSkills ? '#fff' : '#8b949e',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
              }}
            >
              Skills
            </button>
          )}
          <button
            onClick={() => setShowMeta(!showMeta)}
            title="Node info"
            style={{
              background: showMeta ? '#30363d' : '#21262d',
              border: '1px solid #30363d',
              color: '#8b949e',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '3px 6px',
              borderRadius: '4px',
            }}
          >
            ...
          </button>
          <button
            onClick={onClose}
            title="Close panel (Esc)"
            style={{
              background: '#21262d',
              border: '1px solid #30363d',
              color: '#8b949e',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '16px' }}>▶</span>
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* Mobile skills pane — collapsible inline */}
      {mobile && showMobileSkills && skillsPane && (
        <div style={{
          borderBottom: '1px solid #30363d',
          maxHeight: '50vh',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          {skillsPane}
        </div>
      )}

      {/* Collapsible metadata/actions bar */}
      {showMeta && (
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid #30363d',
          background: '#0d1117',
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '11px', color: '#484f58' }}>{node.id}</span>
          <button
            onClick={() => setIsEditing(!isEditing)}
            style={{
              padding: '3px 8px',
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '4px',
              color: '#c9d1d9',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
          {node.type !== 'root' && (
            <>
              <button
                onClick={onToggleExclude}
                style={{
                  padding: '3px 8px',
                  background: node.excluded ? '#7f1d1d' : '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: node.excluded ? '#fca5a5' : '#8b949e',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {node.excluded ? 'Include' : 'Exclude'}
              </button>
              <button
                onClick={onNodeDelete}
                style={{
                  padding: '3px 8px',
                  background: '#21262d',
                  border: '1px solid #f85149',
                  borderRadius: '4px',
                  color: '#f85149',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Chat input - PROMINENT, at top */}
      <form onSubmit={handleChatSubmit} style={{
        padding: '12px 16px',
        borderBottom: '1px solid #30363d',
        background: '#0d1117',
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask a follow-up question..."
            disabled={isRunning}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '8px',
              color: '#e0e0e0',
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            disabled={isRunning || !chatInput.trim()}
            style={{
              padding: '10px 16px',
              background: isRunning ? '#21262d' : '#238636',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.6 : 1,
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {isRunning ? '...' : 'Send'}
          </button>
        </div>
      </form>

      {/* User prompt for chat operations */}
      {node.type === 'operation' && node.operation === 'chat' && node.invocation_prompt && (
        <div
          style={{
            padding: '10px 16px',
            background: '#1c1410',
            borderBottom: '1px solid #30363d',
          }}
        >
          <div style={{ fontSize: '11px', color: '#f0883e', marginBottom: '4px', fontWeight: 600 }}>
            YOUR QUESTION
          </div>
          <div
            style={{
              fontSize: '13px',
              color: '#f0883e',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            "{node.invocation_prompt}"
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        {isEditing ? (
          <div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              style={{
                width: '100%',
                minHeight: '200px',
                padding: '12px',
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '15px',
                lineHeight: '1.6',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSaveEdit}
                style={{
                  padding: '8px 16px',
                  background: '#238636',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(node.content_full);
                }}
                style={{
                  padding: '8px 16px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Use SubsectionViewer for structured skill responses */}
            {node.type === 'operation' && isStructuredResponse(node.content_full) ? (
              <SubsectionViewer
                node={node}
                onAnswerSave={onAnswerSave}
                onSubsectionSelect={onSubsectionSelect}
                onContinueWithAnswers={(_nodeId, formattedAnswers) => {
                  onChatSubmit(`Based on my responses:\n\n${formattedAnswers}\n\nPlease continue the analysis.`);
                }}
                availableSkills={skills.map(s => s.name)}
              />
            ) : (
              <div
                style={{
                  padding: '20px',
                  background: '#0d1117',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  fontSize: '15px',
                  lineHeight: '1.6',
                }}
              >
                <Markdown content={node.content_full} />
              </div>
            )}
          </div>
        )}

        {/* Run on section - at bottom */}
        {node.type === 'operation' && (node.invocation_target || parentNode) && (
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #30363d' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>RUN ON</span>
              <button
                onClick={() => setShowFullParent(!showFullParent)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#58a6ff',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}
              >
                {showFullParent ? '▼ collapse' : '▶ expand'}
              </button>
            </div>
            <div
              style={{
                fontSize: '13px',
                color: '#8b949e',
                lineHeight: '1.5',
                padding: '10px 12px',
                background: '#0d1117',
                borderRadius: '6px',
                maxHeight: showFullParent ? '200px' : '60px',
                overflow: showFullParent ? 'auto' : 'hidden',
                whiteSpace: showFullParent ? 'pre-wrap' : 'normal',
              }}
            >
              {node.invocation_target
                ? (showFullParent ? node.invocation_target : node.invocation_target.slice(0, 150) + (node.invocation_target.length > 150 ? '...' : ''))
                : parentNode
                  ? (showFullParent ? parentNode.content_full : parentNode.content_compressed)
                  : '(no target recorded)'}
            </div>
          </div>
        )}
      </div>

      {/* Loading indicator */}
      {isRunning && (
        <div
          style={{
            padding: '12px 16px',
            background: '#21262d',
            borderTop: '1px solid #30363d',
            color: '#58a6ff',
            fontSize: '13px',
            textAlign: 'center',
          }}
        >
          Running operation...
        </div>
      )}
    </div>
  );
}
