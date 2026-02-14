// Skills pane for sidebar - shown when a node is selected

import { useState } from 'react';
import type { CanvasNode, SkillInfo } from '../types';

interface SkillsPaneProps {
  node: CanvasNode;
  skills: SkillInfo[];
  selectedContent?: string; // If a subsection is selected
  onRunSkill: (skillName: string, content?: string) => void;
  onRunSkillQueue?: (skillNames: string[], content?: string) => void; // Run skills sequentially
  onClearSelection?: () => void;
  onClose: () => void;
  isRunning: boolean;
}

export default function SkillsPane({
  node,
  skills,
  selectedContent,
  onRunSkill,
  onRunSkillQueue,
  onClearSelection,
  onClose,
  isRunning,
}: SkillsPaneProps) {
  const [queueMode, setQueueMode] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);

  const handleSkillClick = (skillName: string) => {
    if (queueMode) {
      // Toggle skill in queue
      setQueue(prev =>
        prev.includes(skillName)
          ? prev.filter(s => s !== skillName)
          : [...prev, skillName]
      );
    } else {
      onRunSkill(skillName, selectedContent);
    }
  };

  const handleRunQueue = () => {
    if (queue.length === 0) return;
    if (onRunSkillQueue) {
      onRunSkillQueue(queue, selectedContent);
    } else {
      // Fallback: run first skill only
      onRunSkill(queue[0], selectedContent);
    }
    setQueue([]);
    setQueueMode(false);
  };

  const handleClearQueue = () => {
    setQueue([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Compact header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase' }}>
            Skills
          </div>
          <button
            onClick={() => {
              setQueueMode(!queueMode);
              if (queueMode) setQueue([]);
            }}
            title={queueMode ? 'Exit queue mode' : 'Queue multiple skills to run in sequence'}
            style={{
              padding: '2px 6px',
              background: queueMode ? '#8b5cf6' : '#21262d',
              border: '1px solid #30363d',
              borderRadius: '4px',
              color: queueMode ? '#fff' : '#8b949e',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 500,
            }}
          >
            {queueMode ? 'queuing' : 'queue'}
          </button>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: '14px',
          }}
        >
          ×
        </button>
      </div>

      {/* Target indicator - clickable to clear selection */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid #30363d',
        background: '#0d1117',
        fontSize: '11px',
        color: '#8b949e',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {selectedContent ? (
          <>
            <span style={{ color: '#58a6ff' }}>on selection</span>
            <button
              onClick={onClearSelection}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                cursor: 'pointer',
                fontSize: '10px',
                padding: '2px 6px',
              }}
              title="Clear selection, run on full node"
            >
              × clear
            </button>
          </>
        ) : (
          <span>on {node.operation || 'root'}</span>
        )}
      </div>

      {/* Queue display */}
      {queueMode && queue.length > 0 && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid #30363d',
          background: '#1c1428',
        }}>
          <div style={{ fontSize: '10px', color: '#a78bfa', marginBottom: '6px', fontWeight: 600 }}>
            QUEUED ({queue.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
            {queue.map((skillName, idx) => (
              <span
                key={skillName}
                style={{
                  padding: '2px 6px',
                  background: '#8b5cf6',
                  color: '#fff',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
              >
                {idx + 1}. @{skillName}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleRunQueue}
              disabled={isRunning}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: '#8b5cf6',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.6 : 1,
              }}
            >
              Run Queue →
            </button>
            <button
              onClick={handleClearQueue}
              style={{
                padding: '6px 10px',
                background: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#8b949e',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Skills list - single column */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {isRunning && !queueMode ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: '#8b949e',
          }}>
            Running skill...
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            {skills.map((skill) => {
              const isQueued = queue.includes(skill.name);
              const queuePosition = queue.indexOf(skill.name) + 1;
              return (
                <button
                  key={skill.name}
                  onClick={() => handleSkillClick(skill.name)}
                  title={skill.description || ''}
                  style={{
                    padding: '8px 12px',
                    background: isQueued ? '#2d1f42' : '#21262d',
                    border: isQueued ? '1px solid #8b5cf6' : '1px solid #30363d',
                    borderRadius: '6px',
                    color: isQueued ? '#a78bfa' : '#c9d1d9',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseOver={(e) => {
                    if (!isQueued) {
                      e.currentTarget.style.background = '#30363d';
                      e.currentTarget.style.borderColor = queueMode ? '#8b5cf6' : '#58a6ff';
                      e.currentTarget.style.color = queueMode ? '#a78bfa' : '#58a6ff';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isQueued) {
                      e.currentTarget.style.background = '#21262d';
                      e.currentTarget.style.borderColor = '#30363d';
                      e.currentTarget.style.color = '#c9d1d9';
                    }
                  }}
                >
                  <span>@{skill.name}</span>
                  {isQueued && (
                    <span style={{
                      padding: '2px 6px',
                      background: '#8b5cf6',
                      color: '#fff',
                      fontSize: '10px',
                      borderRadius: '10px',
                      fontWeight: 600,
                    }}>
                      {queuePosition}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid #30363d',
        background: '#0d1117',
      }}>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '8px' }}>
          Or enter freeform prompt:
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem('prompt') as HTMLInputElement;
            if (input.value.trim()) {
              onRunSkill('chat:' + input.value.trim(), selectedContent);
              input.value = '';
            }
          }}
          style={{ display: 'flex', gap: '8px' }}
        >
          <input
            name="prompt"
            type="text"
            placeholder="Ask Claude anything..."
            disabled={isRunning}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              fontSize: '13px',
            }}
          />
          <button
            type="submit"
            disabled={isRunning}
            style={{
              padding: '8px 16px',
              background: '#238636',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.6 : 1,
            }}
          >
            Go
          </button>
        </form>
      </div>
    </div>
  );
}
