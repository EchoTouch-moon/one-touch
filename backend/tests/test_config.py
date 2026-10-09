from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from backend.config import ensure_data_dir

REPO_ROOT = Path(__file__).resolve().parents[2]


def read_config(env: dict[str, str], expression: str) -> tuple[str, str]:
    """Read one config value in a fresh interpreter with `env` applied.

    Most config fields are dataclass defaults, so they are bound when the module
    is first imported rather than when AppConfig() is constructed. Setting the
    environment in-process would therefore test nothing, so this spawns a
    process the way a real deployment starts the app.
    """
    code = f"from backend.config import AppConfig; print(AppConfig().{expression})"
    result = subprocess.run(
        [sys.executable, "-c", code],
        env={**os.environ, **env},
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip().splitlines()[-1], result.stderr


def test_legacy_env_names_are_still_honoured():
    """An existing deployment keeps working after the ONETOUCH_ rename."""
    value, stderr = read_config({"GLM_WORDS_ADMIN_USERNAME": "legacy-admin"}, "admin_username")
    assert value == "legacy-admin"
    assert "GLM_WORDS_ADMIN_USERNAME is deprecated" in stderr


def test_new_env_names_win_over_legacy_ones():
    value, _ = read_config(
        {"GLM_WORDS_REVIEW_ALGORITHM": "sm2", "ONETOUCH_REVIEW_ALGORITHM": "fsrs"},
        "review.algorithm",
    )
    assert value == "fsrs"


def test_new_env_names_are_used_without_warnings():
    value, stderr = read_config({"ONETOUCH_REVIEW_ALGORITHM": "fsrs"}, "review.algorithm")
    assert value == "fsrs"
    assert "deprecated" not in stderr


def test_defaults_land_in_the_new_data_directory():
    value, _ = read_config({}, "database.url")
    assert value.endswith("/.one-touch/words.db")
    assert "glm-words" not in value


def test_ensure_data_dir_adopts_the_legacy_directory(tmp_path, monkeypatch):
    """~/.glm-words is moved once, so a rename never orphans local data."""
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    legacy = tmp_path / ".glm-words"
    (legacy / "backups").mkdir(parents=True)
    (legacy / "words.db").write_text("sqlite-bytes", encoding="utf-8")

    current = ensure_data_dir()

    assert current == tmp_path / ".one-touch"
    assert (current / "words.db").read_text(encoding="utf-8") == "sqlite-bytes"
    assert (current / "backups").is_dir()
    assert not legacy.exists()


def test_ensure_data_dir_never_overwrites_existing_state(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    current = tmp_path / ".one-touch"
    current.mkdir()
    (current / "words.db").write_text("new", encoding="utf-8")
    legacy = tmp_path / ".glm-words"
    legacy.mkdir()
    (legacy / "words.db").write_text("old", encoding="utf-8")

    assert ensure_data_dir() == current
    assert (current / "words.db").read_text(encoding="utf-8") == "new"
    assert legacy.exists()
