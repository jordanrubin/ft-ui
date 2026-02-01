"""tests for client with mocking."""

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from runeforge_canvas.core.client import ClaudeClient


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
        with patch("runeforge_canvas.core.client.ClaudeSDKClient") as MockSDK:
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
            assert result == "test response"

    @pytest.mark.asyncio
    async def test_complete_handles_disconnect_error(self):
        """complete() ignores disconnect errors."""
        with patch("runeforge_canvas.core.client.ClaudeSDKClient") as MockSDK:
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
                yield mock_event

            mock_instance.receive_response = mock_receive
            MockSDK.return_value = mock_instance

            client = ClaudeClient()
            # should not raise despite disconnect error
            result = await client.complete("test")
            assert result == "response"

    @pytest.mark.asyncio
    async def test_complete_returns_no_response_on_empty(self):
        """complete() returns placeholder when no text received."""
        with patch("runeforge_canvas.core.client.ClaudeSDKClient") as MockSDK:
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
            assert result == "(no response)"
