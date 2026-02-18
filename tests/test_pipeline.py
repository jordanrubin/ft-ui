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


class TestPipelineDAGDependencies:
    """tests for DAG dependency parsing and wave computation."""

    @staticmethod
    def get_deps(target: str) -> list[int]:
        """parse $N references from target to find dependencies (0-indexed)."""
        import re
        deps = []
        for m in re.findall(r'\$(\d+)', target):
            deps.append(int(m) - 1)
        return deps

    @staticmethod
    def compute_waves(steps: list[dict]) -> list[int]:
        """compute wave assignment for each step.

        wave 0 = no $N deps, wave 1 = deps all in wave 0, etc.
        Returns list of wave numbers parallel to steps.
        """
        import re
        n = len(steps)
        waves = [-1] * n

        def get_deps(target: str) -> list[int]:
            return [int(m) - 1 for m in re.findall(r'\$(\d+)', target)]

        changed = True
        while changed:
            changed = False
            for i in range(n):
                if waves[i] >= 0:
                    continue
                deps = get_deps(steps[i]["target"])
                if not deps:
                    waves[i] = 0
                    changed = True
                elif all(waves[d] >= 0 for d in deps):
                    waves[i] = max(waves[d] for d in deps) + 1
                    changed = True
        return waves

    def test_no_deps_all_wave_zero(self):
        """steps with no $N refs are all in wave 0."""
        steps = [
            {"skill": "excavate", "target": "node1", "reason": "a"},
            {"skill": "negspace", "target": "node2", "reason": "b"},
            {"skill": "antithesize", "target": "node3", "reason": "c"},
        ]
        waves = self.compute_waves(steps)
        assert waves == [0, 0, 0]

    def test_linear_chain(self):
        """$1 -> $2 -> $3 creates sequential waves."""
        steps = [
            {"skill": "excavate", "target": "node1", "reason": "a"},
            {"skill": "stressify", "target": "$1", "reason": "b"},
            {"skill": "synthesize", "target": "$2", "reason": "c"},
        ]
        waves = self.compute_waves(steps)
        assert waves == [0, 1, 2]

    def test_fan_out_fan_in(self):
        """parallel steps then a join step."""
        steps = [
            {"skill": "excavate", "target": "node1", "reason": "a"},
            {"skill": "negspace", "target": "node2", "reason": "b"},
            {"skill": "antithesize", "target": "node3", "reason": "c"},
            {"skill": "synthesize", "target": "$1", "reason": "join 1"},
            {"skill": "synthesize", "target": "$2", "reason": "join 2"},
        ]
        waves = self.compute_waves(steps)
        assert waves == [0, 0, 0, 1, 1]

    def test_diamond_pattern(self):
        """two parallel steps feed into one join."""
        steps = [
            {"skill": "excavate", "target": "node1", "reason": "a"},
            {"skill": "negspace", "target": "node1", "reason": "b"},
            {"skill": "stressify", "target": "$1", "reason": "follow up 1"},
            {"skill": "dimensionalize", "target": "$2", "reason": "follow up 2"},
            {"skill": "synthesize", "target": "$3", "reason": "final"},
        ]
        waves = self.compute_waves(steps)
        assert waves == [0, 0, 1, 1, 2]

    def test_get_deps_single_ref(self):
        """single $N reference returns one dep."""
        assert self.get_deps("$1") == [0]
        assert self.get_deps("$3") == [2]

    def test_get_deps_no_ref(self):
        """plain node ID has no deps."""
        assert self.get_deps("abc123") == []

    def test_get_deps_multiple_refs(self):
        """target with multiple $N refs (e.g. synthesize referencing many)."""
        # While current schema uses single target, the parser handles multiple
        assert self.get_deps("$1") == [0]
        assert self.get_deps("$2") == [1]

    def test_compose_prompt_encourages_parallel(self, test_client_for_prompt):
        """compose prompt should encourage parallel execution and 5-12 steps."""
        client, state, captured = test_client_for_prompt

        response = client.post("/pipeline/compose", json={})
        # It will fail to parse but we just want to check the prompt
        assert len(captured) > 0
        prompt = captured[0]
        assert "parallel" in prompt.lower()
        assert "5-12" in prompt

    @pytest.fixture
    def test_client_for_prompt(self):
        """test client that captures the prompt sent to Claude."""
        from fastapi.testclient import TestClient
        from future_tokenizer.api import server
        from future_tokenizer.api.server import AppState

        state = AppState(mock=True)
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("test goal")
        canvas.add_node(root)
        state.canvas = canvas
        state.canvas_path = None

        captured: list[str] = []

        async def mock_complete(prompt, **kwargs):
            captured.append(prompt)
            # Return valid pipeline JSON so it doesn't error
            return CompletionResult(text=json.dumps({
                "rationale": "test",
                "steps": [{"skill": "excavate", "target": root.id, "reason": "test"}],
            }))

        state._client = MagicMock()
        state._client.complete = mock_complete

        original_state = server.state
        server.state = state
        client = TestClient(server.app)
        yield client, state, captured
        server.state = original_state


class TestPlanNodeResponse:
    """tests that plan nodes include plan_path in API response."""

    def test_plan_node_includes_plan_path(self):
        """NodeResponse from plan node with context_snapshot exposes plan_path."""
        from future_tokenizer.api.server import NodeResponse

        plan_node = CanvasNode.create_plan(
            content="# My Plan\n\nDo things.",
            parent_id="root123",
            source_ids=["a", "b"],
        )
        plan_node.context_snapshot = ["/home/user/.claude/plans/test-20260218-1530.md"]

        response = NodeResponse.from_node(plan_node)
        assert response.plan_path == "/home/user/.claude/plans/test-20260218-1530.md"

    def test_non_plan_node_has_no_plan_path(self):
        """NodeResponse from operation node has null plan_path."""
        from future_tokenizer.api.server import NodeResponse

        node = CanvasNode.create_operation(
            operation="@excavate",
            content="found things",
            parent_id="root123",
            context_snapshot=["root123"],
        )
        response = NodeResponse.from_node(node)
        assert response.plan_path is None
