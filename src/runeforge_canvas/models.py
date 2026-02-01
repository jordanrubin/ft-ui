"""core data model for runeforge canvas.

graph of thinking nodes, not linear chat.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional


class NodeType(Enum):
    ROOT = "root"           # starting question/context
    OPERATION = "operation" # result of a runeforge skill
    USER = "user"           # user annotation/note


@dataclass
class CanvasNode:
    """single node in the thinking graph."""

    id: str
    type: NodeType
    content_compressed: str  # always available, ≤100 chars
    content_full: str        # expanded view
    parent_id: Optional[str] = None
    operation: Optional[str] = None  # e.g., "@excavate", "@antithesize"
    children_ids: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

    # for future cross-linking (research entanglement)
    links_to: list[str] = field(default_factory=list)
    context_snapshot: list[str] = field(default_factory=list)

    @classmethod
    def create_root(cls, content: str) -> CanvasNode:
        """create a root node with initial question/context."""
        return cls(
            id=_generate_id(),
            type=NodeType.ROOT,
            content_compressed=_compress(content),
            content_full=content,
        )

    @classmethod
    def create_operation(
        cls,
        operation: str,
        content: str,
        parent_id: str,
        context_snapshot: list[str],
    ) -> CanvasNode:
        """create an operation result node."""
        return cls(
            id=_generate_id(),
            type=NodeType.OPERATION,
            operation=operation,
            content_compressed=_compress(content),
            content_full=content,
            parent_id=parent_id,
            context_snapshot=context_snapshot,
        )

    @classmethod
    def create_note(cls, content: str, parent_id: str) -> CanvasNode:
        """create a user annotation node."""
        return cls(
            id=_generate_id(),
            type=NodeType.USER,
            content_compressed=_compress(content),
            content_full=content,
            parent_id=parent_id,
        )

    def to_dict(self) -> dict:
        """serialize to dict for json."""
        d = asdict(self)
        d["type"] = self.type.value
        return d

    @classmethod
    def from_dict(cls, d: dict) -> CanvasNode:
        """deserialize from dict."""
        d = d.copy()
        d["type"] = NodeType(d["type"])
        return cls(**d)


@dataclass
class Canvas:
    """the full thinking graph."""

    name: str
    nodes: dict[str, CanvasNode] = field(default_factory=dict)
    root_id: Optional[str] = None
    active_path: list[str] = field(default_factory=list)  # ids from root to focus
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def add_node(self, node: CanvasNode) -> None:
        """add a node to the canvas, updating parent's children list."""
        self.nodes[node.id] = node
        if node.parent_id and node.parent_id in self.nodes:
            parent = self.nodes[node.parent_id]
            if node.id not in parent.children_ids:
                parent.children_ids.append(node.id)
        if node.type == NodeType.ROOT:
            self.root_id = node.id
            self.active_path = [node.id]

    def set_focus(self, node_id: str) -> None:
        """recompute active path from root to this node."""
        if node_id not in self.nodes:
            return

        path = []
        current: Optional[str] = node_id
        while current:
            path.append(current)
            current = self.nodes[current].parent_id
        self.active_path = list(reversed(path))

    def get_focus_node(self) -> Optional[CanvasNode]:
        """get the currently focused node (end of active path)."""
        if not self.active_path:
            return None
        return self.nodes.get(self.active_path[-1])

    def get_context_for_operation(self, node_id: str) -> list[CanvasNode]:
        """
        gather context for running an operation.

        for v1: parent chain only.
        future: add cross-links and sibling awareness.
        """
        context = []

        # walk parent chain
        for pid in self.active_path:
            if pid == node_id:
                break
            context.append(self.nodes[pid])

        # include the focus node itself
        if node_id in self.nodes:
            context.append(self.nodes[node_id])

        return context

    def get_siblings(self, node_id: str) -> list[CanvasNode]:
        """get sibling nodes (other children of same parent)."""
        node = self.nodes.get(node_id)
        if not node or not node.parent_id:
            return []

        parent = self.nodes.get(node.parent_id)
        if not parent:
            return []

        return [
            self.nodes[cid]
            for cid in parent.children_ids
            if cid != node_id and cid in self.nodes
        ]

    def delete_node(self, node_id: str) -> Optional[str]:
        """delete a node and all its descendants.

        returns the parent_id to focus after deletion, or None if root deleted.
        cannot delete the root node.
        """
        node = self.nodes.get(node_id)
        if not node:
            return None

        # don't delete root
        if node.type == NodeType.ROOT:
            return None

        parent_id = node.parent_id

        # collect all descendants to delete
        to_delete = self._collect_descendants(node_id)
        to_delete.add(node_id)

        # remove from parent's children list
        if parent_id and parent_id in self.nodes:
            parent = self.nodes[parent_id]
            parent.children_ids = [
                cid for cid in parent.children_ids if cid not in to_delete
            ]

        # delete all nodes
        for nid in to_delete:
            del self.nodes[nid]

        # update active path if deleted node was in it
        if node_id in self.active_path:
            self.set_focus(parent_id or self.root_id or "")

        return parent_id

    def _collect_descendants(self, node_id: str) -> set[str]:
        """recursively collect all descendant node ids."""
        descendants = set()
        node = self.nodes.get(node_id)
        if not node:
            return descendants

        for child_id in node.children_ids:
            descendants.add(child_id)
            descendants.update(self._collect_descendants(child_id))

        return descendants

    def to_dict(self) -> dict:
        """serialize to dict for json."""
        return {
            "name": self.name,
            "nodes": {nid: n.to_dict() for nid, n in self.nodes.items()},
            "root_id": self.root_id,
            "active_path": self.active_path,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Canvas:
        """deserialize from dict."""
        canvas = cls(
            name=d["name"],
            root_id=d.get("root_id"),
            active_path=d.get("active_path", []),
            created_at=d.get("created_at", datetime.now().isoformat()),
        )
        for nid, nd in d.get("nodes", {}).items():
            canvas.nodes[nid] = CanvasNode.from_dict(nd)
        return canvas

    def save(self, path: Path) -> None:
        """save canvas to json file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, path: Path) -> Canvas:
        """load canvas from json file."""
        with open(path) as f:
            return cls.from_dict(json.load(f))


def _generate_id() -> str:
    """generate a short unique id."""
    return uuid.uuid4().hex[:8]


def _compress(content: str, max_len: int = 100) -> str:
    """compress content to ≤max_len chars."""
    # take first line or first max_len chars
    first_line = content.split("\n")[0].strip()
    if len(first_line) <= max_len:
        return first_line
    return first_line[:max_len - 3] + "..."
