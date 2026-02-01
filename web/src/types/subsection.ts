// Types for structured skill response subsections

export type SubsectionType =
  | 'thesis'
  | 'antithesis'
  | 'crux'
  | 'assumption'
  | 'dimension'
  | 'alternative'
  | 'failure_mode'
  | 'simulation_step'
  | 'negspace'
  | 'metaphor'
  | 'rhyme'
  | 'synthesis'
  | 'generic';

export type ImportanceLevel = 'high' | 'medium' | 'low';
export type StrengthLevel = 'strong' | 'moderate' | 'weak';

export interface SubsectionTag {
  label: string;
  color: 'red' | 'orange' | 'yellow' | 'blue' | 'purple' | 'gray';
}

export interface Subsection {
  id: string;
  type: SubsectionType;
  title: string;
  content: string;
  importance?: ImportanceLevel;
  strength?: StrengthLevel;
  tags?: SubsectionTag[];
  assumptions?: string[];
  children?: Subsection[];
  collapsed?: boolean;
}

export interface ParsedResponse {
  header?: {
    skill: string;
    input: string;
    compressed?: string;
  };
  mainContent?: Subsection;
  subsections: Subsection[];
  rawContent: string;
}

// Skill-specific section names for parsing
export const SKILL_SECTION_PATTERNS: Record<string, { pattern: RegExp; type: SubsectionType }[]> = {
  '@antithesize': [
    { pattern: /^##?\s*THESIS\s*(?:\(STEEL[- ]MANNED\))?/mi, type: 'thesis' },
    { pattern: /^##?\s*ANTITHES[EI]S/mi, type: 'antithesis' },
  ],
  '@excavate': [
    { pattern: /^##?\s*CRUX(?:ES)?/mi, type: 'crux' },
    { pattern: /^##?\s*ASSUMPTION/mi, type: 'assumption' },
  ],
  '@stressify': [
    { pattern: /^##?\s*FAILURE\s*MODE/mi, type: 'failure_mode' },
    { pattern: /^##?\s*STRESS\s*(?:TEST|POINT)/mi, type: 'failure_mode' },
  ],
  '@simulate': [
    { pattern: /^##?\s*STEP\s*\d/mi, type: 'simulation_step' },
    { pattern: /^##?\s*SCENARIO/mi, type: 'simulation_step' },
  ],
  '@diverge': [
    { pattern: /^##?\s*ALTERNATIVE/mi, type: 'alternative' },
    { pattern: /^##?\s*OPTION/mi, type: 'alternative' },
  ],
  '@dimensionalize': [
    { pattern: /^##?\s*DIMENSION/mi, type: 'dimension' },
    { pattern: /^##?\s*AXIS/mi, type: 'dimension' },
  ],
  '@negspace': [
    { pattern: /^##?\s*MISSING/mi, type: 'negspace' },
    { pattern: /^##?\s*ABSENT/mi, type: 'negspace' },
    { pattern: /^##?\s*NEGSPACE/mi, type: 'negspace' },
  ],
  '@metaphorize': [
    { pattern: /^##?\s*METAPHOR/mi, type: 'metaphor' },
    { pattern: /^##?\s*MAPPING/mi, type: 'metaphor' },
  ],
  '@rhyme': [
    { pattern: /^##?\s*RHYME/mi, type: 'rhyme' },
    { pattern: /^##?\s*PARALLEL/mi, type: 'rhyme' },
  ],
  '@synthesize': [
    { pattern: /^##?\s*SYNTHESIS/mi, type: 'synthesis' },
    { pattern: /^##?\s*INTEGRATION/mi, type: 'synthesis' },
  ],
};

// Antithesis type tags
export const ANTITHESIS_TAGS: Record<string, SubsectionTag> = {
  'rival thesis': { label: 'rival thesis', color: 'red' },
  'selection critique': { label: 'selection critique', color: 'orange' },
  'boundary case': { label: 'boundary case', color: 'yellow' },
  'causal inversion': { label: 'causal inversion', color: 'blue' },
  'scale dependence': { label: 'scale dependence', color: 'purple' },
  'mechanism doubt': { label: 'mechanism doubt', color: 'gray' },
};

// Colors for subsection types
export const SUBSECTION_COLORS: Record<SubsectionType, string> = {
  thesis: '#2d2d2d',
  antithesis: '#f5f5f5',
  crux: '#f5f5f5',
  assumption: '#fff8e1',
  dimension: '#e3f2fd',
  alternative: '#f3e5f5',
  failure_mode: '#ffebee',
  simulation_step: '#e8f5e9',
  negspace: '#fce4ec',
  metaphor: '#e0f7fa',
  rhyme: '#fff3e0',
  synthesis: '#f1f8e9',
  generic: '#fafafa',
};
