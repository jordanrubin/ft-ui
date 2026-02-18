"""tests for canvas data models."""

import pytest
import tempfile
from pathlib import Path

from future_tokenizer.core.models import (
    Canvas,
    CanvasNode,
    NodeType,
    list_templates,
    get_template,
    BUILTIN_TEMPLATES,
)


class TestCanvasNode:
    """tests for CanvasNode."""

    def test_create_root(self):
        """root node has correct type and no parent."""
        node = CanvasNode.create_root("test goal")
        assert node.type == NodeType.ROOT
        assert node.parent_id is None
        assert node.content_full == "test goal"
        assert len(node.id) == 8  # uuid hex[:8]

    def test_create_operation(self):
        """operation node links to parent."""
        node = CanvasNode.create_operation(
            operation="@excavate",
            content="assumptions found",
            parent_id="parent123",
            context_snapshot=["parent123"],
        )
        assert node.type == NodeType.OPERATION
        assert node.parent_id == "parent123"
        assert node.operation == "@excavate"

    def test_create_note(self):
        """note node is user type."""
        node = CanvasNode.create_note("my note", "parent123")
        assert node.type == NodeType.USER
        assert node.parent_id == "parent123"

    def test_compress_long_content(self):
        """long content is compressed for preview."""
        long_text = "x" * 200
        node = CanvasNode.create_root(long_text)
        assert len(node.content_compressed) <= 100
        assert node.content_compressed.endswith("...")

    def test_compress_json_artifact_extracts_summary(self):
        """JSON canvas artifact extracts summary value, not JSON key."""
        json_content = '''```json
{
  "summary": "Home office purchase rhymes with budget allocation",
  "blocks": [
    {
      "kind": "rhyme_candidates",
      "title": "Structural Pattern Matches",
      "items": []
    }
  ]
}
```'''
        node = CanvasNode.create_operation(
            operation="@rhyme",
            content=json_content,
            parent_id="parent123",
            context_snapshot=["parent123"],
        )
        # Should extract the summary VALUE, not the JSON key
        assert '"summary"' not in node.content_compressed
        assert 'Home office purchase' in node.content_compressed

    def test_compress_json_artifact_without_code_block(self):
        """JSON artifact without markdown code block extracts summary."""
        json_content = '''{
  "summary": "Equipment as expiring option",
  "blocks": []
}'''
        node = CanvasNode.create_operation(
            operation="@metaphorize",
            content=json_content,
            parent_id="parent123",
            context_snapshot=["parent123"],
        )
        assert '"summary"' not in node.content_compressed
        assert 'Equipment as expiring option' in node.content_compressed

    def test_roundtrip_serialization(self):
        """node survives to_dict/from_dict."""
        original = CanvasNode.create_operation(
            operation="@stressify",
            content="failure modes",
            parent_id="abc",
            context_snapshot=["abc", "def"],
        )
        d = original.to_dict()
        restored = CanvasNode.from_dict(d)
        assert restored.id == original.id
        assert restored.type == original.type
        assert restored.operation == original.operation
        assert restored.context_snapshot == original.context_snapshot

    def test_token_fields_defaults(self):
        """token fields default to zero."""
        node = CanvasNode.create_operation(
            operation="@excavate",
            content="result",
            parent_id="p1",
            context_snapshot=["p1"],
        )
        assert node.input_tokens == 0
        assert node.output_tokens == 0
        assert node.cache_read_tokens == 0
        assert node.cache_creation_tokens == 0
        assert node.cost_usd == 0.0

    def test_token_fields_set(self):
        """token fields can be set via create_operation."""
        node = CanvasNode.create_operation(
            operation="@excavate",
            content="result",
            parent_id="p1",
            context_snapshot=["p1"],
            input_tokens=1500,
            output_tokens=800,
            cache_read_tokens=200,
            cache_creation_tokens=50,
            cost_usd=0.042,
        )
        assert node.input_tokens == 1500
        assert node.output_tokens == 800
        assert node.cache_read_tokens == 200
        assert node.cache_creation_tokens == 50
        assert node.cost_usd == 0.042

    def test_token_fields_roundtrip(self):
        """token fields survive to_dict/from_dict."""
        original = CanvasNode.create_operation(
            operation="chat",
            content="response",
            parent_id="p1",
            context_snapshot=["p1"],
            input_tokens=2000,
            output_tokens=1000,
            cost_usd=0.05,
        )
        d = original.to_dict()
        restored = CanvasNode.from_dict(d)
        assert restored.input_tokens == 2000
        assert restored.output_tokens == 1000
        assert restored.cost_usd == 0.05

    def test_backward_compat_missing_token_fields(self):
        """old canvases without token fields load with defaults."""
        d = {
            "id": "abc12345",
            "type": "operation",
            "content_compressed": "test",
            "content_full": "test content",
            "parent_id": "root1234",
            "operation": "@excavate",
            "children_ids": [],
            "created_at": "2024-01-01T00:00:00",
            "links_to": [],
            "context_snapshot": [],
            "excluded": False,
            "source_ids": [],
            "invocation_target": None,
            "invocation_prompt": None,
            "used_web_search": False,
        }
        # should not crash — missing token fields use defaults
        node = CanvasNode.from_dict(d)
        assert node.input_tokens == 0
        assert node.output_tokens == 0
        assert node.cost_usd == 0.0


class TestCanvas:
    """tests for Canvas."""

    def test_add_root(self):
        """adding root sets root_id and active_path."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        assert canvas.root_id == root.id
        assert canvas.active_path == [root.id]

    def test_add_child(self):
        """adding child updates parent's children_ids."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("note", root.id)
        canvas.add_node(child)

        assert child.id in canvas.nodes[root.id].children_ids

    def test_set_focus(self):
        """set_focus rebuilds active_path."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("note", root.id)
        canvas.add_node(child)

        grandchild = CanvasNode.create_note("deep", child.id)
        canvas.add_node(grandchild)

        canvas.set_focus(grandchild.id)
        assert canvas.active_path == [root.id, child.id, grandchild.id]

    def test_get_focus_node(self):
        """get_focus_node returns end of active_path."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("note", root.id)
        canvas.add_node(child)
        canvas.set_focus(child.id)

        focus = canvas.get_focus_node()
        assert focus is not None
        assert focus.id == child.id

    def test_get_context_for_operation(self):
        """context includes parent chain."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("note", root.id)
        canvas.add_node(child)
        canvas.set_focus(child.id)

        context = canvas.get_context_for_operation(child.id)
        assert len(context) == 2
        assert context[0].id == root.id
        assert context[1].id == child.id

    def test_save_and_load(self):
        """canvas survives save/load cycle."""
        canvas = Canvas(name="test-canvas")
        root = CanvasNode.create_root("my goal")
        canvas.add_node(root)

        child = CanvasNode.create_operation(
            operation="@excavate",
            content="assumptions",
            parent_id=root.id,
            context_snapshot=[root.id],
        )
        canvas.add_node(child)
        canvas.set_focus(child.id)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test.json"
            canvas.save(path)

            loaded = Canvas.load(path)
            assert loaded.name == "test-canvas"
            assert loaded.root_id == root.id
            assert len(loaded.nodes) == 2
            assert loaded.active_path == [root.id, child.id]

    def test_load_migrates_stale_compressed_content(self):
        """loading a canvas recomputes stale compressed content from JSON artifacts."""
        import json

        canvas = Canvas(name="test-migration")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        json_content = '```json\n{"summary": "Clean summary text", "blocks": []}\n```'
        child = CanvasNode.create_operation(
            operation="@excavate",
            content=json_content,
            parent_id=root.id,
            context_snapshot=[root.id],
        )
        canvas.add_node(child)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test.json"
            canvas.save(path)

            # Manually corrupt the compressed content to simulate stale data
            with open(path) as f:
                data = json.load(f)
            data["nodes"][child.id]["content_compressed"] = '"summary": "Clean summary text"'
            with open(path, "w") as f:
                json.dump(data, f)

            # Load should fix the stale compressed content
            loaded = Canvas.load(path)
            node = loaded.nodes[child.id]
            assert '"summary"' not in node.content_compressed
            assert "Clean summary text" in node.content_compressed

    def test_unique_ids(self):
        """each node gets a unique id."""
        ids = set()
        for _ in range(100):
            node = CanvasNode.create_root("test")
            assert node.id not in ids
            ids.add(node.id)

    def test_delete_node(self):
        """delete removes node and updates parent."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("note", root.id)
        canvas.add_node(child)

        # delete child
        parent_id = canvas.delete_node(child.id)

        assert parent_id == root.id
        assert child.id not in canvas.nodes
        assert child.id not in canvas.nodes[root.id].children_ids

    def test_delete_node_with_descendants(self):
        """delete removes all descendants."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("child", root.id)
        canvas.add_node(child)

        grandchild = CanvasNode.create_note("grandchild", child.id)
        canvas.add_node(grandchild)

        # delete child - should also delete grandchild
        canvas.delete_node(child.id)

        assert child.id not in canvas.nodes
        assert grandchild.id not in canvas.nodes
        assert len(canvas.nodes) == 1  # only root remains

    def test_cannot_delete_root(self):
        """cannot delete root node."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        result = canvas.delete_node(root.id)

        assert result is None
        assert root.id in canvas.nodes

    def test_delete_updates_active_path(self):
        """delete updates active_path if deleted node was focused."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("child", root.id)
        canvas.add_node(child)
        canvas.set_focus(child.id)

        assert canvas.active_path == [root.id, child.id]

        # delete focused node
        canvas.delete_node(child.id)

        # should now focus parent
        assert canvas.active_path == [root.id]

    # --- undo/redo tests ---

    def test_undo_redo_add_node(self):
        """undo/redo works for add_node."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("child", root.id)
        canvas.add_node(child)

        assert len(canvas.nodes) == 2
        assert canvas.can_undo()

        # undo add
        canvas.undo()
        assert len(canvas.nodes) == 1
        assert child.id not in canvas.nodes

        # redo add
        assert canvas.can_redo()
        canvas.redo()
        assert len(canvas.nodes) == 2
        assert child.id in canvas.nodes

    def test_undo_redo_delete_node(self):
        """undo/redo works for delete_node."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("child", root.id)
        canvas.add_node(child)

        canvas.delete_node(child.id)
        assert child.id not in canvas.nodes

        # undo delete
        canvas.undo()
        assert child.id in canvas.nodes

    def test_undo_nothing(self):
        """undo returns False when nothing to undo."""
        canvas = Canvas(name="test")
        assert not canvas.can_undo()
        assert not canvas.undo()

    # --- search tests ---

    def test_search_basic(self):
        """basic search finds matching nodes."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("important goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("another note", root.id)
        canvas.add_node(child)

        results = canvas.search("important")
        assert len(results) == 1
        assert results[0].id == root.id

    def test_search_case_insensitive(self):
        """search is case insensitive by default."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("IMPORTANT goal")
        canvas.add_node(root)

        results = canvas.search("important")
        assert len(results) == 1

    def test_search_regex(self):
        """regex search works."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("feature-123")
        canvas.add_node(root)

        child = CanvasNode.create_note("bug-456", root.id)
        canvas.add_node(child)

        results = canvas.search_regex(r"feature-\d+")
        assert len(results) == 1
        assert results[0].id == root.id

    # --- sibling navigation tests ---

    def test_get_siblings(self):
        """get_siblings returns other children of same parent."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_note("child1", root.id)
        canvas.add_node(child1)

        child2 = CanvasNode.create_note("child2", root.id)
        canvas.add_node(child2)

        siblings = canvas.get_siblings(child1.id)
        assert len(siblings) == 1
        assert siblings[0].id == child2.id

    def test_get_next_sibling(self):
        """get_next_sibling returns next in order."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_note("child1", root.id)
        canvas.add_node(child1)

        child2 = CanvasNode.create_note("child2", root.id)
        canvas.add_node(child2)

        next_sib = canvas.get_next_sibling(child1.id)
        assert next_sib is not None
        assert next_sib.id == child2.id

        # child2 has no next sibling
        assert canvas.get_next_sibling(child2.id) is None

    def test_get_prev_sibling(self):
        """get_prev_sibling returns previous in order."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_note("child1", root.id)
        canvas.add_node(child1)

        child2 = CanvasNode.create_note("child2", root.id)
        canvas.add_node(child2)

        prev_sib = canvas.get_prev_sibling(child2.id)
        assert prev_sib is not None
        assert prev_sib.id == child1.id

        # child1 has no prev sibling
        assert canvas.get_prev_sibling(child1.id) is None

    # --- cross-linking tests ---

    def test_add_link(self):
        """add_link creates cross-link."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_note("child1", root.id)
        canvas.add_node(child1)

        child2 = CanvasNode.create_note("child2", root.id)
        canvas.add_node(child2)

        result = canvas.add_link(child1.id, child2.id)
        assert result is True
        assert child2.id in canvas.nodes[child1.id].links_to

    def test_add_link_duplicate(self):
        """add_link returns False for duplicate."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_note("child1", root.id)
        canvas.add_node(child1)

        child2 = CanvasNode.create_note("child2", root.id)
        canvas.add_node(child2)

        canvas.add_link(child1.id, child2.id)
        result = canvas.add_link(child1.id, child2.id)
        assert result is False

    def test_get_linked_nodes(self):
        """get_linked_nodes returns linked nodes."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_note("child1", root.id)
        canvas.add_node(child1)

        child2 = CanvasNode.create_note("child2", root.id)
        canvas.add_node(child2)

        canvas.add_link(child1.id, child2.id)

        linked = canvas.get_linked_nodes(child1.id)
        assert len(linked) == 1
        assert linked[0].id == child2.id

    def test_get_backlinks(self):
        """get_backlinks returns nodes linking to this one."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_note("child1", root.id)
        canvas.add_node(child1)

        child2 = CanvasNode.create_note("child2", root.id)
        canvas.add_node(child2)

        canvas.add_link(child1.id, child2.id)

        backlinks = canvas.get_backlinks(child2.id)
        assert len(backlinks) == 1
        assert backlinks[0].id == child1.id

    # --- edit node tests ---

    def test_edit_node(self):
        """edit_node updates content."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("original")
        canvas.add_node(root)

        result = canvas.edit_node(root.id, "updated content")
        assert result is True
        assert canvas.nodes[root.id].content_full == "updated content"
        assert canvas.nodes[root.id].content_compressed == "updated content"

    def test_edit_node_undo(self):
        """edit_node can be undone."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("original")
        canvas.add_node(root)

        canvas.edit_node(root.id, "updated")
        canvas.undo()

        assert canvas.nodes[root.id].content_full == "original"

    # --- statistics tests ---

    def test_get_statistics(self):
        """get_statistics returns correct counts."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_note("child1", root.id)
        canvas.add_node(child1)

        child2 = CanvasNode.create_operation(
            operation="@excavate",
            content="result",
            parent_id=root.id,
            context_snapshot=[root.id],
        )
        canvas.add_node(child2)

        stats = canvas.get_statistics()
        assert stats["total_nodes"] == 3
        assert stats["max_depth"] == 1
        assert stats["branch_count"] == 1  # root has 2 children
        assert stats["leaf_count"] == 2  # child1 and child2
        assert stats["node_types"]["root"] == 1
        assert stats["node_types"]["user"] == 1
        assert stats["node_types"]["operation"] == 1
        assert stats["operations_used"]["@excavate"] == 1

    def test_get_statistics_token_aggregates(self):
        """get_statistics includes total token usage."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child1 = CanvasNode.create_operation(
            operation="@excavate",
            content="result1",
            parent_id=root.id,
            context_snapshot=[root.id],
            input_tokens=1000,
            output_tokens=500,
            cost_usd=0.02,
        )
        canvas.add_node(child1)

        child2 = CanvasNode.create_operation(
            operation="chat",
            content="result2",
            parent_id=root.id,
            context_snapshot=[root.id],
            input_tokens=2000,
            output_tokens=800,
            cost_usd=0.03,
        )
        canvas.add_node(child2)

        stats = canvas.get_statistics()
        assert stats["total_input_tokens"] == 3000
        assert stats["total_output_tokens"] == 1300
        assert abs(stats["total_cost_usd"] - 0.05) < 0.001

    # --- export tests ---

    def test_export_markdown(self):
        """export_markdown produces valid output."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("my goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("a note", root.id)
        canvas.add_node(child)

        md = canvas.export_markdown()
        assert "**[root]**" in md
        assert "my goal" in md
        assert "a note" in md

    def test_export_mermaid(self):
        """export_mermaid produces valid flowchart."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("note", root.id)
        canvas.add_node(child)

        mermaid = canvas.export_mermaid()
        assert "flowchart TD" in mermaid
        assert f"{root.id} --> {child.id}" in mermaid

    def test_export_outline(self):
        """export_outline produces text outline."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        child = CanvasNode.create_note("note", root.id)
        canvas.add_node(child)

        outline = canvas.export_outline()
        assert "goal" in outline
        assert "note" in outline


class TestTemplates:
    """tests for template system."""

    def test_list_templates(self):
        """list_templates returns all templates."""
        templates = list_templates()
        assert len(templates) >= 4  # blank, feature, bug, decision, refactor

    def test_get_template(self):
        """get_template returns specific template."""
        template = get_template("feature")
        assert template is not None
        assert template.name == "Feature Spec"

    def test_get_template_not_found(self):
        """get_template returns None for unknown."""
        template = get_template("nonexistent")
        assert template is None

    def test_builtin_templates_have_required_fields(self):
        """all templates have name and description."""
        for key, template in BUILTIN_TEMPLATES.items():
            assert template.name, f"{key} missing name"
            assert template.description, f"{key} missing description"
