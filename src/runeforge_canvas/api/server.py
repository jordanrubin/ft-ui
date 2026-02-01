"""fastapi server for runeforge canvas.

exposes core operations as REST endpoints for react frontend.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from ..core.models import (
    Canvas,
    CanvasNode,
    NodeType,
    list_saved_canvases,
    get_canvas_dir,
    list_templates,
    get_template,
)
from ..core.skills import SkillLoader, SkillChain, get_default_loader
from ..core.client import ClaudeClient, MockClient, ClientProtocol


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


class ChainRun(BaseModel):
    """request to run a skill chain."""
    chain_text: str
    node_id: str


class ChatRun(BaseModel):
    """request to run freeform chat."""
    prompt: str
    node_id: str


class CanvasCreate(BaseModel):
    """request to create a new canvas."""
    name: str
    root_content: str
    template: Optional[str] = None  # template name to use


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
        )


class CanvasResponse(BaseModel):
    """canvas in api response."""
    name: str
    nodes: dict[str, NodeResponse]
    root_id: Optional[str]
    active_path: list[str]
    can_undo: bool
    can_redo: bool

    @classmethod
    def from_canvas(cls, canvas: Canvas) -> "CanvasResponse":
        return cls(
            name=canvas.name,
            nodes={k: NodeResponse.from_node(v) for k, v in canvas.nodes.items()},
            root_id=canvas.root_id,
            active_path=canvas.active_path,
            can_undo=canvas.can_undo(),
            can_redo=canvas.can_redo(),
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


class SkillInfo(BaseModel):
    """skill info for listing."""
    name: str
    display_name: str
    description: str


# --- app state ---

class AppState:
    """shared application state."""

    def __init__(self, skills_dir: Optional[str] = None, mock: bool = False):
        self.canvas: Optional[Canvas] = None
        self.canvas_path: Optional[Path] = None
        self.skill_loader = get_default_loader(skills_dir)
        self.mock = mock
        self._client: Optional[ClientProtocol] = None

    @property
    def client(self) -> ClientProtocol:
        if self._client is None:
            if self.mock:
                self._client = MockClient()
            else:
                self._client = ClaudeClient()
        return self._client

    def format_context(self, nodes: list[CanvasNode]) -> str:
        """format context nodes as text for the prompt."""
        parts = []
        for node in nodes:
            if node.operation:
                parts.append(f"[{node.operation}]\n{node.content_full}")
            else:
                parts.append(node.content_full)
        return "\n\n---\n\n".join(parts)


state = AppState()


# --- lifespan ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    yield
    # shutdown
    pass


# --- app ---

app = FastAPI(
    title="runeforge canvas api",
    description="REST API for runeforge canvas graph-based thinking",
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
    """create a new canvas."""
    state.canvas = Canvas(name=req.name)
    root = CanvasNode.create_root(req.root_content)
    state.canvas.add_node(root)
    return CanvasResponse.from_canvas(state.canvas)


@app.get("/canvas", response_model=CanvasResponse)
async def get_canvas():
    """get current canvas state."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")
    return CanvasResponse.from_canvas(state.canvas)


@app.post("/canvas/load")
async def load_canvas(path: str):
    """load canvas from file."""
    p = Path(path).expanduser()
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"file not found: {path}")
    state.canvas = Canvas.load(p)
    state.canvas_path = p
    return CanvasResponse.from_canvas(state.canvas)


@app.post("/canvas/save")
async def save_canvas(path: Optional[str] = None):
    """save canvas to file."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")
    p = Path(path).expanduser() if path else state.canvas_path
    if not p:
        raise HTTPException(status_code=400, detail="no path specified")
    state.canvas.save(p)
    state.canvas_path = p
    return {"saved": str(p)}


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
    return NodeResponse.from_node(node)


@app.delete("/node/{node_id}")
async def delete_node(node_id: str):
    """delete a node and descendants."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    new_focus = state.canvas.delete_node(node_id)
    if new_focus is None and node_id == state.canvas.root_id:
        raise HTTPException(status_code=400, detail="cannot delete root node")

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

    skill = state.skill_loader.get(req.skill_name)
    if not skill:
        raise HTTPException(status_code=404, detail=f"skill not found: {req.skill_name}")

    focus = state.canvas.nodes.get(req.node_id)
    if not focus:
        raise HTTPException(status_code=404, detail=f"node not found: {req.node_id}")

    # gather context
    context_nodes = state.canvas.get_context_for_operation(focus.id)
    context_text = state.format_context(context_nodes)

    # build prompt and call api
    prompt = skill.build_prompt(context_text, req.params)
    result = await state.client.complete(prompt)

    # create result node
    new_node = CanvasNode.create_operation(
        operation=skill.display_name,
        content=result,
        parent_id=focus.id,
        context_snapshot=[n.id for n in context_nodes],
    )
    state.canvas.add_node(new_node)
    state.canvas.set_focus(new_node.id)

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

    # run chain
    current_input = context_text
    results = []

    for skill, params in resolved:
        prompt = skill.build_prompt(current_input, params)
        result = await state.client.complete(prompt)
        results.append(f"## {skill.display_name}\n\n{result}")
        current_input = result

    # create result node
    combined = "\n\n---\n\n".join(results)
    new_node = CanvasNode.create_operation(
        operation=chain.display_name,
        content=combined,
        parent_id=focus.id,
        context_snapshot=[n.id for n in context_nodes],
    )
    state.canvas.add_node(new_node)
    state.canvas.set_focus(new_node.id)

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
    prompt = f"""here is the current discussion context:

{context_text}

---

user question: {req.prompt}

respond thoughtfully to the user's question about this context. be specific and reference the material above."""

    result = await state.client.complete(prompt)

    # create result node
    new_node = CanvasNode.create_operation(
        operation="chat",
        content=result,
        parent_id=focus.id,
        context_snapshot=[n.id for n in context_nodes],
    )
    state.canvas.add_node(new_node)
    state.canvas.set_focus(new_node.id)

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

    return CanvasResponse.from_canvas(state.canvas)


# --- undo/redo endpoints ---

@app.post("/canvas/undo", response_model=CanvasResponse)
async def undo():
    """undo last action."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.undo():
        raise HTTPException(status_code=400, detail="nothing to undo")

    return CanvasResponse.from_canvas(state.canvas)


@app.post("/canvas/redo", response_model=CanvasResponse)
async def redo():
    """redo last undone action."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.redo():
        raise HTTPException(status_code=400, detail="nothing to redo")

    return CanvasResponse.from_canvas(state.canvas)


# --- node editing endpoints ---

@app.put("/node/{node_id}", response_model=NodeResponse)
async def edit_node(node_id: str, req: NodeEdit):
    """edit a node's content."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.edit_node(node_id, req.content):
        raise HTTPException(status_code=404, detail=f"node not found: {node_id}")

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

    return NodeResponse.from_node(state.canvas.nodes[req.from_id])


@app.delete("/link")
async def remove_link(from_id: str, to_id: str):
    """remove a cross-link between nodes."""
    if not state.canvas:
        raise HTTPException(status_code=404, detail="no canvas loaded")

    if not state.canvas.remove_link(from_id, to_id):
        raise HTTPException(status_code=400, detail="could not remove link")

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


# --- entrypoint ---

def main():
    """run the api server."""
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="runeforge canvas api server")
    parser.add_argument("--host", default="0.0.0.0", help="host to bind")
    parser.add_argument("--port", "-p", type=int, default=8000, help="port to bind")
    parser.add_argument("--skills-dir", "-s", help="path to skills directory")
    parser.add_argument("--mock", "-m", action="store_true", help="use mock client")
    parser.add_argument("--reload", action="store_true", help="enable auto-reload")

    args = parser.parse_args()

    # configure state
    global state
    state = AppState(skills_dir=args.skills_dir, mock=args.mock)

    uvicorn.run(
        "runeforge_canvas.api.server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
