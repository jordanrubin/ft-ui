import { useState, useMemo } from 'react';
import type { CanvasNode, ParsedResponse } from '../types';
import { parseSkillResponse } from '../utils/responseParser';
import SubsectionCard from './SubsectionCard';

interface SubsectionViewerProps {
  node: CanvasNode;
  onAnswerSave?: (nodeId: string, answers: Record<string, string>) => void;
  onSubsectionSelect?: (content: string | undefined) => void;
}

export default function SubsectionViewer({
  node,
  onAnswerSave,
  onSubsectionSelect,
}: SubsectionViewerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Load answers from localStorage on mount
  const storageKey = `rf-answers-${node.id}`;
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Parse the response content
  const parsedResponse = useMemo((): ParsedResponse => {
    return parseSkillResponse(node.content_full, node.operation);
  }, [node.content_full, node.operation]);

  // Handle answer updates - save to localStorage
  const handleAnswer = (subsectionId: string, answer: string) => {
    const newAnswers = { ...answers, [subsectionId]: answer };
    setAnswers(newAnswers);
    localStorage.setItem(storageKey, JSON.stringify(newAnswers));
    if (onAnswerSave) {
      onAnswerSave(node.id, newAnswers);
    }
  };

  // Merge answers into subsections for display
  const subsectionsWithAnswers = useMemo(() => {
    return parsedResponse.subsections.map(sub => ({
      ...sub,
      answer: answers[sub.id] || sub.answer,
    }));
  }, [parsedResponse.subsections, answers]);

  // Check if we have meaningful structure to display
  const hasContent = parsedResponse.mainContent != null || parsedResponse.subsections.length > 0;

  const handleSelect = (id: string) => {
    const newId = selectedId === id ? null : id;
    setSelectedId(newId);
    // Notify parent of selection change
    if (onSubsectionSelect) {
      if (newId) {
        const sub = subsectionsWithAnswers.find(s => s.id === newId);
        const content = sub ? (sub.content ? `${sub.title}\n\n${sub.content}` : sub.title) : undefined;
        onSubsectionSelect(content);
      } else {
        onSubsectionSelect(undefined);
      }
    }
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
        {subsectionsWithAnswers.map((subsection) => (
          <SubsectionCard
            key={subsection.id}
            subsection={subsection}
            isSelected={selectedId === subsection.id}
            onSelect={handleSelect}
            onAnswer={handleAnswer}
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
