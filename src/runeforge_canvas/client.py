"""api client using claude-agent-sdk.

uses the same auth as claude code for zero-cost api calls.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    UserMessage,
)


class ClaudeClient:
    """async client for claude using claude-agent-sdk."""

    def __init__(self, cwd: Optional[Path] = None):
        self.cwd = cwd or Path.cwd()
        self._client: Optional[ClaudeSDKClient] = None
        self._connected = False

    async def connect(self) -> None:
        """connect to claude."""
        if self._connected:
            return

        options = ClaudeAgentOptions(
            cwd=str(self.cwd),
        )
        self._client = ClaudeSDKClient(options)
        await self._client.connect()
        self._connected = True

    async def disconnect(self) -> None:
        """disconnect from claude."""
        if self._client and self._connected:
            await self._client.disconnect()
            self._connected = False
            self._client = None

    async def __aenter__(self) -> ClaudeClient:
        await self.connect()
        return self

    async def __aexit__(self, *args) -> None:
        await self.disconnect()

    async def complete(self, prompt: str) -> str:
        """send a prompt and collect the full response.

        this is a simple interface that sends the prompt and waits for
        the complete response, collecting all text blocks.
        """
        if not self._client or not self._connected:
            raise RuntimeError("client not connected - use async with or call connect()")

        text_parts: list[str] = []

        async for event in self._client.process_query(prompt):
            # collect text from assistant messages
            if hasattr(event, "type"):
                if event.type == "assistant" and hasattr(event, "message"):
                    msg = event.message
                    if hasattr(msg, "content"):
                        for block in msg.content:
                            if hasattr(block, "text"):
                                text_parts.append(block.text)

        return "\n".join(text_parts)


async def run_skill(skill_prompt: str, cwd: Optional[Path] = None) -> str:
    """convenience function to run a skill prompt.

    creates a client, sends the prompt, returns the result.
    """
    async with ClaudeClient(cwd=cwd) as client:
        return await client.complete(skill_prompt)
