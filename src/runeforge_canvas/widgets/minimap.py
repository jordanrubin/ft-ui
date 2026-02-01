"""minimap widget: ascii tree visualization of the canvas graph.

click to change focus. shows structure at a glance.
"""

from __future__ import annotations

from textual.widgets import Static
from textual.message import Message
from rich.text import Text

from ..models import Canvas, CanvasNode, NodeType


class NodeClicked(Message):
    """message emitted when a node is clicked in the minimap."""

    def __init__(self, node_id: str) -> None:
        self.node_id = node_id
        super().__init__()


class Minimap(Static):
    """ascii tree minimap of the canvas graph."""

    DEFAULT_CSS = """
    Minimap {
        height: auto;
        min-height: 5;
        max-height: 40%;
        padding: 1;
        border: solid $surface-lighten-2;
    }
    """

    def __init__(self, canvas: Canvas, **kwargs) -> None:
        super().__init__(**kwargs)
        self.canvas = canvas
        self._node_positions: dict[str, tuple[int, int]] = {}  # node_id -> (row, col)

    def render(self) -> Text:
        """render the tree as ascii."""
        if not self.canvas.root_id:
            return Text("(empty canvas)", style="dim")

        lines: list[str] = []
        self._node_positions.clear()
        self._render_node(self.canvas.root_id, lines, prefix="", is_last=True, depth=0)

        # build styled text
        text = Text()
        active_set = set(self.canvas.active_path)

        for i, line in enumerate(lines):
            # find node id for this line (stored during render)
            node_id = None
            for nid, (row, _) in self._node_positions.items():
                if row == i:
                    node_id = nid
                    break

            if node_id and node_id in active_set:
                text.append(line + "\n", style="bold cyan")
            else:
                text.append(line + "\n", style="dim")

        return text

    def _render_node(
        self,
        node_id: str,
        lines: list[str],
        prefix: str,
        is_last: bool,
        depth: int,
    ) -> None:
        """recursively render a node and its children."""
        node = self.canvas.nodes.get(node_id)
        if not node:
            return

        # store position for click detection
        row = len(lines)
        self._node_positions[node_id] = (row, len(prefix))

        # build node label
        connector = "└─" if is_last else "├─"
        if depth == 0:
            connector = ""

        label = self._node_label(node)
        lines.append(f"{prefix}{connector}[{label}]")

        # recurse to children
        child_prefix = prefix + ("  " if is_last else "│ ")
        children = node.children_ids
        for i, child_id in enumerate(children):
            self._render_node(
                child_id,
                lines,
                child_prefix if depth > 0 else "",
                is_last=(i == len(children) - 1),
                depth=depth + 1,
            )

    def _node_label(self, node: CanvasNode) -> str:
        """generate a short label for a node."""
        if node.type == NodeType.ROOT:
            # first few words of content
            words = node.content_compressed.split()[:3]
            return " ".join(words)[:15]
        elif node.type == NodeType.OPERATION:
            return node.operation or "op"
        else:
            return "note"

    def on_click(self, event) -> None:
        """handle click to focus a node."""
        # find which node was clicked based on y position
        y = event.y
        for node_id, (row, _) in self._node_positions.items():
            if row == y:
                self.post_message(NodeClicked(node_id))
                return

    def refresh_canvas(self, canvas: Canvas) -> None:
        """update with new canvas state."""
        self.canvas = canvas
        self.refresh()
