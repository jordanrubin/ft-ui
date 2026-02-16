import { useState, useMemo, useEffect } from 'react';
import type { CanvasNode, ParsedResponse, Subsection, SubsectionType, ImportanceLevel } from '../types';
import { parseSkillResponse } from '../utils/responseParser';
import { parseCanvasResponse, type CanvasArtifact, type CanvasBlock, type CanvasItem, type Importance } from '../types/canvasArtifact';
import SubsectionCard from './SubsectionCard';

// Map CanvasArtifact block kinds to SubsectionType
function mapBlockKindToType(kind: string): SubsectionType {
  const mapping: Record<string, SubsectionType> = {
    cruxes: 'crux',
    crux: 'crux',
    antitheses: 'antithesis',
    antithesis: 'antithesis',
    alternatives: 'alternative',
    alternative: 'alternative',
    failure_modes: 'failure_mode',
    failure_mode: 'failure_mode',
    questions: 'question',
    question: 'question',
    assumptions: 'assumption',
    assumption: 'assumption',
    dimensions: 'dimension',
    dimension: 'dimension',
    proposals: 'proposal',
    proposal: 'proposal',
  };
  return mapping[kind.toLowerCase()] || 'generic';
}

// Map CanvasArtifact importance to SubsectionType importance
function mapImportance(importance?: Importance): ImportanceLevel | undefined {
  if (!importance) return undefined;
  if (importance === 'critical') return 'high';
  return importance as ImportanceLevel;
}

interface SubsectionViewerProps {
  node: CanvasNode;
  onAnswerSave?: (nodeId: string, answers: Record<string, string>) => void;
  onSubsectionSelect?: (content: string | undefined) => void;
  onContinueWithAnswers?: (nodeId: string, formattedAnswers: string) => void;
  availableSkills?: string[];
}

export default function SubsectionViewer({
  node,
  onAnswerSave,
  onSubsectionSelect,
  onContinueWithAnswers,
  availableSkills = [],
}: SubsectionViewerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const MAX_VISIBLE_CARDS = 5;

  // Load answers from localStorage
  const storageKey = `rf-answers-${node.id}`;
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Reload answers when node changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      setAnswers(stored ? JSON.parse(stored) : {});
    } catch {
      setAnswers({});
    }
  }, [storageKey]);

  // Try to parse as CanvasArtifact first, then fall back to legacy parser
  const { artifact, parsedResponse } = useMemo((): { artifact: CanvasArtifact | null; parsedResponse: ParsedResponse } => {
    const { artifact, raw } = parseCanvasResponse(node.content_full);

    if (artifact) {
      // Convert CanvasArtifact to ParsedResponse format for backward compatibility
      const subsections: Subsection[] = artifact.blocks.flatMap((block: CanvasBlock) =>
        block.items.map((item: CanvasItem, idx: number): Subsection => ({
          id: item.id || `${block.kind}_${idx}`,
          type: mapBlockKindToType(block.kind),
          title: item.title || item.text.slice(0, 60) + (item.text.length > 60 ? '...' : ''),
          content: item.text,
          importance: mapImportance(item.importance),
          tags: item.tags?.map(t => ({ label: t, color: 'gray' as const })),
        }))
      );

      return {
        artifact,
        parsedResponse: {
          subsections,
          rawContent: raw,
        },
      };
    }

    // Fall back to legacy parsing
    return {
      artifact: null,
      parsedResponse: parseSkillResponse(node.content_full, node.operation),
    };
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

  // Check if any answers exist
  const hasAnyAnswers = Object.keys(answers).length > 0;

  // Format answers for chat continuation
  const formatAnswersForChat = () => {
    const lines: string[] = [];
    for (const sub of subsectionsWithAnswers) {
      if (sub.answer) {
        lines.push(`**${sub.title}**: ${sub.answer}`);
      }
    }
    return lines.join('\n\n');
  };

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

  // Get section labels - prefer artifact block titles, fall back to type-based labels
  const getSectionLabels = (): string[] => {
    // If we have a CanvasArtifact, use block titles
    if (artifact) {
      return artifact.blocks.map(b => b.title.toUpperCase());
    }

    // Fall back to legacy type-based label
    const skill = node.operation?.toLowerCase().replace('@', '');
    if (!skill || skill === 'chat') return [];

    const firstType = parsedResponse.subsections[0]?.type;
    switch (firstType) {
      case 'antithesis':
        return ['ANTITHESES'];
      case 'crux':
        return ['CRUXES'];
      case 'assumption':
        return ['ASSUMPTIONS'];
      case 'alternative':
        return ['ALTERNATIVES'];
      case 'failure_mode':
        return ['FAILURE MODES'];
      case 'dimension':
        return ['DIMENSIONS'];
      default:
        return [];
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

  const sectionLabels = getSectionLabels();

  return (
    <div style={{
      background: '#f8fafc',
      borderRadius: '12px',
      padding: '20px',
      overscrollBehavior: 'contain',
      WebkitOverflowScrolling: 'touch',
    }}>
      {/* Artifact summary - shown at top for structured responses */}
      {artifact?.summary && (
        <div style={{
          background: '#27272a',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '16px',
        }}>
          <div style={{
            color: '#a1a1aa',
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: '8px',
            letterSpacing: '0.5px',
          }}>
            SUMMARY
          </div>
          <div style={{
            color: '#e5e7eb',
            fontSize: '14px',
            lineHeight: 1.6,
          }}>
            {artifact.summary}
          </div>
        </div>
      )}

      {/* Main content (thesis) - legacy format */}
      {!artifact && parsedResponse.mainContent && (
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
      {sectionLabels.length > 0 && parsedResponse.subsections.length > 0 && (
        <div style={{
          color: '#6b7280',
          fontSize: '12px',
          fontWeight: 600,
          marginBottom: '12px',
          letterSpacing: '0.5px',
        }}>
          {sectionLabels[0]}
        </div>
      )}

      {/* Subsection cards - capped at MAX_VISIBLE_CARDS, overflow shown as compact list */}
      <div>
        {subsectionsWithAnswers.slice(0, MAX_VISIBLE_CARDS).map((subsection) => (
          <SubsectionCard
            key={subsection.id}
            subsection={subsection}
            isSelected={selectedId === subsection.id}
            onSelect={handleSelect}
            onAnswer={handleAnswer}
          />
        ))}
        {subsectionsWithAnswers.length > MAX_VISIBLE_CARDS && (
          <div style={{ marginTop: '8px' }}>
            <button
              onClick={() => setShowOverflow(!showOverflow)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                color: '#a1a1aa',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{showOverflow ? 'Hide' : `${subsectionsWithAnswers.length - MAX_VISIBLE_CARDS} more...`}</span>
              <span style={{ fontSize: '10px' }}>{showOverflow ? '▼' : '▶'}</span>
            </button>
            {showOverflow && subsectionsWithAnswers.slice(MAX_VISIBLE_CARDS).map((subsection) => (
              <SubsectionCard
                key={subsection.id}
                subsection={subsection}
                isSelected={selectedId === subsection.id}
                onSelect={handleSelect}
                onAnswer={handleAnswer}
              />
            ))}
          </div>
        )}
      </div>

      {/* Continue with answers button */}
      {onContinueWithAnswers && parsedResponse.subsections.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => {
              if (hasAnyAnswers) {
                onContinueWithAnswers(node.id, formatAnswersForChat());
              }
            }}
            disabled={!hasAnyAnswers}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: hasAnyAnswers ? '#3b82f6' : '#e5e7eb',
              border: 'none',
              borderRadius: '8px',
              color: hasAnyAnswers ? '#fff' : '#9ca3af',
              fontSize: '14px',
              fontWeight: 600,
              cursor: hasAnyAnswers ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Continue with responses</span>
            {hasAnyAnswers && (
              <span style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '12px',
              }}>
                {Object.keys(answers).length}
              </span>
            )}
          </button>
          {!hasAnyAnswers && (
            <div style={{
              fontSize: '12px',
              color: '#9ca3af',
              textAlign: 'center',
              marginTop: '8px',
            }}>
              Add responses to subsections above to continue
            </div>
          )}
        </div>
      )}

      {/* Suggested moves from artifact - filtered to available skills */}
      {artifact?.suggested_moves && artifact.suggested_moves.length > 0 && availableSkills.length > 0 && (() => {
        const filteredMoves = artifact.suggested_moves.filter(move =>
          move.skill && availableSkills.some(skill => skill.toLowerCase() === move.skill!.toLowerCase())
        );
        if (filteredMoves.length === 0) return null;
        return (
          <div style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}>
            <div style={{
              color: '#6b7280',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '10px',
              letterSpacing: '0.5px',
            }}>
              SUGGESTED NEXT
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {filteredMoves.map((move, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#e0e7ff',
                    color: '#3730a3',
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '6px 12px',
                    borderRadius: '16px',
                    cursor: 'default',
                  }}
                  title={move.reason}
                >
                  {move.skill}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Warnings from artifact */}
      {artifact?.warnings && artifact.warnings.length > 0 && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: '#fef3c7',
          borderRadius: '8px',
          border: '1px solid #fcd34d',
        }}>
          <div style={{
            color: '#92400e',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '6px',
          }}>
            CAVEATS
          </div>
          <ul style={{
            margin: 0,
            paddingLeft: '20px',
            color: '#78350f',
            fontSize: '13px',
          }}>
            {artifact.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

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
            position: 'relative',
          }}>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const text = parsedResponse.rawContent;
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  // Fallback for non-HTTPS or permission denied
                  const textarea = document.createElement('textarea');
                  textarea.value = text;
                  textarea.style.position = 'fixed';
                  textarea.style.opacity = '0';
                  document.body.appendChild(textarea);
                  textarea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textarea);
                }
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                padding: '6px 10px',
                background: copied ? '#059669' : '#475569',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                zIndex: 10,
              }}
            >
              {copied ? '\u2713 Copied' : 'Copy'}
            </button>
            <div style={{
              padding: '16px',
              paddingTop: '36px',
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
          </div>
        )}
      </div>
    </div>
  );
}
