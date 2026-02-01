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
  high: [/\bhigh\b/i, /\bcritical\b/i, /\bkey\b/i, /\bcrucial\b/i, /\bcentral\b/i],
  medium: [/\bmed(?:ium)?\b/i, /\bmoderate\b/i, /\bsecondary\b/i],
  low: [/\blow\b/i, /\bminor\b/i, /\bperipheral\b/i],
};

const STRENGTH_PATTERNS: Record<StrengthLevel, RegExp[]> = {
  strong: [/\bstrong\b/i, /\bcompelling\b/i, /\bpowerful\b/i, /\bdecisive\b/i],
  moderate: [/\bmoderate\b/i, /\bpartial\b/i, /\bqualified\b/i],
  weak: [/\bweak\b/i, /\btentative\b/i, /\bspeculative\b/i],
};

const ANTITHESIS_TYPE_PATTERNS: Record<string, RegExp> = {
  'rival thesis': /rival\s*thesis|competing\s*(theory|view|position)/i,
  'selection critique': /selection\s*(critique|bias)|sampling\s*(issue|problem|bias)/i,
  'boundary case': /boundary\s*case|edge\s*case|limit\s*case/i,
  'causal inversion': /causal\s*inversion|reverse\s*causation|cause.*effect/i,
  'scale dependence': /scale\s*depend|scaling\s*(issue|problem)|different\s*scale/i,
  'mechanism doubt': /mechanism\s*doubt|how.*actually.*work|underlying\s*mechanism/i,
};

function extractImportance(text: string): ImportanceLevel | undefined {
  const lowerText = text.toLowerCase();

  // Check explicit markers first
  if (/\[high\]|\(high\)|high\s*importance|high\s*priority/i.test(text)) return 'high';
  if (/\[med(?:ium)?\]|\(med(?:ium)?\)|medium\s*importance/i.test(text)) return 'medium';
  if (/\[low\]|\(low\)|low\s*importance/i.test(text)) return 'low';

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
  // Check explicit markers first
  if (/\[strong\]|\(strong\)|strong\s*argument/i.test(text)) return 'strong';
  if (/\[moderate\]|\(moderate\)/i.test(text)) return 'moderate';
  if (/\[weak\]|\(weak\)|weak\s*argument/i.test(text)) return 'weak';

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

  // Look for bullet points or numbered items
  const bulletPattern = /^[\s]*[-*•]\s+(.+)$/gm;
  const matches = content.matchAll(bulletPattern);

  for (const match of matches) {
    const item = match[1].trim();
    // Filter to items that look like assumptions
    if (item.length > 10 && item.length < 250) {
      assumptions.push(item);
    }
  }

  return assumptions.slice(0, 6);
}

// Parse individual items from a section (numbered list, bullets, or bold headers)
function parseListItems(content: string, type: SubsectionType): Subsection[] {
  const items: Subsection[] = [];

  // Try to find numbered items: "1. Title" or "1) Title"
  const numberedPattern = /(?:^|\n)(\d+)[.\)]\s*\*?\*?([^*\n:]+)\*?\*?[:\s]*\n?([\s\S]*?)(?=(?:\n\d+[.\)])|$)/g;

  let match;
  while ((match = numberedPattern.exec(content)) !== null) {
    const title = match[2].trim();
    const itemContent = match[3]?.trim() || '';

    if (title.length > 5) {
      const tags = type === 'antithesis' ? extractAntithesisTags(title + ' ' + itemContent) : [];
      const strength = extractStrength(title + ' ' + itemContent);
      const importance = extractImportance(title + ' ' + itemContent);
      const assumptions = ['crux', 'assumption'].includes(type) ? extractAssumptions(itemContent) : [];

      items.push({
        id: generateId(),
        type,
        title,
        content: itemContent,
        strength,
        importance,
        tags: tags.length > 0 ? tags : undefined,
        assumptions: assumptions.length > 0 ? assumptions : undefined,
        collapsed: false,
      });
    }
  }

  // If no numbered items, try bold headers: "**Title**: content" or "**Title**\ncontent"
  if (items.length === 0) {
    const boldPattern = /\*\*([^*]+)\*\*[:\s]*([^*]*?)(?=\*\*|$)/g;

    while ((match = boldPattern.exec(content)) !== null) {
      const title = match[1].trim();
      const itemContent = match[2]?.trim() || '';

      if (title.length > 3 && title.length < 150) {
        const tags = type === 'antithesis' ? extractAntithesisTags(title + ' ' + itemContent) : [];
        const strength = extractStrength(title + ' ' + itemContent);
        const importance = extractImportance(title + ' ' + itemContent);

        items.push({
          id: generateId(),
          type,
          title,
          content: itemContent,
          strength,
          importance,
          tags: tags.length > 0 ? tags : undefined,
          collapsed: false,
        });
      }
    }
  }

  // If still no items, try bullet points with meaningful content
  if (items.length === 0) {
    const bulletPattern = /(?:^|\n)[-*•]\s+(.+?)(?=\n[-*•]|\n\n|$)/gs;

    while ((match = bulletPattern.exec(content)) !== null) {
      const text = match[1].trim();

      if (text.length > 20) {
        // Try to extract title from first sentence or colon-separated
        let title = text;
        let itemContent = '';

        const colonIdx = text.indexOf(':');
        if (colonIdx > 0 && colonIdx < 80) {
          title = text.slice(0, colonIdx).trim();
          itemContent = text.slice(colonIdx + 1).trim();
        } else if (text.length > 80) {
          const sentenceEnd = text.search(/[.!?]\s/);
          if (sentenceEnd > 0 && sentenceEnd < 100) {
            title = text.slice(0, sentenceEnd + 1).trim();
            itemContent = text.slice(sentenceEnd + 1).trim();
          } else {
            title = text.slice(0, 80) + '...';
            itemContent = text;
          }
        }

        const tags = type === 'antithesis' ? extractAntithesisTags(text) : [];
        const strength = extractStrength(text);
        const importance = extractImportance(text);

        items.push({
          id: generateId(),
          type,
          title,
          content: itemContent,
          strength,
          importance,
          tags: tags.length > 0 ? tags : undefined,
          collapsed: false,
        });
      }
    }
  }

  return items;
}

function classifySectionType(title: string): SubsectionType {
  const upperTitle = title.toUpperCase();

  if (/THESIS|STEEL[- ]?MANNED|POSITION|CLAIM/i.test(upperTitle)) return 'thesis';
  if (/ANTITHES|COUNTER|OBJECTION|CHALLENGE/i.test(upperTitle)) return 'antithesis';
  if (/CRUX|PIVOT|HINGE|KEY\s*QUESTION/i.test(upperTitle)) return 'crux';
  if (/ASSUMPTION|PRESUPPOS|TAKEN\s*FOR\s*GRANTED/i.test(upperTitle)) return 'assumption';
  if (/FAILURE|STRESS|BREAK|EDGE\s*CASE/i.test(upperTitle)) return 'failure_mode';
  if (/DIMENSION|AXIS|FACTOR|VARIABLE/i.test(upperTitle)) return 'dimension';
  if (/ALTERNATIVE|OPTION|POSSIBILITY|PATH/i.test(upperTitle)) return 'alternative';
  if (/STEP\s*\d|SCENARIO|SEQUENCE|TRACE/i.test(upperTitle)) return 'simulation_step';
  if (/NEGSPACE|MISSING|ABSENT|GAP|VOID/i.test(upperTitle)) return 'negspace';
  if (/METAPHOR|ANALOG|MAPPING|LIKE/i.test(upperTitle)) return 'metaphor';
  if (/RHYME|PARALLEL|ECHO|SIMILAR/i.test(upperTitle)) return 'rhyme';
  if (/SYNTHESIS|INTEGRATION|RECONCIL|BRIDGE/i.test(upperTitle)) return 'synthesis';

  return 'generic';
}

export function parseSkillResponse(
  content: string,
  operation?: string | null
): ParsedResponse {
  // Split content by markdown headers
  const headerPattern = /^(#{1,3})\s+(.+)$/gm;
  const sections: { level: number; title: string; start: number; end?: number }[] = [];

  let match;
  while ((match = headerPattern.exec(content)) !== null) {
    sections.push({
      level: match[1].length,
      title: match[2].trim(),
      start: match.index,
    });
  }

  // Set end positions
  for (let i = 0; i < sections.length; i++) {
    sections[i].end = sections[i + 1]?.start || content.length;
  }

  // If no headers found, try to parse as a flat list
  if (sections.length === 0) {
    const flatItems = parseListItems(content, 'generic');
    if (flatItems.length > 0) {
      return {
        subsections: flatItems,
        rawContent: content,
      };
    }

    // No structure at all - return as single section
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

  // Parse sections
  const parsedSections: Subsection[] = [];
  let mainContent: Subsection | undefined;

  for (const section of sections) {
    const sectionText = content.slice(section.start, section.end);
    const sectionContent = sectionText.replace(/^#{1,3}\s+.+\n?/, '').trim();
    const type = classifySectionType(section.title);

    // Try to parse items within the section
    const items = parseListItems(sectionContent, type);

    const parsed: Subsection = {
      id: generateId(),
      type,
      title: section.title,
      content: items.length > 0 ? '' : sectionContent,
      children: items.length > 0 ? items : undefined,
      collapsed: false,
    };

    // Thesis/main content goes to mainContent
    if (type === 'thesis' && !mainContent) {
      mainContent = parsed;
    } else {
      // If section has children, make the parent a container
      if (items.length > 0) {
        parsedSections.push(...items);
      } else if (sectionContent.length > 0) {
        // Add section with its content
        const sectionItems = parseListItems(sectionContent, type);
        if (sectionItems.length > 0) {
          parsedSections.push(...sectionItems);
        } else {
          parsedSections.push(parsed);
        }
      }
    }
  }

  // Build header info
  const header = operation ? {
    skill: operation,
    input: '',
    compressed: undefined,
  } : undefined;

  return {
    header,
    mainContent,
    subsections: parsedSections,
    rawContent: content,
  };
}

// Check if content appears to be structured skill output
export function isStructuredResponse(content: string): boolean {
  // Check for markdown headers
  const hasHeaders = /^#{1,3}\s+/m.test(content);

  // Check for skill-related keywords
  const hasSkillMarkers = /THESIS|ANTITHES|CRUX|DIMENSION|ALTERNATIVE|FAILURE|SCENARIO|NEGSPACE|METAPHOR|RHYME|SYNTHESIS|ASSUMPTION/i.test(content);

  // Check for structured lists
  const hasNumberedList = /^\d+[.\)]\s+/m.test(content);
  const hasBoldHeaders = /\*\*[^*]+\*\*/m.test(content);

  return hasHeaders || (hasSkillMarkers && (hasNumberedList || hasBoldHeaders));
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
