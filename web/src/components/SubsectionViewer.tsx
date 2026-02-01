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

  if (!hasStructure) {
    // No structured content, show raw
    return (
      <div
        style={{
          padding: '16px',
          background: '#0d1117',
          borderRadius: '6px',
          color: '#e0e0e0',
          fontSize: '14px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          maxHeight: '400px',
          overflow: 'auto',
        }}
      >
        {node.content_full}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      {parsedResponse.header && (
        <div
          style={{
            background: '#1a1a1a',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>
            {parsedResponse.header.skill}
            {parsedResponse.header.compressed && ' \u2192 compressed'}
          </div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: 500 }}>
            "{parsedResponse.header.input}"
          </div>
        </div>
      )}

      {/* How to use hint */}
      {!selectedId && (
        <div
          style={{
            background: '#fffde7',
            border: '1px solid #fff9c4',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#5d4037',
          }}
        >
          <strong>How to use:</strong> Click a {parsedResponse.mainContent ? 'section' : 'item'} to select it,
          then click an operation button to copy the prompt. Paste in chat to run.
        </div>
      )}

      {/* Main content (thesis) */}
      {parsedResponse.mainContent && (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              background: '#2d2d2d',
              borderRadius: '8px',
              padding: '16px',
              border: selectedId === parsedResponse.mainContent.id ? '2px solid #2196f3' : '2px solid transparent',
              cursor: 'pointer',
            }}
            onClick={() => handleSelect(parsedResponse.mainContent!.id)}
          >
            <div style={{ color: '#888', fontSize: '11px', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.5px' }}>
              {parsedResponse.mainContent.title.toUpperCase()}
            </div>
            <div style={{ color: '#e0e0e0', fontSize: '14px', lineHeight: 1.6 }}>
              {parsedResponse.mainContent.content}
            </div>

            {/* Skill buttons when selected */}
            {selectedId === parsedResponse.mainContent.id && (
              <div style={{ marginTop: '12px', borderTop: '1px solid #444', paddingTop: '12px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                  Run skill on selection:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {suggestedSkills.map((skillName) => (
                    <button
                      key={skillName}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSkillRun(skillName, parsedResponse.mainContent!.content);
                      }}
                      disabled={isRunning}
                      style={{
                        padding: '6px 12px',
                        background: '#3d3d3d',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        opacity: isRunning ? 0.6 : 1,
                      }}
                    >
                      {skillName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subsections header */}
      {parsedResponse.subsections.length > 0 && (
        <div
          style={{
            color: '#666',
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: '8px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {parsedResponse.subsections[0]?.type === 'antithesis'
            ? 'ANTITHESES \u2014 CLICK TO EXPAND'
            : parsedResponse.subsections[0]?.type === 'crux'
            ? 'CRUXES \u2014 CLICK TO SELECT'
            : 'SECTIONS \u2014 CLICK TO SELECT'}
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
      <div style={{ marginTop: '16px', borderTop: '1px solid #30363d', paddingTop: '12px' }}>
        <button
          onClick={() => setShowRaw(!showRaw)}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            fontSize: '12px',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {showRaw ? '\u25BC Hide' : '\u25B6 Show'} raw response
        </button>

        {showRaw && (
          <div
            style={{
              marginTop: '8px',
              padding: '12px',
              background: '#0d1117',
              borderRadius: '6px',
              color: '#8b949e',
              fontSize: '12px',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              maxHeight: '200px',
              overflow: 'auto',
            }}
          >
            {parsedResponse.rawContent}
          </div>
        )}
      </div>
    </div>
  );
}
