"""core data model for future tokenizer.

graph of thinking nodes, not linear chat.
"""

from __future__ import annotations

import copy
import json
import re
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Callable


# --- configuration ---

DEFAULT_COMPRESSION_LENGTH = 100
MAX_UNDO_HISTORY = 50


class NodeType(Enum):
    ROOT = "root"           # starting question/context
    OPERATION = "operation" # result of a runeforge skill
    USER = "user"           # user annotation/note
    PLAN = "plan"           # synthesized plan from multiple sources


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

    # for plan synthesis
    excluded: bool = False  # mark node to exclude from plan synthesis
    source_ids: list[str] = field(default_factory=list)  # for plan nodes: which nodes contributed

    # invocation tracking - what was run and on what
    invocation_target: Optional[str] = None  # the content that was passed as input
    invocation_prompt: Optional[str] = None  # for chat: user's prompt; for skills: skill name
    used_web_search: bool = False  # whether web search was enabled for this response

    # token usage tracking
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    cost_usd: float = 0.0

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
        invocation_target: Optional[str] = None,
        invocation_prompt: Optional[str] = None,
        used_web_search: bool = False,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_read_tokens: int = 0,
        cache_creation_tokens: int = 0,
        cost_usd: float = 0.0,
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
            invocation_target=invocation_target,
            invocation_prompt=invocation_prompt,
            used_web_search=used_web_search,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_creation_tokens=cache_creation_tokens,
            cost_usd=cost_usd,
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

    @classmethod
    def create_plan(
        cls,
        content: str,
        parent_id: str,
        source_ids: list[str],
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_read_tokens: int = 0,
        cache_creation_tokens: int = 0,
        cost_usd: float = 0.0,
    ) -> CanvasNode:
        """create a plan node synthesized from multiple sources."""
        return cls(
            id=_generate_id(),
            type=NodeType.PLAN,
            operation="plan",
            content_compressed=_compress(content),
            content_full=content,
            parent_id=parent_id,
            source_ids=source_ids,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_creation_tokens=cache_creation_tokens,
            cost_usd=cost_usd,
        )

    def update_content(self, new_content: str, compress_length: int = DEFAULT_COMPRESSION_LENGTH) -> None:
        """update node content (for editing)."""
        self.content_full = new_content
        self.content_compressed = _compress(new_content, compress_length)

    def add_link(self, target_id: str) -> bool:
        """add a cross-link to another node. returns True if added."""
        if target_id not in self.links_to:
            self.links_to.append(target_id)
            return True
        return False

    def remove_link(self, target_id: str) -> bool:
        """remove a cross-link. returns True if removed."""
        if target_id in self.links_to:
            self.links_to.remove(target_id)
            return True
        return False

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
    compress_length: int = DEFAULT_COMPRESSION_LENGTH
    source_directory: Optional[str] = None  # directory path if created from directory
    source_file: Optional[str] = None  # file path if created from single file

    # undo/redo - not serialized
    _undo_stack: list[dict] = field(default_factory=list, repr=False)
    _redo_stack: list[dict] = field(default_factory=list, repr=False)

    def _snapshot(self) -> dict:
        """create a snapshot of current state for undo."""
        return {
            "nodes": {nid: copy.deepcopy(n.to_dict()) for nid, n in self.nodes.items()},
            "root_id": self.root_id,
            "active_path": self.active_path.copy(),
        }

    def _push_undo(self) -> None:
        """push current state to undo stack."""
        self._undo_stack.append(self._snapshot())
        if len(self._undo_stack) > MAX_UNDO_HISTORY:
            self._undo_stack.pop(0)
        # clear redo stack on new action
        self._redo_stack.clear()

    def undo(self) -> bool:
        """undo last action. returns True if successful."""
        if not self._undo_stack:
            return False
        # save current state to redo
        self._redo_stack.append(self._snapshot())
        # restore previous state
        state = self._undo_stack.pop()
        self._restore_snapshot(state)
        return True

    def redo(self) -> bool:
        """redo last undone action. returns True if successful."""
        if not self._redo_stack:
            return False
        # save current state to undo
        self._undo_stack.append(self._snapshot())
        # restore redo state
        state = self._redo_stack.pop()
        self._restore_snapshot(state)
        return True

    def _restore_snapshot(self, state: dict) -> None:
        """restore canvas from snapshot."""
        self.nodes = {nid: CanvasNode.from_dict(nd) for nid, nd in state["nodes"].items()}
        self.root_id = state["root_id"]
        self.active_path = state["active_path"]

    def can_undo(self) -> bool:
        """check if undo is available."""
        return len(self._undo_stack) > 0

    def can_redo(self) -> bool:
        """check if redo is available."""
        return len(self._redo_stack) > 0

    def add_node(self, node: CanvasNode, record_undo: bool = True) -> None:
        """add a node to the canvas, updating parent's children list."""
        if record_undo:
            self._push_undo()
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

    def delete_node(self, node_id: str, record_undo: bool = True) -> Optional[str]:
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

        if record_undo:
            self._push_undo()

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

    # --- node editing ---

    def edit_node(self, node_id: str, new_content: str, record_undo: bool = True) -> bool:
        """edit a node's content. returns True if successful."""
        node = self.nodes.get(node_id)
        if not node:
            return False
        if record_undo:
            self._push_undo()
        node.update_content(new_content, self.compress_length)
        return True

    # --- search ---

    def search(self, query: str, case_sensitive: bool = False) -> list[CanvasNode]:
        """search nodes by content. returns matching nodes."""
        if not case_sensitive:
            query = query.lower()
        results = []
        for node in self.nodes.values():
            content = node.content_full if case_sensitive else node.content_full.lower()
            if query in content:
                results.append(node)
        return results

    def search_regex(self, pattern: str) -> list[CanvasNode]:
        """search nodes by regex pattern. returns matching nodes."""
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error:
            return []
        return [n for n in self.nodes.values() if regex.search(n.content_full)]

    # --- sibling navigation ---

    def get_next_sibling(self, node_id: str) -> Optional[CanvasNode]:
        """get next sibling in parent's children list."""
        node = self.nodes.get(node_id)
        if not node or not node.parent_id:
            return None
        parent = self.nodes.get(node.parent_id)
        if not parent:
            return None
        try:
            idx = parent.children_ids.index(node_id)
            if idx < len(parent.children_ids) - 1:
                return self.nodes.get(parent.children_ids[idx + 1])
        except ValueError:
            pass
        return None

    def get_prev_sibling(self, node_id: str) -> Optional[CanvasNode]:
        """get previous sibling in parent's children list."""
        node = self.nodes.get(node_id)
        if not node or not node.parent_id:
            return None
        parent = self.nodes.get(node.parent_id)
        if not parent:
            return None
        try:
            idx = parent.children_ids.index(node_id)
            if idx > 0:
                return self.nodes.get(parent.children_ids[idx - 1])
        except ValueError:
            pass
        return None

    # --- cross-linking ---

    def add_link(self, from_id: str, to_id: str, record_undo: bool = True) -> bool:
        """add a cross-link between nodes. returns True if added."""
        from_node = self.nodes.get(from_id)
        to_node = self.nodes.get(to_id)
        if not from_node or not to_node:
            return False
        if from_id == to_id:
            return False
        if record_undo:
            self._push_undo()
        return from_node.add_link(to_id)

    def remove_link(self, from_id: str, to_id: str, record_undo: bool = True) -> bool:
        """remove a cross-link. returns True if removed."""
        from_node = self.nodes.get(from_id)
        if not from_node:
            return False
        if record_undo:
            self._push_undo()
        return from_node.remove_link(to_id)

    def get_linked_nodes(self, node_id: str) -> list[CanvasNode]:
        """get all nodes linked from this node."""
        node = self.nodes.get(node_id)
        if not node:
            return []
        return [self.nodes[lid] for lid in node.links_to if lid in self.nodes]

    def get_backlinks(self, node_id: str) -> list[CanvasNode]:
        """get all nodes that link TO this node."""
        return [n for n in self.nodes.values() if node_id in n.links_to]

    def get_context_for_operation_with_links(self, node_id: str) -> list[CanvasNode]:
        """gather context including cross-links and siblings for richer operations."""
        context = []
        seen = set()

        # parent chain
        for pid in self.active_path:
            if pid not in seen:
                context.append(self.nodes[pid])
                seen.add(pid)
            if pid == node_id:
                break

        # include focus node
        if node_id in self.nodes and node_id not in seen:
            context.append(self.nodes[node_id])
            seen.add(node_id)

        # add cross-linked nodes
        node = self.nodes.get(node_id)
        if node:
            for lid in node.links_to:
                if lid in self.nodes and lid not in seen:
                    context.append(self.nodes[lid])
                    seen.add(lid)

        return context

    def get_context_for_multiple_nodes(self, node_ids: list[str]) -> list[CanvasNode]:
        """gather context from multiple selected nodes.

        collects nodes in a sensible order: tries to find common ancestor chain,
        then includes all selected nodes.
        """
        if not node_ids:
            return []

        context = []
        seen = set()

        # find the common ancestor path by checking which nodes have the shallowest depth
        # and include ancestor chain from root to that point
        def get_depth(nid: str) -> int:
            depth = 0
            current = nid
            while current and current in self.nodes:
                depth += 1
                current = self.nodes[current].parent_id
            return depth

        # sort nodes by depth (shallowest first)
        sorted_nodes = sorted(
            [(nid, get_depth(nid)) for nid in node_ids if nid in self.nodes],
            key=lambda x: x[1]
        )

        if not sorted_nodes:
            return []

        # get ancestor chain of the shallowest node as common context
        shallowest_id = sorted_nodes[0][0]
        ancestor_chain = []
        current = shallowest_id
        while current and current in self.nodes:
            ancestor_chain.append(current)
            current = self.nodes[current].parent_id
        ancestor_chain.reverse()  # root to node

        # add ancestors (excluding the selected nodes themselves)
        for nid in ancestor_chain:
            if nid not in seen:
                if nid not in node_ids:  # don't add selected nodes here
                    context.append(self.nodes[nid])
                seen.add(nid)

        # now add all selected nodes in depth order
        for nid, _ in sorted_nodes:
            if nid not in seen:
                context.append(self.nodes[nid])
                seen.add(nid)

        return context

    # --- statistics ---

    def get_statistics(self) -> dict:
        """get canvas statistics."""
        if not self.nodes:
            return {
                "total_nodes": 0,
                "max_depth": 0,
                "branch_count": 0,
                "leaf_count": 0,
                "node_types": {},
                "operations_used": {},
            }

        # count node types
        type_counts: dict[str, int] = {}
        operation_counts: dict[str, int] = {}
        leaf_count = 0

        for node in self.nodes.values():
            t = node.type.value
            type_counts[t] = type_counts.get(t, 0) + 1
            if node.operation:
                operation_counts[node.operation] = operation_counts.get(node.operation, 0) + 1
            if not node.children_ids:
                leaf_count += 1

        # calculate depth
        def get_depth(nid: str, depth: int = 0) -> int:
            node = self.nodes.get(nid)
            if not node or not node.children_ids:
                return depth
            return max(get_depth(cid, depth + 1) for cid in node.children_ids)

        max_depth = get_depth(self.root_id) if self.root_id else 0

        # count branches (nodes with >1 child)
        branch_count = sum(1 for n in self.nodes.values() if len(n.children_ids) > 1)

        return {
            "total_nodes": len(self.nodes),
            "max_depth": max_depth,
            "branch_count": branch_count,
            "leaf_count": leaf_count,
            "node_types": type_counts,
            "operations_used": operation_counts,
            "total_input_tokens": sum(n.input_tokens for n in self.nodes.values()),
            "total_output_tokens": sum(n.output_tokens for n in self.nodes.values()),
            "total_cost_usd": sum(n.cost_usd for n in self.nodes.values()),
        }

    # --- export formats ---

    def export_markdown(self) -> str:
        """export canvas as markdown outline."""
        if not self.root_id:
            return ""

        lines = []

        def render_node(nid: str, indent: int = 0) -> None:
            node = self.nodes.get(nid)
            if not node:
                return
            prefix = "  " * indent
            marker = "- " if indent > 0 else "# "
            title = node.operation or node.type.value
            lines.append(f"{prefix}{marker}**[{title}]** {node.content_compressed}")
            if indent > 0 and node.content_full != node.content_compressed:
                # add full content as indented block
                for line in node.content_full.split("\n")[:5]:  # limit preview
                    lines.append(f"{prefix}  > {line}")
            for cid in node.children_ids:
                render_node(cid, indent + 1)

        render_node(self.root_id)
        return "\n".join(lines)

    def export_mermaid(self) -> str:
        """export canvas as mermaid flowchart."""
        if not self.root_id:
            return "flowchart TD\n  empty[No nodes]"

        lines = ["flowchart TD"]

        def sanitize(text: str) -> str:
            # escape quotes and limit length
            return text[:30].replace('"', "'").replace("\n", " ")

        for nid, node in self.nodes.items():
            label = node.operation or node.type.value
            content = sanitize(node.content_compressed)
            lines.append(f'  {nid}["{label}: {content}"]')

        # add edges
        for nid, node in self.nodes.items():
            for cid in node.children_ids:
                lines.append(f"  {nid} --> {cid}")

        # add cross-links as dotted
        for nid, node in self.nodes.items():
            for lid in node.links_to:
                if lid in self.nodes:
                    lines.append(f"  {nid} -.-> {lid}")

        return "\n".join(lines)

    def export_outline(self) -> str:
        """export canvas as plain text outline."""
        if not self.root_id:
            return ""

        lines = []

        def render_node(nid: str, indent: int = 0) -> None:
            node = self.nodes.get(nid)
            if not node:
                return
            prefix = "    " * indent
            bullet = f"{indent + 1}." if indent == 0 else "-"
            label = f"[{node.operation}] " if node.operation else ""
            lines.append(f"{prefix}{bullet} {label}{node.content_compressed}")
            for cid in node.children_ids:
                render_node(cid, indent + 1)

        render_node(self.root_id)
        return "\n".join(lines)

    def to_dict(self) -> dict:
        """serialize to dict for json (excludes undo/redo stacks)."""
        d = {
            "name": self.name,
            "nodes": {nid: n.to_dict() for nid, n in self.nodes.items()},
            "root_id": self.root_id,
            "active_path": self.active_path,
            "created_at": self.created_at,
            "compress_length": self.compress_length,
        }
        if self.source_directory:
            d["source_directory"] = self.source_directory
        if self.source_file:
            d["source_file"] = self.source_file
        return d

    @classmethod
    def from_dict(cls, d: dict) -> Canvas:
        """deserialize from dict."""
        canvas = cls(
            name=d["name"],
            root_id=d.get("root_id"),
            active_path=d.get("active_path", []),
            created_at=d.get("created_at", datetime.now().isoformat()),
            compress_length=d.get("compress_length", DEFAULT_COMPRESSION_LENGTH),
            source_directory=d.get("source_directory"),
            source_file=d.get("source_file"),
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
            canvas = cls.from_dict(json.load(f))
        # migrate stale compressed content (pre-JSON-summary-extraction nodes)
        canvas._recompute_compressed()
        return canvas

    def _recompute_compressed(self) -> None:
        """recompute compressed content for nodes with stale JSON summaries."""
        for node in self.nodes.values():
            fresh = _compress(node.content_full, self.compress_length)
            if fresh != node.content_compressed:
                node.content_compressed = fresh


def _generate_id() -> str:
    """generate a short unique id."""
    return uuid.uuid4().hex[:8]


def _compress(content: str, max_len: int = DEFAULT_COMPRESSION_LENGTH) -> str:
    """compress content to ≤max_len chars, skipping preamble.

    For JSON canvas artifacts, extracts the summary field value.
    """
    # Try to extract summary from JSON canvas artifact
    summary = _extract_json_summary(content)
    if summary:
        if len(summary) <= max_len:
            return summary
        return summary[:max_len - 3] + "..."

    # common preamble patterns to skip
    skip_patterns = [
        "i'll apply", "i will apply", "okay", "ok,", "sure,", "let me",
        "i'll run", "i will run", "applying", "running", "here's",
        "---",  # markdown dividers
    ]

    lines = [l.strip() for l in content.split("\n") if l.strip()]

    # find first substantive line (not preamble, not just punctuation/dividers)
    for line in lines:
        line_lower = line.lower()
        # skip if it matches preamble patterns
        if any(line_lower.startswith(p) for p in skip_patterns):
            continue
        # skip markdown headers that are just skill names
        if line.startswith("#") and len(line) < 30:
            continue
        # skip very short lines (likely dividers)
        if len(line) < 10:
            continue
        # found a substantive line
        if len(line) <= max_len:
            return line
        return line[:max_len - 3] + "..."

    # fallback to first line if nothing matched
    first_line = lines[0] if lines else content[:max_len]
    if len(first_line) <= max_len:
        return first_line
    return first_line[:max_len - 3] + "..."


def _extract_json_summary(content: str) -> Optional[str]:
    """Extract summary from JSON canvas artifact if present."""
    import re

    # Try to extract JSON from markdown code block
    json_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', content)
    json_str = json_match.group(1) if json_match else None

    # Or try direct JSON if content starts with {
    if not json_str and content.strip().startswith('{'):
        json_str = content.strip()

    if not json_str:
        return None

    try:
        parsed = json.loads(json_str)
        if isinstance(parsed, dict) and 'summary' in parsed:
            return parsed['summary']
    except json.JSONDecodeError:
        pass

    return None


# --- templates ---

@dataclass
class CanvasTemplate:
    """template for creating new canvases with predefined structure."""
    name: str
    description: str
    root_content: str
    # list of (operation_name, parent_index) where parent_index refers to position in creation order
    # 0 = root, 1 = first child, etc.
    operations: list[tuple[str, int]] = field(default_factory=list)


# built-in templates
BUILTIN_TEMPLATES: dict[str, CanvasTemplate] = {
    "blank": CanvasTemplate(
        name="Blank",
        description="Empty canvas with just a root goal",
        root_content="",
        operations=[],
    ),
    "feature": CanvasTemplate(
        name="Feature Spec",
        description="Plan a new feature: goal → requirements → edge cases → implementation",
        root_content="Feature: [describe the feature you want to build]",
        operations=[
            ("@excavate", 0),  # surface assumptions from root
        ],
    ),
    "bug": CanvasTemplate(
        name="Bug Investigation",
        description="Investigate a bug: symptom → hypotheses → tests → fix",
        root_content="Bug: [describe the unexpected behavior]",
        operations=[
            ("@excavate", 0),  # surface hidden assumptions
            ("@stressify", 0),  # probe for failure modes
        ],
    ),
    "decision": CanvasTemplate(
        name="Decision Analysis",
        description="Analyze a decision: options → tradeoffs → recommendation",
        root_content="Decision: [describe what you need to decide]",
        operations=[
            ("@diverge", 0),   # generate alternatives
            ("@dimensionalize", 0),  # map to measurable dimensions
        ],
    ),
    "refactor": CanvasTemplate(
        name="Refactoring Plan",
        description="Plan a refactor: current state → problems → approach → risks",
        root_content="Refactor: [describe what code needs refactoring and why]",
        operations=[
            ("@excavate", 0),  # surface hidden dependencies
            ("@stressify", 0),  # identify risks
            ("@simulate", 0),  # trace execution forward
        ],
    ),
}


def list_templates() -> list[CanvasTemplate]:
    """list all available templates."""
    return list(BUILTIN_TEMPLATES.values())


def get_template(name: str) -> Optional[CanvasTemplate]:
    """get a template by name."""
    return BUILTIN_TEMPLATES.get(name)


# --- canvas management ---

def get_canvas_dir() -> Path:
    """get the default canvas storage directory."""
    canvas_dir = Path.home() / ".future-tokenizer"
    old_dir = Path.home() / ".runeforge-canvas"
    if old_dir.exists() and not canvas_dir.exists():
        old_dir.rename(canvas_dir)
    canvas_dir.mkdir(parents=True, exist_ok=True)
    return canvas_dir


def list_saved_canvases() -> list[dict]:
    """list all saved canvases with metadata.

    returns list of dicts with: name, path, created_at, node_count, modified_at
    """
    canvas_dir = get_canvas_dir()
    canvases = []

    for path in canvas_dir.glob("*.json"):
        if path.name.startswith("."):
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            canvases.append({
                "name": data.get("name", path.stem),
                "path": str(path),
                "created_at": data.get("created_at", ""),
                "node_count": len(data.get("nodes", {})),
                "modified_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
            })
        except (json.JSONDecodeError, KeyError):
            # skip invalid files
            continue

    # sort by modified time, most recent first
    canvases.sort(key=lambda x: x["modified_at"], reverse=True)
    return canvases


def get_most_recent_canvas() -> Optional[Path]:
    """get path to most recently modified canvas."""
    canvases = list_saved_canvases()
    if canvases:
        return Path(canvases[0]["path"])
    return None
