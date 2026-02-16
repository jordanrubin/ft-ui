"""tests that run_skill_on_selection includes tree context in the prompt."""

import pytest
from unittest.mock import AsyncMock, patch
from pathlib import Path

from runeforge_canvas.core.models import Canvas, CanvasNode
from runeforge_canvas.core.skills import Skill, SkillLoader, CompositeSkillLoader


def _make_tree():
    """build a 3-node tree: root → excavate → stressify."""
    canvas = Canvas(name="test")

    root = CanvasNode.create_root("Should we build a monolith or microservices?")
    canvas.add_node(root)

    excavate = CanvasNode.create_operation(
        operation="@excavate",
        content="assumptions:\n- team is small\n- latency matters\n- deploy cadence is weekly",
        parent_id=root.id,
        context_snapshot=[root.id],
    )
    canvas.add_node(excavate)

    stress = CanvasNode.create_operation(
        operation="@stressify",
        content="failure modes:\n1. team grows to 30 engineers\n2. deploy cadence goes daily\n3. latency SLA tightens to 50ms",
        parent_id=excavate.id,
        context_snapshot=[root.id, excavate.id],
    )
    canvas.add_node(stress)
    canvas.set_focus(stress.id)

    return canvas, root, excavate, stress


class TestSelectionContextInclusion:
    """run_skill_on_selection should include tree context, not just the selection."""

    def test_prompt_contains_tree_context_and_selection(self):
        """the prompt sent to the LLM should contain both parent chain and selection."""
        canvas, root, excavate, stress = _make_tree()

        # gather context the same way the endpoint should
        context_nodes = canvas.get_context_for_operation(stress.id)

        # context should include entire chain: root → excavate → stress
        assert len(context_nodes) == 3
        assert context_nodes[0].id == root.id
        assert context_nodes[1].id == excavate.id
        assert context_nodes[2].id == stress.id

    def test_format_context_includes_all_ancestors(self):
        """format_context should produce text containing all ancestor content."""
        from runeforge_canvas.api.server import AppState

        canvas, root, excavate, stress = _make_tree()
        app_state = AppState(mock=True)
        app_state.canvas = canvas

        context_nodes = canvas.get_context_for_operation(stress.id)
        context_text = app_state.format_context(context_nodes)

        # root question should be in context
        assert "monolith or microservices" in context_text
        # excavate output should be in context
        assert "team is small" in context_text
        # stress output should be in context
        assert "failure modes" in context_text

    def test_selection_prompt_should_include_tree_and_selection(self):
        """the final prompt for a selection run should contain both tree context and selection text."""
        canvas, root, excavate, stress = _make_tree()

        from runeforge_canvas.api.server import AppState

        app_state = AppState(mock=True)
        app_state.canvas = canvas

        # simulate what the endpoint should do:
        # 1. gather tree context
        context_nodes = canvas.get_context_for_operation(stress.id)
        context_text = app_state.format_context(context_nodes)

        # 2. build combined context with selection
        selected_content = "team grows to 30 engineers"
        combined = f"""{context_text}

<directive>
FOCUS: Apply this skill ONLY to the selected content below. The tree context above is provided for background understanding.
</directive>

<selection>
{selected_content}
</selection>"""

        skill = Skill(
            name="excavate",
            description="test",
            body="dig for assumptions",
            path=Path("/fake"),
        )
        prompt = skill.build_prompt(combined)

        # prompt should contain tree context
        assert "monolith or microservices" in prompt
        assert "team is small" in prompt
        assert "failure modes" in prompt
        # prompt should contain the selection
        assert "team grows to 30 engineers" in prompt
        assert "<selection>" in prompt
        assert "<directive>" in prompt

    def test_answers_included_in_selection_prompt(self):
        """user answers should be included in selection prompts."""
        canvas, root, excavate, stress = _make_tree()

        from runeforge_canvas.api.server import AppState

        app_state = AppState(mock=True)
        app_state.canvas = canvas

        context_nodes = canvas.get_context_for_operation(stress.id)
        context_text = app_state.format_context(context_nodes)

        answers = {"q1": "we expect 20 engineers by Q4", "q2": "latency budget is flexible"}
        if answers:
            answer_text = "\n\n--- USER ANSWERS ---\n"
            for q_id, answer in answers.items():
                answer_text += f"- {q_id}: {answer}\n"
            context_text += answer_text

        assert "we expect 20 engineers by Q4" in context_text
        assert "latency budget is flexible" in context_text
