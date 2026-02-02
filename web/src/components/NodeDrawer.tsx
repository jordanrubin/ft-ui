import { useState, useEffect } from 'react';
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
}

export default function NodeDrawer({
  node,
  parentNode,
  skills,
  onClose,
  onSkillRun,
  onSkillRunOnSelection: _onSkillRunOnSelection,
  onChatSubmit,
  onNodeEdit,
  onNodeDelete,
  onLinkCreate,
  onToggleExclude,
  onAnswerSave,
  onSubsectionSelect,
  linkedNodes,
  backlinks,
  isRunning,
  selectedNodeIds,
  allNodes,
  onSkillRunOnMultiple,
  onClearMultiSelection,
}: NodeDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [activeTab, setActiveTab] = useState<'content' | 'skills' | 'links'>('content');
  const [showFullParent, setShowFullParent] = useState(false);

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
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '400px',
          height: '100vh',
          background: '#161b22',
          borderLeft: '1px solid #30363d',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
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
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
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

  const handleAddLink = () => {
    if (linkInput.trim()) {
      onLinkCreate(linkInput.trim());
      setLinkInput('');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        height: '100vh',
        background: '#161b22',
        borderLeft: '1px solid #30363d',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
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
              background: node.excluded ? '#7f1d1d' : (node.operation ? '#0f3460' : '#3a3a3a'),
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {node.excluded && '✗ '}{node.operation || node.type}
          </span>
          <span style={{ marginLeft: '8px', color: '#666', fontSize: '12px' }}>
            {node.id}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {node.type !== 'root' && (
            <button
              onClick={onToggleExclude}
              title={node.excluded ? 'Include in plan' : 'Exclude from plan'}
              style={{
                background: node.excluded ? '#7f1d1d' : '#21262d',
                border: '1px solid #30363d',
                color: node.excluded ? '#fca5a5' : '#8b949e',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
              }}
            >
              {node.excluded ? 'Excluded' : 'Exclude'}
            </button>
          )}
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
            ×
          </button>
        </div>
      </div>

      {/* Invocation info: what was run and on what */}
      {node.type === 'operation' && (node.invocation_prompt || node.invocation_target || parentNode) && (
        <div
          style={{
            padding: '12px 16px',
            background: '#0d1117',
            borderBottom: '1px solid #30363d',
          }}
        >
          {/* Invocation prompt - what was asked */}
          {node.invocation_prompt && (
            <div style={{ marginBottom: node.invocation_target ? '12px' : 0 }}>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                {node.operation === 'chat' ? 'Prompt:' : 'Skill:'}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: node.operation === 'chat' ? '#f0883e' : '#58a6ff',
                  fontStyle: node.operation === 'chat' ? 'italic' : 'normal',
                  padding: '6px 10px',
                  background: '#161b22',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${node.operation === 'chat' ? '#f0883e' : '#58a6ff'}`,
                }}
              >
                {node.operation === 'chat' ? `"${node.invocation_prompt}"` : node.invocation_prompt}
              </div>
            </div>
          )}

          {/* Invocation target - what it was run on */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#666' }}>Run on:</span>
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
              lineHeight: '1.4',
              maxHeight: showFullParent ? 'none' : '60px',
              overflow: showFullParent ? 'auto' : 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: showFullParent ? 'pre-wrap' : 'normal',
            }}
          >
            {node.invocation_target
              ? (showFullParent ? node.invocation_target : node.invocation_target.slice(0, 100) + (node.invocation_target.length > 100 ? '...' : ''))
              : parentNode
                ? (showFullParent ? parentNode.content_full : parentNode.content_compressed)
                : '(no target recorded)'}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #30363d' }}>
        {(['content', 'skills', 'links'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === tab ? '#21262d' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
              color: activeTab === tab ? '#fff' : '#666',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontSize: '14px',
            }}
          >
            {tab}
            {tab === 'links' && (linkedNodes.length + backlinks.length > 0) && (
              <span style={{ marginLeft: '4px', color: '#9b59b6' }}>
                ({linkedNodes.length + backlinks.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {activeTab === 'content' && (
          <div>
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
                    color: '#e0e0e0',
                    fontSize: '14px',
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
                  />
                ) : (
                  <div
                    style={{
                      padding: '16px',
                      background: '#0d1117',
                      borderRadius: '6px',
                      color: '#e0e0e0',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      maxHeight: '300px',
                      overflow: 'auto',
                    }}
                  >
                    <Markdown content={node.content_full} />
                  </div>
                )}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{
                      padding: '8px 16px',
                      background: '#21262d',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  {node.type !== 'root' && (
                    <button
                      onClick={onNodeDelete}
                      style={{
                        padding: '8px 16px',
                        background: '#21262d',
                        border: '1px solid #f85149',
                        borderRadius: '6px',
                        color: '#f85149',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Chat input */}
            <form onSubmit={handleChatSubmit} style={{ marginTop: '24px' }}>
              <label style={{ color: '#666', fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                Ask about this node
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a question..."
                  disabled={isRunning}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
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
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    opacity: isRunning ? 0.6 : 1,
                  }}
                >
                  {isRunning ? '...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'skills' && (
          <div>
            <p style={{ color: '#666', fontSize: '12px', marginBottom: '16px' }}>
              Run a skill on this node to create a new child node.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {skills.map((skill) => (
                <button
                  key={skill.name}
                  onClick={() => onSkillRun(skill.name)}
                  disabled={isRunning}
                  style={{
                    padding: '12px',
                    background: '#21262d',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: isRunning ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{skill.display_name}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>{skill.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'links' && (
          <div>
            {/* Outgoing links */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ color: '#9b59b6', margin: '0 0 12px', fontSize: '14px' }}>
                Links from this node ({linkedNodes.length})
              </h4>
              {linkedNodes.length === 0 ? (
                <p style={{ color: '#666', fontSize: '13px' }}>No outgoing links</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {linkedNodes.map((linked) => (
                    <div
                      key={linked.id}
                      style={{
                        padding: '10px',
                        background: '#21262d',
                        borderRadius: '6px',
                        borderLeft: '3px solid #9b59b6',
                      }}
                    >
                      <div style={{ fontSize: '11px', color: '#9b59b6', marginBottom: '4px' }}>
                        {linked.operation || linked.type}
                      </div>
                      <div style={{ color: '#c9d1d9', fontSize: '13px' }}>
                        {linked.content_compressed}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Backlinks */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ color: '#58a6ff', margin: '0 0 12px', fontSize: '14px' }}>
                Links to this node ({backlinks.length})
              </h4>
              {backlinks.length === 0 ? (
                <p style={{ color: '#666', fontSize: '13px' }}>No incoming links</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {backlinks.map((bl) => (
                    <div
                      key={bl.id}
                      style={{
                        padding: '10px',
                        background: '#21262d',
                        borderRadius: '6px',
                        borderLeft: '3px solid #58a6ff',
                      }}
                    >
                      <div style={{ fontSize: '11px', color: '#58a6ff', marginBottom: '4px' }}>
                        {bl.operation || bl.type}
                      </div>
                      <div style={{ color: '#c9d1d9', fontSize: '13px' }}>
                        {bl.content_compressed}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add link */}
            <div>
              <h4 style={{ color: '#666', margin: '0 0 8px', fontSize: '14px' }}>Add a link</h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Target node ID..."
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#e0e0e0',
                    fontSize: '14px',
                  }}
                />
                <button
                  onClick={handleAddLink}
                  disabled={!linkInput.trim()}
                  style={{
                    padding: '10px 16px',
                    background: '#9b59b6',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: linkInput.trim() ? 'pointer' : 'not-allowed',
                    opacity: linkInput.trim() ? 1 : 0.6,
                  }}
                >
                  Link
                </button>
              </div>
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
