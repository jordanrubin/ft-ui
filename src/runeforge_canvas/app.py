"""runeforge canvas: main textual application.

graph-based thinking environment for runeforge skills.
"""

from __future__ import annotations

import asyncio
import subprocess
import shutil
from pathlib import Path
from typing import Optional

from textual.app import App, ComposeResult
from textual.containers import Vertical
from textual.widgets import Header, Footer, Static, Input
from textual.binding import Binding

from .models import Canvas, CanvasNode
from .skills import SkillLoader, Skill, SkillChain, get_default_loader
from .client import ClaudeClient
from .widgets.minimap import Minimap, NodeClicked
from .widgets.path import ActivePath
from .widgets.operations import OperationsPanel, RunOperation, RunChain, AddNote


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
        Binding("l", "load", "load"),
        Binding("e", "export", "export"),
        Binding("x", "execute", "execute"),
        Binding("r", "review", "review"),
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
        self._last_execution: Optional[Path] = None  # path to last execution log

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
        # save first before any cleanup that might fail
        self._auto_save()

        # cleanup client - wrap in try/except to avoid runtime errors on quit
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception:
                pass  # ignore cleanup errors on quit

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
        self._auto_save()  # save immediately after root creation

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

    async def on_run_chain(self, event: RunChain) -> None:
        """handle skill chain submission."""
        if self._running_op:
            return

        focus = self.canvas.get_focus_node()
        if not focus:
            self.notify("no node focused", severity="warning")
            return

        # parse chain
        try:
            chain = SkillChain.parse(event.chain_text)
            resolved = self.skill_loader.resolve_chain(chain)
        except ValueError as e:
            self.notify(str(e), severity="error")
            return

        await self._run_chain(resolved, focus, chain.display_name)

    async def _run_chain(
        self,
        chain: list[tuple[Skill, dict]],
        focus: CanvasNode,
        chain_name: str,
    ) -> None:
        """run a chain of skills, passing output as input to next."""
        self._running_op = True
        self._show_spinner()

        try:
            # gather initial context
            context_nodes = self.canvas.get_context_for_operation(focus.id)
            context_text = self._format_context(context_nodes)

            # run each skill in sequence
            current_input = context_text
            results = []

            for skill, params in chain:
                prompt = skill.build_prompt(current_input, params)

                if not self._client:
                    raise RuntimeError("client not initialized")

                result = await self._client.complete(prompt)
                results.append(f"## {skill.display_name}\n\n{result}")

                # output becomes input for next skill
                current_input = result

            # create single node with combined results
            combined = "\n\n---\n\n".join(results)
            new_node = CanvasNode.create_operation(
                operation=chain_name,
                content=combined,
                parent_id=focus.id,
                context_snapshot=[n.id for n in context_nodes],
            )
            self.canvas.add_node(new_node)
            self.canvas.set_focus(new_node.id)

            self._refresh_all()
            self._auto_save()

        except Exception as e:
            self.notify(f"chain failed: {e}", severity="error")

        finally:
            self._running_op = False
            self._hide_spinner()

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
        """auto-save after every change. creates default path if needed."""
        if not self.canvas.root_id:
            return  # nothing to save

        if not self.canvas_path:
            # create default path based on first few words of root
            save_dir = Path.home() / ".runeforge-canvas"
            save_dir.mkdir(parents=True, exist_ok=True)

            # generate name from root content
            root = self.canvas.nodes.get(self.canvas.root_id)
            if root:
                words = root.content_compressed.split()[:3]
                name = "-".join(w.lower()[:10] for w in words if w.isalnum() or w[0].isalnum())
                name = name or "untitled"
            else:
                name = "untitled"

            self.canvas_path = save_dir / f"{name}.json"
            self.canvas.name = name

        try:
            self.canvas.save(self.canvas_path)
        except Exception as e:
            self.notify(f"auto-save failed: {e}", severity="error")

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

    def action_load(self) -> None:
        """load a canvas from ~/.runeforge-canvas/."""
        save_dir = Path.home() / ".runeforge-canvas"
        if not save_dir.exists():
            self.notify("no saved canvases found", severity="warning")
            return

        # list available canvases
        canvases = sorted(save_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not canvases:
            self.notify("no saved canvases found", severity="warning")
            return

        # load most recent
        most_recent = canvases[0]
        try:
            self.canvas = Canvas.load(most_recent)
            self.canvas_path = most_recent
            self._hide_start_prompt()
            self._refresh_all()
            self.notify(f"loaded {most_recent.name}")

            # show other available canvases
            if len(canvases) > 1:
                others = ", ".join(c.stem for c in canvases[1:5])
                self.notify(f"other canvases: {others}...", severity="information")
        except Exception as e:
            self.notify(f"failed to load: {e}", severity="error")

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

    def action_execute(self) -> None:
        """execute the plan in claude code."""
        if not self.canvas.active_path:
            self.notify("nothing to execute", severity="warning")
            return

        # check claude is available
        if not shutil.which("claude"):
            self.notify("claude command not found - install claude code first", severity="error")
            return

        # flatten plan to markdown
        lines = self._flatten_path()
        plan_text = "\n\n".join(lines)

        # create execution directory
        exec_dir = Path.home() / ".runeforge-canvas" / "executions"
        exec_dir.mkdir(parents=True, exist_ok=True)

        # write plan file
        import time
        timestamp = int(time.time())
        plan_path = exec_dir / f"plan-{timestamp}.md"
        plan_path.write_text(plan_text)

        # write execution log path (claude will write here)
        log_path = exec_dir / f"exec-{timestamp}.log"
        self._last_execution = log_path

        # build prompt for claude
        prompt = f"""execute this plan:

{plan_text}

work through each step. if you encounter issues, note them but continue.
when done, summarize what was completed vs what diverged from the plan."""

        # spawn claude in new terminal
        # use subprocess to run claude with the prompt
        try:
            # write prompt to temp file for claude to read
            prompt_path = exec_dir / f"prompt-{timestamp}.txt"
            prompt_path.write_text(prompt)

            # spawn claude with --print flag to capture output
            # run in background, redirect output to log
            subprocess.Popen(
                f'claude --print "{prompt}" 2>&1 | tee "{log_path}"',
                shell=True,
                cwd=str(Path.cwd()),
                start_new_session=True,
            )

            self.notify(f"executing plan... log: {log_path}")

        except Exception as e:
            self.notify(f"failed to spawn claude: {e}", severity="error")

    def action_review(self) -> None:
        """review the last execution, surface divergences."""
        if not self._last_execution:
            self.notify("no execution to review - press x first", severity="warning")
            return

        if not self._last_execution.exists():
            self.notify("execution log not found yet - still running?", severity="warning")
            return

        # read execution log
        try:
            log_content = self._last_execution.read_text()
        except Exception as e:
            self.notify(f"failed to read log: {e}", severity="error")
            return

        if not log_content.strip():
            self.notify("execution log is empty - still running?", severity="warning")
            return

        # create a review node as child of current focus
        focus = self.canvas.get_focus_node()
        if not focus:
            self.notify("no node focused", severity="warning")
            return

        # create review node with execution results
        review_content = f"""## execution review

### log
```
{log_content[:2000]}{'...(truncated)' if len(log_content) > 2000 else ''}
```

### divergences
(analyze above for plan vs actual differences)
"""

        review_node = CanvasNode.create_note(review_content, focus.id)
        self.canvas.add_node(review_node)
        self.canvas.set_focus(review_node.id)

        self._refresh_all()
        self._auto_save()
        self.notify("review node created - expand to see execution log")


def run(canvas_path: Optional[str] = None, skills_dir: Optional[str] = None) -> None:
    """run the runeforge canvas app."""
    app = RuneforgeCanvas(
        canvas_path=Path(canvas_path) if canvas_path else None,
        skills_dir=Path(skills_dir) if skills_dir else None,
    )
    app.run()


if __name__ == "__main__":
    run()
