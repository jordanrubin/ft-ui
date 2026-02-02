import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';

import CanvasView from './components/CanvasView';
import NodeDrawer from './components/NodeDrawer';
import Login from './components/Login';
import { canvasApi, nodeApi, skillApi, linkApi, templateApi } from './api/client';
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
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Load initial data
  useEffect(() => {
    Promise.all([
      skillApi.list().catch(() => []),
      templateApi.list().catch(() => []),
      canvasApi.list().catch(() => []),
      canvasApi.get().catch(() => null),
    ]).then(([skills, templates, list, currentCanvas]) => {
      setSkills(skills);
      setTemplates(templates);
      setCanvasList(list);
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
      setSelectedNode(null); // close drawer
      setIsRunning(true);
      setError(null);
      try {
        const newNode = await skillApi.run(skillName, selectedNode.id);
        await refreshCanvas();
        // focus the new node
        if (newNode?.id) {
          setSelectedNode(newNode);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Skill failed');
      } finally {
        setIsRunning(false);
      }
    },
    [selectedNode, refreshCanvas]
  );

  const handleSkillRunOnSelection = useCallback(
    async (skillName: string, selectedContent: string) => {
      if (!selectedNode) return;
      setSelectedNode(null); // close drawer
      setIsRunning(true);
      setError(null);
      try {
        const newNode = await skillApi.runOnSelection(skillName, selectedNode.id, selectedContent);
        await refreshCanvas();
        if (newNode?.id) {
          setSelectedNode(newNode);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Skill on selection failed');
      } finally {
        setIsRunning(false);
      }
    },
    [selectedNode, refreshCanvas]
  );

  const handleSkillRunOnMultiple = useCallback(
    async (skillName: string) => {
      if (selectedNodeIds.size === 0) return;
      setIsRunning(true);
      setError(null);
      try {
        const nodeIds = [...selectedNodeIds];
        const newNode = await skillApi.runOnMultiple(skillName, nodeIds);
        setSelectedNodeIds(new Set()); // clear selection
        await refreshCanvas();
        if (newNode?.id) {
          setSelectedNode(newNode);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Skill on multiple nodes failed');
      } finally {
        setIsRunning(false);
      }
    },
    [selectedNodeIds, refreshCanvas]
  );

  const handleClearMultiSelection = useCallback(() => {
    setSelectedNodeIds(new Set());
  }, []);

  const handleChatSubmit = useCallback(
    async (prompt: string) => {
      if (!selectedNode) return;
      setSelectedNode(null); // close drawer
      setIsRunning(true);
      setError(null);
      try {
        const newNode = await skillApi.runChat(prompt, selectedNode.id);
        await refreshCanvas();
        if (newNode?.id) {
          setSelectedNode(newNode);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chat failed');
      } finally {
        setIsRunning(false);
      }
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

  const handleCreateCanvas = useCallback(async () => {
    const name = prompt('Canvas name:');
    const goal = prompt('What are you trying to build?');
    if (name && goal) {
      try {
        const newCanvas = await canvasApi.create(name, goal);
        setCanvas(newCanvas);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    }
  }, []);

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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

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
            width: '260px',
            background: '#161b22',
            borderRight: '1px solid #30363d',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid #30363d' }}>
            <h1 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Runeforge Canvas</h1>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
              reasoning-as-graph
            </p>
          </div>

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
          </div>

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
                  <button
                    key={item.path}
                    onClick={() => handleLoadCanvas(item.path)}
                    style={{
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
                ))}
              </div>
            )}
          </div>

          {/* Current canvas stats */}
          {canvas && (
            <div style={{ padding: '12px', borderTop: '1px solid #30363d', fontSize: '12px', color: '#666' }}>
              <strong>{canvas.name}</strong>
              <br />
              {Object.keys(canvas.nodes).length} nodes
            </div>
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

        {/* Loading overlay */}
        {isRunning && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(13, 17, 23, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div
              style={{
                padding: '24px 48px',
                background: '#161b22',
                borderRadius: '12px',
                border: '1px solid #30363d',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid #30363d',
                  borderTopColor: '#58a6ff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px',
                }}
              />
              <div style={{ color: '#e0e0e0', fontSize: '16px' }}>Running operation...</div>
            </div>
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
          skills={skills}
          onClose={handleCloseDrawer}
          onSkillRun={handleSkillRun}
          onSkillRunOnSelection={handleSkillRunOnSelection}
          onChatSubmit={handleChatSubmit}
          onNodeEdit={handleNodeEdit}
          onNodeDelete={handleNodeDelete}
          onLinkCreate={handleLinkCreate}
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
