import { describe, it, expect } from 'vitest';
import { parseSkillResponse, isStructuredResponse } from '../utils/responseParser';
import { parseCanvasResponse, isCanvasArtifact } from '../types/canvasArtifact';

describe('parseSkillResponse', () => {
  describe('hashId determinism for answer persistence', () => {
    it('generates same ID for same question across multiple parses', () => {
      const content = `**1. What framework should we use?**

- [ ] React
- [ ] Vue
- [ ] Svelte

*Why this matters:* Framework choice affects long-term maintainability.`;

      const result1 = parseSkillResponse(content, 'askuserquestions');
      const result2 = parseSkillResponse(content, 'askuserquestions');

      expect(result1.subsections).toHaveLength(1);
      expect(result2.subsections).toHaveLength(1);
      expect(result1.subsections[0].id).toBe(result2.subsections[0].id);
    });

    it('generates different IDs for different questions', () => {
      const content1 = `**1. What framework should we use?**
*Why this matters:* Important.`;

      const content2 = `**1. What database should we use?**
*Why this matters:* Important.`;

      const result1 = parseSkillResponse(content1, 'askuserquestions');
      const result2 = parseSkillResponse(content2, 'askuserquestions');

      expect(result1.subsections[0].id).not.toBe(result2.subsections[0].id);
    });

    it('preserves ID across session reloads (deterministic hash)', () => {
      const content = `**1. Should we enable caching?**

- [ ] Yes
- [ ] No

*Why this matters:* Performance impact.

**2. What cache strategy?**

- [ ] Write-through
- [ ] Write-back

*Why this matters:* Consistency tradeoffs.`;

      // Simulate multiple "page loads" by parsing the same content
      const firstLoad = parseSkillResponse(content, 'askuserquestions');
      const secondLoad = parseSkillResponse(content, 'askuserquestions');
      const thirdLoad = parseSkillResponse(content, 'askuserquestions');

      // All parses should produce identical IDs
      expect(firstLoad.subsections.map(s => s.id)).toEqual(
        secondLoad.subsections.map(s => s.id)
      );
      expect(secondLoad.subsections.map(s => s.id)).toEqual(
        thirdLoad.subsections.map(s => s.id)
      );
    });

    it('question IDs start with q_ prefix', () => {
      const content = `**1. Test question?**
*Why this matters:* Testing.`;

      const result = parseSkillResponse(content, 'askuserquestions');

      expect(result.subsections[0].id).toMatch(/^q_/);
    });
  });

  describe('askuserquestions parsing', () => {
    it('extracts options from checkbox format', () => {
      const content = `**1. Which option?**

- [ ] Option A
- [ ] Option B
- [ ] Option C

*Why this matters:* Testing.`;

      const result = parseSkillResponse(content, 'askuserquestions');

      expect(result.subsections).toHaveLength(1);
      expect(result.subsections[0].options).toEqual(['Option A', 'Option B', 'Option C']);
    });

    it('extracts multiple questions', () => {
      const content = `**1. First question?**
- [ ] A
- [ ] B

*Why this matters:* First.

**2. Second question?**
- [ ] C
- [ ] D

*Why this matters:* Second.`;

      const result = parseSkillResponse(content, 'askuserquestions');

      expect(result.subsections).toHaveLength(2);
      expect(result.subsections[0].title).toBe('First question?');
      expect(result.subsections[1].title).toBe('Second question?');
    });

    it('extracts explanation from Why this matters section', () => {
      const content = `**1. What approach?**

- [ ] Fast
- [ ] Safe

*Why this matters:* This affects the entire architecture.`;

      const result = parseSkillResponse(content, 'askuserquestions');

      expect(result.subsections[0].content).toBe('This affects the entire architecture.');
    });
  });

  describe('antithesize parsing', () => {
    it('extracts thesis and antitheses', () => {
      const content = `## THESIS (STEEL-MANNED)
The claim is that X leads to Y.

## ANTITHESES
1. **Counter-argument one**: This challenges the main premise.
2. **Counter-argument two**: Different angle of attack.`;

      const result = parseSkillResponse(content, 'antithesize');

      expect(result.mainContent?.title).toBe('THESIS (STEEL-MANNED)');
      expect(result.subsections).toHaveLength(2);
      expect(result.subsections[0].type).toBe('antithesis');
    });
  });

  describe('generic parsing', () => {
    it('extracts numbered items from content', () => {
      const content = `Here are some points:

1. **First point**: Description of first.
2. **Second point**: Description of second.
3. **Third point**: Description of third.`;

      const result = parseSkillResponse(content);

      expect(result.subsections.length).toBeGreaterThanOrEqual(3);
    });

    it('correctly parses titles with hyphens in compound words', () => {
      // This is the actual content from the bug report - "trade-offs" was being
      // split at the hyphen, resulting in title "Monitor vs. laptop trade"
      // and content starting with "offs**"
      const content = `**Key considerations:**
1. **What's driving the decision?** Are you experiencing performance bottlenecks?
2. **What's your work profile?** The right equipment choice depends heavily on your work.
3. **Monitor vs. laptop trade-offs** - DisplayLink can have limitations (compression, no hardware acceleration).`;

      const result = parseSkillResponse(content);

      // Find the subsection that should have "trade-offs" in the title
      const tradeOffSection = result.subsections.find(s =>
        s.title.toLowerCase().includes('monitor') || s.title.toLowerCase().includes('trade')
      );

      expect(tradeOffSection).toBeDefined();
      // The title should contain the FULL compound word "trade-offs", not just "trade"
      expect(tradeOffSection!.title).toContain('trade-offs');
      // The content should NOT start with "offs"
      expect(tradeOffSection!.content).not.toMatch(/^offs/);
    });

    it('preserves hyphens in bold titles followed by dash separator', () => {
      // Test case: "**word-with-hyphen** - description"
      const content = `1. **Cost-benefit analysis** - Evaluate the financial impact.
2. **Risk-reward ratio** - Consider potential outcomes.`;

      const result = parseSkillResponse(content);

      expect(result.subsections.length).toBe(2);
      expect(result.subsections[0].title).toBe('Cost-benefit analysis');
      expect(result.subsections[1].title).toBe('Risk-reward ratio');
    });
  });

  describe('isStructuredResponse rejects raw JSON display', () => {
    it('recognizes JSON canvas artifact as structured', () => {
      const content = '```json\n{"summary": "Test summary", "blocks": [{"kind": "test", "title": "T", "items": []}]}\n```';
      expect(isStructuredResponse(content)).toBe(true);
    });

    it('recognizes JSON canvas artifact without language tag', () => {
      const content = '```\n{"summary": "Test", "blocks": []}\n```';
      expect(isStructuredResponse(content)).toBe(true);
    });

    it('recognizes bare JSON object as structured', () => {
      const content = '{"summary": "Test", "blocks": []}';
      expect(isStructuredResponse(content)).toBe(true);
    });

    it('never displays raw JSON — all JSON canvas artifacts route to SubsectionViewer', () => {
      // These are real content patterns from canvas skill responses.
      // Every one MUST be recognized as structured so NodeDrawer uses
      // SubsectionViewer instead of raw Markdown rendering.
      const realPatterns = [
        '```json\n{"summary": "Dimensionalizing home office", "blocks": [{"kind": "dimensions", "title": "D", "items": [{"id": "1", "title": "T", "text": "X"}]}]}\n```',
        '```json\n{"summary": "Equipment decision needs stress-testing", "blocks": [{"kind": "antitheses", "title": "A", "items": []}]}\n```',
        '```json\n{"summary": "Home office purchase rhymes", "blocks": [{"kind": "rhyme_candidates", "title": "R", "items": []}], "suggested_moves": [{"skill": "@dimensionalize"}]}\n```',
      ];
      for (const content of realPatterns) {
        expect(isStructuredResponse(content)).toBe(true);
      }
    });
  });

  describe('canvas artifact parsing', () => {
    it('parses @rhyme JSON artifact correctly', () => {
      const content = `\`\`\`json
{
  "summary": "Home office purchase rhymes with budget allocation",
  "blocks": [
    {
      "kind": "rhyme_candidates",
      "title": "Structural Pattern Matches",
      "items": [
        {
          "id": "rhyme_1",
          "title": "Budget window as expiring option",
          "text": "Your benefit rhymes with an expiring coupon",
          "importance": "high",
          "tags": ["time-bounded"]
        }
      ]
    }
  ],
  "suggested_moves": [
    {
      "skill": "@dimensionalize",
      "reason": "Extract key decision dimensions"
    }
  ]
}
\`\`\``;

      const { artifact, raw } = parseCanvasResponse(content);

      expect(artifact).not.toBeNull();
      expect(artifact!.summary).toBe('Home office purchase rhymes with budget allocation');
      expect(artifact!.blocks).toHaveLength(1);
      expect(artifact!.blocks[0].kind).toBe('rhyme_candidates');
      expect(artifact!.blocks[0].items).toHaveLength(1);
      expect(artifact!.blocks[0].items[0].title).toBe('Budget window as expiring option');
      expect(raw).toBe(content);
    });

    it('parses @dimensionalize JSON artifact correctly', () => {
      const content = `\`\`\`json
{
  "summary": "Dimensionalizing home office equipment allocation",
  "blocks": [
    {
      "kind": "dimensions",
      "title": "Decision Dimensions",
      "items": [
        {
          "id": "dim_1",
          "title": "Cost efficiency",
          "text": "Maximize value per dollar spent",
          "importance": "critical"
        },
        {
          "id": "dim_2",
          "title": "Portability",
          "text": "Ability to work from different locations",
          "importance": "high"
        }
      ]
    }
  ]
}
\`\`\``;

      const { artifact } = parseCanvasResponse(content);

      expect(artifact).not.toBeNull();
      expect(artifact!.blocks).toHaveLength(1);
      expect(artifact!.blocks[0].items).toHaveLength(2);
    });

    it('parses @metaphorize JSON artifact correctly', () => {
      const content = `\`\`\`json
{
  "summary": "Equipment purchase as expiring leveraged option",
  "blocks": [
    {
      "kind": "primitive_mapping",
      "title": "Option Contract to Equipment Purchase",
      "items": [
        {
          "id": "map_1",
          "title": "Strike price maps to subsidy cap",
          "text": "Option strike maps to employer benefit ceiling"
        }
      ]
    }
  ]
}
\`\`\``;

      const { artifact } = parseCanvasResponse(content);

      expect(artifact).not.toBeNull();
      expect(artifact!.summary).toBe('Equipment purchase as expiring leveraged option');
    });

    it('validates canvas artifact structure', () => {
      // Valid artifact
      expect(isCanvasArtifact({
        summary: 'Test',
        blocks: [{ kind: 'test', title: 'Test', items: [] }]
      })).toBe(true);

      // Missing summary
      expect(isCanvasArtifact({
        blocks: [{ kind: 'test', title: 'Test', items: [] }]
      })).toBe(false);

      // Missing blocks
      expect(isCanvasArtifact({
        summary: 'Test'
      })).toBe(false);

      // Invalid block (missing kind)
      expect(isCanvasArtifact({
        summary: 'Test',
        blocks: [{ title: 'Test', items: [] }]
      })).toBe(false);

      // Invalid block (missing items)
      expect(isCanvasArtifact({
        summary: 'Test',
        blocks: [{ kind: 'test', title: 'Test' }]
      })).toBe(false);
    });

    it('returns null artifact for non-JSON content', () => {
      const content = `## THESIS
This is plain markdown content without JSON.

## ANTITHESES
1. **First point**: Description.`;

      const { artifact, raw } = parseCanvasResponse(content);

      expect(artifact).toBeNull();
      expect(raw).toBe(content);
    });

    it('returns null artifact for invalid JSON', () => {
      const content = `\`\`\`json
{ invalid json here
\`\`\``;

      const { artifact, raw } = parseCanvasResponse(content);

      expect(artifact).toBeNull();
      expect(raw).toBe(content);
    });
  });

  describe('isStructuredResponse rhyme fix', () => {
    it('does NOT trigger on prose containing rhyme/pattern/echo words', () => {
      // This prose preamble was incorrectly triggering card rendering
      const prose = `The pattern of your argument echoes a familiar motif in decision theory.
The structural match between these two cases suggests an analog worth exploring.
Let me trace the rhyme between your situation and classical risk scenarios.`;

      expect(isStructuredResponse(prose)).toBe(false);
    });

    it('still triggers on content with actual numbered items', () => {
      const structured = `Here are the echoes and rhymes found:

1. **Budget allocation as option pricing** - Your spending decision rhymes with financial options theory.
2. **Time pressure as decay function** - The pattern of urgency maps to theta decay in options.
3. **Sunk cost as exercise decision** - The analog to already-spent money echoes option exercise logic.`;

      expect(isStructuredResponse(structured)).toBe(true);
    });

    it('still triggers on JSON canvas artifacts from rhyme skill', () => {
      const jsonArtifact = '```json\n{"summary": "Structural rhymes found", "blocks": [{"kind": "rhyme_candidates", "title": "Echoes", "items": []}]}\n```';
      expect(isStructuredResponse(jsonArtifact)).toBe(true);
    });
  });
});
