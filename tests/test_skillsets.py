"""tests for skillset ingestion - adding skills from GitHub repos or local folders."""

import pytest
import tempfile
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

from runeforge_canvas.core.skillsets import (
    Skillset,
    SkillsetManager,
    parse_github_url,
)
from runeforge_canvas.core.skills import SkillLoader


class TestSkillset:
    """tests for Skillset model."""

    def test_create_local_skillset(self):
        """create a skillset from local path."""
        skillset = Skillset(
            name="my-skills",
            source="/home/user/my-skills",
            source_type="local",
        )
        assert skillset.name == "my-skills"
        assert skillset.source == "/home/user/my-skills"
        assert skillset.source_type == "local"

    def test_create_github_skillset(self):
        """create a skillset from github url."""
        skillset = Skillset(
            name="community-skills",
            source="https://github.com/user/skills-repo",
            source_type="github",
        )
        assert skillset.name == "community-skills"
        assert skillset.source_type == "github"


class TestParseGithubUrl:
    """tests for GitHub URL parsing."""

    def test_parse_https_url(self):
        """parse standard https github url."""
        result = parse_github_url("https://github.com/owner/repo")
        assert result == ("owner", "repo", None)

    def test_parse_https_url_with_git(self):
        """parse https url ending in .git."""
        result = parse_github_url("https://github.com/owner/repo.git")
        assert result == ("owner", "repo", None)

    def test_parse_https_url_with_branch(self):
        """parse url with branch/tree path."""
        result = parse_github_url("https://github.com/owner/repo/tree/main")
        assert result == ("owner", "repo", "main")

    def test_parse_short_form(self):
        """parse owner/repo short form."""
        result = parse_github_url("owner/repo")
        assert result == ("owner", "repo", None)

    def test_invalid_url_returns_none(self):
        """invalid url returns None."""
        result = parse_github_url("not-a-valid-url")
        assert result is None


class TestSkillsetManager:
    """tests for SkillsetManager."""

    def test_add_local_skillset(self):
        """add a skillset from local directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # create skills directory structure
            skills_dir = Path(tmpdir) / "my-skills"
            skills_dir.mkdir()
            skill_dir = skills_dir / "testskill"
            skill_dir.mkdir()
            (skill_dir / "TESTSKILL.md").write_text("""---
name: testskill
description: a test skill
---

# Test Skill

Do the test thing.
""")

            # create manager with temp config file
            config_file = Path(tmpdir) / "skillsets.json"
            manager = SkillsetManager(config_file=config_file)

            # add the skillset
            skillset = manager.add_local(str(skills_dir), name="my-skills")

            assert skillset.name == "my-skills"
            assert skillset.source_type == "local"
            assert len(manager.list()) == 1

            # verify config was saved
            assert config_file.exists()
            saved = json.loads(config_file.read_text())
            assert len(saved["skillsets"]) == 1

    def test_add_local_skillset_infers_name(self):
        """add local skillset infers name from folder."""
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = Path(tmpdir) / "awesome-skills"
            skills_dir.mkdir()

            config_file = Path(tmpdir) / "skillsets.json"
            manager = SkillsetManager(config_file=config_file)

            skillset = manager.add_local(str(skills_dir))
            assert skillset.name == "awesome-skills"

    def test_remove_skillset(self):
        """remove a skillset."""
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = Path(tmpdir) / "skills"
            skills_dir.mkdir()

            config_file = Path(tmpdir) / "skillsets.json"
            manager = SkillsetManager(config_file=config_file)

            skillset = manager.add_local(str(skills_dir), name="to-remove")
            assert len(manager.list()) == 1

            manager.remove("to-remove")
            assert len(manager.list()) == 0

    def test_get_skill_loaders(self):
        """get SkillLoaders for all skillsets."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # create two skill directories
            skills1 = Path(tmpdir) / "skills1"
            skills1.mkdir()
            skill_dir1 = skills1 / "skill1"
            skill_dir1.mkdir()
            (skill_dir1 / "SKILL1.md").write_text("""---
name: skill1
description: first skill
---
body
""")

            skills2 = Path(tmpdir) / "skills2"
            skills2.mkdir()
            skill_dir2 = skills2 / "skill2"
            skill_dir2.mkdir()
            (skill_dir2 / "SKILL2.md").write_text("""---
name: skill2
description: second skill
---
body
""")

            config_file = Path(tmpdir) / "skillsets.json"
            manager = SkillsetManager(config_file=config_file)

            manager.add_local(str(skills1), name="set1")
            manager.add_local(str(skills2), name="set2")

            loaders = manager.get_skill_loaders()
            assert len(loaders) == 2

            # verify loaders can load skills
            all_skills = {}
            for loader in loaders:
                all_skills.update(loader.load())

            assert "skill1" in all_skills
            assert "skill2" in all_skills

    def test_persistence(self):
        """skillsets persist across manager instances."""
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = Path(tmpdir) / "skills"
            skills_dir.mkdir()

            config_file = Path(tmpdir) / "skillsets.json"

            # add with first manager
            manager1 = SkillsetManager(config_file=config_file)
            manager1.add_local(str(skills_dir), name="persistent")

            # load with second manager
            manager2 = SkillsetManager(config_file=config_file)
            skillsets = manager2.list()

            assert len(skillsets) == 1
            assert skillsets[0].name == "persistent"


class TestSkillsetGithub:
    """tests for GitHub skillset cloning."""

    @patch("runeforge_canvas.core.skillsets.subprocess.run")
    def test_add_github_skillset(self, mock_run):
        """add a skillset from github clones repo."""
        mock_run.return_value = MagicMock(returncode=0)

        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "skillsets.json"
            clone_dir = Path(tmpdir) / "clones"
            manager = SkillsetManager(config_file=config_file, clone_dir=clone_dir)

            skillset = manager.add_github("https://github.com/user/skills-repo")

            assert skillset.name == "skills-repo"
            assert skillset.source_type == "github"
            mock_run.assert_called_once()
            # verify git clone was called with correct url
            call_args = mock_run.call_args[0][0]
            assert "git" in call_args
            assert "clone" in call_args
            assert "https://github.com/user/skills-repo" in call_args

    @patch("runeforge_canvas.core.skillsets.subprocess.run")
    def test_add_github_with_branch(self, mock_run):
        """add github skillset with specific branch."""
        mock_run.return_value = MagicMock(returncode=0)

        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "skillsets.json"
            clone_dir = Path(tmpdir) / "clones"
            manager = SkillsetManager(config_file=config_file, clone_dir=clone_dir)

            skillset = manager.add_github(
                "https://github.com/user/skills-repo/tree/develop"
            )

            call_args = mock_run.call_args[0][0]
            assert "--branch" in call_args
            assert "develop" in call_args

    @patch("runeforge_canvas.core.skillsets.subprocess.run")
    def test_refresh_github_skillset(self, mock_run):
        """refresh a github skillset pulls latest."""
        mock_run.return_value = MagicMock(returncode=0)

        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "skillsets.json"
            clone_dir = Path(tmpdir) / "clones"
            manager = SkillsetManager(config_file=config_file, clone_dir=clone_dir)

            # first add
            manager.add_github("https://github.com/user/skills-repo")
            mock_run.reset_mock()

            # then refresh
            manager.refresh("skills-repo")

            mock_run.assert_called_once()
            call_args = mock_run.call_args[0][0]
            assert "git" in call_args
            assert "pull" in call_args
