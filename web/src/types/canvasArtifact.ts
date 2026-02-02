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

// Suggested next skill to run
export interface SuggestedMove {
  skill: string;                   // e.g., '@stressify'
  reason?: string;                 // why this move makes sense
  target?: string;                 // which item to target
}

// The main canvas artifact schema
export interface CanvasArtifact {
  // Required: compressed summary for node title/preview
  summary: string;                 // ~100 chars, the headline

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
