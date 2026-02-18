"""tests for _read_file_content helper, source_file model support, and upload endpoint."""

import io
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from future_tokenizer.core.models import Canvas, CanvasNode


class TestReadFileContent:
    """tests for the _read_file_content server helper."""

    def test_read_markdown_file(self):
        from future_tokenizer.api.server import _read_file_content

        with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False) as f:
            f.write("# Hello\n\nSome markdown content")
            f.flush()
            result = _read_file_content(Path(f.name))
        assert "# Hello" in result
        assert "Some markdown content" in result

    def test_read_txt_file(self):
        from future_tokenizer.api.server import _read_file_content

        with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", delete=False) as f:
            f.write("plain text content")
            f.flush()
            result = _read_file_content(Path(f.name))
        assert result == "plain text content"

    def test_read_python_file(self):
        from future_tokenizer.api.server import _read_file_content

        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("def hello():\n    return 'world'")
            f.flush()
            result = _read_file_content(Path(f.name))
        assert "def hello():" in result

    def test_read_json_file(self):
        from future_tokenizer.api.server import _read_file_content

        with tempfile.NamedTemporaryFile(suffix=".json", mode="w", delete=False) as f:
            f.write('{"key": "value"}')
            f.flush()
            result = _read_file_content(Path(f.name))
        assert '"key"' in result

    def test_caps_at_50k(self):
        from future_tokenizer.api.server import _read_file_content

        with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", delete=False) as f:
            f.write("x" * 60000)
            f.flush()
            result = _read_file_content(Path(f.name))
        assert len(result) == 50000

    def test_rejects_unknown_binary(self):
        from future_tokenizer.api.server import _read_file_content

        with tempfile.NamedTemporaryFile(suffix=".bin", mode="wb", delete=False) as f:
            # Write bytes that are invalid UTF-8 sequences
            f.write(b"\x80\x81\xfe\xff" * 100)
            f.flush()
            with pytest.raises(ValueError, match="Unsupported file type"):
                _read_file_content(Path(f.name))

    def test_read_csv_file(self):
        from future_tokenizer.api.server import _read_file_content

        with tempfile.NamedTemporaryFile(suffix=".csv", mode="w", delete=False) as f:
            f.write("name,age\nAlice,30\nBob,25")
            f.flush()
            result = _read_file_content(Path(f.name))
        assert "Alice,30" in result

    def test_read_toml_file(self):
        from future_tokenizer.api.server import _read_file_content

        with tempfile.NamedTemporaryFile(suffix=".toml", mode="w", delete=False) as f:
            f.write('[project]\nname = "test"')
            f.flush()
            result = _read_file_content(Path(f.name))
        assert 'name = "test"' in result


class TestCanvasSourceFile:
    """tests for source_file field on Canvas model."""

    def test_source_file_serialization(self):
        """source_file survives to_dict/from_dict."""
        canvas = Canvas(name="test", source_file="/tmp/test.md")
        d = canvas.to_dict()
        assert d["source_file"] == "/tmp/test.md"

        restored = Canvas.from_dict(d)
        assert restored.source_file == "/tmp/test.md"

    def test_source_file_none_by_default(self):
        """source_file is None when not set."""
        canvas = Canvas(name="test")
        assert canvas.source_file is None

        d = canvas.to_dict()
        assert "source_file" not in d

    def test_source_file_save_load(self):
        """source_file survives save/load cycle."""
        canvas = Canvas(name="test", source_file="/tmp/doc.pdf")
        root = CanvasNode.create_root("content")
        canvas.add_node(root)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test.json"
            canvas.save(path)

            loaded = Canvas.load(path)
            assert loaded.source_file == "/tmp/doc.pdf"


class TestUploadEndpoint:
    """tests for POST /canvas/from-upload."""

    @pytest.fixture(autouse=True)
    def _setup_client(self):
        from future_tokenizer.api.server import app, state
        self.client = TestClient(app)
        # reset state between tests
        state.canvas = None
        state.canvas_path = None
        state._dirty = False

    def test_upload_markdown_file(self):
        """uploading a .md file creates a canvas with content as-is (no code fence)."""
        content = b"# My Document\n\nSome content here"
        resp = self.client.post(
            "/canvas/from-upload",
            files={"file": ("readme.md", io.BytesIO(content), "text/markdown")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "readme"
        assert data["source_file"] == "readme.md"
        # markdown content should NOT be wrapped in code fence
        root = data["nodes"][data["root_id"]]
        assert "# readme.md" in root["content_full"]
        assert "Some content here" in root["content_full"]
        assert "```" not in root["content_full"]

    def test_upload_python_file(self):
        """uploading a .py file wraps content in a code fence."""
        content = b"def hello():\n    return 'world'"
        resp = self.client.post(
            "/canvas/from-upload",
            files={"file": ("app.py", io.BytesIO(content), "text/x-python")},
        )
        assert resp.status_code == 200
        data = resp.json()
        root = data["nodes"][data["root_id"]]
        assert "```py" in root["content_full"]
        assert "def hello():" in root["content_full"]

    def test_upload_custom_canvas_name(self):
        """canvas_name form field overrides the filename-derived name."""
        content = b"some text"
        resp = self.client.post(
            "/canvas/from-upload",
            files={"file": ("data.txt", io.BytesIO(content), "text/plain")},
            data={"canvas_name": "My Custom Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "My Custom Name"

    def test_upload_binary_file_rejected(self):
        """uploading an unsupported binary file returns 400."""
        content = b"\x80\x81\xfe\xff" * 100
        resp = self.client.post(
            "/canvas/from-upload",
            files={"file": ("data.bin", io.BytesIO(content), "application/octet-stream")},
        )
        assert resp.status_code == 400
        assert "Unsupported file type" in resp.json()["detail"]

    def test_upload_source_file_is_original_filename(self):
        """source_file should be the original upload filename, not a temp path."""
        content = b"hello"
        resp = self.client.post(
            "/canvas/from-upload",
            files={"file": ("notes.txt", io.BytesIO(content), "text/plain")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_file"] == "notes.txt"
