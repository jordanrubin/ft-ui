// Types matching the FastAPI backend

export interface CanvasNode {
  id: string;
  type: 'root' | 'operation' | 'user' | 'plan';
  content_full: string;
  content_compressed: string;
  operation: string | null;
  parent_id: string | null;
  children_ids: string[];
  links_to: string[];
  excluded: boolean;
  source_ids: string[];
}

export interface Canvas {
  name: string;
  nodes: Record<string, CanvasNode>;
  root_id: string | null;
  active_path: string[];
  can_undo: boolean;
  can_redo: boolean;
  is_dirty: boolean;
  last_saved_at: string | null;
  canvas_path: string | null;
}

export interface CanvasListItem {
  name: string;
  path: string;
  created_at: string;
  modified_at: string;
  node_count: number;
}

export interface SkillInfo {
  name: string;
  display_name: string;
  description: string;
}

export interface TemplateInfo {
  name: string;
  display_name: string;
  description: string;
}

export interface Statistics {
  total_nodes: number;
  max_depth: number;
  branch_count: number;
  leaf_count: number;
  node_types: Record<string, number>;
  operations_used: Record<string, number>;
}

export interface AppStatus {
  has_canvas: boolean;
  canvas_name: string | null;
  canvas_path: string | null;
  is_dirty: boolean;
  last_saved_at: string | null;
  autosave_interval: number;
  node_count: number;
}
