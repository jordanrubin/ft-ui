import { useState } from 'react';
import type { PipelineStep } from '../types/canvas';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PipelineStepState extends PipelineStep {
  status: StepStatus;
  error?: string;
}

interface PipelineProgressProps {
  rationale: string;
  steps: PipelineStepState[];
  reflecting?: boolean;
  reflection?: string;
  onDismiss: () => void;
}

/** Compute wave number for each step based on $N dependency DAG. */
function computeWaves(steps: PipelineStepState[]): number[] {
  const n = steps.length;
  const waves = new Array<number>(n).fill(-1);

  function getDeps(target: string): number[] {
    const deps: number[] = [];
    const matches = target.matchAll(/\$(\d+)/g);
    for (const m of matches) {
      deps.push(parseInt(m[1]) - 1); // 0-indexed
    }
    return deps;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      if (waves[i] >= 0) continue;
      const deps = getDeps(steps[i].target);
      if (deps.length === 0) {
        waves[i] = 0;
        changed = true;
      } else if (deps.every(d => waves[d] >= 0)) {
        waves[i] = Math.max(...deps.map(d => waves[d])) + 1;
        changed = true;
      }
    }
  }
  return waves;
}

const WAVE_LABELS = ['explore', 'deepen', 'converge'];

function getWaveLabel(wave: number): string {
  if (wave < WAVE_LABELS.length) return WAVE_LABELS[wave];
  return `converge ${wave - 1}`;
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return <span style={{ color: '#3fb950', fontWeight: 700 }}>✓</span>;
    case 'running':
      return (
        <span
          style={{
            color: '#58a6ff',
            fontWeight: 700,
            display: 'inline-block',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          ↻
        </span>
      );
    case 'failed':
      return <span style={{ color: '#f85149', fontWeight: 700 }}>✗</span>;
    case 'pending':
    default:
      return <span style={{ color: '#484f58' }}>·</span>;
  }
}

export default function PipelineProgress({ rationale, steps, reflecting, reflection, onDismiss }: PipelineProgressProps) {
  const [rationaleExpanded, setRationaleExpanded] = useState(false);
  const waves = computeWaves(steps);

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const failedCount = steps.filter(s => s.status === 'failed').length;
  const allDone = steps.every(s => s.status === 'completed' || s.status === 'failed');

  // Group steps by wave
  const waveGroups: Array<{ wave: number; indices: number[] }> = [];
  const seenWaves = new Set<number>();
  for (let i = 0; i < steps.length; i++) {
    const w = waves[i];
    if (!seenWaves.has(w)) {
      seenWaves.add(w);
      waveGroups.push({ wave: w, indices: [] });
    }
    waveGroups.find(g => g.wave === w)!.indices.push(i);
  }
  waveGroups.sort((a, b) => a.wave - b.wave);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        zIndex: 100,
        width: '360px',
        maxHeight: '70vh',
        overflowY: 'auto',
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        color: '#c9d1d9',
        fontSize: '12px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 14px 8px',
          borderBottom: '1px solid #21262d',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '13px' }}>
          Pipeline ({completedCount}/{steps.length} done{failedCount > 0 ? `, ${failedCount} failed` : ''})
          {allDone && ' ✓'}
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 4px',
            lineHeight: 1,
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>

      {/* Rationale */}
      {rationale && (
        <div
          style={{
            padding: '8px 14px',
            color: '#8b949e',
            fontSize: '11px',
            lineHeight: 1.5,
            borderBottom: '1px solid #21262d',
            cursor: 'pointer',
          }}
          onClick={() => setRationaleExpanded(!rationaleExpanded)}
        >
          <div
            style={{
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: rationaleExpanded ? 'unset' : 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {rationale}
          </div>
          {rationale.length > 120 && (
            <span style={{ color: '#58a6ff', fontSize: '10px' }}>
              {rationaleExpanded ? 'show less' : 'show more'}
            </span>
          )}
        </div>
      )}

      {/* Steps grouped by wave */}
      <div style={{ padding: '6px 0 10px' }}>
        {waveGroups.map(({ wave, indices }) => (
          <div key={wave}>
            {/* Wave header */}
            <div
              style={{
                padding: '6px 14px 2px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ color: '#484f58', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {getWaveLabel(wave)}
              </span>
              <div style={{ flex: 1, height: '1px', background: '#21262d' }} />
            </div>

            {/* Steps in this wave */}
            {indices.map(i => {
              const step = steps[i];
              return (
                <div
                  key={i}
                  style={{
                    padding: '4px 14px',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                    opacity: step.status === 'pending' ? 0.5 : 1,
                  }}
                >
                  <span style={{ width: '14px', textAlign: 'center', flexShrink: 0, marginTop: '1px' }}>
                    <StatusIcon status={step.status} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'baseline' }}>
                      <span style={{ color: '#8b949e', fontSize: '11px' }}>{i + 1}.</span>
                      <span style={{ color: '#58a6ff', fontFamily: 'monospace', fontWeight: 600 }}>
                        @{step.skill}
                      </span>
                      {step.mode && (
                        <span style={{ color: '#a371f7', fontSize: '10px' }}>[{step.mode}]</span>
                      )}
                      <span style={{ color: '#484f58', fontSize: '11px' }}>
                        on {step.target}
                      </span>
                    </div>
                    <div
                      style={{
                        color: '#8b949e',
                        fontSize: '11px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {step.reason}
                    </div>
                    {step.status === 'failed' && step.error && (
                      <div style={{ color: '#f85149', fontSize: '10px', marginTop: '2px' }}>
                        {step.error}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Reflection section */}
      {(reflecting || reflection) && (
        <div
          style={{
            padding: '8px 14px 10px',
            borderTop: '1px solid #21262d',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px',
            }}
          >
            <span style={{ color: '#a371f7', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {reflecting ? 'reflecting...' : 'reflection'}
            </span>
            <div style={{ flex: 1, height: '1px', background: '#21262d' }} />
          </div>
          {reflecting && (
            <div style={{ color: '#8b949e', fontSize: '11px', fontStyle: 'italic' }}>
              Analyzing pipeline performance...
            </div>
          )}
          {reflection && (
            <div
              style={{
                color: '#c9d1d9',
                fontSize: '11px',
                lineHeight: 1.5,
                maxHeight: '150px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {reflection}
            </div>
          )}
        </div>
      )}

      {/* Pulse animation for running indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

/** Exported for use in App.tsx DAG executor */
export { computeWaves };
