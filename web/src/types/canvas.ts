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
  invocation_target: string | null;
  invocation_prompt: string | null;
  used_web_search?: boolean;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  plan_path?: string | null;
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
  source_directory: string | null;
  source_file: string | null;
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
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
}

export type Mode = 'positive' | 'critical' | 'internal' | 'external' | 'near' | 'far' | 'coarse' | 'fine' | 'descriptive' | 'prescriptive' | 'surface' | 'underlying';

export interface ModeAxis {
  name: string;
  modes: [Mode, Mode];
  labels: [string, string];
  color: string;
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

export interface PipelineStep {
  skill: string;
  target: string;
  mode?: string;
  reason: string;
}

export interface PipelineSpec {
  rationale: string;
  steps: PipelineStep[];
}

export interface PipelineComposeResponse {
  pipeline: PipelineSpec;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface PipelineStepResult {
  skill: string;
  target: string;
  mode?: string;
  reason: string;
  status: 'completed' | 'failed';
  node_id?: string;
  error?: string;
}

export interface PipelineReflectResponse {
  reflection_id: string;
  reflection: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}
