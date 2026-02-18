"""pytest fixtures for future tokenizer tests."""

import pytest
import tempfile
from pathlib import Path

from future_tokenizer.core.models import Canvas, CanvasNode
from future_tokenizer.core.skills import Skill


@pytest.fixture
def temp_dir():
    """temporary directory that cleans up after test."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def sample_canvas():
    """canvas with root and one child."""
    canvas = Canvas(name="test")
    root = CanvasNode.create_root("build a todo app")
    canvas.add_node(root)

    child = CanvasNode.create_operation(
        operation="@excavate",
        content="assumptions:\n- users want simplicity\n- mobile-first",
        parent_id=root.id,
        context_snapshot=[root.id],
    )
    canvas.add_node(child)
    canvas.set_focus(child.id)

    return canvas


@pytest.fixture
def sample_skill():
    """simple test skill."""
    return Skill(
        name="excavate",
        description="surface hidden assumptions",
        body="# excavate\n\ndig for assumptions in the context.",
        path=Path("/fake/excavate/EXCAVATE.md"),
    )


@pytest.fixture
def mock_skills_dir(temp_dir):
    """directory with sample skills."""
    for name, desc in [
        ("excavate", "surface hidden assumptions"),
        ("stressify", "probe for failure modes"),
        ("synthesize", "compress conflicting positions"),
    ]:
        skill_dir = temp_dir / name
        skill_dir.mkdir()
        (skill_dir / f"{name.upper()}.md").write_text(f"""---
name: {name}
description: {desc}
---

# {name}

apply {name} to the context.
""")
    return temp_dir
