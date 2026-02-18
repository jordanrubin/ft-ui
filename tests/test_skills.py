"""tests for skill loading and parsing."""

import pytest
import tempfile
from pathlib import Path

from future_tokenizer.core.skills import (
    Skill,
    SkillInvocation,
    SkillChain,
    SkillLoader,
    BlendSkillLoader,
    CompositeSkillLoader,
)


class TestSkillInvocation:
    """tests for SkillInvocation parsing."""

    def test_parse_simple(self):
        """parse '@skill' without params."""
        inv = SkillInvocation.parse("@excavate")
        assert inv.name == "excavate"
        assert inv.params == {}

    def test_parse_with_at(self):
        """@ prefix is stripped."""
        inv = SkillInvocation.parse("@stressify")
        assert inv.name == "stressify"

    def test_parse_without_at(self):
        """works without @ prefix."""
        inv = SkillInvocation.parse("diverge")
        assert inv.name == "diverge"

    def test_parse_with_params(self):
        """parse '@skill(param=value)'."""
        inv = SkillInvocation.parse("@simulate(steps=5)")
        assert inv.name == "simulate"
        assert inv.params == {"steps": "5"}

    def test_parse_multiple_params(self):
        """parse '@skill(a=1, b=2)'."""
        inv = SkillInvocation.parse("@test(a=1, b=2, c=three)")
        assert inv.name == "test"
        assert inv.params == {"a": "1", "b": "2", "c": "three"}

    def test_parse_whitespace(self):
        """whitespace is trimmed."""
        inv = SkillInvocation.parse("  @excavate  ")
        assert inv.name == "excavate"


class TestSkillChain:
    """tests for SkillChain parsing."""

    def test_parse_single(self):
        """single skill is valid chain."""
        chain = SkillChain.parse("@excavate")
        assert len(chain.invocations) == 1
        assert chain.invocations[0].name == "excavate"
        assert chain.is_single()

    def test_parse_multiple(self):
        """pipe-separated skills."""
        chain = SkillChain.parse("@excavate | @stressify | @synthesize")
        assert len(chain.invocations) == 3
        assert chain.invocations[0].name == "excavate"
        assert chain.invocations[1].name == "stressify"
        assert chain.invocations[2].name == "synthesize"
        assert not chain.is_single()

    def test_parse_with_params(self):
        """chain with params on some skills."""
        chain = SkillChain.parse("@excavate | @simulate(steps=3)")
        assert len(chain.invocations) == 2
        assert chain.invocations[0].params == {}
        assert chain.invocations[1].params == {"steps": "3"}

    def test_display_name(self):
        """display_name joins with pipes."""
        chain = SkillChain.parse("@a | @b | @c")
        assert chain.display_name == "@a | @b | @c"


class TestSkillLoader:
    """tests for SkillLoader."""

    def test_load_empty_dir(self):
        """empty dir returns no skills."""
        with tempfile.TemporaryDirectory() as tmpdir:
            loader = SkillLoader(Path(tmpdir))
            skills = loader.load()
            assert skills == {}

    def test_load_skill_file(self):
        """loads skill from {name}/{NAME}.md."""
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "excavate"
            skill_dir.mkdir()
            skill_file = skill_dir / "EXCAVATE.md"
            skill_file.write_text("""---
name: excavate
description: surface hidden assumptions
---

# excavate

dig deep into the assumptions.
""")
            loader = SkillLoader(Path(tmpdir))
            skills = loader.load()

            assert "excavate" in skills
            assert skills["excavate"].name == "excavate"
            assert skills["excavate"].description == "surface hidden assumptions"
            assert "dig deep" in skills["excavate"].body

    def test_get_skill(self):
        """get() returns skill by name."""
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "test"
            skill_dir.mkdir()
            (skill_dir / "TEST.md").write_text("""---
name: test
description: test skill
---
body
""")
            loader = SkillLoader(Path(tmpdir))
            skill = loader.get("test")
            assert skill is not None
            assert skill.name == "test"

    def test_get_with_at_prefix(self):
        """get() accepts @prefix."""
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "test"
            skill_dir.mkdir()
            (skill_dir / "TEST.md").write_text("""---
name: test
description: test skill
---
body
""")
            loader = SkillLoader(Path(tmpdir))
            skill = loader.get("@test")
            assert skill is not None
            assert skill.name == "test"

    def test_list_skills_ordered(self):
        """list_skills returns plan-workflow order."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # create skills in non-workflow order
            for name in ["synthesize", "excavate", "diverge", "zzz"]:
                skill_dir = Path(tmpdir) / name
                skill_dir.mkdir()
                (skill_dir / f"{name.upper()}.md").write_text(f"""---
name: {name}
description: {name} skill
---
body
""")
            loader = SkillLoader(Path(tmpdir))
            skills = loader.list_skills()
            names = [s.name for s in skills]

            # excavate should come before diverge, synthesize last of known
            assert names.index("excavate") < names.index("diverge")
            assert names.index("diverge") < names.index("synthesize")
            # unknown skills come after known ones, alphabetically
            assert names.index("synthesize") < names.index("zzz")


class TestSkill:
    """tests for Skill."""

    def test_display_name(self):
        """display_name adds @ prefix."""
        skill = Skill(
            name="excavate",
            description="test",
            body="body",
            path=Path("/fake"),
        )
        assert skill.display_name == "@excavate"

    def test_build_prompt(self):
        """build_prompt formats skill with context."""
        skill = Skill(
            name="excavate",
            description="test",
            body="dig for assumptions",
            path=Path("/fake"),
        )
        prompt = skill.build_prompt("my context here")

        assert '<skill name="excavate">' in prompt
        assert "dig for assumptions" in prompt
        assert "</skill>" in prompt
        assert "<context>" in prompt
        assert "my context here" in prompt
        assert "</context>" in prompt
        assert "excavate skill" in prompt  # skill name mentioned in instruction

    def test_build_prompt_with_params(self):
        """build_prompt includes parameters."""
        skill = Skill(
            name="simulate",
            description="test",
            body="run simulation",
            path=Path("/fake"),
        )
        prompt = skill.build_prompt("context", params={"steps": "5", "depth": "3"})

        assert "<parameters>" in prompt
        assert "steps: 5" in prompt
        assert "depth: 3" in prompt

    def test_build_prompt_mode_excluded_from_skill_params(self):
        """mode is treated as a render param, not passed to skill."""
        skill = Skill(
            name="excavate",
            description="test",
            body="dig",
            path=Path("/fake"),
        )
        prompt = skill.build_prompt("context", params={"mode": "critical", "steps": "5"})

        assert "<parameters>" in prompt
        assert "steps: 5" in prompt
        # mode should NOT appear in the parameters section
        assert "mode: critical" not in prompt


class TestBlendSkillLoader:
    """tests for BlendSkillLoader."""

    def test_load_blend_skills(self):
        """loads mode-inflected skills from blend directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # create blend structure: excavate/EXCAVATE-CRITICAL.md
            skill_dir = Path(tmpdir) / "excavate"
            skill_dir.mkdir()
            (skill_dir / "EXCAVATE-CRITICAL.md").write_text("""---
name: excavate-critical
parent: excavate
mode: critical
description: critical mode excavate
---

# excavate — CRITICAL mode

find weak assumptions.
""")
            (skill_dir / "EXCAVATE-POSITIVE.md").write_text("""---
name: excavate-positive
parent: excavate
mode: positive
description: positive mode excavate
---

# excavate — POSITIVE mode

find strong assumptions.
""")
            loader = BlendSkillLoader(Path(tmpdir))
            skills = loader.load()

            assert "excavate-critical" in skills
            assert "excavate-positive" in skills
            assert skills["excavate-critical"].description == "critical mode excavate"
            assert "weak assumptions" in skills["excavate-critical"].body

    def test_load_missing_dir(self):
        """missing directory returns empty dict."""
        loader = BlendSkillLoader(Path("/nonexistent"))
        skills = loader.load()
        assert skills == {}

    def test_get_blend_skill(self):
        """get() returns blend skill by compound key."""
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "excavate"
            skill_dir.mkdir()
            (skill_dir / "EXCAVATE-CRITICAL.md").write_text("""---
name: excavate-critical
description: critical mode
---
body
""")
            loader = BlendSkillLoader(Path(tmpdir))
            skill = loader.get("excavate-critical")
            assert skill is not None
            assert skill.name == "excavate-critical"


class TestCompositeSkillLoaderWithMode:
    """tests for CompositeSkillLoader.get_with_mode()."""

    def _make_loaders(self, tmpdir):
        """create base skill loader and blend loader in tmpdir."""
        base_dir = Path(tmpdir) / "base"
        blend_dir = Path(tmpdir) / "blend"

        # base skill
        skill_dir = base_dir / "excavate"
        skill_dir.mkdir(parents=True)
        (skill_dir / "EXCAVATE.md").write_text("""---
name: excavate
description: base excavate
---
base body
""")

        # blend skill
        blend_skill_dir = blend_dir / "excavate"
        blend_skill_dir.mkdir(parents=True)
        (blend_skill_dir / "EXCAVATE-CRITICAL.md").write_text("""---
name: excavate-critical
description: critical mode
---
critical body
""")

        base_loader = SkillLoader(base_dir)
        blend_loader = BlendSkillLoader(blend_dir)
        return CompositeSkillLoader([base_loader], blend_loader=blend_loader)

    def test_get_with_mode_returns_blend(self):
        """get_with_mode returns blend skill when mode matches."""
        with tempfile.TemporaryDirectory() as tmpdir:
            loader = self._make_loaders(tmpdir)
            skill = loader.get_with_mode("excavate", "critical")
            assert skill is not None
            assert skill.name == "excavate-critical"
            assert "critical body" in skill.body

    def test_blend_skill_display_name_includes_mode(self):
        """blend skill display_name shows mode for node badges."""
        with tempfile.TemporaryDirectory() as tmpdir:
            loader = self._make_loaders(tmpdir)
            skill = loader.get_with_mode("excavate", "critical")
            assert skill.display_name == "@excavate-critical"

    def test_get_with_mode_falls_back_to_base(self):
        """get_with_mode falls back to base when mode doesn't match."""
        with tempfile.TemporaryDirectory() as tmpdir:
            loader = self._make_loaders(tmpdir)
            skill = loader.get_with_mode("excavate", "nonexistent")
            assert skill is not None
            assert skill.name == "excavate"
            assert "base body" in skill.body

    def test_get_with_no_mode(self):
        """get_with_mode with no mode returns base skill."""
        with tempfile.TemporaryDirectory() as tmpdir:
            loader = self._make_loaders(tmpdir)
            skill = loader.get_with_mode("excavate", None)
            assert skill is not None
            assert skill.name == "excavate"

    def test_get_with_mode_no_blend_loader(self):
        """get_with_mode works when no blend loader is configured."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir) / "base"
            skill_dir = base_dir / "excavate"
            skill_dir.mkdir(parents=True)
            (skill_dir / "EXCAVATE.md").write_text("""---
name: excavate
description: base excavate
---
base body
""")
            loader = CompositeSkillLoader([SkillLoader(base_dir)])
            skill = loader.get_with_mode("excavate", "critical")
            assert skill is not None
            assert skill.name == "excavate"
