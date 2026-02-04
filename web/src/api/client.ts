import type { Canvas, CanvasNode, CanvasListItem, SkillInfo, TemplateInfo, Statistics, AppStatus } from '../types/canvas';

const API_BASE = '/api';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 8000; // 8 seconds

// Errors that should trigger a retry
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors (fetch failed)
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Retry on network-related errors
    return msg.includes('network') ||
           msg.includes('timeout') ||
           msg.includes('failed to fetch') ||
           msg.includes('connection') ||
           msg.includes('econnreset') ||
           msg.includes('socket');
  }
  return false;
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let lastError: Error | null = null;
  let retryDelay = INITIAL_RETRY_DELAY;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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

      return await res.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on retryable errors and if we have attempts left
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        console.warn(`Request to ${path} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${retryDelay}ms...`, error);
        await sleep(retryDelay);
        // Exponential backoff with jitter
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY) + Math.random() * 500;
      } else {
        // Non-retryable error or out of retries
        break;
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Request failed after retries');
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

  // Create from plan
  createFromPlan: (planPath: string, canvasName?: string) =>
    request<Canvas>('/canvas/from-plan', {
      method: 'POST',
      body: JSON.stringify({ plan_path: planPath, canvas_name: canvasName }),
    }),

  // Create from directory
  createFromDirectory: (directoryPath: string, canvasName?: string, includeContents = false) =>
    request<Canvas>('/canvas/from-directory', {
      method: 'POST',
      body: JSON.stringify({
        directory_path: directoryPath,
        canvas_name: canvasName,
        include_contents: includeContents,
      }),
    }),

  // Refresh root from source directory
  refreshRoot: () => request<Canvas>('/canvas/refresh-root', { method: 'POST' }),

  // Rename canvas
  rename: (newName: string) =>
    request<Canvas>(`/canvas/rename?new_name=${encodeURIComponent(newName)}`, { method: 'POST' }),

  // Delete canvas
  delete: (canvasPath: string) =>
    request<{ deleted: string }>(`/canvas/${encodeURIComponent(canvasPath)}`, { method: 'DELETE' }),

  // Status
  getStatus: () => request<AppStatus>('/status'),
};

// Plan file operations
export interface PlanFileInfo {
  name: string;
  path: string;
  modified_at: string;
  size_bytes: number;
}

export const planFileApi = {
  list: () => request<PlanFileInfo[]>('/plans'),
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

  // Exclusion for plan synthesis
  toggleExclude: (nodeId: string) =>
    request<{ node_id: string; excluded: boolean }>(`/node/${nodeId}/toggle-exclude`, {
      method: 'POST',
    }),
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
// Default to canvas render mode for structured output
// verbosity 0 = minimal (max 4 items, 1 sentence each)
const DEFAULT_SKILL_PARAMS = { render: 'canvas', verbosity: 0 };

export const skillApi = {
  list: () => request<SkillInfo[]>('/skills'),

  run: (skillName: string, nodeId: string, params: Record<string, unknown> = {}, answers: Record<string, string> = {}) =>
    request<CanvasNode>('/skill/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_name: skillName,
        node_id: nodeId,
        params: { ...DEFAULT_SKILL_PARAMS, ...params },
        answers,
      }),
    }),

  runOnSelection: (skillName: string, nodeId: string, selectedContent: string, params: Record<string, unknown> = {}, answers: Record<string, string> = {}) =>
    request<CanvasNode>('/skill/run-on-selection', {
      method: 'POST',
      body: JSON.stringify({
        skill_name: skillName,
        node_id: nodeId,
        selected_content: selectedContent,
        params: { ...DEFAULT_SKILL_PARAMS, ...params },
        answers,
      }),
    }),

  runOnMultiple: (skillName: string, nodeIds: string[], params: Record<string, unknown> = {}) =>
    request<CanvasNode>('/skill/run-on-multiple', {
      method: 'POST',
      body: JSON.stringify({
        skill_name: skillName,
        node_ids: nodeIds,
        params: { ...DEFAULT_SKILL_PARAMS, ...params },
      }),
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

// Plan operations
export const planApi = {
  synthesize: (
    goal?: string,
    saveToClaude: boolean = true,
    answers: Record<string, Record<string, string>> = {}
  ) =>
    request<CanvasNode>('/canvas/synthesize-plan', {
      method: 'POST',
      body: JSON.stringify({ goal, save_to_claude: saveToClaude, answers }),
    }),
};

// Template operations
export const templateApi = {
  list: () => request<TemplateInfo[]>('/templates'),
};
