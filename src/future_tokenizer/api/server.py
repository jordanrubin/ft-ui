"""fastapi server for future tokenizer.

exposes core operations as REST endpoints for react frontend.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from ..core.models import (
    Canvas,
    CanvasNode,
    NodeType,
    list_saved_canvases,
    get_canvas_dir,
    get_most_recent_canvas,
    list_templates,
    get_template,
)
from ..core.skills import SkillLoader, SkillChain, get_default_loader
from ..core.client import ClaudeClient, MockClient, ClientProtocol, CompletionResult


# --- configuration ---

DEFAULT_AUTOSAVE_INTERVAL = 30  # seconds
SESSION_FILE = ".ft-session.json"


# --- pydantic models for api ---

class NodeCreate(BaseModel):
    """request to create a node."""
    content: str
    parent_id: str
    type: str = "note"  # "note" or "operation"
    operation: Optional[str] = None


class SkillRun(BaseModel):
    """request to run a skill."""
    skill_name: str
    node_id: str
    params: dict = {}
    answers: dict[str, str] = {}  # subsection_id -> user answer (from askuserquestions)


class ChainRun(BaseModel):
    """request to run a skill chain."""
    chain_text: str
    node_id: str


class SkillRunOnSelection(BaseModel):
    """request to run a skill on selected content."""
    skill_name: str
    node_id: str
    selected_content: str
    params: dict = {}
    answers: dict[str, str] = {}  # subsection_id -> user answer


class SkillRunOnMultiple(BaseModel):
    """request to run a skill on multiple nodes."""
    skill_name: str
    node_ids: list[str]
    params: dict = {}


class ChatRun(BaseModel):
    """request to run freeform chat."""
    prompt: str
    node_id: str
    enable_web_search: bool = False


class CanvasCreate(BaseModel):
    """request to create a new canvas."""
    name: str
    root_content: str
    template: Optional[str] = None  # template name to use
    skip_auto_response: bool = False  # skip initial chat generation (do it async)


class NodeEdit(BaseModel):
    """request to edit a node."""
    content: str


class SearchRequest(BaseModel):
    """request to search canvas."""
    query: str
    case_sensitive: bool = False
    use_regex: bool = False


class LinkRequest(BaseModel):
    """request to add/remove a link."""
    from_id: str
    to_id: str


class NodeResponse(BaseModel):
    """node in api response."""
    id: str
    type: str
    content_full: str
    content_compressed: str
    operation: Optional[str]
    parent_id: Optional[str]
    children_ids: list[str]
    links_to: list[str]
    excluded: bool = False
    source_ids: list[str] = []
    invocation_target: Optional[str] = None
    invocation_prompt: Optional[str] = None
    used_web_search: bool = False
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0

    @classmethod
    def from_node(cls, node: CanvasNode) -> "NodeResponse":
        return cls(
            id=node.id,
            type=node.type.value,
            content_full=node.content_full,
            content_compressed=node.content_compressed,
            operation=node.operation,
            parent_id=node.parent_id,
            children_ids=node.children_ids,
            links_to=node.links_to,
            excluded=node.excluded,
            source_ids=node.source_ids,
            invocation_target=node.invocation_target,
            invocation_prompt=node.invocation_prompt,
            used_web_search=getattr(node, 'used_web_search', False),
            input_tokens=getattr(node, 'input_tokens', 0),
            output_tokens=getattr(node, 'output_tokens', 0),
            cost_usd=getattr(node, 'cost_usd', 0.0),
        )


class CanvasResponse(BaseModel):
    """canvas in api response."""
    name: str
    nodes: dict[str, NodeResponse]
    root_id: Optional[str]
    active_path: list[str]
    can_undo: bool
    can_redo: bool
    is_dirty: bool = False
    last_saved_at: Optional[str] = None
    canvas_path: Optional[str] = None
    source_directory: Optional[str] = None
    source_file: Optional[str] = None

    @classmethod
    def from_canvas(cls, canvas: Canvas, is_dirty: bool = False, last_saved_at: Optional[str] = None, canvas_path: Optional[Path] = None) -> "CanvasResponse":
        return cls(
            name=canvas.name,
            nodes={k: NodeResponse.from_node(v) for k, v in canvas.nodes.items()},
            root_id=canvas.root_id,
            active_path=canvas.active_path,
            can_undo=canvas.can_undo(),
            can_redo=canvas.can_redo(),
            is_dirty=is_dirty,
            last_saved_at=last_saved_at,
            canvas_path=str(canvas_path) if canvas_path else None,
            source_directory=canvas.source_directory,
            source_file=canvas.source_file,
        )


class CanvasListItem(BaseModel):
    """canvas summary for listing."""
    name: str
    path: str
    created_at: str
    modified_at: str
    node_count: int


class TemplateInfo(BaseModel):
    """template info for listing."""
    name: str
    display_name: str
    description: str


class StatisticsResponse(BaseModel):
    """canvas statistics."""
    total_nodes: int
    max_depth: int
    branch_count: int
    leaf_count: int
    node_types: dict[str, int]
    operations_used: dict[str, int]
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost_usd: float = 0.0


class SkillInfo(BaseModel):
    """skill info for listing."""
    name: str
    display_name: str
    description: str


# --- app state ---

class AppState:
    """shared application state with auto-save and crash recovery."""

    def __init__(
        self,
        skills_dir: Optional[str] = None,
        mock: bool = False,
        autosave_interval: int = DEFAULT_AUTOSAVE_INTERVAL,
    ):
        self.canvas: Optional[Canvas] = None
        self.canvas_path: Optional[Path] = None
        self.skill_loader = get_default_loader(skills_dir)
        self.mock = mock
        self._client: Optional[ClientProtocol] = None

        # Dirty state tracking
        self._dirty = False
        self._last_saved_at: Optional[str] = None

        # Auto-save configuration
        self.autosave_interval = autosave_interval
        self._autosave_task: Optional[asyncio.Task] = None

    @property
    def client(self) -> ClientProtocol:
        if self._client is None:
            if self.mock:
                self._client = MockClient()
            else:
                self._client = ClaudeClient()
        return self._client

    @property
    def is_dirty(self) -> bool:
        """check if canvas has unsaved changes."""
        return self._dirty

    def mark_dirty(self) -> None:
        """mark canvas as having unsaved changes."""
        self._dirty = True

    def mark_clean(self) -> None:
        """mark canvas as saved."""
        self._dirty = False
        self._last_saved_at = datetime.now().isoformat()

    def format_context(self, nodes: list[CanvasNode]) -> str:
        """format context nodes as text for the prompt."""
        parts = []
        for node in nodes:
            if node.operation:
                parts.append(f"[{node.operation}]\n{node.content_full}")
            else:
                parts.append(node.content_full)
        return "\n\n---\n\n".join(parts)

    def get_session_file(self) -> Path:
        """get path to session state file."""
        return get_canvas_dir() / SESSION_FILE

    def save_session(self) -> None:
        """save current session state for crash recovery."""
        session = {
            "canvas_path": str(self.canvas_path) if self.canvas_path else None,
            "canvas_name": self.canvas.name if self.canvas else None,
            "last_saved_at": self._last_saved_at,
            "timestamp": datetime.now().isoformat(),
        }
        try:
            with open(self.get_session_file(), "w") as f:
                json.dump(session, f)
        except Exception:
            pass  # Don't crash on session save failure

    def load_session(self) -> Optional[dict]:
        """load previous session state."""
        try:
            with open(self.get_session_file()) as f:
                return json.load(f)
        except Exception:
            return None

    def auto_save(self) -> bool:
        """auto-save canvas if dirty and path is set. returns True if saved."""
        if not self._dirty or not self.canvas or not self.canvas_path:
            return False
        try:
            self.canvas.save(self.canvas_path)
            self.mark_clean()
            self.save_session()
            return True
        except Exception:
            return False

    async def start_autosave(self) -> None:
        """start background auto-save task."""
        if self._autosave_task is not None:
            return
        self._autosave_task = asyncio.create_task(self._autosave_loop())

    async def stop_autosave(self) -> None:
        """stop background auto-save task."""
        if self._autosave_task:
            self._autosave_task.cancel()
            try:
                await self._autosave_task
            except asyncio.CancelledError:
                pass
            self._autosave_task = None

    async def _autosave_loop(self) -> None:
        """background loop for auto-saving."""
        while True:
            await asyncio.sleep(self.autosave_interval)
            if self.auto_save():
                pass  # Successfully auto-saved

    def recover_from_crash(self) -> bool:
        """attempt to recover canvas from last session. returns True if recovered."""
        session = self.load_session()
        if not session:
            return False

        # Try to load the canvas from the session
        canvas_path = session.get("canvas_path")
        if canvas_path:
            path = Path(canvas_path)
            if path.exists():
                try:
                    self.canvas = Canvas.load(path)
                    self.canvas_path = path
                    self._dirty = False
                    return True
                except Exception:
                    pass

        # Fallback: try to load most recent canvas
        recent = get_most_recent_canvas()
        if recent and recent.exists():
            try:
                self.canvas = Canvas.load(recent)
                self.canvas_path = recent
                self._dirty = False
                return True
            except Exception:
                pass

        return False


state = AppState()


def _canvas_response() -> CanvasResponse:
    """helper to build CanvasResponse with current state info."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")
    return CanvasResponse.from_canvas(
        state.canvas,
        is_dirty=state.is_dirty,
        last_saved_at=state._last_saved_at,
        canvas_path=state.canvas_path,
    )


# --- lifespan ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup: recover from crash and start auto-save
    state.recover_from_crash()
    await state.start_autosave()
    yield
    # shutdown: save any pending changes
    state.auto_save()
    await state.stop_autosave()


# --- app ---

app = FastAPI(
    title="future tokenizer api",
    description="REST API for future tokenizer graph-based thinking",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- endpoints ---

@app.get("/health")
async def health():
    """health check."""
    return {"status": "ok"}


@app.get("/status")
async def status():
    """get current application status including dirty state and session info."""
    return {
        "has_canvas": state.canvas is not None,
        "canvas_name": state.canvas.name if state.canvas else None,
        "canvas_path": str(state.canvas_path) if state.canvas_path else None,
        "is_dirty": state.is_dirty,
        "last_saved_at": state._last_saved_at,
        "autosave_interval": state.autosave_interval,
        "node_count": len(state.canvas.nodes) if state.canvas else 0,
    }


@app.get("/skills", response_model=list[SkillInfo])
async def list_skills():
    """list available skills."""
    return [
        SkillInfo(
            name=s.name,
            display_name=s.display_name,
            description=s.description,
        )
        for s in state.skill_loader.list_skills()
    ]


@app.post("/canvas", response_model=CanvasResponse)
async def create_canvas(req: CanvasCreate):
    """create a new canvas with optional auto-generated initial response."""
    state.canvas = Canvas(name=req.name)
    root = CanvasNode.create_root(req.root_content)
    state.canvas.add_node(root)
    # set new canvas_path so we don't overwrite old canvas
    safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in req.name)
    state.canvas_path = get_canvas_dir() / f"{safe_name}.json"

    state.mark_dirty()
    state.save_session()

    # skip auto response if requested (frontend will trigger it separately)
    if req.skip_auto_response:
        return _canvas_response()

    # auto-generate initial response to give user something to work with
    try:
        initial_prompt = f"""the user wants to explore something. here's their initial description:

{req.root_content}

---

you may include brief thinking first if helpful, then provide your response.

FORMAT:
[optional preamble - plain prose only, NO numbered lists or **bold** formatting]

---
ITEMS:
1. **Title** - description [badge]
2. **Title** - description
...

COMPRESSION RULES (for ITEMS section only):
- Max 3-4 items
- Title: 5 words max
- Description: 20 words max
- Badge (optional): add [tag] at end for emphasis, e.g. [high], [crux], [uncertainty], [recommended], [risk]
- Every item must pass: "Would I expand this? Is this a crux?"

IMPORTANT: Only the ITEMS section should use numbered **bold** formatting. The preamble must be plain prose."""

        result = await state.client.complete(initial_prompt)

        initial_node = CanvasNode.create_operation(
            operation="chat",
            content=result.text,
            parent_id=root.id,
            context_snapshot=[root.id],
            invocation_target=req.root_content[:500],
            invocation_prompt="[auto] initial analysis",
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cache_read_tokens=result.cache_read_tokens,
            cache_creation_tokens=result.cache_creation_tokens,
            cost_usd=result.cost_usd,
        )
        state.canvas.add_node(initial_node)
        state.canvas.set_focus(initial_node.id)
        state.mark_dirty()
        state.save_session()
    except Exception:
        # if auto-response fails, just return canvas with root only
        pass

    return _canvas_response()


class PlanFileInfo(BaseModel):
    """info about a plan file."""
    name: str
    path: str
    modified_at: str
    size_bytes: int


@app.get("/plans", response_model=list[PlanFileInfo])
async def list_plan_files():
    """list available plan files from ~/.claude/plans/."""
    plans_dir = Path.home() / ".claude" / "plans"
    if not plans_dir.exists():
        return []

    plans = []
    for f in plans_dir.glob("*.md"):
        stat = f.stat()
        plans.append(PlanFileInfo(
            name=f.stem,
            path=str(f),
            modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            size_bytes=stat.st_size,
        ))

    # sort by modified time, newest first
    plans.sort(key=lambda p: p.modified_at, reverse=True)
    return plans


class CanvasFromPlan(BaseModel):
    """request to create canvas from a plan file."""
    plan_path: str
    canvas_name: Optional[str] = None  # defaults to plan filename


@app.post("/canvas/from-plan", response_model=CanvasResponse)
async def create_canvas_from_plan(req: CanvasFromPlan):
    """create a new canvas from an existing markdown plan file."""
    plan_path = Path(req.plan_path).expanduser()
    if not plan_path.exists():
        raise HTTPException(status_code=404, detail=f"plan file not found: {req.plan_path}")

    content = plan_path.read_text()
    name = req.canvas_name or plan_path.stem

    state.canvas = Canvas(name=name)
    root = CanvasNode.create_root(content)
    state.canvas.add_node(root)
    # set new canvas_path so we don't overwrite old canvas
    safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in name)
    state.canvas_path = get_canvas_dir() / f"{safe_name}.json"
    state.mark_dirty()
    state.save_session()
    return _canvas_response()


class CanvasFromDirectory(BaseModel):
    """request to create canvas from a directory."""
    directory_path: str
    canvas_name: Optional[str] = None
    include_contents: bool = False  # include key file contents
    max_depth: int = 4


def _generate_tree(path: Path, prefix: str = "", depth: int = 0, max_depth: int = 4) -> list[str]:
    """generate a directory tree as list of lines."""
    if depth > max_depth:
        return []

    lines = []
    # skip common non-essential directories
    skip_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.egg-info', '.pytest_cache', '.mypy_cache'}
    skip_extensions = {'.pyc', '.pyo', '.so', '.o', '.a'}

    try:
        items = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
    except PermissionError:
        return []

    # filter items
    items = [i for i in items if i.name not in skip_dirs and i.suffix not in skip_extensions and not i.name.startswith('.')]

    for i, item in enumerate(items):
        is_last = i == len(items) - 1
        connector = "└── " if is_last else "├── "
        lines.append(f"{prefix}{connector}{item.name}")

        if item.is_dir():
            extension = "    " if is_last else "│   "
            lines.extend(_generate_tree(item, prefix + extension, depth + 1, max_depth))

    return lines


def _get_key_files(path: Path) -> list[tuple[str, str]]:
    """get contents of key files in a directory."""
    key_patterns = [
        "README.md", "README", "readme.md",
        "pyproject.toml", "package.json", "Cargo.toml",
        "CLAUDE.md", "claude.md",
    ]
    key_files = []

    for pattern in key_patterns:
        fp = path / pattern
        if fp.exists() and fp.is_file():
            try:
                content = fp.read_text()[:2000]  # limit size
                key_files.append((pattern, content))
            except Exception:
                pass

    return key_files


@app.post("/canvas/from-directory", response_model=CanvasResponse)
async def create_canvas_from_directory(req: CanvasFromDirectory):
    """create a new canvas from a directory structure."""
    dir_path = Path(req.directory_path).expanduser().resolve()
    if not dir_path.exists():
        raise HTTPException(status_code=404, detail=f"directory not found: {req.directory_path}")
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail=f"not a directory: {req.directory_path}")

    name = req.canvas_name or dir_path.name

    # generate content
    lines = [f"# {name}", "", "## Structure", "```"]
    lines.append(dir_path.name + "/")
    lines.extend(_generate_tree(dir_path, "", 0, req.max_depth))
    lines.append("```")

    if req.include_contents:
        key_files = _get_key_files(dir_path)
        if key_files:
            lines.append("")
            lines.append("## Key Files")
            for fname, content in key_files:
                lines.append("")
                lines.append(f"### {fname}")
                lines.append("```")
                lines.append(content)
                lines.append("```")

    content = "\n".join(lines)

    state.canvas = Canvas(name=name)
    state.canvas.source_directory = str(dir_path)  # track source for refresh
    root = CanvasNode.create_root(content)
    state.canvas.add_node(root)
    state.canvas_path = _get_unique_canvas_path(name)
    state.mark_dirty()
    state.save_session()
    return _canvas_response()


# --- file extensions considered text-readable ---
_TEXT_EXTENSIONS = {
    ".md", ".txt", ".csv", ".json", ".toml", ".yaml", ".yml",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".rs", ".go", ".java",
    ".c", ".cpp", ".h", ".hpp", ".rb", ".sh", ".bash", ".zsh",
    ".html", ".css", ".scss", ".xml", ".sql", ".lua", ".r",
    ".swift", ".kt", ".scala", ".pl", ".pm", ".el", ".clj",
    ".hs", ".erl", ".ex", ".exs", ".vim", ".conf", ".cfg",
    ".ini", ".env", ".dockerfile", ".makefile", ".cmake",
    ".tf", ".hcl", ".nix", ".dhall",
}

_MAX_FILE_CHARS = 50_000


def _read_file_content(path: Path) -> str:
    """Read file content for canvas ingestion.

    Supports text files, code files, and PDFs.
    Raises ValueError for unsupported binary files.
    """
    suffix = path.suffix.lower()

    # PDF extraction
    if suffix == ".pdf":
        try:
            import pdfplumber
        except ImportError:
            raise ValueError("pdfplumber is required for PDF files: pip install pdfplumber")
        pages = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)
        return "\n---\n".join(pages)[:_MAX_FILE_CHARS]

    # Text-readable files
    if suffix in _TEXT_EXTENSIONS:
        return path.read_text(errors="replace")[:_MAX_FILE_CHARS]

    # Try reading as text for unknown extensions — reject if binary
    try:
        content = path.read_text(errors="strict")
        return content[:_MAX_FILE_CHARS]
    except (UnicodeDecodeError, ValueError):
        raise ValueError(f"Unsupported file type: {suffix}")


class CanvasFromFile(BaseModel):
    """request to create canvas from a single file."""
    file_path: str
    canvas_name: Optional[str] = None


@app.post("/canvas/from-file", response_model=CanvasResponse)
async def create_canvas_from_file(req: CanvasFromFile):
    """create a new canvas from a single file."""
    file_path = Path(req.file_path).expanduser().resolve()
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"file not found: {req.file_path}")
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail=f"not a file: {req.file_path}")

    try:
        content = _read_file_content(file_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    name = req.canvas_name or file_path.stem

    # Format content with filename header
    lines = [f"# {file_path.name}", ""]
    if file_path.suffix.lower() in (".md", ".txt", ".csv"):
        lines.append(content)
    else:
        lines.append(f"```{file_path.suffix.lstrip('.')}")
        lines.append(content)
        lines.append("```")

    formatted_content = "\n".join(lines)

    # Auto-save current canvas before creating new one
    state.auto_save()

    state.canvas = Canvas(name=name)
    state.canvas.source_file = str(file_path)
    root = CanvasNode.create_root(formatted_content)
    state.canvas.add_node(root)
    state.canvas_path = _get_unique_canvas_path(name)
    state.mark_dirty()
    state.save_session()
    return _canvas_response()


@app.post("/canvas/from-upload", response_model=CanvasResponse)
async def create_canvas_from_upload(
    file: UploadFile = File(...),
    canvas_name: Optional[str] = Form(None),
):
    """create a new canvas from an uploaded file."""
    original_filename = file.filename or "upload"
    suffix = Path(original_filename).suffix

    # Save upload to temp file (preserving extension for _read_file_content)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)

    try:
        content = _read_file_content(tmp_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)

    name = canvas_name or Path(original_filename).stem

    # Format content with filename header (same logic as from-file)
    lines = [f"# {original_filename}", ""]
    if suffix.lower() in (".md", ".txt", ".csv"):
        lines.append(content)
    else:
        lines.append(f"```{suffix.lstrip('.')}")
        lines.append(content)
        lines.append("```")

    formatted_content = "\n".join(lines)

    state.auto_save()

    state.canvas = Canvas(name=name)
    state.canvas.source_file = original_filename
    root = CanvasNode.create_root(formatted_content)
    state.canvas.add_node(root)
    state.canvas_path = _get_unique_canvas_path(name)
    state.mark_dirty()
    state.save_session()
    return _canvas_response()


@app.get("/canvas", response_model=CanvasResponse)
async def get_canvas():
    """get current canvas state."""
    return _canvas_response()


@app.post("/canvas/refresh-root", response_model=CanvasResponse)
async def refresh_root_from_directory():
    """refresh root node content from source directory or file."""
    if state.canvas.source_file:
        # Re-read from source file
        file_path = Path(state.canvas.source_file)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"source file not found: {file_path}")

        try:
            content = _read_file_content(file_path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        lines = [f"# {file_path.name}", ""]
        if file_path.suffix.lower() in (".md", ".txt", ".csv"):
            lines.append(content)
        else:
            lines.append(f"```{file_path.suffix.lstrip('.')}")
            lines.append(content)
            lines.append("```")

        new_content = "\n".join(lines)
    elif state.canvas.source_directory:
        dir_path = Path(state.canvas.source_directory)
        if not dir_path.exists():
            raise HTTPException(status_code=404, detail=f"source directory not found: {dir_path}")

        # regenerate content using same logic as from-directory
        lines = [f"# {state.canvas.name}", "", "## Structure", "```"]
        lines.append(dir_path.name + "/")
        lines.extend(_generate_tree(dir_path, "", 0, 3))  # default max_depth
        lines.append("```")

        key_files = _get_key_files(dir_path)
        if key_files:
            lines.append("")
            lines.append("## Key Files")
            for fname, content in key_files:
                lines.append("")
                lines.append(f"### {fname}")
                lines.append("```")
                lines.append(content)
                lines.append("```")

        new_content = "\n".join(lines)
    else:
        raise HTTPException(
            status_code=400,
            detail="canvas has no source directory or file"
        )

    # update root node
    if state.canvas.root_id and state.canvas.root_id in state.canvas.nodes:
        root = state.canvas.nodes[state.canvas.root_id]
        root.content_full = new_content
        root.content_compressed = new_content[:state.canvas.compress_length]
        state.mark_dirty()

    return _canvas_response()


@app.post("/canvas/load")
async def load_canvas(path: str):
    """load canvas from file."""
    # Auto-save current canvas before loading new one
    state.auto_save()

    p = Path(path).expanduser()
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"file not found: {path}")
    state.canvas = Canvas.load(p)
    state.canvas_path = p
    state.mark_clean()
    state.save_session()
    return _canvas_response()


def _get_unique_canvas_path(name: str) -> Path:
    """get a unique path for a canvas, appending number if name exists."""
    safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in name)
    base_path = get_canvas_dir() / f"{safe_name}.json"

    if not base_path.exists():
        return base_path

    # Find unique name with suffix
    counter = 2
    while True:
        path = get_canvas_dir() / f"{safe_name}-{counter}.json"
        if not path.exists():
            return path
        counter += 1


@app.post("/canvas/save")
async def save_canvas(path: Optional[str] = None):
    """save canvas to file."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")
    p = Path(path).expanduser() if path else state.canvas_path
    if not p:
        # Generate default path from canvas name
        p = get_canvas_dir() / f"{state.canvas.name}.json"
    state.canvas.save(p)
    state.canvas_path = p
    state.mark_clean()
    state.save_session()
    return {"saved": str(p), "is_dirty": False}


@app.post("/canvas/rename")
async def rename_canvas(new_name: str):
    """rename current canvas."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    old_path = state.canvas_path
    state.canvas.name = new_name
    new_path = _get_unique_canvas_path(new_name)
    state.canvas.save(new_path)
    state.canvas_path = new_path

    # Delete old file if it exists and is different
    if old_path and old_path.exists() and old_path != new_path:
        old_path.unlink()

    state.mark_clean()
    state.save_session()
    return _canvas_response()


@app.delete("/canvas")
async def delete_canvas(path: str):
    """delete a saved canvas file."""
    p = Path(path).expanduser()
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"canvas not found: {path}")

    # If deleting current canvas, clear state
    if state.canvas_path and state.canvas_path == p:
        state.canvas = Canvas(name="untitled")
        state.canvas_path = None
        state.mark_clean()

    p.unlink()
    return {"deleted": str(p)}


@app.post("/node", response_model=NodeResponse)
async def create_node(req: NodeCreate):
    """create a new node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if req.type == "note":
        node = CanvasNode.create_note(req.content, req.parent_id)
    elif req.type == "operation":
        node = CanvasNode.create_operation(
            operation=req.operation or "manual",
            content=req.content,
            parent_id=req.parent_id,
            context_snapshot=[],
        )
    else:
        raise HTTPException(status_code=400, detail=f"invalid type: {req.type}")

    state.canvas.add_node(node)
    state.canvas.set_focus(node.id)
    state.mark_dirty()
    return NodeResponse.from_node(node)


@app.delete("/node/{node_id}")
async def delete_node(node_id: str):
    """delete a node and descendants."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    new_focus = state.canvas.delete_node(node_id)
    if new_focus is None and node_id == state.canvas.root_id:
        raise HTTPException(status_code=400, detail="cannot delete root node")

    state.mark_dirty()
    return {"deleted": node_id, "new_focus": new_focus}


@app.post("/focus/{node_id}")
async def set_focus(node_id: str):
    """set focus to a node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if node_id not in state.canvas.nodes:
        raise HTTPException(status_code=404, detail=f"node not found: {node_id}")

    state.canvas.set_focus(node_id)
    return {"focus": node_id, "active_path": state.canvas.active_path}


@app.post("/skill/run", response_model=NodeResponse)
async def run_skill(req: SkillRun):
    """run a skill on a node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    mode = req.params.pop("mode", None) if "mode" in req.params else None
    skill = state.skill_loader.get_with_mode(req.skill_name, mode)
    if not skill:
        raise HTTPException(status_code=404, detail=f"skill not found: {req.skill_name}")

    focus = state.canvas.nodes.get(req.node_id)
    if not focus:
        raise HTTPException(status_code=404, detail=f"node not found: {req.node_id}")

    # gather context
    context_nodes = state.canvas.get_context_for_operation(focus.id)
    context_text = state.format_context(context_nodes)

    # include user answers if provided (from askuserquestions responses)
    if req.answers:
        answer_text = "\n\n--- USER ANSWERS ---\n"
        for q_id, answer in req.answers.items():
            answer_text += f"- {q_id}: {answer}\n"
        context_text += answer_text

    # build prompt and call api
    prompt = skill.build_prompt(context_text, req.params)
    result = await state.client.complete(prompt)

    # create result node with invocation tracking
    new_node = CanvasNode.create_operation(
        operation=skill.display_name,
        content=result.text,
        parent_id=focus.id,
        context_snapshot=[n.id for n in context_nodes],
        invocation_target=context_text[:500] + ("..." if len(context_text) > 500 else ""),
        invocation_prompt=skill.display_name,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_creation_tokens=result.cache_creation_tokens,
        cost_usd=result.cost_usd,
    )
    state.canvas.add_node(new_node)
    state.canvas.set_focus(new_node.id)
    state.mark_dirty()

    return NodeResponse.from_node(new_node)


@app.post("/skill/run-on-selection", response_model=NodeResponse)
async def run_skill_on_selection(req: SkillRunOnSelection):
    """run a skill on selected content from a node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    mode = req.params.pop("mode", None) if "mode" in req.params else None
    skill = state.skill_loader.get_with_mode(req.skill_name, mode)
    if not skill:
        raise HTTPException(status_code=404, detail=f"skill not found: {req.skill_name}")

    focus = state.canvas.nodes.get(req.node_id)
    if not focus:
        raise HTTPException(status_code=404, detail=f"node not found: {req.node_id}")

    # gather tree context (root → ... → focus node)
    context_nodes = state.canvas.get_context_for_operation(focus.id)
    context_text = state.format_context(context_nodes)

    # include user answers if provided
    if req.answers:
        answer_text = "\n\n--- USER ANSWERS ---\n"
        for q_id, answer in req.answers.items():
            answer_text += f"- {q_id}: {answer}\n"
        context_text += answer_text

    # combine tree context with selection directive
    combined_context = f"""{context_text}

<directive>
FOCUS: Apply this skill ONLY to the selected content below. The tree context above is provided for background understanding. Your response should be about the selection, not the broader document.
</directive>

<selection>
{req.selected_content}
</selection>"""

    prompt = skill.build_prompt(combined_context, req.params)
    result = await state.client.complete(prompt)

    # create result node with invocation tracking
    new_node = CanvasNode.create_operation(
        operation=skill.display_name,
        content=result.text,
        parent_id=focus.id,
        context_snapshot=[n.id for n in context_nodes],
        invocation_target=req.selected_content[:500] + ("..." if len(req.selected_content) > 500 else ""),
        invocation_prompt=skill.display_name,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_creation_tokens=result.cache_creation_tokens,
        cost_usd=result.cost_usd,
    )
    state.canvas.add_node(new_node)
    state.canvas.set_focus(new_node.id)
    state.mark_dirty()

    return NodeResponse.from_node(new_node)


@app.post("/skill/run-on-multiple", response_model=NodeResponse)
async def run_skill_on_multiple(req: SkillRunOnMultiple):
    """run a skill on multiple selected nodes."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    mode = req.params.pop("mode", None) if "mode" in req.params else None
    skill = state.skill_loader.get_with_mode(req.skill_name, mode)
    if not skill:
        raise HTTPException(status_code=404, detail=f"skill not found: {req.skill_name}")

    if not req.node_ids:
        raise HTTPException(status_code=400, detail="no nodes specified")

    # validate all nodes exist
    for node_id in req.node_ids:
        if node_id not in state.canvas.nodes:
            raise HTTPException(status_code=404, detail=f"node not found: {node_id}")

    # gather context from all selected nodes
    context_nodes = state.canvas.get_context_for_multiple_nodes(req.node_ids)
    context_text = state.format_context(context_nodes)

    # build prompt with multi-node context
    multi_node_context = f"""<multi-node-selection count="{len(req.node_ids)}">
The following context includes {len(req.node_ids)} selected nodes that the user wants you to analyze together.
</multi-node-selection>

{context_text}"""

    prompt = skill.build_prompt(multi_node_context, req.params)
    result = await state.client.complete(prompt)

    # create result node as child of the first selected node
    parent_id = req.node_ids[0]
    new_node = CanvasNode.create_operation(
        operation=skill.display_name,
        content=result.text,
        parent_id=parent_id,
        context_snapshot=[n.id for n in context_nodes],
        invocation_target=context_text[:500] + ("..." if len(context_text) > 500 else ""),
        invocation_prompt=f"{skill.display_name} on {len(req.node_ids)} nodes",
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_creation_tokens=result.cache_creation_tokens,
        cost_usd=result.cost_usd,
    )
    state.canvas.add_node(new_node)
    state.canvas.set_focus(new_node.id)
    state.mark_dirty()

    return NodeResponse.from_node(new_node)


@app.post("/chain/run", response_model=NodeResponse)
async def run_chain(req: ChainRun):
    """run a skill chain on a node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    focus = state.canvas.nodes.get(req.node_id)
    if not focus:
        raise HTTPException(status_code=404, detail=f"node not found: {req.node_id}")

    # parse chain
    try:
        chain = SkillChain.parse(req.chain_text)
        resolved = state.skill_loader.resolve_chain(chain)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # gather context
    context_nodes = state.canvas.get_context_for_operation(focus.id)
    context_text = state.format_context(context_nodes)

    # run chain — accumulate tokens across steps
    current_input = context_text
    results = []
    total_input_tokens = 0
    total_output_tokens = 0
    total_cache_read = 0
    total_cache_creation = 0
    total_cost = 0.0

    for skill, params in resolved:
        prompt = skill.build_prompt(current_input, params)
        result = await state.client.complete(prompt)
        results.append(f"## {skill.display_name}\n\n{result.text}")
        current_input = result.text
        total_input_tokens += result.input_tokens
        total_output_tokens += result.output_tokens
        total_cache_read += result.cache_read_tokens
        total_cache_creation += result.cache_creation_tokens
        total_cost += result.cost_usd

    # create result node with invocation tracking
    combined = "\n\n---\n\n".join(results)
    new_node = CanvasNode.create_operation(
        operation=chain.display_name,
        content=combined,
        parent_id=focus.id,
        context_snapshot=[n.id for n in context_nodes],
        invocation_target=context_text[:500] + ("..." if len(context_text) > 500 else ""),
        invocation_prompt=chain.display_name,
        input_tokens=total_input_tokens,
        output_tokens=total_output_tokens,
        cache_read_tokens=total_cache_read,
        cache_creation_tokens=total_cache_creation,
        cost_usd=total_cost,
    )
    state.canvas.add_node(new_node)
    state.canvas.set_focus(new_node.id)
    state.mark_dirty()

    return NodeResponse.from_node(new_node)


@app.post("/chat/run", response_model=NodeResponse)
async def run_chat(req: ChatRun):
    """run freeform chat on a node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    focus = state.canvas.nodes.get(req.node_id)
    if not focus:
        raise HTTPException(status_code=404, detail=f"node not found: {req.node_id}")

    # gather context
    context_nodes = state.canvas.get_context_for_operation(focus.id)
    context_text = state.format_context(context_nodes)

    # build prompt
    web_search_note = """
you have access to the WebSearch tool. use it to look up current information when the user's question requires up-to-date facts, recent events, or information you're uncertain about.""" if req.enable_web_search else ""

    prompt = f"""here is the current discussion context:

{context_text}

---

user question: {req.prompt}
{web_search_note}

you may include brief thinking/reasoning first if helpful, then provide your response.

FORMAT:
[optional preamble - plain prose only, NO numbered lists or **bold** formatting]

---
ITEMS:
1. **Title** - description [badge]
2. **Title** - description [badge, badge2]
...

COMPRESSION RULES (for ITEMS section only):
- Max 5 items (3 is better)
- Title: 5 words max
- Description: 20 words max
- Badge (optional): add [tag] at end for emphasis, e.g. [high], [crux], [uncertainty], [recommended], [risk], [opportunity]
- Every item must pass: "Would I expand this? Is this a crux?"

IMPORTANT: Only the ITEMS section should use numbered **bold** formatting. The preamble must be plain prose."""

    result = await state.client.complete(prompt, enable_web_search=req.enable_web_search)

    # create result node with invocation tracking
    new_node = CanvasNode.create_operation(
        operation="chat",
        content=result.text,
        parent_id=focus.id,
        context_snapshot=[n.id for n in context_nodes],
        invocation_target=context_text[:500] + ("..." if len(context_text) > 500 else ""),
        invocation_prompt=req.prompt,
        used_web_search=req.enable_web_search,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_creation_tokens=result.cache_creation_tokens,
        cost_usd=result.cost_usd,
    )
    state.canvas.add_node(new_node)
    state.canvas.set_focus(new_node.id)
    state.mark_dirty()

    return NodeResponse.from_node(new_node)


# --- canvas management endpoints ---

@app.get("/canvases", response_model=list[CanvasListItem])
async def list_canvases():
    """list all saved canvases."""
    return [
        CanvasListItem(
            name=c["name"],
            path=c["path"],
            created_at=c["created_at"],
            modified_at=c["modified_at"],
            node_count=c["node_count"],
        )
        for c in list_saved_canvases()
    ]


@app.get("/templates", response_model=list[TemplateInfo])
async def get_templates():
    """list available templates."""
    from ..core.models import BUILTIN_TEMPLATES
    return [
        TemplateInfo(
            name=key,
            display_name=t.name,
            description=t.description,
        )
        for key, t in BUILTIN_TEMPLATES.items()
    ]


@app.post("/canvas/from-template", response_model=CanvasResponse)
async def create_from_template(template_name: str, canvas_name: str):
    """create a new canvas from a template."""
    template = get_template(template_name)
    if not template:
        raise HTTPException(status_code=404, detail=f"template not found: {template_name}")

    state.canvas = Canvas(name=canvas_name)
    root = CanvasNode.create_root(template.root_content)
    state.canvas.add_node(root)
    state.canvas_path = get_canvas_dir() / f"{canvas_name}.json"
    state.mark_dirty()
    state.save_session()

    return _canvas_response()


# --- undo/redo endpoints ---

@app.post("/canvas/undo", response_model=CanvasResponse)
async def undo():
    """undo last action."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.undo():
        raise HTTPException(status_code=400, detail="nothing to undo")

    state.mark_dirty()
    return _canvas_response()


@app.post("/canvas/redo", response_model=CanvasResponse)
async def redo():
    """redo last undone action."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.redo():
        raise HTTPException(status_code=400, detail="nothing to redo")

    state.mark_dirty()
    return _canvas_response()


# --- node editing endpoints ---

@app.put("/node/{node_id}", response_model=NodeResponse)
async def edit_node(node_id: str, req: NodeEdit):
    """edit a node's content."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.edit_node(node_id, req.content):
        raise HTTPException(status_code=404, detail=f"node not found: {node_id}")

    state.mark_dirty()
    return NodeResponse.from_node(state.canvas.nodes[node_id])


# --- search endpoints ---

@app.post("/canvas/search", response_model=list[NodeResponse])
async def search_canvas(req: SearchRequest):
    """search canvas nodes."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if req.use_regex:
        results = state.canvas.search_regex(req.query)
    else:
        results = state.canvas.search(req.query, req.case_sensitive)

    return [NodeResponse.from_node(n) for n in results]


# --- sibling navigation endpoints ---

@app.get("/node/{node_id}/siblings", response_model=list[NodeResponse])
async def get_siblings(node_id: str):
    """get sibling nodes."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    siblings = state.canvas.get_siblings(node_id)
    return [NodeResponse.from_node(n) for n in siblings]


@app.get("/node/{node_id}/next-sibling", response_model=Optional[NodeResponse])
async def get_next_sibling(node_id: str):
    """get next sibling node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    sibling = state.canvas.get_next_sibling(node_id)
    return NodeResponse.from_node(sibling) if sibling else None


@app.get("/node/{node_id}/prev-sibling", response_model=Optional[NodeResponse])
async def get_prev_sibling(node_id: str):
    """get previous sibling node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    sibling = state.canvas.get_prev_sibling(node_id)
    return NodeResponse.from_node(sibling) if sibling else None


# --- cross-linking endpoints ---

@app.post("/link", response_model=NodeResponse)
async def add_link(req: LinkRequest):
    """add a cross-link between nodes."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.add_link(req.from_id, req.to_id):
        raise HTTPException(status_code=400, detail="could not add link (invalid nodes or already linked)")

    state.mark_dirty()
    return NodeResponse.from_node(state.canvas.nodes[req.from_id])


@app.delete("/link")
async def remove_link(from_id: str, to_id: str):
    """remove a cross-link between nodes."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.remove_link(from_id, to_id):
        raise HTTPException(status_code=400, detail="could not remove link")

    state.mark_dirty()
    return {"removed": True}


@app.get("/node/{node_id}/links", response_model=list[NodeResponse])
async def get_linked_nodes(node_id: str):
    """get nodes linked from this node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    linked = state.canvas.get_linked_nodes(node_id)
    return [NodeResponse.from_node(n) for n in linked]


@app.get("/node/{node_id}/backlinks", response_model=list[NodeResponse])
async def get_backlinks(node_id: str):
    """get nodes that link to this node."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    backlinks = state.canvas.get_backlinks(node_id)
    return [NodeResponse.from_node(n) for n in backlinks]


# --- statistics endpoint ---

@app.get("/canvas/statistics", response_model=StatisticsResponse)
async def get_statistics():
    """get canvas statistics."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    stats = state.canvas.get_statistics()
    return StatisticsResponse(**stats)


# --- export endpoints ---

@app.get("/canvas/export/markdown", response_class=PlainTextResponse)
async def export_markdown():
    """export canvas as markdown."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    return state.canvas.export_markdown()


@app.get("/canvas/export/mermaid", response_class=PlainTextResponse)
async def export_mermaid():
    """export canvas as mermaid flowchart."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    return state.canvas.export_mermaid()


@app.get("/canvas/export/outline", response_class=PlainTextResponse)
async def export_outline():
    """export canvas as plain text outline."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    return state.canvas.export_outline()


@app.get("/canvas/export/json")
async def export_json():
    """export canvas as JSON."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    return state.canvas.to_dict()


# --- node exclusion endpoint ---

@app.post("/node/{node_id}/toggle-exclude")
async def toggle_exclude(node_id: str):
    """toggle whether a node is excluded from plan synthesis."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    node = state.canvas.nodes.get(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"node not found: {node_id}")

    node.excluded = not node.excluded
    state.auto_save()
    return {"node_id": node_id, "excluded": node.excluded}


# --- plan synthesis endpoint ---

class PlanRequest(BaseModel):
    """request to synthesize a plan."""
    goal: Optional[str] = None  # override goal, else use root content
    save_to_claude: bool = True  # save to ~/.claude/plans/
    answers: dict[str, dict[str, str]] = {}  # node_id -> {subsection_id: answer}


@app.post("/canvas/synthesize-plan", response_model=NodeResponse)
async def synthesize_plan(req: PlanRequest):
    """synthesize all canvas thinking into a concrete Claude Code plan."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    source_ids: list[str] = []

    # gather all canvas content, skipping excluded nodes
    def gather_branch(node_id: str, depth: int = 0) -> str:
        node = state.canvas.nodes.get(node_id)
        if not node or node.excluded:
            return ""

        source_ids.append(node_id)

        indent = "  " * depth
        label = f"[{node.operation}]" if node.operation else f"[{node.type.value}]"
        content = node.content_full[:500] + "..." if len(node.content_full) > 500 else node.content_full

        lines = [f"{indent}{label}\n{indent}{content}"]

        # Include any user answers for this node
        if node_id in req.answers:
            node_answers = req.answers[node_id]
            if node_answers:
                answer_text = "\n".join([f"    [USER ANSWER] {q}: {a}" for q, a in node_answers.items()])
                lines.append(f"{indent}  USER RESPONSES:\n{answer_text}")

        for child_id in node.children_ids:
            child_content = gather_branch(child_id, depth + 1)
            if child_content:
                lines.append(child_content)
        return "\n\n".join(lines)

    root = state.canvas.nodes.get(state.canvas.root_id)
    if not root:
        raise HTTPException(status_code=400, detail="canvas has no root")

    full_tree = gather_branch(state.canvas.root_id)
    goal = req.goal or root.content_full

    # synthesize prompt
    prompt = f"""You have access to a tree of exploratory thinking about a goal. The tree includes:
- The original goal/thesis
- Antitheses (counterarguments, alternative viewpoints)
- Cruxes (key decision points, critical assumptions)
- Stress tests (failure modes, edge cases)
- Alternatives (different approaches)
- Various other analytical operations

Your task: Synthesize ALL of this thinking into a CONCRETE, LINEAR, ACTIONABLE PLAN.

The plan should:
1. Acknowledge key concerns raised in the analysis
2. Make explicit decisions where alternatives were considered
3. Include specific, numbered steps
4. Be directly executable (not more analysis)

GOAL:
{goal}

EXPLORATORY THINKING TREE:
{full_tree}

---

Output a markdown plan with this structure:

# Plan: [concise title]

## Context
[1-2 sentences on what was analyzed and key insights]

## Decisions Made
[Bullet list of key choices, referencing which concerns they address]

## Steps

1. **[Step title]**
   [Specific action with details]

2. **[Step title]**
   [Specific action with details]

[Continue with concrete steps...]

## Risks & Mitigations
[Brief list of remaining risks and how to handle them]

---

Generate the plan now:"""

    result = await state.client.complete(prompt)

    # create plan node
    plan_node = CanvasNode.create_plan(
        content=result.text,
        parent_id=state.canvas.root_id,
        source_ids=source_ids,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_creation_tokens=result.cache_creation_tokens,
        cost_usd=result.cost_usd,
    )
    state.canvas.add_node(plan_node)
    state.canvas.set_focus(plan_node.id)

    # save to Claude Code plans directory
    if req.save_to_claude:
        import re
        from datetime import datetime

        plans_dir = Path.home() / ".claude" / "plans"
        plans_dir.mkdir(parents=True, exist_ok=True)

        # generate slug from canvas name
        slug = re.sub(r'[^a-z0-9]+', '-', state.canvas.name.lower()).strip('-')
        timestamp = datetime.now().strftime("%Y%m%d-%H%M")
        filename = f"{slug}-{timestamp}.md"

        plan_path = plans_dir / filename
        plan_path.write_text(result.text)

        # add file path to response metadata
        plan_node.context_snapshot = [str(plan_path)]

    state.auto_save()
    return NodeResponse.from_node(plan_node)


# --- entrypoint ---

def main():
    """run the api server."""
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="future tokenizer api server")
    parser.add_argument("--host", default="0.0.0.0", help="host to bind")
    parser.add_argument("--port", "-p", type=int, default=8000, help="port to bind")
    parser.add_argument("--skills-dir", "-s", help="path to skills directory")
    parser.add_argument("--mock", "-m", action="store_true", help="use mock client")
    parser.add_argument("--reload", action="store_true", help="enable auto-reload")
    parser.add_argument(
        "--autosave-interval",
        type=int,
        default=DEFAULT_AUTOSAVE_INTERVAL,
        help=f"auto-save interval in seconds (default: {DEFAULT_AUTOSAVE_INTERVAL})"
    )
    parser.add_argument(
        "--no-autosave",
        action="store_true",
        help="disable auto-save"
    )

    args = parser.parse_args()

    # configure state
    global state
    autosave = 0 if args.no_autosave else args.autosave_interval
    state = AppState(
        skills_dir=args.skills_dir,
        mock=args.mock,
        autosave_interval=autosave,
    )

    uvicorn.run(
        "future_tokenizer.api.server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
