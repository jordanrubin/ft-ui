import { describe, it, expect } from 'vitest';
import { parseSkillResponse } from '../utils/responseParser';

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
  });
});
