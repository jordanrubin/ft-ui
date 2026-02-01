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

export default function SubsectionCard({
  subsection,
  isSelected,
  onSelect,
  onSkillRun,
  skills = [],
}: SubsectionCardProps) {
  const [showAssumptions, setShowAssumptions] = useState(false);

  const handleClick = () => {
    onSelect(subsection.id);
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

  // Render importance/strength badge
  const renderBadge = () => {
    if (subsection.importance) {
      const isHigh = subsection.importance === 'high';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            background: isHigh ? '#fef2f2' : '#f9fafb',
            color: isHigh ? '#dc2626' : '#6b7280',
          }}>
            {isHigh && <span style={{ color: '#eab308' }}>⚡</span>}
            {subsection.importance}
          </span>
        </div>
      );
    }
    if (subsection.strength) {
      const isStrong = subsection.strength === 'strong';
      return (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 600,
          background: isStrong ? '#fef2f2' : '#f9fafb',
          color: isStrong ? '#dc2626' : '#6b7280',
        }}>
          {isStrong && <span style={{ color: '#eab308' }}>⚡</span>}
          {subsection.strength}
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
        borderRadius: '12px',
        marginBottom: '12px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: isSelected
          ? '0 4px 12px rgba(59, 130, 246, 0.15)'
          : '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Main content area */}
      <div style={{ padding: '16px' }}>
        {/* Top row: tags + badge */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '8px',
        }}>
          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {subsection.tags?.map((tag, i) => {
              const style = getTagStyle(tag.label);
              return (
                <span
                  key={i}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
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

          {/* Badge */}
          {renderBadge()}
        </div>

        {/* Title */}
        <div style={{
          fontWeight: 600,
          fontSize: '15px',
          color: '#111827',
          lineHeight: 1.5,
          marginBottom: subsection.content ? '8px' : 0,
        }}>
          {subsection.title}
        </div>

        {/* Description/content */}
        {subsection.content && (
          <div style={{
            fontSize: '14px',
            color: '#6b7280',
            lineHeight: 1.6,
          }}>
            {subsection.content}
          </div>
        )}

        {/* Assumptions toggle */}
        {subsection.assumptions && subsection.assumptions.length > 0 && (
          <div style={{ marginTop: '12px' }}>
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
                fontSize: '13px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '10px' }}>{showAssumptions ? '▼' : '▶'}</span>
              {showAssumptions ? 'hide assumptions' : 'show assumptions'}
            </button>

            {showAssumptions && (
              <ul style={{
                margin: '10px 0 0 0',
                paddingLeft: '8px',
                listStyle: 'none',
              }}>
                {subsection.assumptions.map((assumption, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: '13px',
                      color: '#4b5563',
                      lineHeight: 1.6,
                      marginBottom: '4px',
                      paddingLeft: '12px',
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
          padding: '12px 16px',
          borderTop: '1px solid #f3f4f6',
          background: '#fafafa',
          borderRadius: '0 0 12px 12px',
        }}>
          <div style={{
            fontSize: '12px',
            color: '#71717a',
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            Run skill on this:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {skills.map((skill) => (
              <button
                key={skill.name}
                onClick={(e) => handleSkillClick(skill.name, e)}
                style={{
                  padding: '8px 14px',
                  background: '#18181b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
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
