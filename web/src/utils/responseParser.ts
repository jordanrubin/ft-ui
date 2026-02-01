// Parser for extracting structured subsections from skill responses

import type {
  Subsection,
  ParsedResponse,
  SubsectionType,
  ImportanceLevel,
  StrengthLevel,
  SubsectionTag,
} from '../types/subsection';

let idCounter = 0;
function generateId(): string {
  return `sub_${++idCounter}_${Date.now().toString(36)}`;
}

// Patterns for extracting metadata from text
const IMPORTANCE_PATTERNS: Record<ImportanceLevel, RegExp[]> = {
  high: [/\bhigh\b/i, /\bcritical\b/i, /\bkey\b/i, /\bcrucial\b/i],
  medium: [/\bmed(?:ium)?\b/i, /\bmoderate\b/i],
  low: [/\blow\b/i, /\bminor\b/i],
};

const STRENGTH_PATTERNS: Record<StrengthLevel, RegExp[]> = {
  strong: [/\bstrong\b/i, /\bcompelling\b/i, /\bpowerful\b/i],
  moderate: [/\bmoderate\b/i, /\bpartial\b/i],
  weak: [/\bweak\b/i, /\btentative\b/i],
};

const ANTITHESIS_TYPE_PATTERNS: Record<string, RegExp> = {
  'rival thesis': /rival\s*thesis/i,
  'selection critique': /selection\s*critique/i,
  'boundary case': /boundary\s*case/i,
  'causal inversion': /causal\s*inversion/i,
  'scale dependence': /scale\s*depend/i,
  'mechanism doubt': /mechanism\s*doubt/i,
};

function extractImportance(text: string): ImportanceLevel | undefined {
  for (const [level, patterns] of Object.entries(IMPORTANCE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return level as ImportanceLevel;
      }
    }
  }
  return undefined;
}

function extractStrength(text: string): StrengthLevel | undefined {
  for (const [level, patterns] of Object.entries(STRENGTH_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return level as StrengthLevel;
      }
    }
  }
  return undefined;
}

function extractAntithesisTags(text: string): SubsectionTag[] {
  const tags: SubsectionTag[] = [];
  for (const [type, pattern] of Object.entries(ANTITHESIS_TYPE_PATTERNS)) {
    if (pattern.test(text)) {
      const tagInfo = {
        'rival thesis': { label: 'rival thesis', color: 'red' as const },
        'selection critique': { label: 'selection critique', color: 'orange' as const },
        'boundary case': { label: 'boundary case', color: 'yellow' as const },
        'causal inversion': { label: 'causal inversion', color: 'blue' as const },
        'scale dependence': { label: 'scale dependence', color: 'purple' as const },
        'mechanism doubt': { label: 'mechanism doubt', color: 'gray' as const },
      }[type];
      if (tagInfo) {
        tags.push(tagInfo);
      }
    }
  }
  return tags;
}

function extractAssumptions(content: string): string[] {
  const assumptions: string[] = [];

  // Look for bullet points or numbered items that look like assumptions
  const bulletPattern = /^[\s]*[-*]\s+(.+)$/gm;
  const matches = content.matchAll(bulletPattern);

  for (const match of matches) {
    const item = match[1].trim();
    // Filter to items that look like assumptions (short, declarative)
    if (item.length > 10 && item.length < 200 && !item.includes('?')) {
      assumptions.push(item);
    }
  }

  return assumptions.slice(0, 5); // Limit to 5 assumptions
}

function parseSection(
  text: string,
  type: SubsectionType
): Subsection {
  const lines = text.split('\n');
  const titleLine = lines[0] || '';
  const content = lines.slice(1).join('\n').trim();

  // Extract title - remove markdown headers
  const title = titleLine.replace(/^#+\s*/, '').trim();

  // Extract metadata
  const importance = extractImportance(titleLine + '\n' + content.slice(0, 200));
  const strength = extractStrength(titleLine + '\n' + content.slice(0, 200));
  const tags = type === 'antithesis' ? extractAntithesisTags(titleLine + '\n' + content) : [];
  const assumptions = ['crux', 'thesis', 'assumption'].includes(type)
    ? extractAssumptions(content)
    : [];

  return {
    id: generateId(),
    type,
    title: title || type.charAt(0).toUpperCase() + type.slice(1),
    content,
    importance,
    strength,
    tags: tags.length > 0 ? tags : undefined,
    assumptions: assumptions.length > 0 ? assumptions : undefined,
    collapsed: false,
  };
}

function detectSkillFromContent(content: string, operation?: string | null): string | null {
  if (operation && operation.startsWith('@')) {
    return operation;
  }

  // Try to detect from content patterns
  if (/THESIS.*ANTITHES/is.test(content)) return '@antithesize';
  if (/CRUX/i.test(content)) return '@excavate';
  if (/FAILURE\s*MODE/i.test(content)) return '@stressify';
  if (/DIMENSION|AXIS/i.test(content)) return '@dimensionalize';
  if (/ALTERNATIVE|OPTION/i.test(content)) return '@diverge';
  if (/STEP\s*\d|SCENARIO/i.test(content)) return '@simulate';
  if (/NEGSPACE|MISSING|ABSENT/i.test(content)) return '@negspace';
  if (/METAPHOR|MAPPING/i.test(content)) return '@metaphorize';
  if (/RHYME|PARALLEL/i.test(content)) return '@rhyme';
  if (/SYNTHESIS|INTEGRATION/i.test(content)) return '@synthesize';

  return null;
}

export function parseSkillResponse(
  content: string,
  operation?: string | null
): ParsedResponse {
  const skill = detectSkillFromContent(content, operation);

  // Split content by markdown headers (## or #)
  const headerPattern = /^(#{1,3})\s+(.+)$/gm;
  const sections: { level: number; title: string; start: number; end?: number }[] = [];

  let match;
  while ((match = headerPattern.exec(content)) !== null) {
    sections.push({
      level: match[1].length,
      title: match[2],
      start: match.index,
    });
  }

  // Set end positions
  for (let i = 0; i < sections.length; i++) {
    sections[i].end = sections[i + 1]?.start || content.length;
  }

  if (sections.length === 0) {
    // No clear structure, return as single generic section
    return {
      subsections: [{
        id: generateId(),
        type: 'generic',
        title: 'Response',
        content: content.trim(),
        collapsed: false,
      }],
      rawContent: content,
    };
  }

  // Classify sections based on their titles
  const parsedSections: Subsection[] = [];
  let mainContent: Subsection | undefined;
  let header: ParsedResponse['header'] | undefined;

  for (const section of sections) {
    const sectionText = content.slice(section.start, section.end);
    const title = section.title.toUpperCase();

    let type: SubsectionType = 'generic';

    // Classify by title
    if (/THESIS|STEEL[- ]?MANNED/i.test(title)) {
      type = 'thesis';
    } else if (/ANTITHES/i.test(title)) {
      type = 'antithesis';
    } else if (/CRUX/i.test(title)) {
      type = 'crux';
    } else if (/ASSUMPTION/i.test(title)) {
      type = 'assumption';
    } else if (/FAILURE|STRESS/i.test(title)) {
      type = 'failure_mode';
    } else if (/DIMENSION|AXIS/i.test(title)) {
      type = 'dimension';
    } else if (/ALTERNATIVE|OPTION/i.test(title)) {
      type = 'alternative';
    } else if (/STEP\s*\d|SCENARIO/i.test(title)) {
      type = 'simulation_step';
    } else if (/NEGSPACE|MISSING|ABSENT/i.test(title)) {
      type = 'negspace';
    } else if (/METAPHOR|MAPPING/i.test(title)) {
      type = 'metaphor';
    } else if (/RHYME|PARALLEL/i.test(title)) {
      type = 'rhyme';
    } else if (/SYNTHESIS|INTEGRATION/i.test(title)) {
      type = 'synthesis';
    }

    const parsed = parseSection(sectionText, type);

    // Thesis is usually the main content
    if (type === 'thesis' && !mainContent) {
      mainContent = parsed;
    } else {
      parsedSections.push(parsed);
    }
  }

  // Extract header info if skill detected
  if (skill) {
    // Try to extract the input from the first line if it's not a header
    const firstNonHeaderLine = content.split('\n').find(
      line => line.trim() && !line.startsWith('#')
    );

    header = {
      skill,
      input: firstNonHeaderLine?.slice(0, 100) || '',
      compressed: firstNonHeaderLine?.slice(0, 50),
    };
  }

  // Parse nested items within antithesis sections
  for (const section of parsedSections) {
    if (section.type === 'antithesis' && section.content) {
      const children = parseAntithesisItems(section.content);
      if (children.length > 0) {
        section.children = children;
        section.content = ''; // Clear parent content since it's in children
      }
    }

    if (section.type === 'crux' && section.content) {
      const children = parseCruxItems(section.content);
      if (children.length > 0) {
        section.children = children;
        section.content = '';
      }
    }
  }

  return {
    header,
    mainContent,
    subsections: parsedSections,
    rawContent: content,
  };
}

function parseAntithesisItems(content: string): Subsection[] {
  const items: Subsection[] = [];

  // Split by numbered items or strong bullet points
  const itemPattern = /(?:^|\n)(?:\d+\.\s*|\*\*|###?\s*)([^:\n]+)[:\n]([^]*?)(?=(?:\n(?:\d+\.\s*|\*\*|###?\s*))|$)/g;

  let match;
  while ((match = itemPattern.exec(content)) !== null) {
    const title = match[1].trim();
    const itemContent = match[2].trim();

    const tags = extractAntithesisTags(title + ' ' + itemContent);
    const strength = extractStrength(title + ' ' + itemContent);

    items.push({
      id: generateId(),
      type: 'antithesis',
      title,
      content: itemContent,
      strength,
      tags: tags.length > 0 ? tags : undefined,
      collapsed: true,
    });
  }

  // If no structured items found, try simpler split
  if (items.length === 0) {
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      if (line.length > 20) {
        const tags = extractAntithesisTags(line);
        const strength = extractStrength(line);

        items.push({
          id: generateId(),
          type: 'antithesis',
          title: line.slice(0, 80) + (line.length > 80 ? '...' : ''),
          content: line,
          strength,
          tags: tags.length > 0 ? tags : undefined,
          collapsed: true,
        });
      }
    }
  }

  return items;
}

function parseCruxItems(content: string): Subsection[] {
  const items: Subsection[] = [];

  // Split by numbered items or bullet points
  const itemPattern = /(?:^|\n)(?:\d+\.\s*|\*\s*|-\s*)([^\n]+)(?:\n(?!\d+\.|\*\s|-\s)([^]*?))?(?=(?:\n(?:\d+\.|\*\s|-\s))|$)/g;

  let match;
  while ((match = itemPattern.exec(content)) !== null) {
    const title = match[1].trim();
    const itemContent = (match[2] || '').trim();

    const importance = extractImportance(title + ' ' + itemContent);
    const assumptions = extractAssumptions(itemContent);

    items.push({
      id: generateId(),
      type: 'crux',
      title,
      content: itemContent,
      importance,
      assumptions: assumptions.length > 0 ? assumptions : undefined,
      collapsed: true,
    });
  }

  return items;
}

// Check if content appears to be structured skill output
export function isStructuredResponse(content: string): boolean {
  // Check for common structural markers
  const hasHeaders = /^#{1,3}\s+/m.test(content);
  const hasSkillMarkers = /THESIS|ANTITHES|CRUX|DIMENSION|ALTERNATIVE|FAILURE|STEP\s*\d|NEGSPACE|METAPHOR|RHYME|SYNTHESIS/i.test(content);

  return hasHeaders && hasSkillMarkers;
}

// Get suggested skills for a subsection based on its type
export function getSuggestedSkills(type: SubsectionType): string[] {
  const suggestions: Record<SubsectionType, string[]> = {
    thesis: ['@antithesize', '@stressify', '@excavate'],
    antithesis: ['@stressify', '@simulate', '@synthesize'],
    crux: ['@stressify', '@operationalize', '@antithesize'],
    assumption: ['@antithesize', '@stressify', '@excavate'],
    dimension: ['@diverge', '@simulate', '@stressify'],
    alternative: ['@simulate', '@stressify', '@dimensionalize'],
    failure_mode: ['@simulate', '@diverge', '@excavate'],
    simulation_step: ['@stressify', '@diverge', '@excavate'],
    negspace: ['@excavate', '@diverge', '@simulate'],
    metaphor: ['@antithesize', '@stressify', '@simulate'],
    rhyme: ['@antithesize', '@excavate', '@stressify'],
    synthesis: ['@antithesize', '@stressify', '@excavate'],
    generic: ['@excavate', '@antithesize', '@stressify'],
  };

  return suggestions[type] || suggestions.generic;
}
