// Skillset management pane - add/remove skillsets from GitHub or local folders

import { useState } from 'react';
import type { SkillsetInfo } from '../types/canvas';
import { skillsetApi, skillApi } from '../api/client';
import type { SkillInfo } from '../types/canvas';

interface SkillsetPaneProps {
  skillsets: SkillsetInfo[];
  onSkillsetsChange: (skillsets: SkillsetInfo[]) => void;
  onSkillsChange: (skills: SkillInfo[]) => void;
}

export default function SkillsetPane({
  skillsets,
  onSkillsetsChange,
  onSkillsChange,
}: SkillsetPaneProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<'local' | 'github'>('github');
  const [inputValue, setInputValue] = useState('');
  const [customName, setCustomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSkillsList = async () => {
    try {
      const skills = await skillApi.list();
      onSkillsChange(skills);
    } catch (e) {
      console.error('Failed to refresh skills:', e);
    }
  };

  const handleAdd = async () => {
    if (!inputValue.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const name = customName.trim() || undefined;
      let newSkillset: SkillsetInfo;

      if (addType === 'local') {
        newSkillset = await skillsetApi.addLocal(inputValue.trim(), name);
      } else {
        newSkillset = await skillsetApi.addGithub(inputValue.trim(), name);
      }

      onSkillsetsChange([...skillsets, newSkillset]);
      await refreshSkillsList();

      // Reset form
      setInputValue('');
      setCustomName('');
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add skillset');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (name: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await skillsetApi.remove(name);
      onSkillsetsChange(skillsets.filter(s => s.name !== name));
      await refreshSkillsList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove skillset');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async (name: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const updated = await skillsetApi.refresh(name);
      onSkillsetsChange(skillsets.map(s => s.name === name ? updated : s));
      await refreshSkillsList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh skillset');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      borderTop: '1px solid #30363d',
      background: '#0d1117',
    }}>
      {/* Header - toggle expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          color: '#8b949e',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        <span>Skillsets ({skillsets.length})</span>
        <span style={{ fontSize: '10px' }}>{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Error message */}
          {error && (
            <div style={{
              padding: '8px',
              marginBottom: '8px',
              background: '#3d1f1f',
              border: '1px solid #f85149',
              borderRadius: '4px',
              color: '#f85149',
              fontSize: '12px',
            }}>
              {error}
              <button
                onClick={() => setError(null)}
                style={{
                  float: 'right',
                  background: 'none',
                  border: 'none',
                  color: '#f85149',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Skillset list */}
          {skillsets.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#6e7681', margin: '8px 0' }}>
              No skillsets added yet
            </p>
          ) : (
            <div style={{ marginBottom: '8px' }}>
              {skillsets.map(skillset => (
                <div
                  key={skillset.name}
                  style={{
                    padding: '8px',
                    marginBottom: '4px',
                    background: '#21262d',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ color: '#c9d1d9', fontWeight: 500 }}>
                      {skillset.name}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {skillset.source_type === 'github' && (
                        <button
                          onClick={() => handleRefresh(skillset.name)}
                          disabled={isLoading}
                          title="Pull latest from GitHub"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#8b949e',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            padding: '2px 4px',
                            fontSize: '10px',
                          }}
                        >
                          ↻
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(skillset.name)}
                        disabled={isLoading}
                        title="Remove skillset"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f85149',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          padding: '2px 4px',
                          fontSize: '10px',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div style={{ color: '#6e7681', fontSize: '10px', marginTop: '2px' }}>
                    {skillset.source_type === 'github' ? '⬙' : '📁'} {skillset.skill_count} skills
                    {skillset.branch && ` • ${skillset.branch}`}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add button / form */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                width: '100%',
                padding: '8px',
                background: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#c9d1d9',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              + Add Skillset
            </button>
          ) : (
            <div style={{
              padding: '8px',
              background: '#21262d',
              borderRadius: '4px',
            }}>
              {/* Type selector */}
              <div style={{ display: 'flex', marginBottom: '8px', gap: '4px' }}>
                <button
                  onClick={() => setAddType('github')}
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: addType === 'github' ? '#238636' : 'transparent',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    color: addType === 'github' ? '#fff' : '#8b949e',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  GitHub
                </button>
                <button
                  onClick={() => setAddType('local')}
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: addType === 'local' ? '#238636' : 'transparent',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    color: addType === 'local' ? '#fff' : '#8b949e',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Local
                </button>
              </div>

              {/* Input field */}
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={addType === 'github' ? 'owner/repo or GitHub URL' : '/path/to/skills'}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '8px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: '#c9d1d9',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />

              {/* Optional name */}
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Custom name (optional)"
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '8px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: '#c9d1d9',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={handleAdd}
                  disabled={isLoading || !inputValue.trim()}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#238636',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    opacity: isLoading || !inputValue.trim() ? 0.6 : 1,
                  }}
                >
                  {isLoading ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setInputValue('');
                    setCustomName('');
                    setError(null);
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    color: '#8b949e',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
