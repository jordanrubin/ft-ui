"""animated spinner widget for long-running operations."""

from __future__ import annotations

from textual.widgets import Static
from textual.reactive import reactive


# spinner frames for animation
SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
PROGRESS_BAR_WIDTH = 30


class Spinner(Static):
    """animated spinner with operation name and elapsed time."""

    DEFAULT_CSS = """
    Spinner {
        display: none;
        height: auto;
        padding: 1 2;
        background: $surface;
        border: tall $primary;
        text-align: center;
    }

    Spinner.visible {
        display: block;
    }

    Spinner .spinner-text {
        text-style: bold;
    }
    """

    frame_index = reactive(0)
    elapsed = reactive(0.0)
    operation_name = reactive("")

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._timer = None

    def render(self) -> str:
        """render spinner with animation."""
        if not self.operation_name:
            return ""

        frame = SPINNER_FRAMES[self.frame_index % len(SPINNER_FRAMES)]

        # build progress bar
        progress_pos = int(self.frame_index % PROGRESS_BAR_WIDTH)
        bar = list("─" * PROGRESS_BAR_WIDTH)
        bar[progress_pos] = "█"
        progress_bar = "".join(bar)

        # format elapsed time
        mins = int(self.elapsed // 60)
        secs = int(self.elapsed % 60)
        if mins > 0:
            time_str = f"{mins}m {secs}s"
        else:
            time_str = f"{secs}s"

        return f"{frame} {self.operation_name} {frame}\n\n[{progress_bar}]\n\n{time_str} elapsed"

    def start(self, operation_name: str) -> None:
        """start the spinner animation."""
        self.operation_name = operation_name
        self.elapsed = 0.0
        self.frame_index = 0
        self.add_class("visible")
        self._timer = self.set_interval(0.1, self._tick)

    def stop(self) -> None:
        """stop the spinner animation."""
        if self._timer:
            self._timer.stop()
            self._timer = None
        self.remove_class("visible")
        self.operation_name = ""

    def _tick(self) -> None:
        """update animation frame and elapsed time."""
        self.frame_index += 1
        self.elapsed += 0.1
