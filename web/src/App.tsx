import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';

import CanvasView from './components/CanvasView';
import NodeDrawer from './components/NodeDrawer';
import SkillsPane from './components/SkillsPane';
import Login from './components/Login';
import { canvasApi, nodeApi, skillApi, linkApi, templateApi, planApi, planFileApi, type PlanFileInfo } from './api/client';
import type { Canvas, CanvasNode, SkillInfo, TemplateInfo, CanvasListItem } from './types/canvas';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('rf-auth') === 'true';
  });
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [_templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [canvasList, setCanvasList] = useState<CanvasListItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<CanvasNode | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [linkedNodes, setLinkedNodes] = useState<CanvasNode[]>([]);
  const [backlinks, setBacklinks] = useState<CanvasNode[]>([]);
  // Track multiple concurrent operations
  const [runningOps, setRunningOps] = useState<Map<string, {
    operation: string;
    stage: 'sending' | 'waiting' | 'processing' | 'updating';
    startTime: number;
  }>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Helper for managing concurrent operations
  const isRunning = runningOps.size > 0;
  const startOperation = (id: string, operation: string) => {
    setRunningOps(prev => new Map(prev).set(id, { operation, stage: 'sending', startTime: Date.now() }));
  };
  const updateOperationStage = (id: string, stage: 'sending' | 'waiting' | 'processing' | 'updating') => {
    setRunningOps(prev => {
      const newMap = new Map(prev);
      const op = newMap.get(id);
      if (op) newMap.set(id, { ...op, stage });
      return newMap;
    });
  };
  const endOperation = (id: string) => {
    setRunningOps(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  };
  const [showSidebar, setShowSidebar] = useState(true);
  const [planFiles, setPlanFiles] = useState<PlanFileInfo[]>([]);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [showCanvasPicker, setShowCanvasPicker] = useState(false);
  const [showDirectoryInput, setShowDirectoryInput] = useState(false);
  const [directoryPath, setDirectoryPath] = useState('');
  const [selectedSubsectionContent, setSelectedSubsectionContent] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Sidebar shows skills pane when a node is selected
  const showSkillsPane = selectedNode !== null;

  // Load initial data
  useEffect(() => {
    Promise.all([
      skillApi.list().catch(() => []),
      templateApi.list().catch(() => []),
      canvasApi.list().catch(() => []),
      canvasApi.get().catch(() => null),
      planFileApi.list().catch(() => []),
    ]).then(([skills, templates, list, currentCanvas, plans]) => {
      setSkills(skills);
      setTemplates(templates);
      setCanvasList(list);
      setPlanFiles(plans);
      if (currentCanvas) {
        setCanvas(currentCanvas);
      }
    });
  }, []);

  // Load links when node selected
  useEffect(() => {
    if (selectedNode) {
      Promise.all([
        nodeApi.getLinks(selectedNode.id).catch(() => []),
        nodeApi.getBacklinks(selectedNode.id).catch(() => []),
      ]).then(([links, backlinks]) => {
        setLinkedNodes(links);
        setBacklinks(backlinks);
      });
    } else {
      setLinkedNodes([]);
      setBacklinks([]);
    }
  }, [selectedNode]);

  const refreshCanvas = useCallback(async () => {
    try {
      const updated = await canvasApi.get();
      setCanvas(updated);
      // Update selected node if it still exists
      if (selectedNode && updated.nodes[selectedNode.id]) {
        setSelectedNode(updated.nodes[selectedNode.id]);
      }
    } catch {
      // Canvas might not exist yet
    }
  }, [selectedNode]);

  const handleNodeClick = useCallback(
    async (nodeId: string, ctrlKey: boolean = false) => {
      try {
        if (ctrlKey) {
          // Multi-select mode: toggle node in selection
          setSelectedNodeIds((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
              next.delete(nodeId);
            } else {
              next.add(nodeId);
            }
            return next;
          });
          // Open drawer if we have selections
          setShowSidebar(true);
        } else {
          // Normal click: clear multi-selection and focus
          setSelectedNodeIds(new Set());
          await nodeApi.setFocus(nodeId);
          await refreshCanvas();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to focus node');
      }
    },
    [refreshCanvas]
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      const node = canvas?.nodes[nodeId];
      if (node) {
        setSelectedNode(node);
        setShowSidebar(true);
      }
    },
    [canvas]
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleSkillRun = useCallback(
    async (skillName: string) => {
      if (!selectedNode) return;
      const opId = `${skillName}-${Date.now()}`;
      const nodeId = selectedNode.id;
      // Don't close drawer - allow queuing more operations
      startOperation(opId, skillName);
      setError(null);

      // Run async without blocking
      (async () => {
        try {
          updateOperationStage(opId, 'waiting');
          const newNode = await skillApi.run(skillName, nodeId);
          updateOperationStage(opId, 'processing');
          await refreshCanvas();
          // Don't auto-select result when running concurrent ops
          if (runningOps.size <= 1 && newNode?.id) {
            setSelectedNode(newNode);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : `${skillName} failed`);
        } finally {
          endOperation(opId);
        }
      })();
    },
    [selectedNode, refreshCanvas, runningOps.size]
  );

  const handleSkillRunOnSelection = useCallback(
    async (skillName: string, selectedContent: string) => {
      if (!selectedNode) return;
      const opId = `${skillName}-sel-${Date.now()}`;
      const nodeId = selectedNode.id;
      startOperation(opId, skillName);
      setError(null);

      (async () => {
        try {
          updateOperationStage(opId, 'waiting');
          const newNode = await skillApi.runOnSelection(skillName, nodeId, selectedContent);
          updateOperationStage(opId, 'processing');
          await refreshCanvas();
          if (runningOps.size <= 1 && newNode?.id) {
            setSelectedNode(newNode);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : `${skillName} on selection failed`);
        } finally {
          endOperation(opId);
        }
      })();
    },
    [selectedNode, refreshCanvas, runningOps.size]
  );

  const handleSkillRunOnMultiple = useCallback(
    async (skillName: string) => {
      if (selectedNodeIds.size === 0) return;
      const opId = `${skillName}-multi-${Date.now()}`;
      const nodeIds = [...selectedNodeIds];
      setSelectedNodeIds(new Set()); // clear selection immediately
      startOperation(opId, skillName);
      setError(null);

      (async () => {
        try {
          updateOperationStage(opId, 'waiting');
          const newNode = await skillApi.runOnMultiple(skillName, nodeIds);
          updateOperationStage(opId, 'processing');
          await refreshCanvas();
          if (runningOps.size <= 1 && newNode?.id) {
            setSelectedNode(newNode);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : `${skillName} on multiple failed`);
        } finally {
          endOperation(opId);
        }
      })();
    },
    [selectedNodeIds, refreshCanvas, runningOps.size]
  );

  const handleClearMultiSelection = useCallback(() => {
    setSelectedNodeIds(new Set());
  }, []);

  const handleChatSubmit = useCallback(
    async (prompt: string) => {
      if (!selectedNode) return;
      const opId = `chat-${Date.now()}`;
      const nodeId = selectedNode.id;
      startOperation(opId, 'chat');
      setError(null);

      (async () => {
        try {
          updateOperationStage(opId, 'waiting');
          const newNode = await skillApi.runChat(prompt, nodeId);
          updateOperationStage(opId, 'processing');
          await refreshCanvas();
          if (runningOps.size <= 1 && newNode?.id) {
            setSelectedNode(newNode);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Chat failed');
        } finally {
          endOperation(opId);
        }
      })();
    },
    [selectedNode, refreshCanvas]
  );

  const handleNodeEdit = useCallback(
    async (content: string) => {
      if (!selectedNode) return;
      try {
        await nodeApi.edit(selectedNode.id, content);
        await refreshCanvas();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Edit failed');
      }
    },
    [selectedNode, refreshCanvas]
  );

  const handleNodeDelete = useCallback(async () => {
    if (!selectedNode) return;
    try {
      await nodeApi.delete(selectedNode.id);
      setSelectedNode(null);
      await refreshCanvas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [selectedNode, refreshCanvas]);

  const handleLinkCreate = useCallback(
    async (targetId: string) => {
      if (!selectedNode) return;
      try {
        await linkApi.add(selectedNode.id, targetId);
        await refreshCanvas();
        // Refresh links
        const links = await nodeApi.getLinks(selectedNode.id);
        setLinkedNodes(links);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Link failed');
      }
    },
    [selectedNode, refreshCanvas]
  );

  const handleToggleExclude = useCallback(async () => {
    if (!selectedNode) return;
    try {
      const result = await nodeApi.toggleExclude(selectedNode.id);
      // Update local state
      setSelectedNode({ ...selectedNode, excluded: result.excluded });
      await refreshCanvas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle exclude failed');
    }
  }, [selectedNode, refreshCanvas]);

  const handleSynthesizePlan = useCallback(async () => {
    const opId = `synthesize-${Date.now()}`;
    startOperation(opId, 'synthesize');
    setError(null);

    (async () => {
      try {
        // Gather all answers from localStorage
        const allAnswers: Record<string, Record<string, string>> = {};
        if (canvas) {
          for (const nodeId of Object.keys(canvas.nodes)) {
            const stored = localStorage.getItem(`rf-answers-${nodeId}`);
            if (stored) {
              try {
                allAnswers[nodeId] = JSON.parse(stored);
              } catch {
                // ignore invalid JSON
              }
            }
          }
        }

        updateOperationStage(opId, 'waiting');
        const planNode = await planApi.synthesize(undefined, true, allAnswers);
        updateOperationStage(opId, 'processing');
        await refreshCanvas();
        updateOperationStage(opId, 'updating');
        setSelectedNode(planNode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Plan synthesis failed');
      } finally {
        endOperation(opId);
      }
    })();
  }, [refreshCanvas, canvas]);

  const handleCreateCanvas = useCallback(async () => {
    const name = prompt('Canvas name:');
    const goal = prompt('What are you trying to build?');
    if (name && goal) {
      try {
        const newCanvas = await canvasApi.create(name, goal);
        setCanvas(newCanvas);
        setSelectedNode(null);
        setCanvasList(await canvasApi.list());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create failed');
      }
    }
  }, []);

  const handleLoadCanvas = useCallback(async (path: string) => {
    try {
      const loaded = await canvasApi.load(path);
      setCanvas(loaded);
      setSelectedNode(null);
      setShowCanvasPicker(false);
      // Refresh canvas list after load
      setCanvasList(await canvasApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    }
  }, []);

  const handleLoadFromPlan = useCallback(async (planPath: string, planName: string) => {
    try {
      const newCanvas = await canvasApi.createFromPlan(planPath, planName);
      setCanvas(newCanvas);
      setSelectedNode(null);
      setShowPlanPicker(false);
      // Refresh canvas list
      const list = await canvasApi.list();
      setCanvasList(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load from plan failed');
    }
  }, []);

  const handleLoadFromDirectory = useCallback(async (dirPath: string) => {
    try {
      const newCanvas = await canvasApi.createFromDirectory(dirPath, undefined, true);
      setCanvas(newCanvas);
      setSelectedNode(null);
      setShowDirectoryInput(false);
      setDirectoryPath('');
      // Refresh canvas list
      const list = await canvasApi.list();
      setCanvasList(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load from directory failed');
    }
  }, []);

  const handleRefreshRoot = useCallback(async () => {
    try {
      const updated = await canvasApi.refreshRoot();
      setCanvas(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    }
  }, []);

  const handleRenameCanvas = useCallback(async () => {
    if (!canvas) return;
    const newName = prompt('Enter new name:', canvas.name);
    if (!newName || newName === canvas.name) return;
    try {
      const updated = await canvasApi.rename(newName);
      setCanvas(updated);
      setCanvasList(await canvasApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    }
  }, [canvas]);

  const handleDeleteCanvas = useCallback(async (path: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await canvasApi.delete(path);
      setCanvasList(await canvasApi.list());
      // If we deleted the current canvas, it will have been cleared on backend
      const updated = await canvasApi.get();
      setCanvas(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, []);

  const handleSaveCanvas = useCallback(async () => {
    if (!canvas) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await canvasApi.save();
      // Refresh canvas to get updated dirty state
      const updated = await canvasApi.get();
      setCanvas(updated);
      // Refresh canvas list
      setCanvasList(await canvasApi.list());
      // Show save confirmation
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [canvas]);

  const handleUndo = useCallback(async () => {
    try {
      const updated = await canvasApi.undo();
      setCanvas(updated);
    } catch {
      // Nothing to undo
    }
  }, []);

  const handleRedo = useCallback(async () => {
    try {
      const updated = await canvasApi.redo();
      setCanvas(updated);
    } catch {
      // Nothing to redo
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      // Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveCanvas();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleSaveCanvas]);

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div style={{ height: '100vh', display: 'flex', background: '#0d1117' }}>
      {/* Sidebar */}
      {showSidebar && (
        <div
          style={{
            width: showSkillsPane ? '180px' : '260px',
            background: '#161b22',
            borderRight: '1px solid #30363d',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.15s ease',
          }}
        >
          {/* Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid #30363d' }}>
            <h1 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Runeforge Canvas</h1>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
              {showSkillsPane ? 'run skills' : 'reasoning-as-graph'}
            </p>
          </div>

          {/* Skills Pane - shown when node is selected */}
          {showSkillsPane && selectedNode && (
            <SkillsPane
              node={selectedNode}
              skills={skills}
              selectedContent={selectedSubsectionContent}
              onRunSkill={async (skillName, content) => {
                if (skillName.startsWith('chat:')) {
                  // Freeform chat
                  const prompt = skillName.slice(5);
                  await handleChatSubmit(prompt);
                } else {
                  // Regular skill
                  if (content) {
                    await handleSkillRunOnSelection(skillName, content);
                  } else {
                    await handleSkillRun(skillName);
                  }
                }
              }}
              onClearSelection={() => setSelectedSubsectionContent(undefined)}
              onClose={() => {
                setSelectedNode(null);
                setSelectedSubsectionContent(undefined);
              }}
              isRunning={isRunning}
            />
          )}

          {/* Canvas operations - shown when no node selected */}
          {!showSkillsPane && (
            <>
          {/* Actions */}
          <div style={{ padding: '12px', borderBottom: '1px solid #30363d' }}>
            <button
              onClick={handleCreateCanvas}
              style={{
                width: '100%',
                padding: '10px',
                background: '#238636',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              + New Canvas
            </button>
            {planFiles.length > 0 && (
              <button
                onClick={() => setShowPlanPicker(!showPlanPicker)}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '8px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Load from Plan
              </button>
            )}
            {canvasList.length > 0 && (
              <button
                onClick={() => setShowCanvasPicker(!showCanvasPicker)}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '8px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Load Saved Canvas
              </button>
            )}
            <button
              onClick={() => setShowDirectoryInput(!showDirectoryInput)}
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '8px',
                background: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Load from Directory
            </button>
            {showDirectoryInput && (
              <div style={{ marginTop: '8px' }}>
                <input
                  type="text"
                  value={directoryPath}
                  onChange={(e) => setDirectoryPath(e.target.value)}
                  placeholder="/path/to/project"
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    color: '#c9d1d9',
                    fontSize: '13px',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && directoryPath.trim()) {
                      handleLoadFromDirectory(directoryPath.trim());
                    }
                  }}
                />
                <button
                  onClick={() => directoryPath.trim() && handleLoadFromDirectory(directoryPath.trim())}
                  disabled={!directoryPath.trim()}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '4px',
                    background: directoryPath.trim() ? '#238636' : '#21262d',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: directoryPath.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                  }}
                >
                  Load
                </button>
              </div>
            )}
          </div>

          {/* Plan Picker */}
          {showPlanPicker && planFiles.length > 0 && (
            <div style={{ padding: '12px', borderBottom: '1px solid #30363d', background: '#0d1117' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
                ~/.claude/plans/ (creates new canvas)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflow: 'auto' }}>
                {planFiles.map((plan) => (
                  <button
                    key={plan.path}
                    onClick={() => handleLoadFromPlan(plan.path, plan.name)}
                    style={{
                      padding: '10px',
                      background: '#21262d',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: '2px' }}>{plan.name}.md</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      {new Date(plan.modified_at).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Canvas Picker */}
          {showCanvasPicker && canvasList.length > 0 && (
            <div style={{ padding: '12px', borderBottom: '1px solid #30363d', background: '#0d1117' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
                ~/.runeforge-canvas/ (load existing)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflow: 'auto' }}>
                {canvasList.map((c) => (
                  <button
                    key={c.path}
                    onClick={() => handleLoadCanvas(c.path)}
                    style={{
                      padding: '10px',
                      background: canvas?.name === c.name ? '#238636' : '#21262d',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: '2px' }}>{c.path.split('/').pop()}</div>
                    <div style={{ fontSize: '11px', color: '#8b949e' }}>
                      {c.node_count} nodes · {new Date(c.modified_at).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Undo/Redo */}
          {canvas && (
            <div style={{ padding: '8px 12px', display: 'flex', gap: '8px', borderBottom: '1px solid #30363d' }}>
              <button
                onClick={handleUndo}
                disabled={!canvas.can_undo}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: canvas.can_undo ? '#c9d1d9' : '#484f58',
                  cursor: canvas.can_undo ? 'pointer' : 'not-allowed',
                  fontSize: '12px',
                }}
              >
                Undo
              </button>
              <button
                onClick={handleRedo}
                disabled={!canvas.can_redo}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: canvas.can_redo ? '#c9d1d9' : '#484f58',
                  cursor: canvas.can_redo ? 'pointer' : 'not-allowed',
                  fontSize: '12px',
                }}
              >
                Redo
              </button>
            </div>
          )}

          {/* Synthesize Plan */}
          {canvas && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #30363d' }}>
              <button
                onClick={handleSynthesizePlan}
                disabled={isRunning}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#8b5cf6',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: isRunning ? 0.6 : 1,
                }}
              >
                {isRunning ? 'Synthesizing...' : 'Synthesize Plan'}
              </button>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#666' }}>
                Collapse all thinking into a Claude Code plan
              </p>
            </div>
          )}

          {/* Canvas list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
              Saved Canvases
            </h3>
            {canvasList.length === 0 ? (
              <p style={{ color: '#484f58', fontSize: '13px' }}>No saved canvases</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {canvasList.map((item) => (
                  <div
                    key={item.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <button
                      onClick={() => handleLoadCanvas(item.path)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: canvas?.name === item.name ? '#21262d' : 'transparent',
                        border: canvas?.name === item.name ? '1px solid #30363d' : '1px solid transparent',
                        borderRadius: '6px',
                        color: '#c9d1d9',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontWeight: 500, marginBottom: '2px' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#666' }}>
                        {item.node_count} nodes
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCanvas(item.path, item.name);
                      }}
                      title="Delete canvas"
                      style={{
                        padding: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        fontSize: '14px',
                        borderRadius: '4px',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.color = '#f85149'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#666'}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current canvas stats */}
          {canvas && (
            <div style={{ padding: '12px', borderTop: '1px solid #30363d', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ color: '#c9d1d9' }}>{canvas.name}</strong>
                  <button
                    onClick={handleRenameCanvas}
                    title="Rename canvas"
                    style={{
                      padding: '2px 6px',
                      background: 'transparent',
                      border: 'none',
                      color: '#666',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    ✎
                  </button>
                </div>
                {canvas.is_dirty ? (
                  <span style={{
                    padding: '2px 6px',
                    background: '#f0883e',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#fff',
                    fontWeight: 500,
                  }}>
                    Unsaved
                  </span>
                ) : saveMessage ? (
                  <span style={{
                    padding: '2px 6px',
                    background: '#238636',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#fff',
                    fontWeight: 500,
                  }}>
                    {saveMessage}
                  </span>
                ) : (
                  <span style={{
                    padding: '2px 6px',
                    background: '#21262d',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#666',
                  }}>
                    Saved
                  </span>
                )}
              </div>
              <div style={{ color: '#666', marginBottom: '8px' }}>
                {Object.keys(canvas.nodes).length} nodes
              </div>
              <button
                onClick={handleSaveCanvas}
                disabled={isSaving || !canvas.is_dirty}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: canvas.is_dirty ? '#238636' : '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: canvas.is_dirty ? '#fff' : '#666',
                  cursor: canvas.is_dirty ? 'pointer' : 'default',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                {isSaving ? 'Saving...' : 'Save (Ctrl+S)'}
              </button>
              {canvas.source_directory && (
                <button
                  onClick={handleRefreshRoot}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '8px',
                    background: '#21262d',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    color: '#58a6ff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                  title={`Refresh from ${canvas.source_directory}`}
                >
                  Refresh Root
                </button>
              )}
            </div>
          )}
            </>
          )}
        </div>
      )}

      {/* Main canvas area */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Toggle sidebar button */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 10,
            padding: '8px 12px',
            background: '#21262d',
            border: '1px solid #30363d',
            borderRadius: '6px',
            color: '#c9d1d9',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          {showSidebar ? '◀' : '▶'}
        </button>

        {/* Running operations indicator - non-blocking, bottom right */}
        {isRunning && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '20px',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxWidth: '300px',
            }}
          >
            {Array.from(runningOps.entries()).map(([id, op]) => (
              <div
                key={id}
                style={{
                  padding: '12px 16px',
                  background: '#161b22',
                  borderRadius: '8px',
                  border: '1px solid #30363d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                {/* Spinner */}
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid #30363d',
                    borderTopColor: op.stage === 'waiting' ? '#58a6ff'
                      : op.stage === 'processing' ? '#3fb950'
                      : op.stage === 'updating' ? '#a371f7'
                      : '#58a6ff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: '#58a6ff',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {op.operation}
                  </div>
                  <div style={{ color: '#8b949e', fontSize: '11px' }}>
                    {op.stage === 'sending' && 'Sending...'}
                    {op.stage === 'waiting' && 'Waiting...'}
                    {op.stage === 'processing' && 'Processing...'}
                    {op.stage === 'updating' && 'Updating...'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              padding: '10px 16px',
              background: '#f85149',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
            }}
          >
            {error}
            <button
              onClick={() => setError(null)}
              style={{
                marginLeft: '12px',
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        )}

        <ReactFlowProvider>
          <CanvasView
            canvas={canvas}
            selectedNodeIds={selectedNodeIds}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
          />
        </ReactFlowProvider>
      </div>

      {/* Node detail drawer */}
      {(selectedNode || selectedNodeIds.size > 0) && (
        <NodeDrawer
          node={selectedNode}
          parentNode={selectedNode?.parent_id && canvas ? canvas.nodes[selectedNode.parent_id] || null : null}
          skills={skills}
          onClose={handleCloseDrawer}
          onSkillRun={handleSkillRun}
          onSkillRunOnSelection={handleSkillRunOnSelection}
          onChatSubmit={handleChatSubmit}
          onNodeEdit={handleNodeEdit}
          onNodeDelete={handleNodeDelete}
          onLinkCreate={handleLinkCreate}
          onToggleExclude={handleToggleExclude}
          onSubsectionSelect={setSelectedSubsectionContent}
          linkedNodes={linkedNodes}
          backlinks={backlinks}
          isRunning={isRunning}
          selectedNodeIds={selectedNodeIds}
          allNodes={canvas?.nodes || {}}
          onSkillRunOnMultiple={handleSkillRunOnMultiple}
          onClearMultiSelection={handleClearMultiSelection}
        />
      )}
    </div>
  );
}
