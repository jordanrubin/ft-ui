import { useState } from 'react';
import type { Subsection, SubsectionTag, SkillInfo } from '../types';

interface SubsectionCardProps {
  subsection: Subsection;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onSkillRun?: (skillName: string, content: string) => void;
  suggestedSkills?: string[];
  skills?: SkillInfo[];
  depth?: number;
}

const TAG_COLORS: Record<SubsectionTag['color'], { bg: string; text: string }> = {
  red: { bg: '#fef2f2', text: '#dc2626' },
  orange: { bg: '#fff7ed', text: '#ea580c' },
  yellow: { bg: '#fefce8', text: '#ca8a04' },
  blue: { bg: '#eff6ff', text: '#2563eb' },
  purple: { bg: '#faf5ff', text: '#9333ea' },
  gray: { bg: '#f3f4f6', text: '#4b5563' },
};

const IMPORTANCE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  high: { bg: '#fef2f2', text: '#dc2626', icon: '\u26A1' },
  medium: { bg: '#fff7ed', text: '#ea580c', icon: '\u223C' },
  low: { bg: '#f3f4f6', text: '#6b7280', icon: '\u25CB' },
};

const STRENGTH_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  strong: { bg: '#fef2f2', text: '#dc2626', icon: '\u26A1' },
  moderate: { bg: '#f3f4f6', text: '#6b7280', icon: '\u25C7' },
  weak: { bg: '#f3f4f6', text: '#9ca3af', icon: '\u25CB' },
};

export default function SubsectionCard({
  subsection,
  isSelected,
  onSelect,
  onSkillRun,
  suggestedSkills = [],
  skills = [],
  depth = 0,
}: SubsectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(!subsection.collapsed);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(subsection.id);
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
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

  const importanceInfo = subsection.importance ? IMPORTANCE_COLORS[subsection.importance] : null;
  const strengthInfo = subsection.strength ? STRENGTH_COLORS[subsection.strength] : null;

  // Filter suggested skills to only show those that exist
  const availableSkills = suggestedSkills.filter(
    s => skills.some(skill => skill.display_name === s || skill.name === s.replace('@', ''))
  );

  return (
    <div
      onClick={handleClick}
      style={{
        background: isSelected ? '#e3f2fd' : '#fff',
        border: `2px solid ${isSelected ? '#2196f3' : '#e0e0e0'}`,
        borderRadius: '8px',
        marginBottom: '8px',
        marginLeft: depth * 16,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: isSelected ? '0 2px 8px rgba(33, 150, 243, 0.2)' : 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        {/* Expand/collapse toggle */}
        {(subsection.content || subsection.children?.length) && (
          <button
            onClick={handleToggleExpand}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: '#666',
              fontSize: '12px',
              flexShrink: 0,
            }}
          >
            {isExpanded ? '\u25BC' : '\u25B6'}
          </button>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tags row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
            {subsection.tags?.map((tag, i) => (
              <span
                key={i}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: TAG_COLORS[tag.color]?.bg || '#f3f4f6',
                  color: TAG_COLORS[tag.color]?.text || '#4b5563',
                }}
              >
                {tag.label}
              </span>
            ))}

            {strengthInfo && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: strengthInfo.bg,
                  color: strengthInfo.text,
                }}
              >
                {strengthInfo.icon} {subsection.strength}
              </span>
            )}
          </div>

          {/* Title */}
          <div
            style={{
              fontWeight: 600,
              fontSize: '14px',
              color: '#1a1a1a',
              lineHeight: 1.4,
            }}
          >
            {subsection.title}
          </div>

          {/* Expanded content */}
          {isExpanded && subsection.content && (
            <div
              style={{
                marginTop: '8px',
                fontSize: '13px',
                color: '#4a4a4a',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {subsection.content}
            </div>
          )}

          {/* Assumptions toggle */}
          {subsection.assumptions && subsection.assumptions.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAssumptions(!showAssumptions);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#666',
                  fontSize: '12px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {showAssumptions ? '\u25BC' : '\u25B6'} {showAssumptions ? 'hide' : 'show'} assumptions
              </button>

              {showAssumptions && (
                <ul
                  style={{
                    margin: '8px 0 0 0',
                    paddingLeft: '20px',
                    fontSize: '12px',
                    color: '#666',
                    lineHeight: 1.5,
                  }}
                >
                  {subsection.assumptions.map((assumption, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>
                      {assumption}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Skill action buttons (shown when selected) */}
          {isSelected && availableSkills.length > 0 && (
            <div style={{ marginTop: '12px', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                Copy prompt & paste in chat:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {availableSkills.map((skillName) => (
                  <button
                    key={skillName}
                    onClick={(e) => handleSkillClick(skillName, e)}
                    style={{
                      padding: '6px 12px',
                      background: '#1a1a1a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#333')}
                    onMouseOut={(e) => (e.currentTarget.style.background = '#1a1a1a')}
                  >
                    {skillName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Importance indicator */}
        {importanceInfo && (
          <div
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              background: importanceInfo.bg,
              color: importanceInfo.text,
              flexShrink: 0,
            }}
          >
            {importanceInfo.icon} {subsection.importance}
          </div>
        )}
      </div>

      {/* Children (nested subsections) */}
      {isExpanded && subsection.children && subsection.children.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          {subsection.children.map((child) => (
            <SubsectionCard
              key={child.id}
              subsection={child}
              isSelected={isSelected}
              onSelect={onSelect}
              onSkillRun={onSkillRun}
              suggestedSkills={suggestedSkills}
              skills={skills}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
