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
  const displayContent = selectedContent || node.content_compressed || node.content_full;
  const truncated = displayContent.length > 150
    ? displayContent.slice(0, 150) + '...'
    : displayContent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with back button */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            padding: '4px',
            fontSize: '16px',
          }}
        >
          ←
        </button>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#c9d1d9' }}>
            Run Skill
          </div>
          <div style={{ fontSize: '11px', color: '#8b949e' }}>
            {selectedContent ? 'on selection' : `on node: ${node.operation || 'root'}`}
          </div>
        </div>
      </div>

      {/* Invocation preview */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #30363d',
        background: '#161b22',
      }}>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px', textTransform: 'uppercase' }}>
          Run On
        </div>
        <div style={{
          fontSize: '13px',
          color: '#c9d1d9',
          lineHeight: 1.5,
          padding: '8px 10px',
          background: '#0d1117',
          borderRadius: '6px',
          border: '1px solid #30363d',
          maxHeight: '120px',
          overflow: 'auto',
        }}>
          <div style={{ color: '#8b949e', fontSize: '11px', marginBottom: '4px' }}>
            {selectedContent ? 'Selection:' : 'Node content:'}
          </div>
          {truncated}
        </div>
      </div>

      {/* Skills grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '12px', textTransform: 'uppercase' }}>
          Available Skills
        </div>

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
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
          }}>
            {skills.map((skill) => (
              <button
                key={skill.name}
                onClick={() => onRunSkill(skill.name, selectedContent)}
                style={{
                  padding: '12px 10px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#30363d';
                  e.currentTarget.style.borderColor = '#8b949e';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#21262d';
                  e.currentTarget.style.borderColor = '#30363d';
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '2px' }}>
                  @{skill.name}
                </div>
                <div style={{ fontSize: '11px', color: '#8b949e', lineHeight: 1.4 }}>
                  {skill.description?.slice(0, 60) || ''}
                  {(skill.description?.length || 0) > 60 ? '...' : ''}
                </div>
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
