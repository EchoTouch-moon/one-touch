#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import re
import shutil
from pathlib import Path


SKIP_DIRS = {
    ".git",
    ".claude",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "node_modules",
    "dist",
    ".vite",
    "logs",
    "backups",
    "data",
    "temp",
    "tmp",
}

SKIP_NAMES = {
    ".DS_Store",
    "words.db",
    "stylus diagnostics.jpg",
    "AI开发.md",
    "简历.md",
}

SKIP_PATTERNS = [
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    "*.db-shm",
    "*.db-wal",
    "*.log",
    "*.jsonl",
    "stylus-diagnostics-*.json",
    "*.pem",
    "*.key",
    "*.crt",
]

TEXT_REWRITES = [
    (re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b"), "127.0.0.1"),
    (re.compile(r"[\u4e00-\u9fa5]?ICP备[\d号\-]+"), "ICP备案号"),
]

TEXT_EXTS = {
    ".md", ".txt", ".json", ".jsonc", ".yml", ".yaml", ".toml",
    ".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".html", ".xml",
    ".svg", ".conf", ".example",
}


def should_skip(path: Path) -> bool:
    if path.name in SKIP_NAMES:
        return True
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    return any(fnmatch.fnmatch(path.name, pattern) for pattern in SKIP_PATTERNS)


def rewrite_text(content: str, rel: Path) -> str:
    del rel
    for pattern, replacement in TEXT_REWRITES:
        content = pattern.sub(replacement, content)
    return content


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a sanitized open-source copy of the project.")
    parser.add_argument("destination", help="Target directory for the public copy")
    args = parser.parse_args()

    src = Path.cwd()
    dst = Path(args.destination).expanduser().resolve()
    if dst == src or src in dst.parents:
        raise SystemExit("Destination must be outside the project directory.")
    if dst.exists():
        if any(dst.iterdir()):
            raise SystemExit(f"Destination is not empty: {dst}")
    dst.mkdir(parents=True, exist_ok=True)

    for path in src.rglob("*"):
        rel = path.relative_to(src)
        if should_skip(rel):
            continue
        target = dst / rel
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix.lower() in TEXT_EXTS or path.name in {".gitignore", "Dockerfile.backend", "docker-compose.yml", "nginx.conf"}:
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                shutil.copy2(path, target)
            else:
                target.write_text(rewrite_text(text, rel), encoding="utf-8")
        else:
            shutil.copy2(path, target)

    print(f"Exported sanitized copy to: {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
