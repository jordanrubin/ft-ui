"""Tests for canvas format and skill exclusions."""

import pytest
from runeforge_canvas.core.canvas_format import (
    should_use_canvas_format,
    CANVAS_FORMAT_EXCLUDED_SKILLS,
)


class TestShouldUseCanvasFormat:
    """Tests for should_use_canvas_format function."""

    def test_returns_false_when_no_params(self):
        """No params means no canvas format."""
        assert should_use_canvas_format(None) is False
        assert should_use_canvas_format({}) is False

    def test_returns_true_when_render_canvas(self):
        """render=canvas enables canvas format."""
        assert should_use_canvas_format({"render": "canvas"}) is True
        assert should_use_canvas_format({"render": "CANVAS"}) is True

    def test_returns_false_when_render_not_canvas(self):
        """Other render modes don't enable canvas format."""
        assert should_use_canvas_format({"render": "narrative"}) is False
        assert should_use_canvas_format({"render": "text"}) is False

    def test_askuserquestions_excluded(self):
        """askuserquestions skill should never use canvas format.

        This is critical for answer persistence - askuserquestions needs
        to output markdown with checkboxes, not JSON.
        """
        params = {"render": "canvas"}

        # Normal skills use canvas format
        assert should_use_canvas_format(params, skill_name="excavate") is True
        assert should_use_canvas_format(params, skill_name="stressify") is True

        # askuserquestions is excluded
        assert should_use_canvas_format(params, skill_name="askuserquestions") is False
        assert should_use_canvas_format(params, skill_name="ASKUSERQUESTIONS") is False

    def test_exclusion_list_contains_askuserquestions(self):
        """Verify askuserquestions is in the exclusion list."""
        assert "askuserquestions" in CANVAS_FORMAT_EXCLUDED_SKILLS
