"""Build the kaoyan exam-sentence corpus from exam markdown files.

Input:  data/kaoyan/exam_texts/english1_YYYY.md (papers with full texts)
        data/kaoyan/kaoyan_words.json (from build_lexicon.py)
Output: data/kaoyan/exam_sentences.json — flat list of sentences, each with
        year, section, text and the kaoyan words it contains.

Usage:
    python scripts/kaoyan/build_sentences.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEXTS_DIR = ROOT / "data" / "kaoyan" / "exam_texts"
WORDS_PATH = ROOT / "data" / "kaoyan" / "kaoyan_words.json"
OUT_PATH = ROOT / "data" / "kaoyan" / "exam_sentences.json"

SKIP_AFTER_SECTION = re.compile(r"Section\s+III|Writing", re.IGNORECASE)
HEADING_RE = re.compile(r"^#\s*(.+)$")
DIRECTIONS_RE = re.compile(r"^Directions?\s*[:：]", re.IGNORECASE)
QUESTION_RE = re.compile(r"^\d{1,2}\s*[\.\s]\s*\[?[A-D]\]?|^\d{1,2}\.\s+[A-Z][a-z]")
OPTION_RE = re.compile(r"^\[?[A-D]\]?[\.\s]")
TABLE_RE = re.compile(r"<table|</table>|答案|!\[")
INLINE_NUM_RE = re.compile(r"\((\d{1,2})\)")
LATEX_RE = re.compile(r"\$([^$]*)\$")
LATEX_CMD_RE = re.compile(r"\\(?:mathrm|text|textbf|emph)\{([^}]*)\}")
LATEX_CARET_RE = re.compile(r"\^\{([^}]*)\}")
UNDERSCORE_RE = re.compile(r"_{2,}")

TOKEN_RE = re.compile(r"[a-zA-Z']+")

ABBREV = {
    "mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr", "vs", "etc", "eg",
    "ie", "no", "u.s", "u.k", "e.g", "i.e", "inc", "ltd",
}


def clean_line(line: str) -> str:
    line = TABLE_RE.sub(" ", line)
    line = LATEX_RE.sub(lambda m: LATEX_CARET_RE.sub(
        lambda c: c.group(1), LATEX_CMD_RE.sub(lambda x: x.group(1), m.group(1))), line)
    line = INLINE_NUM_RE.sub(" ", line)
    line = UNDERSCORE_RE.sub(" ", line)
    # Bare small numbers are cloze blanks / question numbers (e.g. "risks 6 pleasure");
    # real quantities are spelled out or 3+ digits (years, prices).
    line = re.sub(r"(?<![\w$])(\d{1,2})(?![\w%])", " ", line)
    line = re.sub(r"^\[[A-G]\]\s*", "", line)
    line = re.sub(r"\s+", " ", line)
    return line.strip()


def split_sentences(paragraph: str) -> list[str]:
    sentences: list[str] = []
    current: list[str] = []
    tokens = re.split(r"(\s+)", paragraph)
    for token in tokens:
        current.append(token)
        stripped = "".join(current).strip()
        if not stripped:
            continue
        last_word = stripped.split(" ")[-1]
        if not last_word.endswith((".", "?", "!", '."', '?"', "!'")):
            continue
        base = last_word.rstrip('."?!\'').lower()
        if base in ABBREV:
            continue
        # Sentence boundary: current chunk ends a sentence and is long enough.
        sentence = re.sub(r"\s+", " ", stripped)
        if 30 <= len(sentence) <= 600:
            sentences.append(sentence)
        current = []
    return sentences


def build_lemma_map(words: list[dict]) -> dict[str, str]:
    """Map inflected forms (and the word itself) back to the canonical word."""
    lemma: dict[str, str] = {}
    for entry in words:
        word = entry["word"]
        lemma[word] = word
        for form in entry["exchange"].values():
            form = form.strip().lower()
            if form and form not in lemma:
                lemma[form] = word
    return lemma


def rule_lemmatize(token: str, lemma_map: dict[str, str]) -> str | None:
    lower = token.lower().strip("'")
    if lower in lemma_map:
        return lemma_map[lower]
    candidates = []
    if lower.endswith("ies") and len(lower) > 4:
        candidates.append(lower[:-3] + "y")
    if lower.endswith("es") and len(lower) > 4:
        candidates.append(lower[:-2])
    if lower.endswith("s") and len(lower) > 3:
        candidates.append(lower[:-1])
    if lower.endswith("ied") and len(lower) > 4:
        candidates.append(lower[:-3] + "y")
    if lower.endswith("ed") and len(lower) > 4:
        candidates.extend([lower[:-2], lower[:-1]])
    if lower.endswith("ing") and len(lower) > 5:
        candidates.extend([lower[:-3], lower[:-3] + "e", lower[:-4]])
    for candidate in candidates:
        if candidate in lemma_map:
            return lemma_map[candidate]
    return None


def extract_paper(path: Path) -> list[str]:
    """Return cleaned body paragraphs of one exam paper."""
    paragraphs: list[str] = []
    current: list[str] = []
    skip_rest = False

    def flush() -> None:
        text = " ".join(current).strip()
        if text:
            paragraphs.append(text)
        current.clear()

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip()
        heading = HEADING_RE.match(line)
        if heading:
            flush()
            title = heading.group(1).strip()
            if SKIP_AFTER_SECTION.search(title):
                skip_rest = True
            continue
        if skip_rest:
            continue
        if not line.strip():
            flush()
            continue
        if DIRECTIONS_RE.match(line.strip()):
            continue
        if QUESTION_RE.match(line.strip()) or OPTION_RE.match(line.strip()):
            continue
        if "<table" in line or "</table" in line or "![" in line or "答案" in line:
            continue
        cleaned = clean_line(line)
        if not cleaned:
            continue
        current.append(cleaned)
    flush()
    # Re-attach year+section at the caller; paragraphs returned in order.
    return paragraphs


STOPWORDS = set((
    "the a an and or of to in on at for with by is are was were be been being "
    "it its this that these those as from not no nor but if so than then too "
    "we you they he she i me my our your their his her them us him dont dont "
    "do does did doing have has had having will would can could may must should "
    "there here what which who whom when where why how all any both each few "
    "more most other some such only own same just now also into over under "
    "about after before between during through against while up down out off "
    "once again further very because until much many every either neither"
).split())


def load_full_dictionary() -> set[str]:
    """All ECDICT words when the local stardict db is present (much wider
    coverage than the kaoyan subset — needed for extraction quality checks)."""
    db_path = ROOT / "temp" / "ecdict" / "stardict.db"
    if not db_path.exists():
        return set()
    import sqlite3

    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT word FROM stardict").fetchall()
    conn.close()
    return {row[0].lower() for row in rows if row[0]}


def main() -> None:
    words = json.loads(WORDS_PATH.read_text(encoding="utf-8"))
    kaoyan_words = {entry["word"] for entry in words}
    lemma_map = build_lemma_map(words)
    known_tokens = kaoyan_words | STOPWORDS
    known_tokens.update(lemma_map.keys())
    known_tokens.update(lemma_map.values())
    known_tokens.update(load_full_dictionary())

    sentences: list[dict] = []
    for path in sorted(TEXTS_DIR.glob("english*.md")):
        year_match = re.search(r"(\d{4})", path.name)
        year = int(year_match.group(1)) if year_match else 0
        paper = "英语二" if path.name.startswith("english2") else "英语一"
        for paragraph in extract_paper(path):
            for sentence in split_sentences(paragraph):
                tokens = TOKEN_RE.findall(sentence)
                if not (6 <= len(tokens) <= 80):
                    continue
                known_ratio = sum(1 for t in tokens if t.lower() in known_tokens) / len(tokens)
                if known_ratio < 0.92:
                    # Broken PDF extraction (dropped letters) produces unknown tokens.
                    continue
                hits: set[str] = set()
                for token in tokens:
                    lemma = rule_lemmatize(token, lemma_map)
                    if lemma and lemma in kaoyan_words:
                        hits.add(lemma)
                if not hits:
                    continue
                sentences.append({
                    "year": year,
                    "paper": paper,
                    "text": sentence,
                    "words": sorted(hits),
                })

    OUT_PATH.write_text(json.dumps(sentences, ensure_ascii=False), encoding="utf-8")
    total_links = sum(len(item["words"]) for item in sentences)
    print(f"wrote {len(sentences)} sentences ({total_links} word links) to {OUT_PATH}")


if __name__ == "__main__":
    main()
