"""operations panel: grid of skill buttons.

click to apply a skill to the focused node.
"""

from __future__ import annotations

from textual.containers import Horizontal, Vertical
from textual.widgets import Button, Static, Input
from textual.message import Message

from ..skills import Skill


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


class OperationsPanel(Vertical):
    """grid of operation buttons + note input."""

    DEFAULT_CSS = """
    OperationsPanel {
        height: auto;
        max-height: 30%;
        padding: 1;
        border: solid $surface-lighten-2;
    }

    OperationsPanel .op-row {
        height: auto;
        margin-bottom: 1;
    }

    OperationsPanel .op-button {
        min-width: 16;
        margin: 0 1 0 0;
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
        yield Static("operations", classes="label")

        # operation buttons in rows of 4
        row_skills: list[Skill] = []
        for skill in self.skills:
            row_skills.append(skill)
            if len(row_skills) == 4:
                yield from self._make_row(row_skills)
                row_skills = []

        if row_skills:
            yield from self._make_row(row_skills)

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
        yield Static("add note", classes="label")
        with Horizontal(classes="note-row"):
            yield Input(
                placeholder="type a note...",
                id="note-input",
                classes="note-input",
            )
            yield Button("add", id="add-note", classes="note-button")

    def _make_row(self, skills: list[Skill]):
        """make a row of skill buttons."""
        with Horizontal(classes="op-row"):
            for skill in skills:
                yield Button(
                    skill.display_name,
                    id=f"op-{skill.name}",
                    classes="op-button",
                    tooltip=skill.description[:80] if skill.description else None,
                )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """handle button press."""
        btn_id = event.button.id or ""

        if btn_id.startswith("op-"):
            skill_name = btn_id[3:]  # strip "op-" prefix
            self.post_message(RunOperation(skill_name))
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
