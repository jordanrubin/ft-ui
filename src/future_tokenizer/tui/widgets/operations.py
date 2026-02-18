"""operations panel: grid of skill buttons.

click to apply a skill to the focused node.
"""

from __future__ import annotations

from textual.containers import Horizontal, Vertical, Grid
from textual.widgets import Button, Static, Input
from textual.message import Message

from ...core.skills import Skill


class RunOperation(Message):
    """message emitted when an operation button is clicked."""

    def __init__(self, skill_name: str) -> None:
        self.skill_name = skill_name
        super().__init__()


class RunChain(Message):
    """message emitted when a skill chain is submitted."""

    def __init__(self, chain_text: str) -> None:
        self.chain_text = chain_text
        super().__init__()


class AddNote(Message):
    """message emitted when user submits a note."""

    def __init__(self, content: str) -> None:
        self.content = content
        super().__init__()


class RunChat(Message):
    """message emitted when user submits a freeform chat prompt."""

    def __init__(self, prompt: str) -> None:
        self.prompt = prompt
        super().__init__()


class OperationsPanel(Vertical, can_focus_children=True):
    """grid of operation buttons + note input."""

    GRID_COLS = 5  # must match grid-size in CSS

    DEFAULT_CSS = """
    OperationsPanel {
        height: auto;
        max-height: 50%;
        padding: 1;
        border: solid $surface-lighten-2;
        overflow-y: auto;
    }

    OperationsPanel .op-grid {
        grid-size: 5;
        grid-gutter: 1;
        height: auto;
        margin-bottom: 1;
    }

    OperationsPanel .op-button {
        min-width: 14;
    }

    OperationsPanel .note-row {
        height: auto;
        margin-top: 1;
    }

    OperationsPanel .note-input {
        width: 1fr;
    }

    OperationsPanel .note-button {
        min-width: 10;
    }

    OperationsPanel .label {
        margin-bottom: 1;
        text-style: bold;
    }
    """

    def __init__(self, skills: list[Skill], **kwargs) -> None:
        super().__init__(**kwargs)
        self.skills = skills

    def compose(self):
        """compose the operations grid."""
        yield Static("operations (use arrow keys to navigate, enter to run)", classes="label")

        # operation buttons in a grid - better keyboard navigation
        # use name attribute instead of id to avoid duplicate ID errors on recompose
        with Grid(classes="op-grid"):
            for skill in self.skills:
                btn = Button(skill.display_name, classes="op-button")
                btn.skill_name = skill.name  # store skill name as attribute
                yield btn

        # chat input - freeform prompts
        yield Static("chat (ask anything about the focused node)", classes="label")
        with Horizontal(classes="note-row"):
            yield Input(
                placeholder="expand on this... what about X?",
                id="chat-input",
                classes="note-input",
            )
            yield Button("ask", id="run-chat", classes="note-button")

        # chain input
        yield Static("chain (e.g. @excavate | @stressify)", classes="label")
        with Horizontal(classes="note-row"):
            yield Input(
                placeholder="@skill1 | @skill2(param=value)",
                id="chain-input",
                classes="note-input",
            )
            yield Button("run", id="run-chain", classes="note-button")

        # note input
        yield Static("add note (local, no API call)", classes="label")
        with Horizontal(classes="note-row"):
            yield Input(
                placeholder="type a note...",
                id="note-input",
                classes="note-input",
            )
            yield Button("add", id="add-note", classes="note-button")

    def on_key(self, event) -> None:
        """handle arrow keys for grid navigation."""
        key = event.key
        if key not in ("left", "right", "up", "down"):
            return

        idx = self._get_focused_index()
        if idx < 0:
            return

        if key == "right":
            self._focus_button(idx + 1)
            event.stop()
        elif key == "left":
            self._focus_button(idx - 1)
            event.stop()
        elif key == "down":
            self._focus_button(idx + self.GRID_COLS)
            event.stop()
        elif key == "up":
            self._focus_button(idx - self.GRID_COLS)
            event.stop()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """handle button press."""
        import logging
        btn = event.button
        btn_id = btn.id or ""
        logging.debug(f"button pressed: {btn_id} / {getattr(btn, 'skill_name', None)}")

        # check for skill button (has skill_name attribute)
        if hasattr(btn, "skill_name"):
            logging.debug(f"posting RunOperation for {btn.skill_name}")
            self.post_message(RunOperation(btn.skill_name))
        elif btn_id == "run-chat":
            self._submit_chat()
        elif btn_id == "run-chain":
            self._submit_chain()
        elif btn_id == "add-note":
            self._submit_note()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """handle enter in inputs."""
        if event.input.id == "note-input":
            self._submit_note()
        elif event.input.id == "chain-input":
            self._submit_chain()
        elif event.input.id == "chat-input":
            self._submit_chat()

    def _submit_chain(self) -> None:
        """submit the chain input."""
        chain_input = self.query_one("#chain-input", Input)
        chain_text = chain_input.value.strip()
        if chain_text:
            self.post_message(RunChain(chain_text))
            chain_input.value = ""

    def _submit_note(self) -> None:
        """submit the current note."""
        note_input = self.query_one("#note-input", Input)
        content = note_input.value.strip()
        if content:
            self.post_message(AddNote(content))
            note_input.value = ""

    def _submit_chat(self) -> None:
        """submit a freeform chat prompt."""
        chat_input = self.query_one("#chat-input", Input)
        prompt = chat_input.value.strip()
        if prompt:
            self.post_message(RunChat(prompt))
            chat_input.value = ""

    def _get_op_buttons(self) -> list[Button]:
        """get all operation buttons in order."""
        return list(self.query(".op-button"))

    def _get_focused_index(self) -> int:
        """get index of currently focused button, or -1."""
        buttons = self._get_op_buttons()
        focused = self.app.focused
        for i, btn in enumerate(buttons):
            if btn is focused:
                return i
        return -1

    def _focus_button(self, index: int) -> None:
        """focus button at index (with wrapping)."""
        buttons = self._get_op_buttons()
        if not buttons:
            return
        index = index % len(buttons)
        buttons[index].focus()
