"""tests for canvas data models."""

import pytest
import tempfile
from pathlib import Path

from runeforge_canvas.models import Canvas, CanvasNode, NodeType


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
