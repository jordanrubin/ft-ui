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

    def build_prompt(self, context: str, params: Optional[dict] = None) -> str:
        """build the full prompt for this skill with context and optional params."""
        param_section = ""
        if params:
            param_lines = [f"- {k}: {v}" for k, v in params.items()]
            param_section = f"\n<parameters>\n" + "\n".join(param_lines) + "\n</parameters>\n"

        return f"""<skill name="{self.name}">
{self.body}
</skill>
{param_section}
<context>
{context}
</context>

apply the {self.name} skill above to the context. follow the skill's process exactly."""


@dataclass
class SkillInvocation:
    """a single skill invocation with optional parameters."""

    name: str
    params: dict

    @classmethod
    def parse(cls, text: str) -> SkillInvocation:
        """parse '@skill' or '@skill(param=value, param2=value2)'."""
        text = text.strip().lstrip("@")

        # check for params: skill(param=value)
        match = re.match(r"(\w+)\(([^)]*)\)", text)
        if match:
            name = match.group(1)
            params_str = match.group(2)
            params = {}
            if params_str:
                for pair in params_str.split(","):
                    if "=" in pair:
                        k, v = pair.split("=", 1)
                        params[k.strip()] = v.strip()
            return cls(name=name, params=params)

        # no params
        return cls(name=text, params={})


@dataclass
class SkillChain:
    """a chain of skills to run in sequence: @skill1 | @skill2 | @skill3."""

    invocations: list[SkillInvocation]

    @classmethod
    def parse(cls, text: str) -> SkillChain:
        """parse '@skill1 | @skill2' or '@skill1(p=v) | @skill2'."""
        parts = [p.strip() for p in text.split("|")]
        invocations = [SkillInvocation.parse(p) for p in parts if p]
        return cls(invocations=invocations)

    @property
    def display_name(self) -> str:
        """display name for the chain."""
        names = [f"@{inv.name}" for inv in self.invocations]
        return " | ".join(names)

    def is_single(self) -> bool:
        """check if this is a single skill (not a chain)."""
        return len(self.invocations) == 1


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

    def resolve_chain(self, chain: SkillChain) -> list[tuple[Skill, dict]]:
        """resolve a skill chain to list of (skill, params) tuples.

        raises ValueError if any skill in the chain is not found.
        """
        self.load()
        resolved = []
        for inv in chain.invocations:
            skill = self._skills.get(inv.name)
            if not skill:
                raise ValueError(f"skill not found: @{inv.name}")
            resolved.append((skill, inv.params))
        return resolved

    def list_skills(self) -> list[Skill]:
        """list all loaded skills, ordered for plan-building workflow."""
        self.load()

        # plan-workflow order: askuserquestions → excavate → diverge → stressify → simulate → backchain → antithesize → synthesize
        # then alphabetical for the rest
        priority_order = [
            "askuserquestions",  # clarify before planning
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


# default loader paths - look for sibling runeforge repo and local skills
_project_root = Path(__file__).parent.parent.parent.parent  # ft-ui/
_local_skills_dir = _project_root / "skills"
_public_skills_dir = _project_root.parent / "runeforge" / "public"
_full_skills_dir = _project_root.parent / "runeforge" / "runeforge"


def _resolve_skills_dir(skills_dir: Optional[str] = None, full: bool = False) -> Path:
    """resolve skills directory from argument, env var, or default.

    priority:
    1. explicit skills_dir argument
    2. RUNEFORGE_SKILLS_DIR environment variable
    3. RUNEFORGE_PUBLIC_SKILLS_DIR or RUNEFORGE_FULL_SKILLS_DIR env vars
    4. default sibling directory structure
    """
    import os

    # 1. Explicit argument takes priority
    if skills_dir:
        path = Path(skills_dir).expanduser()
        if path.exists():
            return path
        # Try to interpret as relative path from project root
        alt_path = _project_root / skills_dir
        if alt_path.exists():
            return alt_path
        # Return the original path even if it doesn't exist
        return path

    # 2. Generic env var
    env_path = os.environ.get("RUNEFORGE_SKILLS_DIR")
    if env_path:
        path = Path(env_path).expanduser()
        if path.exists():
            return path

    # 3. Specific env vars for public/full
    if full:
        env_path = os.environ.get("RUNEFORGE_FULL_SKILLS_DIR")
    else:
        env_path = os.environ.get("RUNEFORGE_PUBLIC_SKILLS_DIR")

    if env_path:
        path = Path(env_path).expanduser()
        if path.exists():
            return path

    # 4. Default paths
    default_path = _full_skills_dir if full else _public_skills_dir

    # Also check some common alternative locations
    alternative_paths = [
        Path.home() / ".runeforge" / ("runeforge" if full else "public"),
        Path.home() / "runeforge" / ("runeforge" if full else "public"),
        Path("/opt/runeforge") / ("runeforge" if full else "public"),
    ]

    if default_path.exists():
        return default_path

    for alt in alternative_paths:
        if alt.exists():
            return alt

    # Return default even if it doesn't exist
    return default_path


class CompositeSkillLoader:
    """loads skills from multiple directories."""

    def __init__(self, loaders: list[SkillLoader]):
        self.loaders = loaders
        self._skills: dict[str, Skill] = {}
        self._loaded = False

    def load(self) -> dict[str, Skill]:
        """merge skills from all loaders."""
        if self._loaded:
            return self._skills

        for loader in self.loaders:
            self._skills.update(loader.load())

        self._loaded = True
        return self._skills

    def get(self, name: str) -> Optional[Skill]:
        """get a skill by name."""
        self.load()
        name = name.lstrip("@")
        return self._skills.get(name)

    def resolve_chain(self, chain: SkillChain) -> list[tuple[Skill, dict]]:
        """resolve a skill chain."""
        self.load()
        resolved = []
        for inv in chain.invocations:
            skill = self._skills.get(inv.name)
            if not skill:
                raise ValueError(f"skill not found: @{inv.name}")
            resolved.append((skill, inv.params))
        return resolved

    def list_skills(self) -> list[Skill]:
        """list all loaded skills, ordered for plan-building workflow."""
        self.load()

        priority_order = [
            "askuserquestions",
            "excavate",
            "diverge",
            "stressify",
            "simulate",
            "backchain",
            "antithesize",
            "synthesize",
        ]

        def sort_key(skill: Skill) -> tuple[int, str]:
            try:
                return (priority_order.index(skill.name), skill.name)
            except ValueError:
                return (len(priority_order), skill.name)

        return sorted(self._skills.values(), key=sort_key)


def get_default_loader(skills_dir: Optional[str] = None, full: bool = False) -> CompositeSkillLoader:
    """get skill loader combining local and external skills.

    args:
        skills_dir: explicit path to skills directory (overrides env vars)
        full: if True, use full runeforge set (38 skills).
              if False, use public set only (10 skills).

    environment variables:
        RUNEFORGE_SKILLS_DIR: path to skills directory (highest priority after explicit arg)
        RUNEFORGE_PUBLIC_SKILLS_DIR: path to public skills directory
        RUNEFORGE_FULL_SKILLS_DIR: path to full skills directory

    always includes local skills directory.
    """
    resolved_dir = _resolve_skills_dir(skills_dir, full)
    loaders = [
        SkillLoader(_local_skills_dir),  # local skills first (higher priority)
        SkillLoader(resolved_dir),        # then external runeforge skills
    ]
    return CompositeSkillLoader(loaders)
