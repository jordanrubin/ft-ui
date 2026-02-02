import { useState, useMemo } from 'react';
import type { CanvasNode, SkillInfo, ParsedResponse } from '../types';
import { parseSkillResponse } from '../utils/responseParser';
import SubsectionCard from './SubsectionCard';

interface SubsectionViewerProps {
  node: CanvasNode;
  skills: SkillInfo[];
  onSkillRunOnSelection: (skillName: string, content: string) => void;
  isRunning: boolean;
}

export default function SubsectionViewer({
  node,
  skills,
  onSkillRunOnSelection,
  isRunning,
}: SubsectionViewerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Parse the response content
  const parsedResponse = useMemo((): ParsedResponse => {
    return parseSkillResponse(node.content_full, node.operation);
  }, [node.content_full, node.operation]);

  // Check if we have meaningful structure to display
  const hasContent = parsedResponse.mainContent != null || parsedResponse.subsections.length > 0;

  const handleSelect = (id: string) => {
    setSelectedId(selectedId === id ? null : id);
  };

  const handleSkillRun = (skillName: string, content: string) => {
    onSkillRunOnSelection(skillName, content);
  };

  // Get section label based on content type - only for skill-specific outputs
  const getSectionLabel = () => {
    // Only show labels for skill-specific parsers, not generic content
    const skill = node.operation?.toLowerCase().replace('@', '');
    if (!skill || skill === 'chat') return null;

    const firstType = parsedResponse.subsections[0]?.type;
    switch (firstType) {
      case 'antithesis':
        return 'ANTITHESES';
      case 'crux':
        return 'CRUXES';
      case 'assumption':
        return 'ASSUMPTIONS';
      case 'alternative':
        return 'ALTERNATIVES';
      case 'failure_mode':
        return 'FAILURE MODES';
      case 'dimension':
        return 'DIMENSIONS';
      default:
        return null; // Don't show a label for generic/section/proposal/question
    }
  };

  // If no meaningful structure, show clean formatted content
  if (!hasContent) {
    return (
      <div style={{
        background: '#f8fafc',
        borderRadius: '12px',
        padding: '20px',
      }}>
        {/* Header */}
        <div style={{
          background: '#18181b',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '16px',
        }}>
          <div style={{
            color: '#a1a1aa',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            {node.operation || 'response'}
          </div>
        </div>

        {/* Content - nicely formatted */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e5e7eb',
          color: '#374151',
          fontSize: '14px',
          lineHeight: 1.8,
          whiteSpace: 'pre-wrap',
        }}>
          {node.content_full}
        </div>
      </div>
    );
  }

  const sectionLabel = getSectionLabel();

  return (
    <div style={{
      background: '#f8fafc',
      borderRadius: '12px',
      padding: '20px',
    }}>
      {/* Header card */}
      <div style={{
        background: '#18181b',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '16px',
      }}>
        <div style={{
          color: '#a1a1aa',
          fontSize: '13px',
          fontWeight: 500,
        }}>
          {node.operation || 'response'}
        </div>
      </div>

      {/* Main content (thesis) */}
      {parsedResponse.mainContent && (
        <div
          style={{
            background: '#27272a',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '16px',
            border: selectedId === parsedResponse.mainContent.id
              ? '2px solid #3b82f6'
              : '2px solid transparent',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease',
          }}
          onClick={() => handleSelect(parsedResponse.mainContent!.id)}
        >
          <div style={{
            color: '#a1a1aa',
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: '10px',
            letterSpacing: '0.5px',
          }}>
            {parsedResponse.mainContent.title}
          </div>
          <div style={{
            color: '#e5e7eb',
            fontSize: '14px',
            lineHeight: 1.7,
          }}>
            {parsedResponse.mainContent.content}
          </div>

          {/* Skill buttons when selected */}
          {selectedId === parsedResponse.mainContent.id && skills.length > 0 && (
            <div style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #3f3f46',
            }}>
              <div style={{
                fontSize: '12px',
                color: '#a1a1aa',
                marginBottom: '10px',
                fontWeight: 500,
              }}>
                Run skill on this:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {skills.map((skill) => (
                  <button
                    key={skill.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSkillRun(skill.name, parsedResponse.mainContent!.content);
                    }}
                    disabled={isRunning}
                    style={{
                      padding: '8px 14px',
                      background: '#3f3f46',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: isRunning ? 'not-allowed' : 'pointer',
                      opacity: isRunning ? 0.6 : 1,
                    }}
                  >
                    {skill.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hint - minimal, only for first-time users */}
      {!selectedId && parsedResponse.subsections.length > 0 && (
        <div style={{
          fontSize: '12px',
          color: '#9ca3af',
          marginBottom: '12px',
          fontStyle: 'italic',
        }}>
          Click to select, then run a skill on it
        </div>
      )}

      {/* Subsections label */}
      {sectionLabel && parsedResponse.subsections.length > 0 && (
        <div style={{
          color: '#6b7280',
          fontSize: '12px',
          fontWeight: 600,
          marginBottom: '12px',
          letterSpacing: '0.5px',
        }}>
          {sectionLabel}
        </div>
      )}

      {/* Subsection cards */}
      <div>
        {parsedResponse.subsections.map((subsection) => (
          <SubsectionCard
            key={subsection.id}
            subsection={subsection}
            isSelected={selectedId === subsection.id}
            onSelect={handleSelect}
            onSkillRun={handleSkillRun}
            skills={skills}
          />
        ))}
      </div>

      {/* Toggle raw view */}
      <div style={{
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: '1px solid #e5e7eb',
      }}>
        <button
          onClick={() => setShowRaw(!showRaw)}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            fontSize: '13px',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: '10px' }}>{showRaw ? '▼' : '▶'}</span>
          {showRaw ? 'Hide' : 'Show'} raw response
        </button>

        {showRaw && (
          <div style={{
            marginTop: '12px',
            padding: '16px',
            background: '#f1f5f9',
            borderRadius: '8px',
            color: '#475569',
            fontSize: '13px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            maxHeight: '300px',
            overflow: 'auto',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {parsedResponse.rawContent}
          </div>
        )}
      </div>
    </div>
  );
}
