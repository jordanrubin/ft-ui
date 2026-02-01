"""active path widget: renders the focused branch with full detail.

only the active path renders fully - this is what keeps us fast.
"""

from __future__ import annotations

from textual.containers import ScrollableContainer
from textual.widgets import Static
from textual.message import Message
from textual.reactive import reactive
from rich.markdown import Markdown
from rich.panel import Panel
from rich.text import Text

from ..models import Canvas, CanvasNode, NodeType


class NodeExpanded(Message):
    """message emitted when a node is expanded/collapsed."""

    def __init__(self, node_id: str, expanded: bool) -> None:
        self.node_id = node_id
        self.expanded = expanded
        super().__init__()


class NodeWidget(Static):
    """single node in the active path view."""

    DEFAULT_CSS = """
    NodeWidget {
        margin: 0 0 1 0;
        padding: 0;
    }

    NodeWidget.focused {
        border: solid $accent;
    }
    """

    expanded = reactive(False)

    def __init__(self, node: CanvasNode, is_focused: bool = False, **kwargs) -> None:
        super().__init__(**kwargs)
        self.node = node
        self.is_focused = is_focused
        if is_focused:
            self.add_class("focused")

    def render(self) -> Panel:
        """render the node as a panel."""
        # header with type/operation
        if self.node.type == NodeType.ROOT:
            title = "root"
            border_style = "blue"
        elif self.node.type == NodeType.OPERATION:
            title = self.node.operation or "@operation"
            border_style = "green"
        else:
            title = "note"
            border_style = "yellow"

        # content
        if self.expanded:
            content = Markdown(self.node.content_full)
        else:
            # show compressed with expand hint
            text = Text()
            text.append(self.node.content_compressed)
            if len(self.node.content_full) > len(self.node.content_compressed):
                text.append(" [click to expand]", style="dim italic")
            content = text

        return Panel(
            content,
            title=title,
            title_align="left",
            border_style=border_style if self.is_focused else "dim",
            padding=(0, 1),
        )

    def on_click(self) -> None:
        """toggle expanded state."""
        self.expanded = not self.expanded
        self.post_message(NodeExpanded(self.node.id, self.expanded))


class ActivePath(ScrollableContainer):
    """renders the focused branch with full detail."""

    DEFAULT_CSS = """
    ActivePath {
        height: 1fr;
        padding: 1;
        border: solid $surface-lighten-2;
    }
    """

    def __init__(self, canvas: Canvas, **kwargs) -> None:
        super().__init__(**kwargs)
        self.canvas = canvas
        self._expanded: set[str] = set()

    def compose(self):
        """compose the active path widgets."""
        if not self.canvas.active_path:
            yield Static("(no active path)", classes="dim")
            return

        focus_id = self.canvas.active_path[-1] if self.canvas.active_path else None

        for node_id in self.canvas.active_path:
            node = self.canvas.nodes.get(node_id)
            if node:
                widget = NodeWidget(
                    node,
                    is_focused=(node_id == focus_id),
                    id=f"node-{node_id}",
                )
                if node_id in self._expanded:
                    widget.expanded = True
                yield widget

    def on_node_expanded(self, event: NodeExpanded) -> None:
        """track expanded state."""
        if event.expanded:
            self._expanded.add(event.node_id)
        else:
            self._expanded.discard(event.node_id)

    def refresh_path(self, canvas: Canvas) -> None:
        """update with new canvas state, preserving expanded states."""
        self.canvas = canvas
        # remove all children and recompose
        self.remove_children()
        for widget in self.compose():
            self.mount(widget)
        self.scroll_end(animate=False)
