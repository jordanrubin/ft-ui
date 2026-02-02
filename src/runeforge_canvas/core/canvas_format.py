"""Canvas artifact format instructions.

This module defines the structured output format for skills when render=canvas.
It provides prompt instructions that tell Claude to output a CanvasArtifact JSON
instead of narrative prose.

Layer 2 of the 3-layer architecture:
- Layer 1: Canonical skill semantics (the skill markdown files)
- Layer 2: Canvas artifact renderer (this module)
- Layer 3: UI presentation (frontend renders the schema)
"""

from typing import Literal, Optional

RenderMode = Literal["narrative", "canvas"]
Verbosity = Literal[0, 1, 2]
FocusMode = Literal["planning", "critical", "positive", "near", "far", "internal", "external"]


CANVAS_FORMAT_INSTRUCTIONS = '''
<output_format>
OUTPUT AS JSON matching this exact schema (no markdown, no prose, just JSON):

{
  "summary": "string ~100 chars - the main takeaway",
  "blocks": [
    {
      "kind": "string - category like 'cruxes', 'antitheses', 'alternatives', 'failure_modes', 'questions'",
      "title": "string - display title for this section",
      "items": [
        {
          "id": "string - unique identifier like 'item_1'",
          "text": "string - the main content",
          "title": "string? - optional short title",
          "importance": "'critical' | 'high' | 'medium' | 'low'",
          "polarity": "'positive' | 'negative' | 'neutral' | 'mixed'",
          "tags": ["optional", "string", "tags"]
        }
      ]
    }
  ],
  "suggested_moves": [
    {
      "skill": "@skill_name",
      "reason": "why this move makes sense",
      "target": "optional - which item id to target"
    }
  ],
  "warnings": ["optional caveats or assumptions"],
  "edges": [
    {
      "from": "item_id",
      "to": "item_id",
      "type": "'supports' | 'refutes' | 'depends_on' | 'enables' | 'blocks' | 'links_to'"
    }
  ]
}

CRITICAL RULES:
- Output ONLY valid JSON, no markdown code blocks, no prose before/after
- Every block must have at least one item
- Items need id, text, and importance at minimum
- Use the kind that matches your skill's output type
- Keep text concise: 1-3 sentences per item
- suggested_moves should be actionable next steps
</output_format>
'''

VERBOSITY_INSTRUCTIONS = {
    0: "\nBe extremely concise. 1 sentence per item maximum. Only include critical/high importance items.",
    1: "\nBe concise. 1-2 sentences per item. Include high and medium importance items.",
    2: "\nBe thorough. 2-3 sentences per item. Include all importance levels with full reasoning.",
}

FOCUS_INSTRUCTIONS = {
    "planning": "\nFocus on actionable next steps and decisions. What needs to happen?",
    "critical": "\nFocus on finding flaws, risks, and failure modes. What could go wrong?",
    "positive": "\nFocus on strengths, opportunities, and what's working. What's good here?",
    "near": "\nFocus on immediate, short-term implications. What happens next?",
    "far": "\nFocus on long-term, downstream implications. Where does this lead?",
    "internal": "\nFocus on within-system dynamics. How do the parts interact?",
    "external": "\nFocus on outside-system forces. What external factors matter?",
}


def build_canvas_suffix(
    verbosity: Verbosity = 1,
    focus: Optional[FocusMode] = None,
) -> str:
    """Build the format instruction suffix for canvas mode.

    Args:
        verbosity: 0 (terse), 1 (balanced), 2 (thorough)
        focus: optional semantic lens to apply

    Returns:
        Prompt suffix string to append to skill prompt
    """
    suffix = CANVAS_FORMAT_INSTRUCTIONS
    suffix += VERBOSITY_INSTRUCTIONS.get(verbosity, VERBOSITY_INSTRUCTIONS[1])

    if focus:
        suffix += FOCUS_INSTRUCTIONS.get(focus, "")

    return suffix


def should_use_canvas_format(params: Optional[dict]) -> bool:
    """Check if params indicate canvas render mode."""
    if not params:
        return False
    render = params.get("render", "").lower()
    return render == "canvas"
