import type { Canvas, CanvasNode, CanvasListItem, SkillInfo, TemplateInfo, Statistics } from '../types/canvas';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Request failed');
  }
  return res.json();
}

// Canvas operations
export const canvasApi = {
  // Get current canvas
  get: () => request<Canvas>('/canvas'),

  // Create new canvas
  create: (name: string, rootContent: string) =>
    request<Canvas>('/canvas', {
      method: 'POST',
      body: JSON.stringify({ name, root_content: rootContent }),
    }),

  // Create from template
  createFromTemplate: (templateName: string, canvasName: string) =>
    request<Canvas>(`/canvas/from-template?template_name=${templateName}&canvas_name=${canvasName}`, {
      method: 'POST',
    }),

  // Load canvas from file
  load: (path: string) =>
    request<Canvas>(`/canvas/load?path=${encodeURIComponent(path)}`, { method: 'POST' }),

  // Save canvas
  save: (path?: string) =>
    request<{ saved: string }>(`/canvas/save${path ? `?path=${encodeURIComponent(path)}` : ''}`, {
      method: 'POST',
    }),

  // List saved canvases
  list: () => request<CanvasListItem[]>('/canvases'),

  // Undo/redo
  undo: () => request<Canvas>('/canvas/undo', { method: 'POST' }),
  redo: () => request<Canvas>('/canvas/redo', { method: 'POST' }),

  // Search
  search: (query: string, useRegex = false) =>
    request<CanvasNode[]>('/canvas/search', {
      method: 'POST',
      body: JSON.stringify({ query, use_regex: useRegex }),
    }),

  // Statistics
  getStatistics: () => request<Statistics>('/canvas/statistics'),

  // Export
  exportMarkdown: () => fetch(`${API_BASE}/canvas/export/markdown`).then(r => r.text()),
  exportMermaid: () => fetch(`${API_BASE}/canvas/export/mermaid`).then(r => r.text()),
  exportOutline: () => fetch(`${API_BASE}/canvas/export/outline`).then(r => r.text()),
  exportJson: () => request<object>('/canvas/export/json'),
};

// Node operations
export const nodeApi = {
  // Create node
  create: (content: string, parentId: string, type: 'note' | 'operation' = 'note') =>
    request<CanvasNode>('/node', {
      method: 'POST',
      body: JSON.stringify({ content, parent_id: parentId, type }),
    }),

  // Delete node
  delete: (nodeId: string) =>
    request<{ deleted: string; new_focus: string | null }>(`/node/${nodeId}`, {
      method: 'DELETE',
    }),

  // Edit node
  edit: (nodeId: string, content: string) =>
    request<CanvasNode>(`/node/${nodeId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  // Set focus
  setFocus: (nodeId: string) =>
    request<{ focus: string; active_path: string[] }>(`/focus/${nodeId}`, {
      method: 'POST',
    }),

  // Siblings
  getSiblings: (nodeId: string) => request<CanvasNode[]>(`/node/${nodeId}/siblings`),
  getNextSibling: (nodeId: string) => request<CanvasNode | null>(`/node/${nodeId}/next-sibling`),
  getPrevSibling: (nodeId: string) => request<CanvasNode | null>(`/node/${nodeId}/prev-sibling`),

  // Links
  getLinks: (nodeId: string) => request<CanvasNode[]>(`/node/${nodeId}/links`),
  getBacklinks: (nodeId: string) => request<CanvasNode[]>(`/node/${nodeId}/backlinks`),
};

// Link operations
export const linkApi = {
  add: (fromId: string, toId: string) =>
    request<CanvasNode>('/link', {
      method: 'POST',
      body: JSON.stringify({ from_id: fromId, to_id: toId }),
    }),

  remove: (fromId: string, toId: string) =>
    request<{ removed: boolean }>(`/link?from_id=${fromId}&to_id=${toId}`, {
      method: 'DELETE',
    }),
};

// Skill operations
export const skillApi = {
  list: () => request<SkillInfo[]>('/skills'),

  run: (skillName: string, nodeId: string, params: Record<string, unknown> = {}) =>
    request<CanvasNode>('/skill/run', {
      method: 'POST',
      body: JSON.stringify({ skill_name: skillName, node_id: nodeId, params }),
    }),

  runOnSelection: (skillName: string, nodeId: string, selectedContent: string, params: Record<string, unknown> = {}) =>
    request<CanvasNode>('/skill/run-on-selection', {
      method: 'POST',
      body: JSON.stringify({ skill_name: skillName, node_id: nodeId, selected_content: selectedContent, params }),
    }),

  runOnMultiple: (skillName: string, nodeIds: string[], params: Record<string, unknown> = {}) =>
    request<CanvasNode>('/skill/run-on-multiple', {
      method: 'POST',
      body: JSON.stringify({ skill_name: skillName, node_ids: nodeIds, params }),
    }),

  runChain: (chainText: string, nodeId: string) =>
    request<CanvasNode>('/chain/run', {
      method: 'POST',
      body: JSON.stringify({ chain_text: chainText, node_id: nodeId }),
    }),

  runChat: (prompt: string, nodeId: string) =>
    request<CanvasNode>('/chat/run', {
      method: 'POST',
      body: JSON.stringify({ prompt, node_id: nodeId }),
    }),
};

// Template operations
export const templateApi = {
  list: () => request<TemplateInfo[]>('/templates'),
};
