// Skills pane for sidebar - shown when a node is selected

import { useState } from 'react';
import type { CanvasNode, SkillInfo, Mode, ModeAxis } from '../types';

// Human-readable verb labels for skills
const SKILL_VERBS: Record<string, { verb: string; short: string }> = {
  askuserquestions: { verb: 'Ask me questions', short: 'Clarify before acting' },
  excavate: { verb: 'Surface assumptions', short: 'What must be true?' },
  antithesize: { verb: 'Find opposition', short: 'Strongest counter-view' },
  synthesize: { verb: 'Compress to decision', short: 'Resolve the tensions' },
  dimensionalize: { verb: 'Map dimensions', short: 'What axes matter?' },
  negspace: { verb: 'Find what\'s missing', short: 'Suspicious absences' },
  stressify: { verb: 'Stress test', short: 'Where does it break?' },
  diverge: { verb: 'Generate alternatives', short: 'Branch the space' },
  simulate: { verb: 'Project forward', short: 'Trace trajectories' },
  backchain: { verb: 'Trace causes', short: 'What produced this?' },
  handlize: { verb: 'Extract handles', short: 'What can you pull?' },
  inductify: { verb: 'Find patterns', short: 'Hidden regularities' },
  metaphorize: { verb: 'Map domains', short: 'Port rules across' },
  rhetoricize: { verb: 'Map rhetoric', short: 'Persuasion structure' },
  rhyme: { verb: 'Find echoes', short: 'Structural similarity' },
};

// Pipeline recipes - validated skill sequences
const RECIPES = [
  {
    name: 'Insight audit',
    skills: ['excavate', 'antithesize', 'synthesize'],
    description: 'Surface assumptions, challenge them, compress to decision',
  },
  {
    name: 'Blind spots',
    skills: ['excavate', 'negspace', 'antithesize'],
    description: 'Find what\'s hidden, what\'s missing, what opposes',
  },
  {
    name: 'Pattern bridge',
    skills: ['rhyme', 'metaphorize', 'synthesize'],
    description: 'Find echoes, map across domains, compress to insight',
  },
];

// Short human-readable descriptions for each mode
const MODE_DESCRIPTIONS: Record<string, string> = {
  positive: 'Highlight strengths, what works',
  critical: 'Find flaws, what fails',
  internal: 'Look inward, self-referential',
  external: 'Look outward, contextual',
  near: 'Immediate, concrete',
  far: 'Long-range, abstract',
  coarse: 'Big picture, broad strokes',
  fine: 'Granular detail, specifics',
  descriptive: 'What is — factual',
  prescriptive: 'What should be — normative',
  surface: 'Face value, as stated',
  underlying: 'Hidden layers, implicit',
};

const MODE_AXES: ModeAxis[] = [
  { name: 'valence',  modes: ['positive', 'critical'],        labels: ['+', '−'],      color: '#f97316' },
  { name: 'locus',    modes: ['internal', 'external'],        labels: ['in', 'ex'],    color: '#06b6d4' },
  { name: 'distance', modes: ['near', 'far'],                 labels: ['nr', 'fr'],    color: '#22c55e' },
  { name: 'grain',    modes: ['coarse', 'fine'],              labels: ['co', 'fi'],    color: '#eab308' },
  { name: 'register', modes: ['descriptive', 'prescriptive'], labels: ['is', 'ought'], color: '#ec4899' },
  { name: 'depth',    modes: ['surface', 'underlying'],       labels: ['sf', 'dp'],    color: '#8b5cf6' },
];

// Strip canvas/JSON implementation details from skill descriptions shown to users
function cleanDescription(desc: string): string {
  return desc
    .replace(/^Canvas-optimized\s*/i, '')
    .replace(/\.\s*Full analysis in preamble,?\s*\w[\w\s]* in compressed JSON\.?/i, '.')
    .replace(/\s*compressed JSON\.?/i, '.')
    .replace(/\.\.+/g, '.')
    .trim();
}

interface SkillsPaneProps {
  node: CanvasNode;
  skills: SkillInfo[];
  selectedContent?: string; // If a subsection is selected
  onRunSkill: (skillName: string, content?: string, mode?: Mode) => void;
  onRunSkillQueue?: (skillNames: string[], content?: string) => void;
  onComposePipeline?: () => void;
  onClearSelection?: () => void;
  onClose: () => void;
  isRunning: boolean;
  activeMode?: Mode | null;
  onModeChange?: (mode: Mode | null) => void;
}

export default function SkillsPane({
  node,
  skills,
  selectedContent,
  onRunSkill,
  onRunSkillQueue,
  onComposePipeline,
  onClearSelection,
  onClose,
  isRunning,
  activeMode: controlledMode,
  onModeChange,
}: SkillsPaneProps) {
  const [queueMode, setQueueMode] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [localMode, setLocalMode] = useState<Mode | null>(null);

  // Use controlled mode if provided, otherwise local state
  const activeMode = controlledMode !== undefined ? controlledMode : localMode;
  const setActiveMode = onModeChange ?? setLocalMode;

  const handleSkillClick = (skillName: string) => {
    if (queueMode) {
      setQueue(prev =>
        prev.includes(skillName)
          ? prev.filter(s => s !== skillName)
          : [...prev, skillName]
      );
    } else {
      onRunSkill(skillName, selectedContent, activeMode ?? undefined);
    }
  };

  const handleRunQueue = () => {
    if (queue.length === 0) return;
    if (onRunSkillQueue) {
      onRunSkillQueue(queue, selectedContent);
    } else {
      onRunSkill(queue[0], selectedContent);
    }
    setQueue([]);
    setQueueMode(false);
  };

  const handleRunRecipe = (recipe: typeof RECIPES[0]) => {
    // Only queue skills that are actually available
    const available = recipe.skills.filter(s => skills.some(sk => sk.name === s));
    if (available.length === 0) return;
    if (onRunSkillQueue) {
      onRunSkillQueue(available, selectedContent);
    } else {
      onRunSkill(available[0], selectedContent);
    }
  };

  // Split skills into primary (most used) and secondary
  const primarySkillNames = ['excavate', 'antithesize', 'synthesize', 'negspace', 'dimensionalize'];
  const primarySkills = skills.filter(s => primarySkillNames.includes(s.name));
  const secondarySkills = skills.filter(s => !primarySkillNames.includes(s.name));

  const renderSkillButton = (skill: SkillInfo) => {
    const isQueued = queue.includes(skill.name);
    const queuePosition = queue.indexOf(skill.name) + 1;
    const labels = SKILL_VERBS[skill.name];

    return (
      <button
        key={skill.name}
        onClick={() => handleSkillClick(skill.name)}
        title={skill.description ? cleanDescription(skill.description) : ''}
        style={{
          padding: '8px 10px',
          background: isQueued ? '#2d1f42' : '#21262d',
          border: isQueued ? '1px solid #8b5cf6' : '1px solid #30363d',
          borderRadius: '6px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '6px',
        }}
        onMouseOver={(e) => {
          if (!isQueued) {
            e.currentTarget.style.background = '#30363d';
            e.currentTarget.style.borderColor = queueMode ? '#8b5cf6' : '#58a6ff';
          }
        }}
        onMouseOut={(e) => {
          if (!isQueued) {
            e.currentTarget.style.background = '#21262d';
            e.currentTarget.style.borderColor = '#30363d';
          }
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            color: isQueued ? '#a78bfa' : '#c9d1d9',
            lineHeight: 1.3,
          }}>
            {labels?.verb || skill.display_name}
          </div>
          {labels?.short && (
            <div style={{
              fontSize: '11px',
              color: isQueued ? '#7c6aad' : '#6e7681',
              marginTop: '1px',
              lineHeight: 1.2,
            }}>
              {labels.short}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isQueued ? (
            <span style={{
              padding: '2px 6px',
              background: '#8b5cf6',
              color: '#fff',
              fontSize: '10px',
              borderRadius: '10px',
              fontWeight: 600,
            }}>
              {queuePosition}
            </span>
          ) : (
            <span style={{
              fontSize: '10px',
              color: '#484f58',
              fontFamily: 'monospace',
            }}>
              @{skill.name}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Compact header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase' }}>
            Analyze
          </div>
          <button
            onClick={() => {
              setQueueMode(!queueMode);
              if (queueMode) setQueue([]);
            }}
            title={queueMode ? 'Exit queue mode' : 'Queue multiple skills to run in sequence'}
            style={{
              padding: '2px 6px',
              background: queueMode ? '#8b5cf6' : '#21262d',
              border: '1px solid #30363d',
              borderRadius: '4px',
              color: queueMode ? '#fff' : '#8b949e',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 500,
            }}
          >
            {queueMode ? 'queuing' : 'queue'}
          </button>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: '14px',
          }}
        >
          ×
        </button>
      </div>

      {/* Target indicator */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid #30363d',
        background: '#0d1117',
        fontSize: '11px',
        color: '#8b949e',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {selectedContent ? (
          <>
            <span style={{ color: '#58a6ff' }}>on selection</span>
            <button
              onClick={onClearSelection}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                cursor: 'pointer',
                fontSize: '10px',
                padding: '2px 6px',
              }}
              title="Clear selection, run on full node"
            >
              × clear
            </button>
          </>
        ) : (
          <span>on {node.operation || 'root'}</span>
        )}
      </div>

      {/* Mode toggle bar */}
      <div style={{
        padding: '6px 8px',
        borderBottom: '1px solid #30363d',
        background: '#0d1117',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '3px',
      }}>
        {MODE_AXES.map((axis) => (
          <div key={axis.name} style={{ display: 'flex', gap: '1px' }}>
            {axis.modes.map((mode, i) => {
              const isActive = activeMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setActiveMode(isActive ? null : mode)}
                  title={`${mode} — ${MODE_DESCRIPTIONS[mode] || axis.name}`}
                  style={{
                    padding: '2px 5px',
                    fontSize: '10px',
                    fontWeight: 600,
                    background: isActive ? axis.color : '#21262d',
                    border: isActive ? 'none' : `1px solid ${axis.color}33`,
                    borderRadius: i === 0 ? '4px 0 0 4px' : '0 4px 4px 0',
                    color: isActive ? '#fff' : `${axis.color}b3`,
                    cursor: 'pointer',
                    lineHeight: 1.4,
                    transition: 'all 0.1s ease',
                  }}
                >
                  {axis.labels[i]}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Queue display */}
      {queueMode && queue.length > 0 && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid #30363d',
          background: '#1c1428',
        }}>
          <div style={{ fontSize: '10px', color: '#a78bfa', marginBottom: '6px', fontWeight: 600 }}>
            PIPELINE ({queue.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
            {queue.map((skillName, idx) => (
              <span
                key={skillName}
                style={{
                  padding: '2px 6px',
                  background: '#8b5cf6',
                  color: '#fff',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
              >
                {idx + 1}. {SKILL_VERBS[skillName]?.verb || `@${skillName}`}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleRunQueue}
              disabled={isRunning}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: '#8b5cf6',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.6 : 1,
              }}
            >
              Run pipeline
            </button>
            <button
              onClick={() => setQueue([])}
              style={{
                padding: '6px 10px',
                background: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#8b949e',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
        {isRunning && !queueMode ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: '#8b949e',
          }}>
            Running...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* Pipeline recipes - shown when not in queue mode */}
            {!queueMode && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#6e7681',
                  marginBottom: '6px',
                  padding: '0 4px',
                  letterSpacing: '0.5px',
                }}>
                  PIPELINES
                </div>
                {RECIPES.map((recipe) => {
                  const available = recipe.skills.filter(s => skills.some(sk => sk.name === s));
                  if (available.length === 0) return null;
                  return (
                    <button
                      key={recipe.name}
                      onClick={() => handleRunRecipe(recipe)}
                      title={recipe.description}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        marginBottom: '4px',
                        background: '#161b22',
                        border: '1px solid #30363d',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#1c2333';
                        e.currentTarget.style.borderColor = '#8b5cf6';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#161b22';
                        e.currentTarget.style.borderColor = '#30363d';
                      }}
                    >
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#a78bfa',
                        marginBottom: '3px',
                      }}>
                        {recipe.name}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: '#6e7681',
                        lineHeight: 1.3,
                      }}>
                        {recipe.skills.map(s => SKILL_VERBS[s]?.verb || s).join(' → ')}
                      </div>
                    </button>
                  );
                })}
                {onComposePipeline && (
                  <button
                    onClick={onComposePipeline}
                    disabled={isRunning}
                    title="Claude analyzes the graph and composes a custom multi-step pipeline"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      marginBottom: '4px',
                      background: '#1a1528',
                      border: '1px solid #6d28d9',
                      borderRadius: '6px',
                      cursor: isRunning ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      opacity: isRunning ? 0.6 : 1,
                    }}
                    onMouseOver={(e) => {
                      if (!isRunning) {
                        e.currentTarget.style.background = '#2d1f42';
                        e.currentTarget.style.borderColor = '#8b5cf6';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isRunning) {
                        e.currentTarget.style.background = '#1a1528';
                        e.currentTarget.style.borderColor = '#6d28d9';
                      }
                    }}
                  >
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#c4b5fd',
                      marginBottom: '3px',
                    }}>
                      Compose pipeline...
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: '#7c3aed',
                      lineHeight: 1.3,
                    }}>
                      Claude reads the graph and designs a custom sequence
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Primary skills */}
            <div style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#6e7681',
              marginBottom: '4px',
              padding: '0 4px',
              letterSpacing: '0.5px',
            }}>
              SKILLS
            </div>
            {primarySkills.map(renderSkillButton)}

            {/* Show more toggle */}
            {secondarySkills.length > 0 && (
              <>
                <button
                  onClick={() => setShowAllSkills(!showAllSkills)}
                  style={{
                    padding: '4px 10px',
                    background: 'none',
                    border: 'none',
                    color: '#6e7681',
                    cursor: 'pointer',
                    fontSize: '11px',
                    textAlign: 'left',
                    marginTop: '4px',
                  }}
                >
                  {showAllSkills ? '▾ fewer' : `▸ ${secondarySkills.length} more...`}
                </button>
                {showAllSkills && secondarySkills.map(renderSkillButton)}
              </>
            )}
          </div>
        )}
      </div>

      {/* Freeform prompt removed — unified input at bottom of NodeDrawer handles both chat and skills */}
    </div>
  );
}
