"""skillset management - add skills from GitHub repos or local folders.

A skillset is a collection of skills from a single source (directory).
Users can add skillsets from:
- Local directories on their filesystem
- GitHub repositories (cloned automatically)
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional
from datetime import datetime

from .skills import SkillLoader


# Default storage locations
def _get_default_config_file() -> Path:
    """get default config file path."""
    config_dir = Path.home() / ".runeforge-canvas"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / "skillsets.json"


def _get_default_clone_dir() -> Path:
    """get default directory for cloned repos."""
    clone_dir = Path.home() / ".runeforge-canvas" / "skillsets"
    clone_dir.mkdir(parents=True, exist_ok=True)
    return clone_dir


@dataclass
class Skillset:
    """a skillset from a local folder or github repo."""

    name: str
    source: str  # local path or github url
    source_type: str  # "local" or "github"
    local_path: Optional[str] = None  # resolved local path (for github, the clone location)
    branch: Optional[str] = None  # for github repos
    added_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_refreshed: Optional[str] = None

    def get_skills_path(self) -> Path:
        """get the path to load skills from."""
        if self.local_path:
            return Path(self.local_path)
        return Path(self.source)


def parse_github_url(url: str) -> Optional[tuple[str, str, Optional[str]]]:
    """parse a github url or owner/repo string.

    returns (owner, repo, branch) or None if invalid.
    supports:
    - https://github.com/owner/repo
    - https://github.com/owner/repo.git
    - https://github.com/owner/repo/tree/branch
    - owner/repo
    """
    # short form: owner/repo
    short_match = re.match(r"^([a-zA-Z0-9_-]+)/([a-zA-Z0-9_.-]+)$", url)
    if short_match:
        return (short_match.group(1), short_match.group(2), None)

    # full github url
    patterns = [
        # with branch: https://github.com/owner/repo/tree/branch
        r"https?://github\.com/([^/]+)/([^/]+)/tree/([^/]+)/?",
        # basic: https://github.com/owner/repo or https://github.com/owner/repo.git
        r"https?://github\.com/([^/]+)/([^/.]+)(?:\.git)?/?$",
    ]

    for pattern in patterns:
        match = re.match(pattern, url)
        if match:
            groups = match.groups()
            if len(groups) == 3:
                return (groups[0], groups[1], groups[2])
            return (groups[0], groups[1], None)

    return None


class SkillsetManager:
    """manages user-added skillsets."""

    def __init__(
        self,
        config_file: Optional[Path] = None,
        clone_dir: Optional[Path] = None,
    ):
        self.config_file = config_file or _get_default_config_file()
        self.clone_dir = clone_dir or _get_default_clone_dir()
        self._skillsets: list[Skillset] = []
        self._load()

    def _load(self) -> None:
        """load skillsets from config file."""
        if not self.config_file.exists():
            self._skillsets = []
            return

        try:
            data = json.loads(self.config_file.read_text())
            self._skillsets = [
                Skillset(**s) for s in data.get("skillsets", [])
            ]
        except (json.JSONDecodeError, TypeError, KeyError):
            self._skillsets = []

    def _save(self) -> None:
        """save skillsets to config file."""
        self.config_file.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "skillsets": [asdict(s) for s in self._skillsets]
        }
        self.config_file.write_text(json.dumps(data, indent=2))

    def list(self) -> list[Skillset]:
        """list all skillsets."""
        return list(self._skillsets)

    def get(self, name: str) -> Optional[Skillset]:
        """get a skillset by name."""
        for s in self._skillsets:
            if s.name == name:
                return s
        return None

    def add_local(self, path: str, name: Optional[str] = None) -> Skillset:
        """add a skillset from a local directory.

        args:
            path: path to the skills directory
            name: optional name (defaults to directory name)

        returns:
            the created Skillset
        """
        resolved = Path(path).expanduser().resolve()
        if not name:
            name = resolved.name

        # check for duplicate
        if self.get(name):
            raise ValueError(f"skillset '{name}' already exists")

        skillset = Skillset(
            name=name,
            source=str(resolved),
            source_type="local",
            local_path=str(resolved),
        )
        self._skillsets.append(skillset)
        self._save()
        return skillset

    def add_github(
        self,
        url: str,
        name: Optional[str] = None,
    ) -> Skillset:
        """add a skillset from a github repo.

        clones the repo to the clone directory.

        args:
            url: github url or owner/repo
            name: optional name (defaults to repo name)

        returns:
            the created Skillset
        """
        parsed = parse_github_url(url)
        if not parsed:
            raise ValueError(f"invalid github url: {url}")

        owner, repo, branch = parsed

        if not name:
            name = repo

        # check for duplicate
        if self.get(name):
            raise ValueError(f"skillset '{name}' already exists")

        # construct clone url
        clone_url = f"https://github.com/{owner}/{repo}"

        # clone to local directory
        clone_path = self.clone_dir / name
        self.clone_dir.mkdir(parents=True, exist_ok=True)

        cmd = ["git", "clone", "--depth", "1"]
        if branch:
            cmd.extend(["--branch", branch])
        cmd.extend([clone_url, str(clone_path)])

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"git clone failed: {result.stderr}")

        skillset = Skillset(
            name=name,
            source=url,
            source_type="github",
            local_path=str(clone_path),
            branch=branch,
        )
        self._skillsets.append(skillset)
        self._save()
        return skillset

    def remove(self, name: str) -> bool:
        """remove a skillset by name.

        does not delete files for local skillsets.
        does not delete cloned repos for github skillsets.

        returns:
            True if removed, False if not found
        """
        for i, s in enumerate(self._skillsets):
            if s.name == name:
                self._skillsets.pop(i)
                self._save()
                return True
        return False

    def refresh(self, name: str) -> Skillset:
        """refresh a github skillset by pulling latest.

        args:
            name: skillset name

        returns:
            the updated Skillset

        raises:
            ValueError if skillset not found or not a github skillset
        """
        skillset = self.get(name)
        if not skillset:
            raise ValueError(f"skillset '{name}' not found")

        if skillset.source_type != "github":
            raise ValueError(f"skillset '{name}' is not a github skillset")

        if not skillset.local_path:
            raise ValueError(f"skillset '{name}' has no local path")

        # run git pull in the clone directory
        result = subprocess.run(
            ["git", "pull"],
            cwd=skillset.local_path,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"git pull failed: {result.stderr}")

        # update last_refreshed
        skillset.last_refreshed = datetime.now().isoformat()
        self._save()
        return skillset

    def get_skill_loaders(self) -> list[SkillLoader]:
        """get SkillLoaders for all skillsets.

        returns:
            list of SkillLoader instances for each skillset
        """
        loaders = []
        for skillset in self._skillsets:
            path = skillset.get_skills_path()
            if path.exists():
                loaders.append(SkillLoader(path))
        return loaders


# module-level singleton for easy access
_manager: Optional[SkillsetManager] = None


def get_skillset_manager() -> SkillsetManager:
    """get the global skillset manager instance."""
    global _manager
    if _manager is None:
        _manager = SkillsetManager()
    return _manager
