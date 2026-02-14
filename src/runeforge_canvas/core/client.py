"""api client using claude-agent-sdk.

uses the same auth as claude code for zero-cost api calls.
"""

from __future__ import annotations

import traceback
from pathlib import Path
from typing import Optional, Protocol, runtime_checkable

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
)


@runtime_checkable
class ClientProtocol(Protocol):
    """protocol for claude clients (real or mock)."""

    async def complete(self, prompt: str, enable_web_search: bool = False) -> str:
        """send prompt and return response."""
        ...


class MockClient:
    """mock client for testing without api calls."""

    def __init__(self, responses: Optional[dict[str, str]] = None, delay: float = 0.5):
        """init with optional response mapping.

        responses: dict mapping prompt substrings to responses.
        if prompt contains key (case-insensitive), return value.
        delay: simulated API delay in seconds.
        """
        self.responses = responses or {}
        self.calls: list[str] = []  # track all prompts sent
        self.delay = delay
        self.default_response = "## mock response\n\nthis is a simulated response from mock mode.\n\n- point 1\n- point 2\n- point 3"

    async def connect(self) -> None:
        pass

    async def disconnect(self) -> None:
        pass

    async def __aenter__(self) -> "MockClient":
        return self

    async def __aexit__(self, *args) -> None:
        pass

    async def complete(self, prompt: str, enable_web_search: bool = False) -> str:
        """return mock response based on prompt."""
        import asyncio
        self.calls.append(prompt)

        # simulate API delay
        await asyncio.sleep(self.delay)

        # check for matching response (case-insensitive)
        prompt_lower = prompt.lower()
        for key, response in self.responses.items():
            if key.lower() in prompt_lower:
                return response

        return self.default_response


class ClaudeClient:
    """async client for claude using claude-agent-sdk.

    creates a fresh connection per query to avoid state conflicts.
    """

    def __init__(self, cwd: Optional[Path] = None):
        self.cwd = cwd or Path.cwd()

    async def connect(self) -> None:
        """no-op - connections are created per query."""
        pass

    async def disconnect(self) -> None:
        """no-op - connections are cleaned up per query."""
        pass

    async def __aenter__(self) -> ClaudeClient:
        return self

    async def __aexit__(self, *args) -> None:
        pass

    async def complete(self, prompt: str, enable_web_search: bool = False) -> str:
        """send a prompt and collect the full response.

        creates a fresh client for each query to avoid state conflicts.

        args:
            prompt: the prompt to send
            enable_web_search: if True, enable WebSearch tool for this query
        """
        # create fresh client for each query to avoid state conflicts
        # clear API key so SDK uses Max subscription auth, not API credits
        import os
        os.environ.pop("ANTHROPIC_API_KEY", None)

        base_opts = {
            "cwd": str(self.cwd),
            "model": "opus",
        }
        if enable_web_search:
            options = ClaudeAgentOptions(
                **base_opts,
                tools=["WebSearch"],
                allowed_tools=["WebSearch"],
                permission_mode="bypassPermissions",
            )
        else:
            # no tools - pure text generation
            options = ClaudeAgentOptions(
                **base_opts,
                tools=[],
                allowed_tools=[],
            )
        client: Optional[ClaudeSDKClient] = None

        try:
            client = ClaudeSDKClient(options)
            await client.connect()

            # send the query
            await client.query(prompt)

            # collect response
            text_parts: list[str] = []
            import logging

            async for event in client.receive_response():
                logging.debug(f"event type: {type(event).__name__}, attrs: {dir(event)}")

                # check for text content in assistant messages
                if hasattr(event, "message") and hasattr(event.message, "content"):
                    logging.debug(f"message content: {event.message.content}")
                    for block in event.message.content:
                        if hasattr(block, "text"):
                            logging.debug(f"found text: {block.text[:50] if block.text else 'empty'}...")
                            text_parts.append(block.text)
                # also check for direct text attribute
                elif hasattr(event, "text"):
                    logging.debug(f"direct text: {event.text[:50] if event.text else 'empty'}...")
                    text_parts.append(event.text)
                # check for content blocks directly
                elif hasattr(event, "content"):
                    logging.debug(f"content attr: {event.content}")
                    if isinstance(event.content, list):
                        for block in event.content:
                            if hasattr(block, "text"):
                                text_parts.append(block.text)
                            elif isinstance(block, dict) and "text" in block:
                                text_parts.append(block["text"])

            logging.debug(f"total text parts collected: {len(text_parts)}")
            return "\n".join(text_parts) if text_parts else "(no response)"

        except Exception as e:
            # capture full error info for debugging
            error_msg = str(e)
            error_trace = traceback.format_exc()

            # re-raise with more context
            raise RuntimeError(
                f"claude api error: {error_msg}\n\n"
                f"this may be a transient error. try again.\n\n"
                f"trace:\n{error_trace}"
            ) from e

        finally:
            if client:
                try:
                    await client.disconnect()
                except Exception:
                    pass  # ignore cleanup errors


async def run_skill(
    skill_prompt: str,
    cwd: Optional[Path] = None,
    enable_web_search: bool = False,
) -> str:
    """convenience function to run a skill prompt.

    creates a client, sends the prompt, returns the result.

    args:
        skill_prompt: the prompt to send
        cwd: working directory for the client
        enable_web_search: if True, enable WebSearch tool
    """
    async with ClaudeClient(cwd=cwd) as client:
        return await client.complete(skill_prompt, enable_web_search=enable_web_search)
