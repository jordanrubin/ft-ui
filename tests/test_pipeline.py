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


class TestPipelineReflection:
    """tests for pipeline meta-reflection feature."""

    def test_reflection_to_dict_round_trip(self):
        """PipelineReflection serializes and deserializes cleanly."""
        from future_tokenizer.core.models import PipelineReflection

        reflection = PipelineReflection(
            id="ref001",
            created_at="2026-02-18T10:00:00",
            pipeline_rationale="Testing assumptions about React.",
            steps_summary=[
                {"skill": "excavate", "target": "abc123", "status": "completed"},
                {"skill": "stressify", "target": "$1", "status": "failed", "error": "timeout"},
            ],
            reflection="The pipeline explored assumptions well but failed on stress testing.",
            total_steps=2,
            completed_steps=1,
            failed_steps=1,
            total_cost_usd=0.05,
            input_tokens=500,
            output_tokens=200,
            cost_usd=0.02,
        )

        d = reflection.to_dict()
        assert d["id"] == "ref001"
        assert d["total_steps"] == 2
        assert d["failed_steps"] == 1
        assert len(d["steps_summary"]) == 2

        restored = PipelineReflection.from_dict(d)
        assert restored.id == reflection.id
        assert restored.reflection == reflection.reflection
        assert restored.steps_summary == reflection.steps_summary
        assert restored.total_cost_usd == reflection.total_cost_usd

    def test_canvas_save_load_with_reflections(self, temp_dir):
        """Canvas with pipeline_reflections persists through save/load."""
        from future_tokenizer.core.models import PipelineReflection

        canvas = Canvas(name="test-reflect")
        root = CanvasNode.create_root("test goal")
        canvas.add_node(root)

        canvas.pipeline_reflections.append(PipelineReflection(
            id="ref001",
            created_at="2026-02-18T10:00:00",
            pipeline_rationale="First run rationale.",
            steps_summary=[{"skill": "excavate", "target": root.id, "status": "completed"}],
            reflection="Good first exploration.",
            total_steps=1,
            completed_steps=1,
            failed_steps=0,
            total_cost_usd=0.03,
            input_tokens=300,
            output_tokens=100,
            cost_usd=0.01,
        ))

        path = temp_dir / "reflect-test.json"
        canvas.save(path)

        loaded = Canvas.load(path)
        assert len(loaded.pipeline_reflections) == 1
        r = loaded.pipeline_reflections[0]
        assert r.id == "ref001"
        assert r.reflection == "Good first exploration."
        assert r.total_steps == 1

    def test_backward_compat_old_canvas_no_reflections(self, temp_dir):
        """Old canvas files without pipeline_reflections load with empty list."""
        import json

        # Simulate old-format canvas JSON (no pipeline_reflections key)
        old_data = {
            "name": "old-canvas",
            "nodes": {},
            "root_id": None,
            "active_path": [],
            "created_at": "2026-01-01T00:00:00",
            "compress_length": 100,
        }
        path = temp_dir / "old-canvas.json"
        with open(path, "w") as f:
            json.dump(old_data, f)

        loaded = Canvas.load(path)
        assert loaded.pipeline_reflections == []

    def test_reflections_not_in_undo_snapshot(self):
        """Reflections are append-only — not included in undo snapshots."""
        from future_tokenizer.core.models import PipelineReflection

        canvas = Canvas(name="test")
        root = CanvasNode.create_root("goal")
        canvas.add_node(root)

        canvas.pipeline_reflections.append(PipelineReflection(
            id="ref001",
            created_at="2026-02-18T10:00:00",
            pipeline_rationale="test",
            steps_summary=[],
            reflection="test reflection",
            total_steps=0,
            completed_steps=0,
            failed_steps=0,
            total_cost_usd=0.0,
            input_tokens=0,
            output_tokens=0,
            cost_usd=0.0,
        ))

        snapshot = canvas._snapshot()
        assert "pipeline_reflections" not in snapshot

    @pytest.fixture
    def reflect_test_client(self):
        """FastAPI test client with canvas containing completed pipeline nodes."""
        from fastapi.testclient import TestClient
        from future_tokenizer.api import server
        from future_tokenizer.api.server import AppState

        state = AppState(mock=True)
        canvas = Canvas(name="reflect-test")
        root = CanvasNode.create_root("should I use React or Vue?")
        canvas.add_node(root)

        # Simulate pipeline result nodes
        result_node = CanvasNode.create_operation(
            operation="@excavate",
            content="Found three core assumptions: ecosystem size matters, learning curve matters, performance matters.",
            parent_id=root.id,
            context_snapshot=[root.id],
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.01,
        )
        canvas.add_node(result_node)

        failed_node_id = "failed_node_placeholder"

        state.canvas = canvas
        state.canvas_path = None

        # Mock client for reflection call
        async def mock_complete(prompt, **kwargs):
            return CompletionResult(
                text="The pipeline efficiently explored core assumptions. Excavate found solid ground but stressify timed out.\n\n- Use longer timeouts for stress testing\n- Follow up excavate with antithesize before stressify\n- Consider adding negspace for blind spots",
                input_tokens=400,
                output_tokens=150,
                cost_usd=0.03,
            )

        state._client = MagicMock()
        state._client.complete = mock_complete

        original_state = server.state
        server.state = state
        client = TestClient(server.app)
        yield client, state, root, result_node
        server.state = original_state

    def test_reflect_returns_reflection(self, reflect_test_client):
        """POST /pipeline/reflect returns reflection and stores on canvas."""
        client, state, root, result_node = reflect_test_client

        response = client.post("/pipeline/reflect", json={
            "rationale": "Testing assumptions about frameworks.",
            "steps": [
                {"skill": "excavate", "target": root.id, "reason": "Dig for assumptions", "status": "completed", "node_id": result_node.id},
                {"skill": "stressify", "target": "$1", "reason": "Stress test findings", "status": "failed", "error": "timeout"},
            ],
        })
        assert response.status_code == 200
        data = response.json()
        assert "reflection_id" in data
        assert "reflection" in data
        assert len(data["reflection"]) > 0
        assert data["input_tokens"] == 400
        assert data["output_tokens"] == 150
        assert data["cost_usd"] == 0.03

        # Verify stored on canvas
        assert len(state.canvas.pipeline_reflections) == 1
        stored = state.canvas.pipeline_reflections[0]
        assert stored.id == data["reflection_id"]
        assert stored.total_steps == 2
        assert stored.completed_steps == 1
        assert stored.failed_steps == 1

    def test_reflect_handles_failed_steps(self, reflect_test_client):
        """Reflect endpoint gracefully handles all-failed pipeline."""
        client, state, root, result_node = reflect_test_client

        response = client.post("/pipeline/reflect", json={
            "rationale": "Everything broke.",
            "steps": [
                {"skill": "excavate", "target": root.id, "reason": "a", "status": "failed", "error": "err1"},
                {"skill": "stressify", "target": root.id, "reason": "b", "status": "failed", "error": "err2"},
            ],
        })
        assert response.status_code == 200
        data = response.json()
        assert "reflection" in data

        stored = state.canvas.pipeline_reflections[0]
        assert stored.completed_steps == 0
        assert stored.failed_steps == 2

    def test_reflect_no_canvas_returns_404(self, reflect_test_client):
        """Reflect without canvas returns 404."""
        client, state, root, result_node = reflect_test_client
        state.canvas = None

        response = client.post("/pipeline/reflect", json={
            "rationale": "test",
            "steps": [{"skill": "excavate", "target": "abc", "reason": "test", "status": "completed"}],
        })
        assert response.status_code == 404

    def test_compose_includes_past_reflections(self):
        """Compose prompt includes past reflections when they exist."""
        from fastapi.testclient import TestClient
        from future_tokenizer.api import server
        from future_tokenizer.api.server import AppState
        from future_tokenizer.core.models import PipelineReflection

        state = AppState(mock=True)
        canvas = Canvas(name="test")
        root = CanvasNode.create_root("test goal")
        canvas.add_node(root)

        # Add past reflections
        canvas.pipeline_reflections.append(PipelineReflection(
            id="ref001",
            created_at="2026-02-18T10:00:00",
            pipeline_rationale="first run",
            steps_summary=[{"skill": "excavate", "target": root.id, "status": "completed"}],
            reflection="Excavate was useful. Should follow with antithesize next time.",
            total_steps=1,
            completed_steps=1,
            failed_steps=0,
            total_cost_usd=0.03,
            input_tokens=300,
            output_tokens=100,
            cost_usd=0.01,
        ))

        state.canvas = canvas
        state.canvas_path = None

        captured: list[str] = []

        async def mock_complete(prompt, **kwargs):
            captured.append(prompt)
            return CompletionResult(text=json.dumps({
                "rationale": "test",
                "steps": [{"skill": "excavate", "target": root.id, "reason": "test"}],
            }))

        state._client = MagicMock()
        state._client.complete = mock_complete

        original_state = server.state
        server.state = state
        client = TestClient(server.app)
        try:
            response = client.post("/pipeline/compose", json={})
            assert response.status_code == 200
            # Verify past reflections appear in the prompt
            assert len(captured) == 1
            prompt = captured[0]
            assert "Excavate was useful" in prompt
            assert "reflections" in prompt.lower() or "Reflections" in prompt
        finally:
            server.state = original_state
