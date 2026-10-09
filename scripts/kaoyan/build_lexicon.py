"""Build the kaoyan word list from an ECDICT stardict database.

Source: https://github.com/skywind3000/ECDICT (release 1.0.28, stardict.db)
Output: data/kaoyan/kaoyan_words.json — one entry per kaoyan-tagged word with
translation, phonetic, exchange map and BNC frequency, sorted by frequency.

Usage:
    python scripts/kaoyan/build_lexicon.py <stardict.db> [output.json]
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "data" / "kaoyan" / "kaoyan_words.json"


def parse_exchange(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    result: dict[str, str] = {}
    for part in raw.split("/"):
        if ":" in part:
            key, value = part.split(":", 1)
            if key and value:
                result[key] = value
    return result


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    db_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT

    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        """
        SELECT word, translation, phonetic, exchange, frq, bnc
        FROM stardict
        WHERE tag LIKE '%ky%' AND translation IS NOT NULL AND translation != ''
        """
    ).fetchall()
    conn.close()

    words = []
    for word, translation, phonetic, exchange, frq, bnc in rows:
        entry = {
            "word": word.strip().lower(),
            "translation": translation.replace("\\n", "\n").strip(),
            "phonetic": (phonetic or "").strip(),
            "exchange": parse_exchange(exchange),
            "frq": frq or 0,
            "bnc": bnc or 0,
        }
        words.append(entry)

    # Deduplicate by word (case-insensitive collisions) keeping the first entry.
    seen: set[str] = set()
    unique: list[dict] = []
    for entry in words:
        if entry["word"] in seen:
            continue
        seen.add(entry["word"])
        unique.append(entry)

    # Common words first: lower frq rank number = more frequent in BNC.
    unique.sort(key=lambda item: (item["frq"] if item["frq"] > 0 else 99999, item["word"]))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(unique, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(unique)} words to {out_path}")


if __name__ == "__main__":
    main()
