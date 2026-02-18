import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';

import CanvasView from './components/CanvasView';
import NodeDrawer from './components/NodeDrawer';
import SkillsPane from './components/SkillsPane';
import TutorialHint from './components/TutorialHint';
import Login from './components/Login';
import { canvasApi, nodeApi, skillApi, linkApi, templateApi, planApi, planFileApi, type PlanFileInfo } from './api/client';
import type { Canvas, CanvasNode, SkillInfo, TemplateInfo, CanvasListItem, Mode } from './types/canvas';

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
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => {
    const stored = localStorage.getItem('rf-web-search-enabled');
    return stored === null ? true : stored === 'true';
  });

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
  const [showFileInput, setShowFileInput] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showNewCanvasModal, setShowNewCanvasModal] = useState(false);
  const [newCanvasName, setNewCanvasName] = useState('');
  const [newCanvasGoal, setNewCanvasGoal] = useState('');
  const [selectedSubsectionContent, setSelectedSubsectionContent] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Tutorial state
  type TutorialStep = 'click-node' | 'pick-skill' | 'see-result' | null;
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(null);
  const [tutorialNodeId, setTutorialNodeId] = useState<string | undefined>();

  const completeTutorial = useCallback(() => {
    setTutorialStep(null);
    setTutorialNodeId(undefined);
    localStorage.setItem('ft-tutorial-seen', 'true');
  }, []);

  // Mobile detection
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = windowWidth < 768;

  // Active mode for skill runs (shared between SkillsPane and NodeDrawer combobox)
  const [activeMode, setActiveMode] = useState<Mode | null>(null);

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
        // Collapse sidebar if canvas has nodes (user is returning to work)
        const nodeCount = Object.keys(currentCanvas.nodes || {}).length;
        if (nodeCount > 0) {
          setShowSidebar(false);
        }
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

  // Persist web search setting to localStorage
  useEffect(() => {
    localStorage.setItem('rf-web-search-enabled', String(webSearchEnabled));
  }, [webSearchEnabled]);

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
          // Single click: open content panel and focus
          setSelectedNodeIds(new Set());
          setSelectedSubsectionContent(undefined);
          await nodeApi.setFocus(nodeId);
          await refreshCanvas();
          // Open the node in content panel
          const updated = await canvasApi.get();
          const node = updated.nodes[nodeId];
          if (node) {
            setCanvas(updated);
            setSelectedNode(node);
          }
          // Advance tutorial: click-node → pick-skill
          if (tutorialStep === 'click-node') {
            setTutorialStep('pick-skill');
            setTutorialNodeId(undefined);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to focus node');
      }
    },
    [refreshCanvas, tutorialStep]
  );

  const handleDeselectNode = useCallback(() => {
    setSelectedNode(null);
    setSelectedNodeIds(new Set());
    setSelectedSubsectionContent(undefined);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedNode(null);
    setSelectedSubsectionContent(undefined);
  }, []);

  // Helper to load answers from localStorage for a node
  const loadNodeAnswers = (nodeId: string): Record<string, string> => {
    try {
      const stored = localStorage.getItem(`rf-answers-${nodeId}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  };

  const handleSkillRun = useCallback(
    async (skillName: string, mode?: Mode) => {
      if (!selectedNode) return;
      const opId = `${skillName}-${Date.now()}`;
      const nodeId = selectedNode.id;
      // Load any user answers for this node (from askuserquestions)
      const answers = loadNodeAnswers(nodeId);
      const params: Record<string, unknown> = mode ? { mode } : {};
      // Don't close drawer - allow queuing more operations
      startOperation(opId, mode ? `${skillName} [${mode}]` : skillName);
      setError(null);

      // Advance tutorial: pick-skill → see-result
      const wasTutorialSkill = tutorialStep === 'pick-skill';

      // Run async without blocking
      (async () => {
        try {
          updateOperationStage(opId, 'waiting');
          const newNode = await skillApi.run(skillName, nodeId, params, answers);
          updateOperationStage(opId, 'processing');
          await refreshCanvas();
          // Don't auto-select result when running concurrent ops
          if (runningOps.size <= 1 && newNode?.id) {
            setSelectedNode(newNode);
          }
          // Show tutorial result step
          if (wasTutorialSkill && newNode?.id) {
            setTutorialStep('see-result');
            setTutorialNodeId(newNode.id);
            setTimeout(() => {
              completeTutorial();
            }, 4000);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : `${skillName} failed`);
        } finally {
          endOperation(opId);
        }
      })();
    },
    [selectedNode, refreshCanvas, runningOps.size, tutorialStep, completeTutorial]
  );

  const handleSkillRunOnSelection = useCallback(
    async (skillName: string, selectedContent: string, mode?: Mode) => {
      if (!selectedNode) return;
      const opId = `${skillName}-sel-${Date.now()}`;
      const nodeId = selectedNode.id;
      const answers = loadNodeAnswers(nodeId);
      const params: Record<string, unknown> = mode ? { mode } : {};
      startOperation(opId, mode ? `${skillName} [${mode}]` : skillName);
      setError(null);

      // Advance tutorial: pick-skill → see-result
      const wasTutorialSkill = tutorialStep === 'pick-skill';

      (async () => {
        try {
          updateOperationStage(opId, 'waiting');
          const newNode = await skillApi.runOnSelection(skillName, nodeId, selectedContent, params, answers);
          updateOperationStage(opId, 'processing');
          await refreshCanvas();
          if (runningOps.size <= 1 && newNode?.id) {
            setSelectedNode(newNode);
          }
          if (wasTutorialSkill && newNode?.id) {
            setTutorialStep('see-result');
            setTutorialNodeId(newNode.id);
            setTimeout(() => {
              completeTutorial();
            }, 4000);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : `${skillName} on selection failed`);
        } finally {
          endOperation(opId);
        }
      })();
    },
    [selectedNode, refreshCanvas, runningOps.size, tutorialStep, completeTutorial]
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

  // Run skills sequentially (queue mode) - each skill runs on the output of the previous
  const handleSkillRunQueue = useCallback(
    async (skillNames: string[], selectedContent?: string) => {
      if (!selectedNode || skillNames.length === 0) return;
      const opId = `queue-${Date.now()}`;
      let currentNodeId = selectedNode.id;
      const answers = loadNodeAnswers(currentNodeId);

      startOperation(opId, `queue (${skillNames.length})`);
      setError(null);

      (async () => {
        try {
          for (let i = 0; i < skillNames.length; i++) {
            const skillName = skillNames[i];
            updateOperationStage(opId, 'waiting');

            // First skill uses selectedContent if provided, rest use full node
            const newNode = i === 0 && selectedContent
              ? await skillApi.runOnSelection(skillName, currentNodeId, selectedContent, {}, answers)
              : await skillApi.run(skillName, currentNodeId, {}, answers);

            updateOperationStage(opId, 'processing');
            await refreshCanvas();

            // Update current node for next skill in queue
            if (newNode?.id) {
              currentNodeId = newNode.id;
              // Select the new node to show progress
              if (i === skillNames.length - 1) {
                setSelectedNode(newNode);
              }
            }
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Queue failed');
        } finally {
          endOperation(opId);
        }
      })();
    },
    [selectedNode, refreshCanvas]
  );

  const handleChatSubmit = useCallback(
    async (prompt: string) => {
      if (!selectedNode) return;
      const opId = `chat-${Date.now()}`;
      const nodeId = selectedNode.id;
      startOperation(opId, webSearchEnabled ? 'chat (web search)' : 'chat');
      setError(null);

      (async () => {
        try {
          updateOperationStage(opId, 'waiting');
          const newNode = await skillApi.runChat(prompt, nodeId, webSearchEnabled);
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
    [selectedNode, refreshCanvas, webSearchEnabled]
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
    if (!newCanvasName.trim() || !newCanvasGoal.trim()) return;
    const goal = newCanvasGoal.trim();
    const name = newCanvasName.trim();

    try {
      // Create canvas immediately (skip auto-response for instant feedback)
      const newCanvas = await canvasApi.create(name, goal, true);
      setCanvas(newCanvas);
      setSelectedNode(null);
      setShowNewCanvasModal(false);
      setNewCanvasName('');
      setNewCanvasGoal('');
      setShowSidebar(false);
      setCanvasList(await canvasApi.list());

      // Start tutorial for first-time users
      if (!localStorage.getItem('ft-tutorial-seen') && newCanvas.root_id) {
        setTutorialStep('click-node');
        setTutorialNodeId(newCanvas.root_id);
      }

      // Generate initial chat response in background
      const rootId = newCanvas.root_id;
      if (rootId) {
        const opId = `init_${Date.now()}`;
        startOperation(opId, 'chat');
        setError(null);

        (async () => {
          try {
            updateOperationStage(opId, 'waiting');
            const initialPrompt = `give me your initial reaction: what do you understand I want, and what are the key considerations?`;
            const newNode = await skillApi.runChat(initialPrompt, rootId, webSearchEnabled);
            updateOperationStage(opId, 'processing');
            await refreshCanvas();
            if (newNode?.id) {
              setSelectedNode(newNode);
            }
          } catch (err) {
            // Silent fail for auto-response - user can still work with canvas
            console.error('Auto-response generation failed:', err);
          } finally {
            endOperation(opId);
          }
        })();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }, [newCanvasName, newCanvasGoal, refreshCanvas]);

  const handleLoadCanvas = useCallback(async (path: string) => {
    try {
      const loaded = await canvasApi.load(path);
      setCanvas(loaded);
      setSelectedNode(null);
      setShowCanvasPicker(false);
      // Collapse sidebar if canvas has nodes
      if (Object.keys(loaded.nodes || {}).length > 0) {
        setShowSidebar(false);
      }
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
      setShowSidebar(false); // Collapse - new canvas has content
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
      setShowSidebar(false); // Collapse - new canvas has content
      // Refresh canvas list
      const list = await canvasApi.list();
      setCanvasList(list);

      // Generate initial chat response in background
      const rootId = newCanvas.root_id;
      if (rootId) {
        const opId = `init_${Date.now()}`;
        startOperation(opId, 'chat');

        (async () => {
          try {
            updateOperationStage(opId, 'waiting');
            const initialPrompt = `give me your initial reaction: what do you understand this project is, and what are the key considerations?`;
            const newNode = await skillApi.runChat(initialPrompt, rootId, webSearchEnabled);
            updateOperationStage(opId, 'processing');
            await refreshCanvas();
            if (newNode?.id) {
              setSelectedNode(newNode);
            }
          } catch (err) {
            console.error('Auto-response generation failed:', err);
          } finally {
            endOperation(opId);
          }
        })();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load from directory failed');
    }
  }, [refreshCanvas, webSearchEnabled]);

  const handleRefreshRoot = useCallback(async () => {
    try {
      const updated = await canvasApi.refreshRoot();
      setCanvas(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    }
  }, []);

  const handleLoadFromFile = useCallback(async (file: File) => {
    try {
      const newCanvas = await canvasApi.uploadFile(file);
      setCanvas(newCanvas);
      setSelectedNode(null);
      setShowFileInput(false);
      setSelectedFile(null);
      setShowSidebar(false);
      const list = await canvasApi.list();
      setCanvasList(list);

      // Generate initial chat response in background
      const rootId = newCanvas.root_id;
      if (rootId) {
        const opId = `init_${Date.now()}`;
        startOperation(opId, 'chat');

        (async () => {
          try {
            updateOperationStage(opId, 'waiting');
            const initialPrompt = `give me your initial reaction: what do you understand this document is about, and what are the key points?`;
            const newNode = await skillApi.runChat(initialPrompt, rootId, webSearchEnabled);
            updateOperationStage(opId, 'processing');
            await refreshCanvas();
            if (newNode?.id) {
              setSelectedNode(newNode);
            }
          } catch (err) {
            console.error('Auto-response generation failed:', err);
          } finally {
            endOperation(opId);
          }
        })();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [refreshCanvas, webSearchEnabled]);

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
    <div style={{
      height: '100dvh',
      display: 'flex',
      background: '#0d1117',
      overflow: 'hidden',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
    }}>
      {/* Skills Pane Sidebar - always shows when node selected, hidden on mobile (drawer covers it) */}
      {showSkillsPane && selectedNode && !isMobile && (
        <div
          style={{
            width: '180px',
            background: '#161b22',
            borderRight: '1px solid #30363d',
            display: 'flex',
            flexDirection: 'column',
            ...(tutorialStep === 'pick-skill' ? {
              animation: 'tutorial-glow 1.5s ease infinite',
              borderRight: '2px solid #58a6ff',
            } : {}),
          }}
        >
          <SkillsPane
            node={selectedNode}
            skills={skills}
            selectedContent={selectedSubsectionContent}
            activeMode={activeMode}
            onModeChange={setActiveMode}
            onRunSkill={async (skillName, content, mode) => {
              if (skillName.startsWith('chat:')) {
                // Freeform chat
                const prompt = skillName.slice(5);
                await handleChatSubmit(prompt);
              } else {
                // Regular skill
                if (content) {
                  await handleSkillRunOnSelection(skillName, content, mode);
                } else {
                  await handleSkillRun(skillName, mode);
                }
              }
            }}
            onRunSkillQueue={(skillNames, content) => handleSkillRunQueue(skillNames, content)}
            onClearSelection={() => setSelectedSubsectionContent(undefined)}
            onClose={() => {
              setSelectedNode(null);
              setSelectedSubsectionContent(undefined);
            }}
            isRunning={isRunning}
          />
        </div>
      )}

      {/* Main Sidebar - only when no node selected and sidebar is open, hidden on mobile when drawer open */}
      {showSidebar && !showSkillsPane && !(isMobile && (selectedNode || selectedNodeIds.size > 0)) && (
        <div
          style={{
            width: '260px',
            background: '#161b22',
            borderRight: '1px solid #30363d',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid #30363d' }}>
            <h1 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Future Tokenizer</h1>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
              reasoning-as-graph
            </p>
          </div>
          {/* Actions */}
          <div style={{ padding: '12px', borderBottom: '1px solid #30363d' }}>
            <button
              onClick={() => setShowNewCanvasModal(true)}
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
            <button
              onClick={() => setShowFileInput(!showFileInput)}
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
              Load from File
            </button>
            {showFileInput && (
              <div style={{ marginTop: '8px' }}>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    color: '#c9d1d9',
                    fontSize: '13px',
                  }}
                />
                {selectedFile && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#8b949e' }}>
                    {selectedFile.name}
                  </div>
                )}
                <button
                  onClick={() => selectedFile && handleLoadFromFile(selectedFile)}
                  disabled={!selectedFile}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '4px',
                    background: selectedFile ? '#238636' : '#21262d',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: selectedFile ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                  }}
                >
                  Upload
                </button>
              </div>
            )}
          </div>

          {/* Settings */}
          <div style={{ padding: '12px', borderBottom: '1px solid #30363d' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontSize: '13px',
                color: webSearchEnabled ? '#58a6ff' : '#8b949e',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>🔍</span>
                Web search
              </span>
              <div
                style={{
                  width: '36px',
                  height: '20px',
                  background: webSearchEnabled ? '#238636' : '#30363d',
                  borderRadius: '10px',
                  position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    background: '#fff',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: '2px',
                    left: webSearchEnabled ? '18px' : '2px',
                    transition: 'left 0.2s',
                  }}
                />
              </div>
              <input
                type="checkbox"
                checked={webSearchEnabled}
                onChange={(e) => setWebSearchEnabled(e.target.checked)}
                style={{ display: 'none' }}
              />
            </label>
            {webSearchEnabled && (
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#3fb950' }}>
                Claude can search the web for current info
              </p>
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
                ~/.future-tokenizer/ (load existing)
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
                {(() => {
                  const nodes = Object.values(canvas.nodes);
                  const totalTokens = nodes.reduce((sum, n) => sum + (n.input_tokens ?? 0) + (n.output_tokens ?? 0), 0);
                  if (totalTokens === 0) return null;
                  const fmt = totalTokens >= 1_000_000 ? `${(totalTokens / 1_000_000).toFixed(1)}M` : totalTokens >= 1_000 ? `${(totalTokens / 1_000).toFixed(1)}k` : String(totalTokens);
                  return (
                    <span style={{ marginLeft: '8px' }} title="Input + output tokens across all nodes">
                      · {fmt} tokens
                    </span>
                  );
                })()}
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
              {(canvas.source_directory || canvas.source_file) && (
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
                  title={`Refresh from ${canvas.source_directory || canvas.source_file}`}
                >
                  Refresh Root
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main canvas area */}
      <div style={{ flex: selectedNode || selectedNodeIds.size > 0 ? 4 : 1, position: 'relative', minWidth: 0 }}>
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

        {/* Tutorial hints */}
        {tutorialStep === 'click-node' && (
          <TutorialHint
            message="Click this node to start exploring"
            position="center"
            onSkip={completeTutorial}
          />
        )}
        {tutorialStep === 'pick-skill' && (
          <TutorialHint
            message="Pick a skill to analyze"
            position="left"
            onSkip={completeTutorial}
          />
        )}
        {tutorialStep === 'see-result' && (
          <TutorialHint
            message="New perspective created — keep going!"
            position="center"
            onSkip={completeTutorial}
          />
        )}

        <ReactFlowProvider>
          <CanvasView
            canvas={canvas}
            selectedNodeIds={selectedNodeIds}
            tutorialNodeId={tutorialNodeId}
            onNodeClick={handleNodeClick}
            onDeselectNode={handleDeselectNode}
          />
        </ReactFlowProvider>
      </div>

      {/* Content panel — flex sibling, not overlay */}
      {(selectedNode || selectedNodeIds.size > 0) && !isMobile && (
        <NodeDrawer
          node={selectedNode}
          parentNode={selectedNode?.parent_id && canvas ? canvas.nodes[selectedNode.parent_id] || null : null}
          skills={skills}
          onClose={handleCloseDrawer}
          onSkillRun={handleSkillRun}
          activeMode={activeMode}
          onSkillRunOnSelection={handleSkillRunOnSelection}
          onChatSubmit={handleChatSubmit}
          webSearchEnabled={webSearchEnabled}
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

      {/* Mobile: keep overlay behavior */}
      {(selectedNode || selectedNodeIds.size > 0) && isMobile && (
        <NodeDrawer
          node={selectedNode}
          parentNode={selectedNode?.parent_id && canvas ? canvas.nodes[selectedNode.parent_id] || null : null}
          skills={skills}
          onClose={handleCloseDrawer}
          onSkillRun={handleSkillRun}
          activeMode={activeMode}
          onSkillRunOnSelection={handleSkillRunOnSelection}
          onChatSubmit={handleChatSubmit}
          webSearchEnabled={webSearchEnabled}
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
          mobile
          skillsPane={selectedNode ? (
            <SkillsPane
              node={selectedNode}
              skills={skills}
              selectedContent={selectedSubsectionContent}
              activeMode={activeMode}
              onModeChange={setActiveMode}
              onRunSkill={async (skillName, content, mode) => {
                if (skillName.startsWith('chat:')) {
                  const prompt = skillName.slice(5);
                  await handleChatSubmit(prompt);
                } else if (content) {
                  await handleSkillRunOnSelection(skillName, content, mode);
                } else {
                  await handleSkillRun(skillName, mode);
                }
              }}
              onRunSkillQueue={(skillNames, content) => handleSkillRunQueue(skillNames, content)}
              onClearSelection={() => setSelectedSubsectionContent(undefined)}
              onClose={handleCloseDrawer}
              isRunning={isRunning}
            />
          ) : undefined}
        />
      )}

      {/* New Canvas Modal */}
      {showNewCanvasModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowNewCanvasModal(false)}
        >
          <div
            style={{
              background: '#161b22',
              borderRadius: '12px',
              border: '1px solid #30363d',
              padding: '24px',
              width: '480px',
              maxWidth: '90vw',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px', color: '#e6edf3', fontSize: '18px' }}>
              New Canvas
            </h2>

            {/* Canvas name */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: '12px', marginBottom: '6px' }}>
                Canvas name
              </label>
              <input
                type="text"
                value={newCanvasName}
                onChange={(e) => setNewCanvasName(e.target.value)}
                placeholder="my-project"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#e6edf3',
                  fontSize: '14px',
                }}
              />
            </div>

            {/* Goal/root content */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: '12px', marginBottom: '6px' }}>
                What are you building?
              </label>
              <div style={{ color: '#6e7681', fontSize: '11px', marginBottom: '8px' }}>
                This becomes your root node. Give enough detail for skills to work with.
              </div>
              <textarea
                value={newCanvasGoal}
                onChange={(e) => setNewCanvasGoal(e.target.value)}
                placeholder="I am building a..."
                rows={6}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#e6edf3',
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowNewCanvasModal(false);
                  setNewCanvasName('');
                  setNewCanvasGoal('');
                }}
                style={{
                  padding: '10px 16px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCanvas}
                disabled={!newCanvasName.trim() || !newCanvasGoal.trim()}
                style={{
                  padding: '10px 16px',
                  background: newCanvasName.trim() && newCanvasGoal.trim() ? '#238636' : '#21262d',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: newCanvasName.trim() && newCanvasGoal.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Create Canvas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
