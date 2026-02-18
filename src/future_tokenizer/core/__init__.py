"""core primitives shared between frontends."""

from .models import (
    Canvas,
    CanvasNode,
    NodeType,
    CanvasTemplate,
    BUILTIN_TEMPLATES,
    DEFAULT_COMPRESSION_LENGTH,
    MAX_UNDO_HISTORY,
    list_templates,
    get_template,
    list_saved_canvases,
    get_most_recent_canvas,
    get_canvas_dir,
)
from .skills import Skill, SkillLoader, SkillChain, SkillInvocation, get_default_loader
from .client import ClaudeClient, MockClient, ClientProtocol

__all__ = [
    # models
    "Canvas",
    "CanvasNode",
    "NodeType",
    "CanvasTemplate",
    "BUILTIN_TEMPLATES",
    "DEFAULT_COMPRESSION_LENGTH",
    "MAX_UNDO_HISTORY",
    "list_templates",
    "get_template",
    "list_saved_canvases",
    "get_most_recent_canvas",
    "get_canvas_dir",
    # skills
    "Skill",
    "SkillLoader",
    "SkillChain",
    "SkillInvocation",
    "get_default_loader",
    # client
    "ClaudeClient",
    "MockClient",
    "ClientProtocol",
]
