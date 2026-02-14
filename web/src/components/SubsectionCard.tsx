import { useState, useEffect } from 'react';
import type { Subsection } from '../types';

interface SubsectionCardProps {
  subsection: Subsection;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAnswer?: (id: string, answer: string) => void;
}

// Tag styling based on type
const TAG_STYLES: Record<string, { bg: string; text: string }> = {
  'rival thesis': { bg: '#fef2f2', text: '#b91c1c' },
  'selection critique': { bg: '#fff7ed', text: '#c2410c' },
  'boundary case': { bg: '#fef9c3', text: '#a16207' },
  'causal inversion': { bg: '#dbeafe', text: '#1d4ed8' },
  'scale dependence': { bg: '#f3e8ff', text: '#7c3aed' },
  'mechanism doubt': { bg: '#f3f4f6', text: '#4b5563' },
};

// Truncate text to a max length
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '...';
}

export default function SubsectionCard({
  subsection,
  isSelected,
  onSelect,
  onAnswer,
}: SubsectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [answerText, setAnswerText] = useState(subsection.answer || '');
  const [isAnswering, setIsAnswering] = useState(false);

  // Sync answerText when subsection.answer changes (e.g., on reopen)
  useEffect(() => {
    setAnswerText(subsection.answer || '');
  }, [subsection.answer]);

  const isQuestion = subsection.type === 'question';
  const hasAnswer = !!subsection.answer;

  const handleClick = () => {
    onSelect(subsection.id);
  };

  const handleExpandToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  // Get tag style
  const getTagStyle = (label: string) => {
    const style = TAG_STYLES[label.toLowerCase()];
    return style || { bg: '#f3f4f6', text: '#4b5563' };
  };

  // Determine if content is long enough to need truncation
  const contentLength = subsection.content?.length || 0;
  const needsTruncation = contentLength > 120;
  const displayContent = isExpanded || !needsTruncation
    ? subsection.content
    : truncate(subsection.content || '', 120);

  // Render importance/strength badge
  const renderBadge = () => {
    if (subsection.importance) {
      const isHigh = subsection.importance === 'high';
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          background: isHigh ? '#fef2f2' : '#f9fafb',
          color: isHigh ? '#dc2626' : '#6b7280',
        }}>
          {isHigh && '⚡ '}{subsection.importance}
        </span>
      );
    }
    if (subsection.strength) {
      const isStrong = subsection.strength === 'strong';
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          background: isStrong ? '#fef2f2' : '#f9fafb',
          color: isStrong ? '#dc2626' : '#6b7280',
        }}>
          {isStrong && '⚡ '}{subsection.strength}
        </span>
      );
    }
    return null;
  };

  return (
    <div
      onClick={handleClick}
      style={{
        background: '#ffffff',
        border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
        borderRadius: '10px',
        marginBottom: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: isSelected
          ? '0 2px 8px rgba(59, 130, 246, 0.15)'
          : '0 1px 2px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Main content area - more compact */}
      <div style={{ padding: '12px 14px' }}>
        {/* Top row: title + badge */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
        }}>
          {/* Title */}
          <div style={{
            fontWeight: 600,
            fontSize: '14px',
            color: '#111827',
            lineHeight: 1.4,
            flex: 1,
          }}>
            {subsection.title}
          </div>

          {/* Badge */}
          {renderBadge()}
        </div>

        {/* Tags - only show if present */}
        {subsection.tags && subsection.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
            {subsection.tags.map((tag, i) => {
              const style = getTagStyle(tag.label);
              return (
                <span
                  key={i}
                  style={{
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 500,
                    background: style.bg,
                    color: style.text,
                  }}
                >
                  {tag.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Description/content - truncated unless expanded */}
        {subsection.content && (
          <div style={{ marginTop: '6px' }}>
            <div style={{
              fontSize: '13px',
              color: '#6b7280',
              lineHeight: 1.5,
            }}>
              {displayContent}
            </div>
            {needsTruncation && (
              <button
                onClick={handleExpandToggle}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#3b82f6',
                  fontSize: '12px',
                  padding: '4px 0 0 0',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {isExpanded ? 'show less' : 'show more'}
              </button>
            )}
          </div>
        )}

        {/* Assumptions toggle - only when expanded */}
        {isExpanded && subsection.assumptions && subsection.assumptions.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAssumptions(!showAssumptions);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6b7280',
                fontSize: '12px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '9px' }}>{showAssumptions ? '▼' : '▶'}</span>
              {showAssumptions ? 'hide' : 'show'} assumptions ({subsection.assumptions.length})
            </button>

            {showAssumptions && (
              <ul style={{
                margin: '8px 0 0 0',
                paddingLeft: '6px',
                listStyle: 'none',
              }}>
                {subsection.assumptions.map((assumption, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: '12px',
                      color: '#4b5563',
                      lineHeight: 1.5,
                      marginBottom: '3px',
                      paddingLeft: '10px',
                      position: 'relative',
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      color: '#9ca3af',
                    }}>·</span>
                    {assumption}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Response section - shown for all subsections */}
        <div style={{ marginTop: '12px' }}>
          {hasAnswer && !isAnswering ? (
            // Saved response display
            <div style={{
              padding: '10px 12px',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '6px',
            }}>
              <div style={{ fontSize: '11px', color: '#047857', fontWeight: 600, marginBottom: '4px' }}>
                YOUR RESPONSE:
              </div>
              <div style={{ fontSize: '14px', color: '#065f46', lineHeight: 1.5 }}>
                {subsection.answer}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAnswering(true);
                }}
                style={{
                  marginTop: '8px',
                  padding: '4px 8px',
                  background: 'transparent',
                  border: '1px solid #a7f3d0',
                  borderRadius: '4px',
                  color: '#047857',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
            </div>
          ) : isAnswering || isQuestion ? (
            // Input mode - always show for questions, or when editing
            <div onClick={(e) => e.stopPropagation()}>
              {/* Multiple choice options - only for questions */}
              {isQuestion && subsection.options && subsection.options.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    Select an option:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {subsection.options.map((option, i) => {
                      const isOptSelected = answerText === option;
                      return (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAnswerText(option);
                            // Auto-save when selecting an option
                            if (onAnswer) {
                              onAnswer(subsection.id, option);
                            }
                          }}
                          style={{
                            padding: '10px 14px',
                            background: isOptSelected ? '#ecfdf5' : '#f9fafb',
                            border: isOptSelected ? '2px solid #10b981' : '1px solid #e5e7eb',
                            borderRadius: '8px',
                            color: isOptSelected ? '#065f46' : '#374151',
                            fontSize: '14px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                          }}
                        >
                          <span style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: isOptSelected ? '2px solid #10b981' : '2px solid #d1d5db',
                            background: isOptSelected ? '#10b981' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {isOptSelected && (
                              <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>✓</span>
                            )}
                          </span>
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    marginTop: '10px',
                    borderTop: '1px solid #e5e7eb',
                    paddingTop: '10px',
                  }}>
                    Or write your own answer:
                  </div>
                </div>
              )}

              {/* Freetext input */}
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder={isQuestion && subsection.options?.length ? "Type a custom answer..." : "Add your thoughts or response..."}
                style={{
                  width: '100%',
                  minHeight: isQuestion && subsection.options?.length ? '40px' : '60px',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onAnswer && answerText.trim()) {
                      onAnswer(subsection.id, answerText.trim());
                      setIsAnswering(false);
                    }
                  }}
                  disabled={!answerText.trim()}
                  style={{
                    padding: '6px 12px',
                    background: answerText.trim() ? '#059669' : '#9ca3af',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '13px',
                    cursor: answerText.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Save
                </button>
                {(hasAnswer || (!isQuestion && isAnswering)) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAnswerText(subsection.answer || '');
                      setIsAnswering(false);
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#f3f4f6',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      color: '#374151',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            // Collapsed state for non-questions - click to respond
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAnswering(true);
              }}
              style={{
                padding: '8px 12px',
                background: '#f9fafb',
                border: '1px dashed #d1d5db',
                borderRadius: '6px',
                color: '#6b7280',
                fontSize: '13px',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              }}
            >
              + Add response...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
