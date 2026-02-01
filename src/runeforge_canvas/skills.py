"""skill loader for runeforge public skills.

scans skill directory, parses yaml frontmatter + markdown body.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class Skill:
    """a runeforge skill definition."""

    name: str
    description: str
    body: str  # full markdown body (the procedural definition)
    path: Path

    @property
    def display_name(self) -> str:
        """display name with @ prefix."""
        return f"@{self.name}"

    def build_prompt(self, context: str) -> str:
        """build the full prompt for this skill with context."""
        return f"""<skill>
{self.body}
</skill>

<context>
{context}
</context>

apply the skill above to the context. follow the skill's process exactly."""


class SkillLoader:
    """loads skills from a directory."""

    def __init__(self, skills_dir: Path):
        self.skills_dir = skills_dir
        self._skills: dict[str, Skill] = {}
        self._loaded = False

    def load(self) -> dict[str, Skill]:
        """scan directory and load all skills."""
        if self._loaded:
            return self._skills

        if not self.skills_dir.exists():
            return self._skills

        for skill_dir in self.skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue
            if skill_dir.name.startswith("."):
                continue

            # skill file is {SKILL_NAME}.md in uppercase
            skill_file = skill_dir / f"{skill_dir.name.upper()}.md"
            if not skill_file.exists():
                continue

            skill = self._parse_skill_file(skill_file)
            if skill:
                self._skills[skill.name] = skill

        self._loaded = True
        return self._skills

    def get(self, name: str) -> Optional[Skill]:
        """get a skill by name (with or without @ prefix)."""
        self.load()
        name = name.lstrip("@")
        return self._skills.get(name)

    def list_skills(self) -> list[Skill]:
        """list all loaded skills, ordered for plan-building workflow."""
        self.load()

        # plan-workflow order: excavate → diverge → stressify → simulate → backchain → antithesize → synthesize
        # then alphabetical for the rest
        priority_order = [
            "excavate",      # surface assumptions first
            "diverge",       # generate alternatives
            "stressify",     # probe for failure
            "simulate",      # trace execution
            "backchain",     # reverse causal reasoning
            "antithesize",   # generate opposition
            "synthesize",    # compress to decision
        ]

        def sort_key(skill: Skill) -> tuple[int, str]:
            try:
                return (priority_order.index(skill.name), skill.name)
            except ValueError:
                return (len(priority_order), skill.name)

        return sorted(self._skills.values(), key=sort_key)

    def _parse_skill_file(self, path: Path) -> Optional[Skill]:
        """parse a skill markdown file with yaml frontmatter."""
        try:
            content = path.read_text()
        except Exception:
            return None

        # parse yaml frontmatter
        frontmatter, body = self._split_frontmatter(content)
        if not frontmatter:
            return None

        name = frontmatter.get("name")
        description = frontmatter.get("description", "")

        if not name:
            return None

        return Skill(
            name=name,
            description=description,
            body=body.strip(),
            path=path,
        )

    def _split_frontmatter(self, content: str) -> tuple[dict, str]:
        """split yaml frontmatter from markdown body."""
        # match --- at start, then yaml, then ---
        match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
        if not match:
            return {}, content

        yaml_str = match.group(1)
        body = match.group(2)

        # simple yaml parsing (just key: value lines)
        frontmatter = {}
        for line in yaml_str.split("\n"):
            if ":" in line:
                key, value = line.split(":", 1)
                frontmatter[key.strip()] = value.strip()

        return frontmatter, body


# default loader paths
_public_skills_dir = Path(__file__).parent.parent.parent.parent / "runeforge" / "public"
_full_skills_dir = Path(__file__).parent.parent.parent.parent / "runeforge" / "runeforge"


def get_default_loader(full: bool = False) -> SkillLoader:
    """get skill loader.

    args:
        full: if True, use full runeforge set (38 skills).
              if False, use public set only (10 skills).
    """
    skills_dir = _full_skills_dir if full else _public_skills_dir
    return SkillLoader(skills_dir)
