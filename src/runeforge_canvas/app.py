"""runeforge canvas: main textual application.

graph-based thinking environment for runeforge skills.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

from textual.app import App, ComposeResult
from textual.containers import Vertical
from textual.widgets import Header, Footer, Static, Input
from textual.binding import Binding

from .models import Canvas, CanvasNode
from .skills import SkillLoader, Skill, get_default_loader
from .client import ClaudeClient
from .widgets.minimap import Minimap, NodeClicked
from .widgets.path import ActivePath
from .widgets.operations import OperationsPanel, RunOperation, AddNote


class RuneforgeCanvas(App):
    """main application."""

    TITLE = "runeforge canvas"

    CSS = """
    Screen {
        layout: vertical;
    }

    #main-container {
        height: 1fr;
    }

    #spinner {
        display: none;
        text-align: center;
        padding: 1;
        background: $surface;
    }

    #spinner.visible {
        display: block;
    }

    #start-prompt {
        height: auto;
        padding: 1;
        border: solid $primary;
        margin: 1;
    }

    #start-prompt-label {
        margin-bottom: 1;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "quit"),
        Binding("s", "save", "save"),
        Binding("e", "export", "export"),
        Binding("n", "new_canvas", "new"),
        Binding("escape", "focus_operations", "operations"),
    ]

    def __init__(
        self,
        canvas_path: Optional[Path] = None,
        skills_dir: Optional[Path] = None,
    ):
        super().__init__()
        self.canvas_path = canvas_path
        self.skill_loader = SkillLoader(skills_dir) if skills_dir else get_default_loader(full=False)
        self.skills: list[Skill] = []
        self.canvas = Canvas(name="untitled")
        self._client: Optional[ClaudeClient] = None
        self._running_op = False

    def compose(self) -> ComposeResult:
        """compose the app layout."""
        yield Header()

        with Vertical(id="main-container"):
            # spinner overlay (hidden by default)
            yield Static("running operation...", id="spinner")

            # start prompt (shown when no root)
            with Vertical(id="start-prompt"):
                yield Static("what are you trying to build?", id="start-prompt-label")
                yield Input(placeholder="describe your goal or paste a rough plan...", id="root-input")

            # minimap
            yield Minimap(self.canvas, id="minimap")

            # active path
            yield ActivePath(self.canvas, id="active-path")

            # operations panel
            yield OperationsPanel(self.skills, id="operations")

        yield Footer()

    async def on_mount(self) -> None:
        """initialize on mount."""
        # load skills
        self.skills = self.skill_loader.list_skills()

        # update operations panel with loaded skills
        ops = self.query_one("#operations", OperationsPanel)
        ops.skills = self.skills
        ops.refresh(recompose=True)

        # load canvas if path provided
        if self.canvas_path and self.canvas_path.exists():
            self.canvas = Canvas.load(self.canvas_path)
            self._hide_start_prompt()
            self._refresh_all()
        else:
            # show start prompt
            self._show_start_prompt()

        # initialize client
        self._client = ClaudeClient()
        await self._client.__aenter__()

    async def on_unmount(self) -> None:
        """cleanup on unmount."""
        if self._client:
            await self._client.__aexit__(None, None, None)

        # auto-save
        if self.canvas_path and self.canvas.root_id:
            self.canvas.save(self.canvas_path)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """handle root input submission."""
        if event.input.id == "root-input":
            content = event.input.value.strip()
            if content:
                self._create_root(content)

    def _create_root(self, content: str) -> None:
        """create the root node."""
        root = CanvasNode.create_root(content)
        self.canvas.add_node(root)
        self._hide_start_prompt()
        self._refresh_all()

    def _show_start_prompt(self) -> None:
        """show the start prompt, hide canvas widgets."""
        self.query_one("#start-prompt").display = True
        self.query_one("#minimap").display = False
        self.query_one("#active-path").display = False
        self.query_one("#operations").display = False
        self.query_one("#root-input", Input).focus()

    def _hide_start_prompt(self) -> None:
        """hide the start prompt, show canvas widgets."""
        self.query_one("#start-prompt").display = False
        self.query_one("#minimap").display = True
        self.query_one("#active-path").display = True
        self.query_one("#operations").display = True

    def on_node_clicked(self, event: NodeClicked) -> None:
        """handle node click in minimap."""
        self.canvas.set_focus(event.node_id)
        self._refresh_all()

    async def on_run_operation(self, event: RunOperation) -> None:
        """handle operation button click."""
        if self._running_op:
            return

        skill = self.skill_loader.get(event.skill_name)
        if not skill:
            self.notify(f"skill not found: {event.skill_name}", severity="error")
            return

        focus = self.canvas.get_focus_node()
        if not focus:
            self.notify("no node focused", severity="warning")
            return

        await self._run_operation(skill, focus)

    async def _run_operation(self, skill: Skill, focus: CanvasNode) -> None:
        """run a skill operation on the focused node."""
        self._running_op = True
        self._show_spinner()

        try:
            # gather context
            context_nodes = self.canvas.get_context_for_operation(focus.id)
            context_text = self._format_context(context_nodes)

            # build prompt
            prompt = skill.build_prompt(context_text)

            # call api
            if not self._client:
                raise RuntimeError("client not initialized")

            result = await self._client.complete(prompt)

            # create new node
            new_node = CanvasNode.create_operation(
                operation=skill.display_name,
                content=result,
                parent_id=focus.id,
                context_snapshot=[n.id for n in context_nodes],
            )
            self.canvas.add_node(new_node)
            self.canvas.set_focus(new_node.id)

            self._refresh_all()
            self._auto_save()

        except Exception as e:
            self.notify(f"operation failed: {e}", severity="error")

        finally:
            self._running_op = False
            self._hide_spinner()

    def _format_context(self, nodes: list[CanvasNode]) -> str:
        """format context nodes as text for the prompt."""
        parts = []
        for node in nodes:
            if node.operation:
                parts.append(f"[{node.operation}]\n{node.content_full}")
            else:
                parts.append(node.content_full)
        return "\n\n---\n\n".join(parts)

    def on_add_note(self, event: AddNote) -> None:
        """handle note addition."""
        focus = self.canvas.get_focus_node()
        if not focus:
            self.notify("no node focused", severity="warning")
            return

        note = CanvasNode.create_note(event.content, focus.id)
        self.canvas.add_node(note)
        self.canvas.set_focus(note.id)

        self._refresh_all()
        self._auto_save()

    def _show_spinner(self) -> None:
        """show the spinner overlay."""
        self.query_one("#spinner").add_class("visible")

    def _hide_spinner(self) -> None:
        """hide the spinner overlay."""
        self.query_one("#spinner").remove_class("visible")

    def _refresh_all(self) -> None:
        """refresh all canvas widgets."""
        self.query_one("#minimap", Minimap).refresh_canvas(self.canvas)
        self.query_one("#active-path", ActivePath).refresh_path(self.canvas)

    def _auto_save(self) -> None:
        """auto-save if path is set."""
        if self.canvas_path:
            self.canvas.save(self.canvas_path)

    def action_save(self) -> None:
        """save the canvas."""
        if not self.canvas_path:
            # default to ~/.runeforge-canvas/{name}.json
            save_dir = Path.home() / ".runeforge-canvas"
            save_dir.mkdir(parents=True, exist_ok=True)
            self.canvas_path = save_dir / f"{self.canvas.name}.json"

        self.canvas.save(self.canvas_path)
        self.notify(f"saved to {self.canvas_path}")

    def action_new_canvas(self) -> None:
        """start a new canvas."""
        self.canvas = Canvas(name="untitled")
        self.canvas_path = None
        self._show_start_prompt()

    def action_export(self) -> None:
        """export the active path as flattened text (copies to clipboard)."""
        if not self.canvas.active_path:
            self.notify("nothing to export", severity="warning")
            return

        lines = self._flatten_path()
        text = "\n\n".join(lines)

        # copy to clipboard via pyperclip or just save to file
        export_path = Path.home() / ".runeforge-canvas" / "export.md"
        export_path.parent.mkdir(parents=True, exist_ok=True)
        export_path.write_text(text)

        self.notify(f"exported to {export_path}")

    def _flatten_path(self) -> list[str]:
        """flatten the active path to linear text."""
        lines = []
        for node_id in self.canvas.active_path:
            node = self.canvas.nodes.get(node_id)
            if not node:
                continue

            if node.operation:
                lines.append(f"## {node.operation}\n\n{node.content_full}")
            else:
                lines.append(node.content_full)

        return lines

    def action_focus_operations(self) -> None:
        """focus the operations panel."""
        ops = self.query_one("#operations", OperationsPanel)
        first_button = ops.query("Button").first()
        if first_button:
            first_button.focus()


def run(canvas_path: Optional[str] = None, skills_dir: Optional[str] = None) -> None:
    """run the runeforge canvas app."""
    app = RuneforgeCanvas(
        canvas_path=Path(canvas_path) if canvas_path else None,
        skills_dir=Path(skills_dir) if skills_dir else None,
    )
    app.run()


if __name__ == "__main__":
    run()
