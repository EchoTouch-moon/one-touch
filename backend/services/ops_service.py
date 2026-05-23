from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from backend.config import AppConfig


def append_jsonl(config: AppConfig, filename: str, payload: dict[str, Any]) -> Path:
    log_dir = Path(config.ops.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    target = log_dir / filename
    record = {
        "ts": datetime.now(UTC).isoformat(),
        **payload,
    }
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
        handle.write("\n")
    return target


def read_jsonl_tail(config: AppConfig, filename: str, limit: int = 100) -> list[dict[str, Any]]:
    target = Path(config.ops.log_dir) / filename
    if not target.exists():
        return []

    lines = target.read_text(encoding="utf-8").splitlines()
    records: list[dict[str, Any]] = []
    for line in lines[-limit:]:
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def summarize_enrich_events(config: AppConfig, limit: int = 200) -> dict[str, Any]:
    records = read_jsonl_tail(config, "ai-enrich.jsonl", limit)
    by_status: dict[str, int] = {}
    durations: list[float] = []
    for record in records:
        status = str(record.get("status", "unknown"))
        by_status[status] = by_status.get(status, 0) + 1
        duration = record.get("duration_ms")
        if isinstance(duration, int | float):
            durations.append(float(duration))

    avg_duration_ms = round(sum(durations) / len(durations), 1) if durations else None
    return {
        "total": len(records),
        "by_status": by_status,
        "avg_duration_ms": avg_duration_ms,
        "recent": records[-10:],
    }
