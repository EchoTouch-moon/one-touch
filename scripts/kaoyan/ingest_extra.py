"""Ingest extra exam sources into data/kaoyan/exam_texts/.

Sources:
  1. English-1 2005-2016: textutil-converted txt from m2kar's compiled doc
  2. English-2 2010-2025: per-year PDFs (text layer) extracted with pdfplumber

Output: english1_YYYY.md / english2_YYYY.md files that build_sentences.py
already knows how to parse (headings marked with '#', half-width punctuation).

Usage:
    uvx --with pdfplumber python scripts/kaoyan/ingest_extra.py \
        <eng1_txt> <eng2_pdf_dir>
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "kaoyan" / "exam_texts"

WIDTH_MAP = {i: chr(i - 0xFEE0) for i in range(0xFF01, 0xFF5F)}
WIDTH_MAP[0x3000] = " "
WIDTH_MAP[0x2018] = "'"
WIDTH_MAP[0x2019] = "'"
WIDTH_MAP[0x201C] = '"'
WIDTH_MAP[0x201D] = '"'

YEAR_TITLE_RE = re.compile(r"^(\d{4})年.*(?:英语|研究生|试题)")
SECTION_RE = re.compile(r"^(Section\s+[IVX]+.*|Part\s+[A-Z].*|Text\s*\d+.*)$")
DIRECTIONS_RE = re.compile(r"^Directions?\s*[:：]", re.IGNORECASE)
QUESTION_RE = re.compile(r"^\d{1,2}[.．、]\s*(\[|\d|[A-Z])")
OPTION_RE = re.compile(r"^\[?[A-D]\]?[.．、\s]")
NOISE_RE = re.compile(r"答案|解析|ANSWER|本试卷|请勿|第\s*\d+\s*页|密\s*封|准考证|姓名|考场")


def normalize(line: str) -> str:
    return line.translate(WIDTH_MAP).strip()


def is_content(line: str) -> bool:
    if not line:
        return False
    if DIRECTIONS_RE.match(line):
        return False
    if QUESTION_RE.match(line) or OPTION_RE.match(line):
        return False
    if NOISE_RE.search(line):
        return False
    if len(line) <= 2:
        return False
    return True


def md_lines(lines: list[str]) -> list[str]:
    out: list[str] = []
    for raw in lines:
        line = normalize(raw)
        if not line:
            out.append("")
            continue
        year = YEAR_TITLE_RE.match(line)
        if year:
            out.append(f"# {line}")
            continue
        section = SECTION_RE.match(line)
        if section:
            out.append(f"# {line}")
            continue
        if is_content(line):
            out.append(line)
    return out


def ingest_english1(txt_path: Path) -> None:
    text = txt_path.read_text(encoding="utf-8", errors="replace")
    pieces: dict[int, list[str]] = {}
    current_year = 0
    for raw_line in text.splitlines():
        line = normalize(raw_line)
        year = YEAR_TITLE_RE.match(line)
        if year and ("英语" in line or "研究生" in line):
            current_year = int(year.group(1))
            pieces.setdefault(current_year, [])
            continue
        if current_year:
            pieces[current_year].append(raw_line)

    for year, lines in pieces.items():
        if not (2005 <= year <= 2016):
            continue
        body = md_lines(lines)
        if len(body) < 20:
            continue
        target = OUT_DIR / f"english1_{year}.md"
        target.write_text("\n".join(body) + "\n", encoding="utf-8")
        print(f"english1 {year}: {len(body)} lines")


def ingest_english2(pdf_dir: Path) -> None:
    import pdfplumber

    pdfs = sorted(pdf_dir.glob("*年考研英语二真题.pdf"))
    for pdf_path in pdfs:
        year_match = re.search(r"(\d{4})", pdf_path.name)
        if not year_match:
            continue
        year = int(year_match.group(1))
        if not (2010 <= year <= 2025):
            continue
        lines: list[str] = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                lines.extend(page_text.splitlines())
        body = md_lines(lines)
        if len(body) < 20:
            print(f"skip english2 {year}: too few lines")
            continue
        target = OUT_DIR / f"english2_{year}.md"
        target.write_text("\n".join(body) + "\n", encoding="utf-8")
        print(f"english2 {year}: {len(body)} lines")


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    eng1_txt = Path(sys.argv[1])
    eng2_dir = Path(sys.argv[2])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ingest_english1(eng1_txt)
    ingest_english2(eng2_dir)


if __name__ == "__main__":
    main()
