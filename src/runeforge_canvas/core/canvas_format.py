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
You MUST output ONLY a raw JSON object. No markdown. No code fences. No explanation.

SCHEMA:
{
  "summary": "1 sentence, max 100 chars",
  "blocks": [{
    "kind": "the_type",
    "title": "Section Name",
    "items": [{
      "id": "item_1",
      "title": "short title, max 8 words",
      "text": "1 sentence explanation",
      "importance": "critical|high|medium|low",
      "tags": ["tag1", "tag2"]
    }]
  }],
  "suggested_moves": [{"skill": "@skillname", "reason": "why"}],
  "warnings": ["caveat1"]
}

STRICT RULES:
1. Output RAW JSON only - no ```json, no prose, no preamble
2. NO MARKDOWN in values - no **, no *, no [], no > quotes
3. Extract [BRACKETED TERMS] as tags array, not in title/text
4. title: max 8 words, plain text, no punctuation except ?
5. text: 1 sentence max, plain text
6. Keep total items under 6 unless critical
7. suggested_moves: 1-3 relevant next skills
</output_format>
'''

VERBOSITY_INSTRUCTIONS = {
    0: "\nMINIMAL OUTPUT: 1 sentence per item. Max 4 items total. Only critical findings.",
    1: "\nCONCISE OUTPUT: 1 sentence per item. Max 6 items. High/critical findings only.",
    2: "\nDETAILED OUTPUT: 1-2 sentences per item. All importance levels.",
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


# Skills that should never use canvas JSON format (need natural markdown output)
CANVAS_FORMAT_EXCLUDED_SKILLS = {
    "askuserquestions",  # Needs checkbox markdown for interactive responses
}


def should_use_canvas_format(params: Optional[dict], skill_name: Optional[str] = None) -> bool:
    """Check if params indicate canvas render mode.

    Some skills are excluded from canvas format because they need
    natural markdown output (e.g., askuserquestions needs checkboxes).
    """
    if not params:
        return False

    # Check exclusion list
    if skill_name and skill_name.lower() in CANVAS_FORMAT_EXCLUDED_SKILLS:
        return False

    render = params.get("render", "").lower()
    return render == "canvas"
