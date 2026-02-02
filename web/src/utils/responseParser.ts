// Parser for extracting structured subsections from skill responses
// This parser understands the semantic structure of each skill's output format

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

// Antithesis type detection
const ANTITHESIS_TYPE_PATTERNS: Record<string, { pattern: RegExp; tag: SubsectionTag }> = {
  'rival thesis': {
    pattern: /rival\s*thesis|competing\s*(theory|view|position)|alternative\s*explanation/i,
    tag: { label: 'rival thesis', color: 'red' }
  },
  'selection critique': {
    pattern: /selection\s*(critique|bias)|sampling\s*(issue|problem|bias)|cherry.?pick/i,
    tag: { label: 'selection critique', color: 'orange' }
  },
  'boundary case': {
    pattern: /boundary\s*case|edge\s*case|limit\s*case|exception|doesn't\s*apply/i,
    tag: { label: 'boundary case', color: 'yellow' }
  },
  'causal inversion': {
    pattern: /causal\s*inversion|reverse\s*causation|cause.*effect.*reversed|effect.*cause/i,
    tag: { label: 'causal inversion', color: 'blue' }
  },
  'scale dependence': {
    pattern: /scale\s*depend|scaling|different\s*scale|doesn't\s*scale/i,
    tag: { label: 'scale dependence', color: 'purple' }
  },
  'mechanism doubt': {
    pattern: /mechanism|how.*actually.*work|underlying|black\s*box/i,
    tag: { label: 'mechanism doubt', color: 'gray' }
  },
};

function detectAntithesisType(text: string): SubsectionTag | undefined {
  for (const [, { pattern, tag }] of Object.entries(ANTITHESIS_TYPE_PATTERNS)) {
    if (pattern.test(text)) {
      return tag;
    }
  }
  return undefined;
}

function detectStrength(text: string): StrengthLevel | undefined {
  if (/\bstrong\b|\bcompelling\b|\bpowerful\b|\bdecisive\b/i.test(text)) return 'strong';
  if (/\bmoderate\b|\bpartial\b|\bqualified\b/i.test(text)) return 'moderate';
  if (/\bweak\b|\btentative\b|\bspeculative\b/i.test(text)) return 'weak';
  return undefined;
}

function detectImportance(text: string): ImportanceLevel | undefined {
  if (/\bhigh\b|\bcritical\b|\bkey\b|\bcrucial\b|\bcentral\b|\bprimary\b/i.test(text)) return 'high';
  if (/\bmed(?:ium)?\b|\bmoderate\b|\bsecondary\b/i.test(text)) return 'medium';
  if (/\blow\b|\bminor\b|\bperipheral\b/i.test(text)) return 'low';
  return undefined;
}

// Extract bullet points as assumptions
function extractAssumptions(content: string): string[] {
  const assumptions: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^\s*[-*•]\s+(.+)$/);
    if (match && match[1].length > 10 && match[1].length < 200) {
      assumptions.push(match[1].trim());
    }
  }

  return assumptions.slice(0, 5);
}

// ============================================================================
// SKILL-SPECIFIC PARSERS
// ============================================================================

/**
 * Parse @antithesize output
 * Expected format:
 * - Thesis/Steel-manned position
 * - Numbered antitheses with descriptions
 */
function parseAntithesizeOutput(content: string): ParsedResponse {
  const subsections: Subsection[] = [];
  let mainContent: Subsection | undefined;

  // Find the thesis section
  const thesisMatch = content.match(/(?:##?\s*)?(?:THESIS|STEEL[- ]?MANNED|POSITION)[:\s]*\n?([\s\S]*?)(?=##?\s*(?:ANTITHES|COUNTER|\d+\.|$))/i);

  if (thesisMatch) {
    const thesisContent = thesisMatch[1].trim();
    if (thesisContent.length > 10) {
      mainContent = {
        id: generateId(),
        type: 'thesis',
        title: 'THESIS (STEEL-MANNED)',
        content: thesisContent,
        collapsed: false,
      };
    }
  }

  // Find antitheses - look for numbered items after any "ANTITHESIS" header or at the end
  const antithesisSection = content.match(/(?:##?\s*)?(?:ANTITHES[EI]S|COUNTER[- ]?ARGUMENTS?)[:\s]*\n?([\s\S]*?)$/i);
  const textToParse = antithesisSection ? antithesisSection[1] : content;

  // Parse numbered items: "1. **Title**: Description" or "1. Title\nDescription"
  const numberedPattern = /(?:^|\n)(\d+)\.\s*\*?\*?([^*\n]+?)\*?\*?(?:[:\s]*\n|\s*:\s*)([\s\S]*?)(?=\n\d+\.|$)/g;

  let match;
  while ((match = numberedPattern.exec(textToParse)) !== null) {
    const title = match[2].trim();
    const description = match[3].trim();
    const fullText = title + ' ' + description;

    // Skip if this looks like a step instruction, not an actual antithesis
    if (/step\s*\d|generate|identify|process/i.test(title)) continue;

    const tag = detectAntithesisType(fullText);
    const strength = detectStrength(fullText);

    subsections.push({
      id: generateId(),
      type: 'antithesis',
      title,
      content: description,
      strength: strength || 'moderate',
      tags: tag ? [tag] : undefined,
      collapsed: false,
    });
  }

  // If no numbered items found, try bold headers
  if (subsections.length === 0) {
    const boldPattern = /\*\*([^*]+)\*\*[:\s]*([\s\S]*?)(?=\*\*|$)/g;
    while ((match = boldPattern.exec(textToParse)) !== null) {
      const title = match[1].trim();
      const description = match[2].trim();

      // Skip short/generic titles
      if (title.length < 5 || /step|note|example/i.test(title)) continue;

      const fullText = title + ' ' + description;
      const tag = detectAntithesisType(fullText);
      const strength = detectStrength(fullText);

      subsections.push({
        id: generateId(),
        type: 'antithesis',
        title,
        content: description,
        strength: strength || 'moderate',
        tags: tag ? [tag] : undefined,
        collapsed: false,
      });
    }
  }

  return {
    mainContent,
    subsections,
    rawContent: content,
  };
}

/**
 * Parse @excavate output
 * Expected format: Numbered cruxes with descriptions and assumptions
 */
function parseExcavateOutput(content: string): ParsedResponse {
  const subsections: Subsection[] = [];

  // Look for cruxes - numbered items
  const numberedPattern = /(?:^|\n)(\d+)\.\s*\*?\*?([^*\n]+?)\*?\*?(?:[:\s]*\n|\s*:\s*)([\s\S]*?)(?=\n\d+\.|$)/g;

  let match;
  while ((match = numberedPattern.exec(content)) !== null) {
    const title = match[2].trim();
    const description = match[3].trim();

    // Skip process steps
    if (/step|identify|surface|examine/i.test(title)) continue;

    const importance = detectImportance(title + ' ' + description) || 'medium';
    const assumptions = extractAssumptions(description);

    subsections.push({
      id: generateId(),
      type: 'crux',
      title,
      content: description.split('\n')[0]?.trim() || '', // Just first line as description
      importance,
      assumptions: assumptions.length > 0 ? assumptions : undefined,
      collapsed: false,
    });
  }

  return {
    subsections,
    rawContent: content,
  };
}

/**
 * Parse @stressify output
 * Expected format: Failure modes with severity
 */
function parseStressifyOutput(content: string): ParsedResponse {
  const subsections: Subsection[] = [];

  const numberedPattern = /(?:^|\n)(\d+)\.\s*\*?\*?([^*\n]+?)\*?\*?(?:[:\s]*\n|\s*:\s*)([\s\S]*?)(?=\n\d+\.|$)/g;

  let match;
  while ((match = numberedPattern.exec(content)) !== null) {
    const title = match[2].trim();
    const description = match[3].trim();

    if (/step|identify|probe/i.test(title)) continue;

    const strength = detectStrength(title + ' ' + description);

    subsections.push({
      id: generateId(),
      type: 'failure_mode',
      title,
      content: description,
      strength: strength || 'moderate',
      collapsed: false,
    });
  }

  return {
    subsections,
    rawContent: content,
  };
}

/**
 * Parse @diverge output
 * Expected format: Alternative options
 */
function parseDivergeOutput(content: string): ParsedResponse {
  const subsections: Subsection[] = [];

  const numberedPattern = /(?:^|\n)(\d+)\.\s*\*?\*?([^*\n]+?)\*?\*?(?:[:\s]*\n|\s*:\s*)([\s\S]*?)(?=\n\d+\.|$)/g;

  let match;
  while ((match = numberedPattern.exec(content)) !== null) {
    const title = match[2].trim();
    const description = match[3].trim();

    if (/step|generate|brainstorm/i.test(title)) continue;

    subsections.push({
      id: generateId(),
      type: 'alternative',
      title,
      content: description,
      collapsed: false,
    });
  }

  return {
    subsections,
    rawContent: content,
  };
}

/**
 * Parse @askuserquestions output
 * Expected format: Numbered questions with options and "Why this matters" explanations
 */
function parseAskUserQuestionsOutput(content: string): ParsedResponse {
  const subsections: Subsection[] = [];

  // Split content by question numbers
  const questionBlocks = content.split(/(?=\*\*\d+\.)/);

  for (const block of questionBlocks) {
    if (!block.trim()) continue;

    // Extract question title
    const titleMatch = block.match(/\*\*(\d+)\.\s*([^*\n]+\??)\s*\*\*/);
    if (!titleMatch) continue;

    const question = titleMatch[2].trim();

    // Extract options (checkbox format: - [ ] Option or bullet format: - Option)
    const options: string[] = [];
    const optionMatches = block.matchAll(/^[\s]*[-*]\s*(?:\[[\s]*\])?\s*(.+?)$/gm);
    for (const optMatch of optionMatches) {
      const opt = optMatch[1].trim();
      // Skip "Why this matters" and other non-option lines
      if (opt && !opt.startsWith('*') && !opt.toLowerCase().startsWith('why this matters')) {
        options.push(opt);
      }
    }

    // Extract "Why this matters" explanation
    const explanationMatch = block.match(/\*Why this matters:\*\s*([\s\S]*?)(?=\*\*\d+\.|$)/i);
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';

    subsections.push({
      id: generateId(),
      type: 'question',
      title: question,
      content: explanation,
      options: options.length > 0 ? options : undefined,
      importance: detectImportance(question + ' ' + explanation),
      collapsed: false,
    });
  }

  // Fallback: try simpler numbered pattern if no bold questions found
  if (subsections.length === 0) {
    const numberedPattern = /(?:^|\n)(\d+)\.\s*\*?\*?([^*\n]+\?)\*?\*?(?:[:\s]*\n|\s*:\s*)([\s\S]*?)(?=\n\d+\.|$)/g;

    let match;
    while ((match = numberedPattern.exec(content)) !== null) {
      const question = match[2].trim();
      const explanation = match[3].trim();

      if (/step|identify|consider/i.test(question) && question.length < 30) continue;

      subsections.push({
        id: generateId(),
        type: 'question',
        title: question,
        content: explanation,
        importance: detectImportance(question + ' ' + explanation),
        collapsed: false,
      });
    }
  }

  return {
    subsections,
    rawContent: content,
  };
}

/**
 * Parse markdown content into sections based on ## headers
 */
function parseMarkdownSections(content: string): Array<{ header: string; level: number; body: string; startIndex: number }> {
  const sections: Array<{ header: string; level: number; body: string; startIndex: number }> = [];

  // Match ## and ### headers
  const headerPattern = /^(#{2,3})\s+(.+)$/gm;
  const matches: Array<{ level: number; header: string; index: number; fullMatch: string }> = [];

  let match;
  while ((match = headerPattern.exec(content)) !== null) {
    matches.push({
      level: match[1].length,
      header: match[2].trim(),
      index: match.index,
      fullMatch: match[0],
    });
  }

  // Extract body for each section
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    const bodyStart = current.index + current.fullMatch.length;
    const bodyEnd = next ? next.index : content.length;
    const body = content.slice(bodyStart, bodyEnd).trim();

    sections.push({
      header: current.header,
      level: current.level,
      body,
      startIndex: current.index,
    });
  }

  return sections;
}

/**
 * Detect the semantic type of a section based on its header and content
 * Returns null for sections that shouldn't become cards (intro/context sections)
 */
function detectSectionType(header: string, _body: string): SubsectionType | null {
  const headerLower = header.toLowerCase();

  // Skip intro/context sections that aren't actionable
  if (
    headerLower.includes('background') ||
    headerLower.includes('context') ||
    headerLower.includes('overview') ||
    headerLower.includes('introduction') ||
    headerLower.includes('summary') ||
    /^the\s+(core\s+)?challenge$/i.test(header) ||  // "The Core Challenge" is context
    /^(why|what|how)\s+/i.test(header)  // "Why this matters", "What we know"
  ) {
    return null; // Don't create a card for this
  }

  // Questions - sections asking for input/decisions
  if (
    headerLower.includes('question') ||
    headerLower.includes('decision') ||
    /\?$/.test(header) ||
    /your\s+(preferences?|input|feedback|thoughts)/i.test(header) ||
    /before\s+(i|we)\s+(build|proceed|start)/i.test(headerLower)
  ) {
    return 'question';
  }

  // Proposals - design options, approaches, recommendations
  if (
    headerLower.includes('option') ||
    headerLower.includes('approach') ||
    headerLower.includes('proposal') ||
    headerLower.includes('design') ||
    headerLower.includes('recommendation') ||
    /^(my\s+)?proposed/i.test(header) ||
    /^option\s*\d/i.test(header)
  ) {
    return 'proposal';
  }

  // Alternatives
  if (headerLower.includes('alternative') || /^other\s/i.test(header)) {
    return 'alternative';
  }

  // Implementation/technical sections - skip unless they have numbered items
  if (
    headerLower.includes('implementation') ||
    headerLower.includes('technical') ||
    headerLower.includes('interface')  // "Interface Design Options" → will have numbered items
  ) {
    return 'section';
  }

  return 'section';
}

/**
 * Extract numbered items from section body, stopping at ## boundaries
 */
function extractNumberedItemsFromBody(body: string): Array<{ num: number; title: string; description: string }> {
  const items: Array<{ num: number; title: string; description: string }> = [];

  // Pattern: "1. **Title**: desc" or "1. **Title**\ndesc" or "1. Title\ndesc"
  // Stop at next numbered item or end
  const pattern = /(?:^|\n)(\d+)\.\s*\*?\*?([^*\n]+?)\*?\*?(?:\s*[:\-–]\s*|\s*\n)([\s\S]*?)(?=\n\d+\.\s|$)/g;

  let match;
  while ((match = pattern.exec(body)) !== null) {
    const num = parseInt(match[1], 10);
    let title = match[2].trim();
    const description = match[3].trim();

    // Clean up: remove trailing ** from title
    title = title.replace(/\*\*$/, '').trim();

    // Skip process/meta steps
    if (/^step\s*\d/i.test(title)) continue;
    if (title.length < 3) continue;

    items.push({ num, title, description });
  }

  return items;
}

/**
 * Generic parser for unknown skill types
 * Properly handles markdown structure with ## headers
 */
function parseGenericOutput(content: string): ParsedResponse {
  const subsections: Subsection[] = [];

  // First, parse markdown sections
  const sections = parseMarkdownSections(content);

  // If we have multiple ## sections, use section-based parsing
  if (sections.length >= 2) {
    for (const section of sections) {
      const sectionType = detectSectionType(section.header, section.body);

      // Skip sections that shouldn't become cards (intro/context)
      if (sectionType === null) continue;

      // Extract numbered items within this section
      const items = extractNumberedItemsFromBody(section.body);

      if (items.length >= 2) {
        // Multiple items: create a card for each
        for (const item of items) {
          const itemType: SubsectionType =
            sectionType === 'question' ? 'question' :
            sectionType === 'proposal' ? 'proposal' :
            sectionType === 'alternative' ? 'alternative' : 'generic';

          subsections.push({
            id: generateId(),
            type: itemType,
            title: item.title,
            content: item.description.slice(0, 600),
            collapsed: false,
            tags: [{
              label: section.header.slice(0, 25),
              color: itemType === 'question' ? 'orange' :
                     itemType === 'proposal' ? 'blue' :
                     itemType === 'alternative' ? 'purple' : 'gray',
            }],
          });
        }
      } else if (items.length === 1 && sectionType !== 'section') {
        // Single numbered item in an actionable section (question/proposal)
        const item = items[0];
        subsections.push({
          id: generateId(),
          type: sectionType,
          title: item.title,
          content: item.description.slice(0, 400),
          collapsed: false,
          tags: [{
            label: section.header.slice(0, 25),
            color: sectionType === 'question' ? 'orange' :
                   sectionType === 'proposal' ? 'blue' : 'gray',
          }],
        });
      }
      // Don't create cards for sections without numbered items
      // They're usually just context/prose that the user can read in raw view
    }

    if (subsections.length > 0) {
      return {
        subsections,
        rawContent: content,
      };
    }
  }

  // Fallback: try to parse flat numbered items (for content without headers)
  const flatItems = extractNumberedItemsFromBody(content);

  for (const item of flatItems) {
    if (item.title.length < 8) continue;
    if (/identify|examine|consider|note|generate/i.test(item.title) && item.title.length < 25) continue;

    subsections.push({
      id: generateId(),
      type: 'generic',
      title: item.title,
      content: item.description.slice(0, 400),
      collapsed: false,
    });
  }

  return {
    subsections,
    rawContent: content,
  };
}

// ============================================================================
// MAIN PARSER
// ============================================================================

export function parseSkillResponse(
  content: string,
  operation?: string | null
): ParsedResponse {
  // Normalize operation name
  const skill = operation?.toLowerCase().replace('@', '') || '';

  // Route to skill-specific parser
  switch (skill) {
    case 'antithesize':
      return parseAntithesizeOutput(content);
    case 'excavate':
      return parseExcavateOutput(content);
    case 'stressify':
      return parseStressifyOutput(content);
    case 'diverge':
      return parseDivergeOutput(content);
    case 'askuserquestions':
      return parseAskUserQuestionsOutput(content);
    default:
      return parseGenericOutput(content);
  }
}

// Check if content has meaningful structure worth displaying
export function isStructuredResponse(content: string): boolean {
  // Must have actual numbered items with descriptions
  const hasNumberedItems = /\n\d+\.\s*[^\n]{10,}/.test(content);

  // Or must have skill-specific markers
  const hasSkillMarkers = /THESIS|ANTITHES|CRUX|FAILURE\s*MODE/i.test(content);

  // Or has multiple markdown headers (## sections)
  const headerMatches = content.match(/^##\s+.+$/gm);
  const hasMultipleSections = headerMatches !== null && headerMatches.length >= 2;

  // Or has rhyme/pattern markers
  const hasRhymeMarkers = /rhyme|pattern|analog|motif|echo|structural\s*match/i.test(content);

  // Or has bullet points with substantial content
  const bulletMatches = content.match(/^\s*[-*•]\s+.{15,}/gm);
  const hasSubstantialBullets = bulletMatches !== null && bulletMatches.length >= 3;

  // Or has question markers (askuserquestions skill)
  const hasQuestionMarkers = /why this matters|clarifying questions?/i.test(content);

  return hasNumberedItems || hasSkillMarkers || hasMultipleSections ||
         (hasRhymeMarkers && (hasSubstantialBullets || hasMultipleSections)) ||
         hasQuestionMarkers;
}

// Get suggested skills for a subsection based on its type
export function getSuggestedSkills(type: SubsectionType): string[] {
  const suggestions: Record<SubsectionType, string[]> = {
    thesis: ['@antithesize', '@stressify', '@excavate'],
    antithesis: ['@stressify', '@simulate', '@synthesize'],
    crux: ['@stressify', '@antithesize', '@simulate'],
    assumption: ['@antithesize', '@stressify', '@excavate'],
    dimension: ['@diverge', '@simulate', '@stressify'],
    alternative: ['@simulate', '@stressify', '@antithesize'],
    failure_mode: ['@simulate', '@diverge', '@excavate'],
    simulation_step: ['@stressify', '@diverge', '@excavate'],
    negspace: ['@excavate', '@diverge', '@simulate'],
    metaphor: ['@antithesize', '@stressify', '@simulate'],
    rhyme: ['@antithesize', '@excavate', '@stressify'],
    synthesis: ['@antithesize', '@stressify', '@excavate'],
    proposal: ['@stressify', '@antithesize', '@excavate'],
    question: ['@excavate', '@diverge', '@antithesize'],
    section: ['@excavate', '@antithesize', '@stressify'],
    generic: ['@excavate', '@antithesize', '@stressify'],
  };

  return suggestions[type] || suggestions.generic;
}
