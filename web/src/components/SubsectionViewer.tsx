import { useState, useMemo } from 'react';
import type { CanvasNode, SkillInfo, ParsedResponse, Subsection } from '../types';
import { parseSkillResponse, getSuggestedSkills } from '../utils/responseParser';
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

  const hasStructure = parsedResponse.subsections.length > 0 ||
    parsedResponse.mainContent != null;

  const handleSelect = (id: string) => {
    setSelectedId(selectedId === id ? null : id);
  };

  const handleSkillRun = (skillName: string, content: string) => {
    onSkillRunOnSelection(skillName, content);
  };

  // Find selected subsection for skill suggestions
  const selectedSubsection = useMemo((): Subsection | null => {
    if (!selectedId) return null;

    const findById = (subs: Subsection[]): Subsection | null => {
      for (const sub of subs) {
        if (sub.id === selectedId) return sub;
        if (sub.children) {
          const found = findById(sub.children);
          if (found) return found;
        }
      }
      return null;
    };

    if (parsedResponse.mainContent?.id === selectedId) {
      return parsedResponse.mainContent;
    }

    return findById(parsedResponse.subsections);
  }, [selectedId, parsedResponse]);

  const suggestedSkills = selectedSubsection
    ? getSuggestedSkills(selectedSubsection.type)
    : [];

  // Get section label based on content type
  const getSectionLabel = () => {
    const firstType = parsedResponse.subsections[0]?.type;
    switch (firstType) {
      case 'antithesis':
        return 'ANTITHESES — CLICK TO EXPAND';
      case 'crux':
        return 'CRUXES — CLICK TO SELECT';
      case 'assumption':
        return 'ASSUMPTIONS — CLICK TO SELECT';
      case 'alternative':
        return 'ALTERNATIVES — CLICK TO SELECT';
      case 'failure_mode':
        return 'FAILURE MODES — CLICK TO SELECT';
      case 'dimension':
        return 'DIMENSIONS — CLICK TO SELECT';
      default:
        return 'SECTIONS — CLICK TO SELECT';
    }
  };

  // Extract a short version of the input for the header
  const getInputPreview = () => {
    // Try to get from parent context or node content
    const lines = node.content_full.split('\n');
    const firstMeaningfulLine = lines.find(l => l.trim() && !l.startsWith('#'));
    if (firstMeaningfulLine && firstMeaningfulLine.length < 100) {
      return firstMeaningfulLine.trim();
    }
    return node.content_compressed || 'Response';
  };

  if (!hasStructure) {
    // No structured content - show as a simple formatted view
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
            fontSize: '12px',
            marginBottom: '6px',
          }}>
            {node.operation || 'response'}
          </div>
          <div style={{
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 500,
            lineHeight: 1.4,
          }}>
            "{getInputPreview()}"
          </div>
        </div>

        {/* Content */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #e5e7eb',
          color: '#374151',
          fontSize: '14px',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }}>
          {node.content_full}
        </div>
      </div>
    );
  }

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
          fontSize: '12px',
          marginBottom: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {node.operation || '@skill'}
          {parsedResponse.header?.compressed && (
            <>
              <span style={{ color: '#52525b' }}>→</span>
              <span>compressed</span>
            </>
          )}
        </div>
        <div style={{
          color: '#ffffff',
          fontSize: '16px',
          fontWeight: 500,
          lineHeight: 1.4,
        }}>
          "{getInputPreview()}"
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
            textTransform: 'uppercase',
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
          {selectedId === parsedResponse.mainContent.id && (
            <div style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #3f3f46',
            }}>
              <div style={{
                fontSize: '12px',
                color: '#ef4444',
                marginBottom: '10px',
                fontWeight: 500,
              }}>
                Run skill on selection:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {suggestedSkills.map((skillName) => (
                  <button
                    key={skillName}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSkillRun(skillName, parsedResponse.mainContent!.content);
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
                      transition: 'background 0.15s ease',
                    }}
                    onMouseOver={(e) => !isRunning && (e.currentTarget.style.background = '#52525b')}
                    onMouseOut={(e) => (e.currentTarget.style.background = '#3f3f46')}
                  >
                    {skillName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* How to use hint */}
      {!selectedId && parsedResponse.subsections.length > 0 && (
        <div style={{
          background: '#fef9c3',
          border: '1px solid #fde047',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          fontSize: '14px',
          color: '#713f12',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: '#a16207' }}>How to use:</strong>{' '}
          Click a {parsedResponse.subsections[0]?.type || 'section'} to select it, then click an operation button to copy the prompt. Paste in chat to run.
        </div>
      )}

      {/* Subsections header */}
      {parsedResponse.subsections.length > 0 && (
        <div style={{
          color: '#6b7280',
          fontSize: '12px',
          fontWeight: 600,
          marginBottom: '12px',
          letterSpacing: '0.5px',
        }}>
          {getSectionLabel()}
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
            suggestedSkills={getSuggestedSkills(subsection.type)}
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
