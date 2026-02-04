// Canvas Artifact Schema
// Uniform output format for all skills when render=canvas
//
// This is Layer 2 of the 3-layer architecture:
// Layer 1: Canonical skill semantics (rich narrative output)
// Layer 2: Canvas artifact renderer (this schema - machine legible)
// Layer 3: UI presentation (renders this schema directly)

export type RenderMode = 'narrative' | 'canvas';
export type Verbosity = 0 | 1 | 2;
export type Polarity = 'positive' | 'negative' | 'neutral' | 'mixed';
export type Importance = 'critical' | 'high' | 'medium' | 'low';

// Semantic focus modes - what lens to apply
export type FocusMode =
  | 'planning'    // actionable next steps
  | 'critical'    // find flaws
  | 'positive'    // find strengths
  | 'near'        // immediate implications
  | 'far'         // long-term implications
  | 'internal'    // within-system view
  | 'external';   // outside-system view

// Extended mode system for canvas skills (6 axes, 12 modes)
export type Mode =
  | 'positive' | 'critical'        // Valence: return vs risk
  | 'internal' | 'external'        // Object: speaker-utility vs audience-reception
  | 'near' | 'far'                 // Temporal: action (monday) vs vision (5yr)
  | 'coarse' | 'fine'              // Resolution: strategy/gestalt vs tactics/detail
  | 'descriptive' | 'prescriptive' // Normative: what IS vs what SHOULD change
  | 'surface' | 'underlying';      // Epistemic: explicit/stated vs implicit/assumed

// Move types for suggested_moves
export type MoveType = 'skill' | 'web_search' | 'ask_questions' | 'synthesize_plan';

// Edge types for graph relationships
export type EdgeType =
  | 'supports'
  | 'refutes'
  | 'depends_on'
  | 'enables'
  | 'blocks'
  | 'links_to'
  | 'elaborates'
  | 'contrasts';

// A single atomic item within a block
export interface CanvasItem {
  id: string;
  text: string;                    // the main content
  title?: string;                  // optional short title
  importance?: Importance;
  polarity?: Polarity;
  tags?: string[];                 // freeform tags for filtering/grouping
  source?: string;                 // what context this came from
}

// A block groups related items (e.g., "Cruxes", "Failure Modes")
export interface CanvasBlock {
  kind: string;                    // 'cruxes' | 'antitheses' | 'alternatives' | etc.
  title: string;                   // display title
  items: CanvasItem[];
}

// An edge represents a relationship between items
export interface CanvasEdge {
  from: string;                    // item id
  to: string;                      // item id
  type: EdgeType;
  label?: string;                  // optional edge label
}

// Suggested next skill to run (extended for canvas skills)
export interface SuggestedMove {
  // Move type - defaults to 'skill' if absent for backward compatibility
  type?: MoveType;

  // For type='skill' (or when type is absent)
  skill?: string;                  // e.g., '@stressify'
  mode?: Mode;                     // mode to run skill in
  params?: Record<string, unknown>; // skill-specific parameters

  // For type='web_search'
  query?: string;                  // search query

  // For type='ask_questions'
  questions?: string[];            // up to 3 questions to ask

  // For type='synthesize_plan'
  plan_elements?: string[];        // what to include in plan

  // Common fields
  reason?: string;                 // why this move makes sense (10 words max)
  target?: string;                 // which item id to apply to
}

// The main canvas artifact schema
export interface CanvasArtifact {
  // Required: compressed summary for node title/preview
  summary: string;                 // ~100 chars (or 20 words max for canvas skills)

  // Required: structured content blocks
  blocks: CanvasBlock[];

  // Optional: suggested next moves
  suggested_moves?: SuggestedMove[];

  // Optional: edges if skill implies structure
  edges?: CanvasEdge[];

  // Optional: warnings/caveats
  warnings?: string[];

  // Optional: what context was actually used
  context_used?: string[];

  // Metadata
  schema_version?: string;
  skill?: string;                  // which skill produced this

  // Canvas skill extensions
  mode?: Mode;                     // which mode was used (default: 'critical')
  params?: Record<string, unknown>; // skill-specific parameters used
}

// Type guard to check if content is a CanvasArtifact
export function isCanvasArtifact(obj: unknown): obj is CanvasArtifact {
  if (typeof obj !== 'object' || obj === null) return false;
  const artifact = obj as Record<string, unknown>;
  return (
    typeof artifact.summary === 'string' &&
    Array.isArray(artifact.blocks) &&
    artifact.blocks.every(
      (b: unknown) =>
        typeof b === 'object' &&
        b !== null &&
        typeof (b as Record<string, unknown>).kind === 'string' &&
        typeof (b as Record<string, unknown>).title === 'string' &&
        Array.isArray((b as Record<string, unknown>).items)
    )
  );
}

// Parse response that might be JSON CanvasArtifact or narrative text
export function parseCanvasResponse(content: string): { artifact: CanvasArtifact | null; raw: string } {
  const trimmed = content.trim();

  // Try to extract JSON from markdown code block
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (isCanvasArtifact(parsed)) {
        return { artifact: parsed, raw: content };
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  // Try direct JSON parse
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isCanvasArtifact(parsed)) {
        return { artifact: parsed, raw: content };
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  return { artifact: null, raw: content };
}

// Render parameters for skill invocation
export interface CanvasRenderParams {
  render?: RenderMode;
  verbosity?: Verbosity;
  focus?: FocusMode;
}
