"""tests for client with mocking."""

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from future_tokenizer.core.client import ClaudeClient, MockClient, CompletionResult


class TestCompletionResult:
    """tests for CompletionResult dataclass."""

    def test_defaults(self):
        """CompletionResult has zero defaults for usage fields."""
        r = CompletionResult(text="hello")
        assert r.text == "hello"
        assert r.input_tokens == 0
        assert r.output_tokens == 0
        assert r.cache_read_tokens == 0
        assert r.cache_creation_tokens == 0
        assert r.cost_usd == 0.0

    def test_with_usage(self):
        """CompletionResult stores usage values."""
        r = CompletionResult(
            text="response",
            input_tokens=1000,
            output_tokens=500,
            cache_read_tokens=200,
            cache_creation_tokens=100,
            cost_usd=0.042,
        )
        assert r.input_tokens == 1000
        assert r.output_tokens == 500
        assert r.cache_read_tokens == 200
        assert r.cache_creation_tokens == 100
        assert r.cost_usd == 0.042


class TestMockClient:
    """tests for MockClient returning CompletionResult."""

    @pytest.mark.asyncio
    async def test_returns_completion_result(self):
        """MockClient.complete() returns CompletionResult, not str."""
        client = MockClient(delay=0)
        result = await client.complete("test")
        assert isinstance(result, CompletionResult)
        assert isinstance(result.text, str)
        assert result.input_tokens == 0
        assert result.output_tokens == 0

    @pytest.mark.asyncio
    async def test_matched_response(self):
        """MockClient matches prompt substrings."""
        client = MockClient(responses={"hello": "world"}, delay=0)
        result = await client.complete("say hello please")
        assert result.text == "world"

    @pytest.mark.asyncio
    async def test_default_response(self):
        """MockClient returns default when no match."""
        client = MockClient(delay=0)
        result = await client.complete("anything")
        assert "mock response" in result.text

    @pytest.mark.asyncio
    async def test_tracks_calls(self):
        """MockClient tracks prompts."""
        client = MockClient(delay=0)
        await client.complete("first")
        await client.complete("second")
        assert len(client.calls) == 2


class TestClaudeClient:
    """tests for ClaudeClient."""

    @pytest.mark.asyncio
    async def test_context_manager(self):
        """client works as async context manager."""
        async with ClaudeClient() as client:
            assert client is not None

    @pytest.mark.asyncio
    async def test_connect_disconnect_are_noops(self):
        """connect/disconnect are safe noops."""
        client = ClaudeClient()
        await client.connect()  # should not raise
        await client.disconnect()  # should not raise

    @pytest.mark.asyncio
    async def test_complete_creates_fresh_client(self):
        """each complete() creates a fresh SDK client."""
        with patch("future_tokenizer.core.client.ClaudeSDKClient") as MockSDK:
            # setup mock
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.disconnect = AsyncMock()
            mock_instance.query = AsyncMock()

            # mock response event
            mock_event = MagicMock()
            mock_event.message = MagicMock()
            mock_block = MagicMock()
            mock_block.text = "test response"
            mock_event.message.content = [mock_block]
            # no usage on this event
            del mock_event.usage
            del mock_event.total_cost_usd

            async def mock_receive():
                yield mock_event

            mock_instance.receive_response = mock_receive
            MockSDK.return_value = mock_instance

            client = ClaudeClient()
            result = await client.complete("test prompt")

            # verify fresh client created
            MockSDK.assert_called_once()
            mock_instance.connect.assert_called_once()
            mock_instance.query.assert_called_once_with("test prompt")
            mock_instance.disconnect.assert_called_once()
            assert isinstance(result, CompletionResult)
            assert result.text == "test response"

    @pytest.mark.asyncio
    async def test_complete_captures_usage(self):
        """complete() extracts usage from ResultMessage."""
        with patch("future_tokenizer.core.client.ClaudeSDKClient") as MockSDK:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.disconnect = AsyncMock()
            mock_instance.query = AsyncMock()

            # text event (no usage)
            text_event = MagicMock()
            text_event.message = MagicMock()
            text_block = MagicMock()
            text_block.text = "response text"
            text_event.message.content = [text_block]
            del text_event.usage
            del text_event.total_cost_usd

            # result event with usage (last event)
            result_event = MagicMock()
            result_event.usage = {
                "input_tokens": 1500,
                "output_tokens": 800,
                "cache_read_input_tokens": 300,
                "cache_creation_input_tokens": 50,
            }
            result_event.total_cost_usd = 0.035
            # no text content on result event
            del result_event.message
            del result_event.text
            del result_event.content

            async def mock_receive():
                yield text_event
                yield result_event

            mock_instance.receive_response = mock_receive
            MockSDK.return_value = mock_instance

            client = ClaudeClient()
            result = await client.complete("test")

            assert result.text == "response text"
            assert result.input_tokens == 1500
            assert result.output_tokens == 800
            assert result.cache_read_tokens == 300
            assert result.cache_creation_tokens == 50
            assert result.cost_usd == 0.035

    @pytest.mark.asyncio
    async def test_complete_handles_disconnect_error(self):
        """complete() ignores disconnect errors."""
        with patch("future_tokenizer.core.client.ClaudeSDKClient") as MockSDK:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.disconnect = AsyncMock(side_effect=Exception("cleanup failed"))
            mock_instance.query = AsyncMock()

            async def mock_receive():
                # must match the structure the client expects
                mock_event = MagicMock()
                mock_event.message = MagicMock()
                mock_block = MagicMock()
                mock_block.text = "response"
                mock_event.message.content = [mock_block]
                del mock_event.usage
                del mock_event.total_cost_usd
                yield mock_event

            mock_instance.receive_response = mock_receive
            MockSDK.return_value = mock_instance

            client = ClaudeClient()
            # should not raise despite disconnect error
            result = await client.complete("test")
            assert result.text == "response"

    @pytest.mark.asyncio
    async def test_complete_returns_no_response_on_empty(self):
        """complete() returns placeholder when no text received."""
        with patch("future_tokenizer.core.client.ClaudeSDKClient") as MockSDK:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.disconnect = AsyncMock()
            mock_instance.query = AsyncMock()

            async def mock_receive():
                # empty response
                return
                yield  # make it a generator

            mock_instance.receive_response = mock_receive
            MockSDK.return_value = mock_instance

            client = ClaudeClient()
            result = await client.complete("test")
            assert result.text == "(no response)"
