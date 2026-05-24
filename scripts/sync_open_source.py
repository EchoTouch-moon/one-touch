#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path

from export_open_source import export_open_source


DEFAULT_TARGET = Path("/Users/v/new-idea/one touch")

SENSITIVE_PATTERNS = [
    re.compile(r"moonpulse\.online", re.IGNORECASE),
    re.compile(r"82\.157\.5\.124"),
    re.compile(r"鲁ICP备"),
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
]

FORBIDDEN_FILE_PATTERNS = [
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    "*.db-shm",
    "*.db-wal",
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    "*.log",
    "*.jsonl",
    "*.pem",
    "*.key",
    "*.crt",
]

TEXT_EXTS = {
    ".css",
    ".conf",
    ".example",
    ".html",
    ".js",
    ".json",
    ".jsonc",
    ".jsx",
    ".md",
    ".py",
    ".svg",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}

TEXT_NAMES = {".gitignore", "Dockerfile.backend", "docker-compose.yml", "nginx.conf"}

SCAN_EXCLUDED_PATHS = {
    "docs/open-source-prep.zh-CN.md",
    "scripts/export_open_source.py",
    "scripts/sync_open_source.py",
}


def run(command: list[str], *, cwd: Path, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def git_output(args: list[str], cwd: Path) -> str:
    return run(["git", *args], cwd=cwd, capture=True).stdout.strip()


def ensure_git_repo(path: Path) -> None:
    if not (path / ".git").exists():
        raise SystemExit(f"Target is not a git repository: {path}")


def ensure_clean_target(path: Path, *, force: bool) -> None:
    status = git_output(["status", "--porcelain"], path)
    if status and not force:
        raise SystemExit(
            "Target repository has uncommitted changes. Commit/stash them first, "
            "or rerun with --force-target-overwrite if you intentionally want to replace them."
        )


def sync_tree(exported: Path, target: Path) -> None:
    for child in target.iterdir():
        if child.name == ".git":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    for child in exported.iterdir():
        destination = target / child.name
        if child.is_dir():
            shutil.copytree(child, destination, symlinks=True)
        else:
            shutil.copy2(child, destination)


def is_text_file(path: Path) -> bool:
    return path.suffix.lower() in TEXT_EXTS or path.name in TEXT_NAMES


def scan_forbidden_files(target: Path) -> list[str]:
    findings: list[str] = []
    for pattern in FORBIDDEN_FILE_PATTERNS:
        findings.extend(
            str(path.relative_to(target))
            for path in target.rglob(pattern)
            if ".git" not in path.parts and ".claude" not in path.parts
        )
    return sorted(findings)


def scan_sensitive_text(target: Path) -> list[str]:
    findings: list[str] = []
    for path in target.rglob("*"):
        if not path.is_file() or ".git" in path.parts or ".claude" in path.parts or not is_text_file(path):
            continue
        rel = path.relative_to(target).as_posix()
        if rel in SCAN_EXCLUDED_PATHS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in SENSITIVE_PATTERNS:
            match = pattern.search(text)
            if match:
                findings.append(f"{path.relative_to(target)}: {match.group(0)}")
                break
    return sorted(findings)


def run_safety_scan(target: Path) -> None:
    file_findings = scan_forbidden_files(target)
    text_findings = scan_sensitive_text(target)
    if file_findings or text_findings:
        lines = ["Open-source sync failed safety scan."]
        if file_findings:
            lines.append("Forbidden files:")
            lines.extend(f"  - {item}" for item in file_findings[:30])
        if text_findings:
            lines.append("Sensitive text matches:")
            lines.extend(f"  - {item}" for item in text_findings[:30])
        raise SystemExit("\n".join(lines))


def default_commit_message(source: Path) -> str:
    message = git_output(["log", "-1", "--pretty=%s"], source)
    return f"sync: {message}" if message else "sync: update open-source copy"


def maybe_commit(target: Path, source: Path, message: str | None) -> None:
    status = git_output(["status", "--porcelain"], target)
    if not status:
        print("Open-source copy is already up to date.")
        return
    run(["git", "add", "-A"], cwd=target)
    run(["git", "commit", "-m", message or default_commit_message(source)], cwd=target)


def install_post_commit_hook(source: Path, target: Path) -> None:
    hook = source / ".git" / "hooks" / "post-commit"
    script = source / "scripts" / "sync_open_source.py"
    hook.write_text(
        "#!/bin/sh\n"
        f"python3 {shlex.quote(str(script))} --target {shlex.quote(str(target))} --commit\n",
        encoding="utf-8",
    )
    os.chmod(hook, 0o755)
    print(f"Installed post-commit hook: {hook}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync the sanitized open-source copy into the one touch repository.")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET, help="Existing public git repository to update")
    parser.add_argument("--commit", action="store_true", help="Create a commit in the target repository after syncing")
    parser.add_argument("--message", help="Commit message for the target repository")
    parser.add_argument("--check-only", action="store_true", help="Only run the safety scan on the target repository")
    parser.add_argument("--install-hook", action="store_true", help="Install a private repo post-commit hook for automatic sync")
    parser.add_argument("--force-target-overwrite", action="store_true", help="Replace target files even when target has changes")
    args = parser.parse_args()

    source = Path(__file__).resolve().parents[1]
    target = args.target.expanduser().resolve()

    ensure_git_repo(target)

    if args.install_hook:
        install_post_commit_hook(source, target)
        return 0

    if args.check_only:
        run_safety_scan(target)
        print("Safety scan passed.")
        return 0

    ensure_clean_target(target, force=args.force_target_overwrite)

    with tempfile.TemporaryDirectory(prefix="glm-words-open-source-") as tmp:
        exported = Path(tmp) / "export"
        export_open_source(source, exported)
        sync_tree(exported, target)

    run_safety_scan(target)
    if args.commit:
        maybe_commit(target, source, args.message)
    else:
        print(f"Synced sanitized copy to: {target}")
        print("Review the target diff, then commit it from the target repository.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
