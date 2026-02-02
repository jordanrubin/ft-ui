// Skills pane for sidebar - shown when a node is selected

import type { CanvasNode, SkillInfo } from '../types';

interface SkillsPaneProps {
  node: CanvasNode;
  skills: SkillInfo[];
  selectedContent?: string; // If a subsection is selected
  onRunSkill: (skillName: string, content?: string) => void;
  onClose: () => void;
  isRunning: boolean;
}

export default function SkillsPane({
  node,
  skills,
  selectedContent,
  onRunSkill,
  onClose,
  isRunning,
}: SkillsPaneProps) {

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
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase' }}>
          Skills
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

      {/* Target indicator - minimal */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid #30363d',
        background: '#0d1117',
        fontSize: '11px',
        color: '#8b949e',
      }}>
        {selectedContent ? (
          <span style={{ color: '#58a6ff' }}>selection</span>
        ) : (
          <span>{node.operation || 'root'}</span>
        )}
      </div>

      {/* Skills list - single column */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {isRunning ? (
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
            {skills.map((skill) => (
              <button
                key={skill.name}
                onClick={() => onRunSkill(skill.name, selectedContent)}
                title={skill.description || ''}
                style={{
                  padding: '8px 12px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#30363d';
                  e.currentTarget.style.borderColor = '#58a6ff';
                  e.currentTarget.style.color = '#58a6ff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#21262d';
                  e.currentTarget.style.borderColor = '#30363d';
                  e.currentTarget.style.color = '#c9d1d9';
                }}
              >
                @{skill.name}
              </button>
            ))}
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
