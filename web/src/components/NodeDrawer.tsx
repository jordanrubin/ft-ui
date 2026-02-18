import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { CanvasNode, SkillInfo, Mode } from '../types/canvas';
import SubsectionViewer from './SubsectionViewer';
import { isStructuredResponse } from '../utils/responseParser';
import { Markdown } from '../utils/markdown';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface NodeDrawerProps {
  node: CanvasNode | null;
  parentNode: CanvasNode | null;
  skills: SkillInfo[];
  onClose: () => void;
  onSkillRun: (skillName: string, mode?: Mode) => void;
  activeMode?: Mode | null;
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
  onSkillRun,
  activeMode: activeModeProp,
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
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter skills based on input text
  const filteredSkills = chatInput.trim()
    ? skills.filter(s =>
        s.name.toLowerCase().includes(chatInput.trim().toLowerCase()) ||
        s.display_name.toLowerCase().includes(chatInput.trim().toLowerCase()) ||
        s.description.toLowerCase().includes(chatInput.trim().toLowerCase())
      )
    : skills;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowSkillDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [chatInput]);

  const handleSkillSelect = useCallback((skillName: string) => {
    onSkillRun(skillName, activeModeProp ?? undefined);
    setChatInput('');
    setShowSkillDropdown(false);
    setHighlightedIndex(-1);
  }, [onSkillRun, activeModeProp]);

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
    const text = chatInput.trim();
    if (!text) return;

    // If a skill is highlighted in the dropdown, run it
    if (showSkillDropdown && highlightedIndex >= 0 && highlightedIndex < filteredSkills.length) {
      handleSkillSelect(filteredSkills[highlightedIndex].name);
      return;
    }

    // If input exactly matches a skill name (with or without @), run it
    const normalized = text.replace(/^@/, '').toLowerCase();
    const exactMatch = skills.find(s => s.name.toLowerCase() === normalized);
    if (exactMatch) {
      handleSkillSelect(exactMatch.name);
      return;
    }

    // Otherwise, send as chat
    onChatSubmit(text);
    setChatInput('');
    setShowSkillDropdown(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (!showSkillDropdown || filteredSkills.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = highlightedIndex < filteredSkills.length - 1 ? highlightedIndex + 1 : 0;
      setHighlightedIndex(next);
      dropdownRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = highlightedIndex > 0 ? highlightedIndex - 1 : filteredSkills.length - 1;
      setHighlightedIndex(next);
      dropdownRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape') {
      setShowSkillDropdown(false);
      setHighlightedIndex(-1);
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
          {((node.input_tokens ?? 0) > 0 || (node.output_tokens ?? 0) > 0) && (
            <span
              style={{
                fontSize: '10px',
                color: '#484f58',
              }}
              title={`Input: ${node.input_tokens?.toLocaleString() ?? 0} | Output: ${node.output_tokens?.toLocaleString() ?? 0}`}
            >
              {formatTokens(node.input_tokens ?? 0)} in / {formatTokens(node.output_tokens ?? 0)} out
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

      {/* Content — scrollable middle */}
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

        {/* Run on section - at bottom of content */}
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

      {/* Loading indicator — thin bar above input */}
      {isRunning && (
        <div
          style={{
            padding: '6px 16px',
            background: '#161b22',
            borderTop: '1px solid #30363d',
            color: '#8b5cf6',
            fontSize: '12px',
            textAlign: 'center',
            letterSpacing: '0.05em',
          }}
        >
          Running...
        </div>
      )}

      {/* Combobox input — fixed at bottom */}
      <form onSubmit={handleChatSubmit} style={{
        padding: '12px 16px',
        borderTop: '1px solid #30363d',
        background: '#0d1117',
        position: 'relative',
        flexShrink: 0,
      }}>
        {/* Skill dropdown — opens upward into content area */}
        {showSkillDropdown && !isRunning && filteredSkills.length > 0 && (
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '12px',
              right: '12px',
              marginBottom: '0',
              background: '#161b22',
              border: '1px solid #30363d',
              borderBottom: 'none',
              borderRadius: '8px 8px 0 0',
              maxHeight: '280px',
              overflowY: 'auto',
              zIndex: 50,
              boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {filteredSkills.map((skill, i) => (
              <div
                key={skill.name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSkillSelect(skill.name);
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  background: i === highlightedIndex ? '#21262d' : 'transparent',
                  borderBottom: i < filteredSkills.length - 1 ? '1px solid #1c2128' : 'none',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: i === highlightedIndex ? '#8b5cf6' : '#c9d1d9',
                }}>
                  @{skill.name}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#484f58',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {skill.description}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={(e) => {
              setChatInput(e.target.value);
              setShowSkillDropdown(true);
            }}
            onFocus={() => setShowSkillDropdown(true)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask a question or pick a skill..."
            disabled={isRunning}
            autoComplete="off"
            style={{
              flex: 1,
              padding: '10px 12px',
              background: '#21262d',
              border: `1px solid ${showSkillDropdown ? '#8b5cf6' : '#30363d'}`,
              borderRadius: showSkillDropdown && filteredSkills.length > 0 ? '0 0 8px 8px' : '8px',
              color: '#e0e0e0',
              fontSize: '14px',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
          />
          <button
            type="submit"
            disabled={isRunning || !chatInput.trim()}
            style={{
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              color: chatInput.trim() && !isRunning ? '#8b5cf6' : '#484f58',
              cursor: isRunning || !chatInput.trim() ? 'default' : 'pointer',
              fontSize: '18px',
              flexShrink: 0,
              lineHeight: 1,
              transition: 'color 0.15s',
            }}
            title="Send"
          >
            {isRunning ? '\u00B7\u00B7\u00B7' : '\u2191'}
          </button>
        </div>
      </form>
    </div>
  );
}
