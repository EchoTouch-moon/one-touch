from __future__ import annotations

import asyncio
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

from backend.config import AppConfig


def sqlite_path_from_url(database_url: str) -> Path | None:
    if not database_url.startswith("sqlite"):
        return None

    parsed = urlparse(database_url)
    if parsed.scheme not in {"sqlite", "sqlite+aiosqlite"}:
        return None
    if parsed.path in {"", "/:memory:"}:
        return None

    path = unquote(parsed.path)
    if parsed.netloc:
        path = f"//{parsed.netloc}{path}"
    return Path(path)


def run_sqlite_backup(config: AppConfig) -> Path | None:
    source = sqlite_path_from_url(config.database.url)
    if source is None or not source.exists():
        return None

    backup_dir = Path(config.ops.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    target = backup_dir / f"words-{stamp}.db"
    with sqlite3.connect(source) as source_conn:
        with sqlite3.connect(target) as target_conn:
            source_conn.backup(target_conn)
    return target


def prune_old_backups(config: AppConfig) -> int:
    retention_days = max(1, config.ops.backup_retention_days)
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    backup_dir = Path(config.ops.backup_dir)
    if not backup_dir.exists():
        return 0

    removed = 0
    for file in backup_dir.glob("words-*.db"):
        mtime = datetime.fromtimestamp(file.stat().st_mtime, tz=UTC)
        if mtime < cutoff:
            file.unlink()
            removed += 1
    return removed


async def backup_loop(config: AppConfig, logger) -> None:
    interval_seconds = max(1, config.ops.backup_interval_hours) * 60 * 60
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            target = await asyncio.to_thread(run_sqlite_backup, config)
            removed = await asyncio.to_thread(prune_old_backups, config)
            if target:
                logger.info("Database backup created at %s; pruned %d old backups", target, removed)
            else:
                logger.info("Skipped database backup because no SQLite database file was found")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Database backup failed")
