"""auth: piggyback on claude code's oauth tokens.

reads tokens from ~/.claude/.credentials.json (linux).
acceptable breakage if format changes.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class OAuthToken:
    """claude.ai oauth token."""

    access_token: str
    refresh_token: str
    expires_at: int  # unix timestamp ms
    scopes: list[str]

    @property
    def is_expired(self) -> bool:
        """check if token is expired (with 60s buffer)."""
        now_ms = int(time.time() * 1000)
        return now_ms >= (self.expires_at - 60_000)

    @classmethod
    def from_dict(cls, d: dict) -> OAuthToken:
        """parse from credentials.json format."""
        return cls(
            access_token=d["accessToken"],
            refresh_token=d["refreshToken"],
            expires_at=d["expiresAt"],
            scopes=d.get("scopes", []),
        )


class AuthError(Exception):
    """authentication error."""

    pass


def get_credentials_path() -> Path:
    """get the claude code credentials file path."""
    return Path.home() / ".claude" / ".credentials.json"


def load_token() -> OAuthToken:
    """load oauth token from claude code credentials.

    raises AuthError if credentials not found or invalid.
    """
    creds_path = get_credentials_path()

    if not creds_path.exists():
        raise AuthError(
            f"credentials not found at {creds_path}\n"
            "run 'claude' to authenticate first"
        )

    try:
        with open(creds_path) as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise AuthError(f"invalid credentials file: {e}")

    oauth_data = data.get("claudeAiOauth")
    if not oauth_data:
        raise AuthError("no claudeAiOauth in credentials file")

    try:
        token = OAuthToken.from_dict(oauth_data)
    except KeyError as e:
        raise AuthError(f"missing field in credentials: {e}")

    if token.is_expired:
        raise AuthError(
            "oauth token expired\n"
            "run 'claude' to refresh authentication"
        )

    return token


def get_access_token() -> str:
    """get the access token string for api calls.

    convenience wrapper around load_token().
    """
    return load_token().access_token
