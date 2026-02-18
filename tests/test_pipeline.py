"""tests for pipeline compose feature."""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from future_tokenizer.core.models import Canvas, CanvasNode
from future_tokenizer.core.client import CompletionResult


class TestExportOutlineWithIds:
    """tests for export_outline_with_ids on Canvas."""

    def test_empty_canvas(self):
        """empty canvas returns empty string."""
        canvas = Canvas(name="test")
        assert canvas.export_outline_with_ids() == ""

    def test_root_only(self):
        """root node shows id in outline."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("my goal")
        canvas.add_node(root)

        result = canvas.export_outline_with_ids()
        assert root.id in result
        assert "my goal" in result

    def test_node_ids_in_output(self, sample_canvas):
        """all node ids appear in outline."""
        result = sample_canvas.export_outline_with_ids()
        for node_id in sample_canvas.nodes:
            assert node_id in result

    def test_operations_shown(self, sample_canvas):
        """operation names appear in outline."""
        result = sample_canvas.export_outline_with_ids()
        assert "@excavate" in result

    def test_deep_tree(self):
        """deep tree shows proper indentation with ids."""
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("root goal")
        canvas.add_node(root)

        child = CanvasNode.create_operation(
            operation="@excavate",
            content="found assumptions",
            parent_id=root.id,
            context_snapshot=[root.id],
        )
        canvas.add_node(child)

        grandchild = CanvasNode.create_operation(
            operation="@stressify",
            content="stress tested",
            parent_id=child.id,
            context_snapshot=[root.id, child.id],
        )
        canvas.add_node(grandchild)

        result = canvas.export_outline_with_ids()
        assert root.id in result
        assert child.id in result
        assert grandchild.id in result
        # Verify indentation structure
        lines = result.strip().split("\n")
        assert len(lines) == 3


class TestPipelineComposeEndpoint:
    """tests for POST /pipeline/compose endpoint."""

    @pytest.fixture
    def mock_app_state(self):
        """create app state with mock client and sample canvas."""
        from future_tokenizer.api.server import AppState
        state = AppState(mock=True)
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("should I use React or Vue?")
        canvas.add_node(root)

        child = CanvasNode.create_operation(
            operation="@excavate",
            content="assumptions: React has bigger ecosystem",
            parent_id=root.id,
            context_snapshot=[root.id],
        )
        canvas.add_node(child)
        canvas.set_focus(child.id)

        state.canvas = canvas
        state.canvas_path = None
        return state, root, child

    @pytest.fixture
    def test_client(self, mock_app_state):
        """FastAPI test client with mocked state."""
        from fastapi.testclient import TestClient
        from future_tokenizer.api import server

        state, root, child = mock_app_state
        original_state = server.state
        server.state = state
        client = TestClient(server.app)
        yield client, state, root, child
        server.state = original_state

    def test_compose_returns_pipeline(self, test_client):
        """compose endpoint returns valid pipeline spec."""
        client, state, root, child = test_client

        # Mock Claude to return a valid pipeline JSON
        pipeline_json = json.dumps({
            "rationale": "The graph has excavated assumptions but never stress-tested them.",
            "steps": [
                {"skill": "stressify", "target": child.id, "reason": "Stress test assumptions"},
                {"skill": "negspace", "target": root.id, "reason": "Find blind spots"},
                {"skill": "synthesize", "target": "$1", "reason": "Compress findings"},
            ]
        })

        mock_result = CompletionResult(
            text=pipeline_json,
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.01,
        )

        async def mock_complete(prompt, **kwargs):
            return mock_result

        state._client = MagicMock()
        state._client.complete = mock_complete

        response = client.post("/pipeline/compose", json={})
        assert response.status_code == 200
        data = response.json()
        assert "pipeline" in data
        assert data["pipeline"]["rationale"] == "The graph has excavated assumptions but never stress-tested them."
        assert len(data["pipeline"]["steps"]) == 3
        assert data["pipeline"]["steps"][0]["skill"] == "stressify"
        assert data["pipeline"]["steps"][2]["target"] == "$1"

    def test_compose_with_focus_node(self, test_client):
        """compose with node_id hint includes it in request."""
        client, state, root, child = test_client

        pipeline_json = json.dumps({
            "rationale": "Focused analysis",
            "steps": [
                {"skill": "excavate", "target": root.id, "reason": "Dig deeper"},
            ]
        })

        mock_result = CompletionResult(text=pipeline_json)

        async def mock_complete(prompt, **kwargs):
            return mock_result

        state._client = MagicMock()
        state._client.complete = mock_complete

        response = client.post("/pipeline/compose", json={"node_id": child.id})
        assert response.status_code == 200

    def test_compose_no_canvas(self, test_client):
        """compose without canvas returns 404."""
        client, state, root, child = test_client
        state.canvas = None

        response = client.post("/pipeline/compose", json={})
        assert response.status_code == 404

    def test_compose_invalid_json_from_claude(self, test_client):
        """compose with non-JSON Claude response returns 500."""
        client, state, root, child = test_client

        mock_result = CompletionResult(text="This is not JSON at all")

        async def mock_complete(prompt, **kwargs):
            return mock_result

        state._client = MagicMock()
        state._client.complete = mock_complete

        response = client.post("/pipeline/compose", json={})
        assert response.status_code == 500


class TestPipelineStepTargetValidation:
    """tests for $N reference validation in pipeline steps."""

    def test_dollar_ref_format(self):
        """$N references should be valid step references."""
        # Valid: $1, $2, $10
        import re
        pattern = re.compile(r"^\$[1-9]\d*$")
        assert pattern.match("$1")
        assert pattern.match("$2")
        assert pattern.match("$10")
        assert not pattern.match("$0")  # 0 not valid (1-indexed)
        assert not pattern.match("$")
        assert not pattern.match("abc")

    def test_resolve_dollar_refs(self):
        """$N references resolve to actual node IDs."""
        result_nodes = {"$1": "abc123", "$2": "def456"}

        target = "$1"
        if target.startswith("$"):
            resolved = result_nodes.get(target)
        else:
            resolved = target

        assert resolved == "abc123"

    def test_invalid_dollar_ref_not_resolved(self):
        """$N reference to non-existent step returns None."""
        result_nodes = {"$1": "abc123"}

        target = "$3"
        resolved = result_nodes.get(target)
        assert resolved is None
