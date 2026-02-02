import { useState } from 'react';
import type { Subsection, SkillInfo } from '../types';

interface SubsectionCardProps {
  subsection: Subsection;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onSkillRun?: (skillName: string, content: string) => void;
  skills?: SkillInfo[];
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
  onSkillRun,
  skills = [],
}: SubsectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const handleClick = () => {
    onSelect(subsection.id);
  };

  const handleExpandToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleSkillClick = (skillName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSkillRun) {
      const content = subsection.content || subsection.title;
      onSkillRun(skillName, content);
    }
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
      </div>

      {/* Skill action buttons (shown when selected) */}
      {isSelected && skills.length > 0 && (
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid #f3f4f6',
          background: '#fafafa',
          borderRadius: '0 0 10px 10px',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {skills.map((skill) => (
              <button
                key={skill.name}
                onClick={(e) => handleSkillClick(skill.name, e)}
                style={{
                  padding: '6px 12px',
                  background: '#18181b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#27272a')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#18181b')}
              >
                {skill.display_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
