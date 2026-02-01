"""fastapi server for runeforge canvas.

exposes core operations as REST endpoints for react frontend.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ..core.models import Canvas, CanvasNode, NodeType
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


class NodeResponse(BaseModel):
    """node in api response."""
    id: str
    type: str
    content_full: str
    content_compressed: str
    operation: Optional[str]
    parent_id: Optional[str]
    children: list[str]

    @classmethod
    def from_node(cls, node: CanvasNode) -> "NodeResponse":
        return cls(
            id=node.id,
            type=node.type.value,
            content_full=node.content_full,
            content_compressed=node.content_compressed,
            operation=node.operation,
            parent_id=node.parent_id,
            children=node.children,
        )


class CanvasResponse(BaseModel):
    """canvas in api response."""
    name: str
    nodes: dict[str, NodeResponse]
    root_id: Optional[str]
    active_path: list[str]

    @classmethod
    def from_canvas(cls, canvas: Canvas) -> "CanvasResponse":
        return cls(
            name=canvas.name,
            nodes={k: NodeResponse.from_node(v) for k, v in canvas.nodes.items()},
            root_id=canvas.root_id,
            active_path=canvas.active_path,
        )


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
