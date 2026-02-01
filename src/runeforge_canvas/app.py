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
from .client import ClaudeClient, MockClient
from .widgets.minimap import Minimap, NodeClicked
from .widgets.path import ActivePath, NodeWidget
from .widgets.operations import OperationsPanel, RunOperation, RunChain, AddNote, RunChat
from .widgets.spinner import Spinner

import logging
logging.basicConfig(level=logging.DEBUG, filename="/tmp/runeforge-debug.log")

# retry settings for failed operations
MAX_RETRIES = 2
RETRY_DELAY = 1.0  # seconds


class RuneforgeCanvas(App):
    """main application."""

    TITLE = "runeforge canvas"
    SUB_TITLE = "~/.runeforge-canvas/"

    CSS = """
    Screen {
        layout: vertical;
    }

    #main-container {
        height: 1fr;
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
        Binding("d", "delete_node", "delete"),
        Binding("m", "focus_minimap", "minimap"),
        Binding("o", "toggle_expand", "expand"),
        Binding("escape", "focus_operations", "operations"),
    ]

    def __init__(
        self,
        canvas_path: Optional[Path] = None,
        skills_dir: Optional[Path] = None,
        mock: bool = False,
    ):
        super().__init__()
        self.canvas_path = canvas_path
        self.skill_loader = SkillLoader(skills_dir) if skills_dir else get_default_loader(full=False)
        self.skills: list[Skill] = []
        self.canvas = Canvas(name="untitled")
        self._mock = mock
        self._client: Optional[ClaudeClient | MockClient] = None
        self._running_op = False
        self._last_execution: Optional[Path] = None  # path to last execution log

    def compose(self) -> ComposeResult:
        """compose the app layout."""
        yield Header()

        with Vertical(id="main-container"):
            # animated spinner (hidden by default)
            yield Spinner(id="spinner")

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
            self.sub_title = str(self.canvas_path)
            self._hide_start_prompt()
            self._refresh_all()
        else:
            # show start prompt
            self._show_start_prompt()

        # initialize client
        logging.debug(f"mock mode: {self._mock}")
        if self._mock:
            logging.debug("using MockClient")
            # mock responses for all 10 public skills
            self._client = MockClient(
                responses={
                    "excavate": "## assumptions surfaced\n\n1. user wants simplicity over features\n2. mobile-first approach assumed\n3. budget constraints exist\n4. timeline is aggressive",
                    "antithesize": "## opposition\n\n**counter-thesis**: this approach optimizes for the wrong metric.\n\nthe real problem isn't what we think it is.\n\nalternative worldview: speed matters more than correctness here.",
                    "synthesize": "## synthesis\n\n**core insight**: balance simplicity with robustness.\n\nkey tradeoffs:\n- speed vs quality\n- features vs maintainability\n\n**decision**: start simple, add complexity only when needed.",
                    "dimensionalize": "## dimensions\n\n| dimension | score | notes |\n|-----------|-------|-------|\n| complexity | 3/5 | moderate |\n| risk | 2/5 | low |\n| impact | 4/5 | high |\n| effort | 3/5 | medium |",
                    "handlize": "## operational handles\n\n1. **deploy frequency** - can ship daily\n2. **rollback time** - under 5 min\n3. **error budget** - 0.1% acceptable\n4. **key metric** - time to first byte",
                    "inductify": "## patterns extracted\n\n1. all successful cases share: clear ownership\n2. failures correlate with: unclear requirements\n3. meta-pattern: simplicity wins long-term",
                    "metaphorization": "## metaphor\n\nthis is like **building a house**:\n- foundation = data model\n- walls = api layer\n- roof = ui\n- plumbing = auth flow",
                    "negspace": "## what's missing\n\n1. no error handling strategy\n2. no rollback plan\n3. security not addressed\n4. monitoring absent\n5. no user feedback loop",
                    "rhetoricize": "## rhetoric analysis\n\n**frame**: progress narrative\n**spin**: optimistic\n**hidden assumption**: tech solves all\n**counter-frame**: sustainability",
                    "rhyme": "## structural echo\n\nthis rhymes with:\n- oauth flow patterns\n- crud app architecture\n- event sourcing (partial)\n- microservices decomposition",
                },
                delay=0.5,  # simulate 0.5s API delay
            )
            self.notify("mock mode - no api calls", severity="warning")
        else:
            logging.debug("using real ClaudeClient")
            self._client = ClaudeClient()
        logging.debug(f"client type: {type(self._client).__name__}")
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
        logging.debug(f"node clicked: {event.node_id}")
        self.canvas.set_focus(event.node_id)
        self._refresh_all()
        self.notify(f"focused: {event.node_id[:8]}", timeout=1)

    async def on_run_operation(self, event: RunOperation) -> None:
        """handle operation button click."""
        logging.debug(f"on_run_operation called: {event.skill_name}")
        self.notify(f"running {event.skill_name}...", timeout=2)

        if self._running_op:
            logging.debug("already running an operation")
            return

        skill = self.skill_loader.get(event.skill_name)
        if not skill:
            self.notify(f"skill not found: {event.skill_name}", severity="error")
            return

        focus = self.canvas.get_focus_node()
        if not focus:
            self.notify("no node focused", severity="warning")
            return

        logging.debug(f"calling _run_operation with skill={skill.name}")
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

    async def on_run_chat(self, event: RunChat) -> None:
        """handle freeform chat prompt about focused node."""
        if self._running_op:
            return

        focus = self.canvas.get_focus_node()
        if not focus:
            self.notify("no node focused", severity="warning")
            return

        await self._run_chat(event.prompt, focus)

    async def _run_chat(self, user_prompt: str, focus: CanvasNode) -> None:
        """run a freeform chat turn on the focused node."""
        self._running_op = True
        self._show_spinner("thinking...")

        try:
            # gather context from the path
            context_nodes = self.canvas.get_context_for_operation(focus.id)
            context_text = self._format_context(context_nodes)

            # build a simple conversational prompt
            prompt = f"""here is the current discussion context:

{context_text}

---

user question: {user_prompt}

respond thoughtfully to the user's question about this context. be specific and reference the material above."""

            if not self._client:
                raise RuntimeError("client not initialized")

            result = await self._client.complete(prompt)

            # create a new node with the response
            # use operation type with "chat" label to distinguish from notes
            new_node = CanvasNode.create_operation(
                operation="chat",
                content=result,
                parent_id=focus.id,
                context_snapshot=[n.id for n in context_nodes],
            )
            self.canvas.add_node(new_node)
            self.canvas.set_focus(new_node.id)

            self._refresh_all()
            self._auto_save()
            self.notify("chat complete!", timeout=2)

        except Exception as e:
            self.notify(f"chat failed: {e}", severity="error")

        finally:
            self._running_op = False
            self._hide_spinner()

    async def _run_chain(
        self,
        chain: list[tuple[Skill, dict]],
        focus: CanvasNode,
        chain_name: str,
    ) -> None:
        """run a chain of skills, passing output as input to next."""
        self._running_op = True
        self._show_spinner(f"running {chain_name}")

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
        """run a skill operation on the focused node with retry logic."""
        logging.debug(f"_run_operation started: {skill.name}")
        self._running_op = True
        self._show_spinner(f"running {skill.display_name}")

        try:
            last_error: Optional[Exception] = None

            for attempt in range(MAX_RETRIES + 1):
                try:
                    # gather context
                    context_nodes = self.canvas.get_context_for_operation(focus.id)
                    context_text = self._format_context(context_nodes)

                    # build prompt
                    prompt = skill.build_prompt(context_text)

                    # call api
                    if not self._client:
                        raise RuntimeError("client not initialized")

                    if attempt > 0:
                        self.notify(f"retrying... (attempt {attempt + 1})", severity="warning")
                        await asyncio.sleep(RETRY_DELAY)

                    result = await self._client.complete(prompt)
                    logging.debug(f"got result: {result[:100] if result else 'EMPTY'}...")

                    # create new node
                    new_node = CanvasNode.create_operation(
                        operation=skill.display_name,
                        content=result,
                        parent_id=focus.id,
                        context_snapshot=[n.id for n in context_nodes],
                    )
                    self.canvas.add_node(new_node)
                    self.canvas.set_focus(new_node.id)
                    logging.debug(f"created node {new_node.id}")

                    self._refresh_all()
                    self._auto_save()
                    self.notify("operation complete!", timeout=2)
                    return  # success

                except Exception as e:
                    last_error = e
                    # log the error but continue retrying
                    if attempt < MAX_RETRIES:
                        self.notify(f"attempt {attempt + 1} failed: {e}", severity="warning")
                    continue

            # all retries exhausted
            self.notify(f"operation failed after {MAX_RETRIES + 1} attempts: {last_error}", severity="error")

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

    def _show_spinner(self, operation_name: str = "running operation") -> None:
        """show the animated spinner."""
        self.query_one("#spinner", Spinner).start(operation_name)

    def _hide_spinner(self) -> None:
        """hide the spinner."""
        self.query_one("#spinner", Spinner).stop()

    def _refresh_all(self) -> None:
        """refresh all canvas widgets."""
        self.query_one("#minimap", Minimap).refresh_canvas(self.canvas)
        self.query_one("#active-path", ActivePath).refresh_path(self.canvas)

    def _auto_save(self) -> None:
        """auto-save after every change. creates default path if needed."""
        if not self.canvas.root_id:
            return  # nothing to save

        is_new_path = False
        if not self.canvas_path:
            is_new_path = True
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
            if is_new_path:
                self.notify(f"saving to {self.canvas_path}")
                self.sub_title = str(self.canvas_path)
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

    def action_delete_node(self) -> None:
        """delete the focused node and its descendants."""
        focus = self.canvas.get_focus_node()
        if not focus:
            self.notify("no node focused", severity="warning")
            return

        if focus.id == self.canvas.root_id:
            self.notify("cannot delete root node", severity="warning")
            return

        # delete and get parent to focus
        parent_id = self.canvas.delete_node(focus.id)

        if parent_id:
            self.canvas.set_focus(parent_id)
            self.notify("node deleted")
        else:
            self.notify("delete failed", severity="error")

        self._refresh_all()
        self._auto_save()

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
            self.sub_title = str(most_recent)
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

    def action_focus_minimap(self) -> None:
        """focus the minimap for keyboard navigation."""
        minimap = self.query_one("#minimap", Minimap)
        minimap.focus()

    def action_toggle_expand(self) -> None:
        """toggle expansion of focused node in active path."""
        active_path = self.query_one("#active-path", ActivePath)
        # find the focused node widget and toggle it
        for widget in active_path.query(NodeWidget):
            if hasattr(widget, "is_focused") and widget.is_focused:
                widget.expanded = not widget.expanded
                self.notify("expanded" if widget.expanded else "collapsed", timeout=1)
                break

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


def run(canvas_path: Optional[str] = None, skills_dir: Optional[str] = None, mock: bool = False) -> None:
    """run the runeforge canvas app."""
    app = RuneforgeCanvas(
        canvas_path=Path(canvas_path) if canvas_path else None,
        skills_dir=Path(skills_dir) if skills_dir else None,
        mock=mock,
    )
    app.run()


if __name__ == "__main__":
    run()
