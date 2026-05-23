from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel, Field, field_validator


ALLOWED_POS = {"n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "interj.", "phr."}


class EnrichExampleSchema(BaseModel):
    sentence_en: str = Field("", max_length=240)
    sentence_zh: str = Field("", max_length=240)


class EnrichDefinitionSchema(BaseModel):
    pos: str = Field("phr.", max_length=16)
    meaning_en: str = Field("", max_length=160)
    meaning_zh: str = Field("", max_length=120)
    example: EnrichExampleSchema | None = None

    @field_validator("pos")
    @classmethod
    def normalize_pos(cls, value: str) -> str:
        pos = value.strip().lower()
        if pos in {"vi.", "vt."}:
            pos = "v."
        return pos if pos in ALLOWED_POS else "phr."


class EnrichResponseSchema(BaseModel):
    phonetic: str = Field("", max_length=128)
    definitions: list[EnrichDefinitionSchema] = Field(default_factory=list, min_length=0, max_length=4)

    @field_validator("phonetic")
    @classmethod
    def trim_phonetic(cls, value: str) -> str:
        return value.strip()

    @field_validator("definitions")
    @classmethod
    def keep_useful_definitions(cls, value: list[EnrichDefinitionSchema]) -> list[EnrichDefinitionSchema]:
        return [item for item in value if item.meaning_zh.strip()][:4]

@dataclass(frozen=True)
class LLMConfig:
    provider: str = "ollama"
    model: str = "llama3"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.3


@dataclass(frozen=True)
class EnrichResult:
    phonetic: str
    definitions: list[dict]
    examples: list[dict]
    collocations: list[dict]


class BaseLLMProvider(ABC):
    def __init__(self, config: LLMConfig) -> None:
        self.config = config

    @abstractmethod
    async def enrich_word(self, word: str) -> EnrichResult:
        ...


ENRICH_SYSTEM_PROMPT = """You are building concise vocabulary flashcards for Chinese-speaking English learners.

Given one English headword, return ONLY valid JSON matching this schema:
{
  "phonetic": "American IPA only, wrapped in slashes",
  "definitions": [
    {
      "pos": "one POS abbreviation",
      "meaning_en": "short English gloss",
      "meaning_zh": "concise Chinese meaning, merge near-duplicate senses",
      "example": {
        "sentence_en": "one natural English example sentence using this sense",
        "sentence_zh": "Chinese translation"
      }
    }
  ]
}

Rules:
- Use American pronunciation only. Do not include UK IPA.
- Use POS only from: n. v. adj. adv. prep. conj. pron. interj. phr.
- Return 2-4 definitions total for common words; 1-2 for simple words.
- Merge senses when the Chinese explanations are very close or differ only by context.
- Prefer high-frequency learner-relevant meanings.
- Avoid rare, technical, legal, archaic, or highly specialized meanings unless the word is mainly used that way.
- Each definition must have exactly one English example sentence and one Chinese translation.
- Examples should be short, natural, and useful for memory. Do not put an English definition in sentence_en.
- meaning_en is optional helper text; keep it very short or leave it empty. The important English field is example.sentence_en.
- Do not include collocations unless they are essential to the meaning.
- No markdown, no comments, no extra keys.

Return ONLY valid JSON, no markdown or explanation."""
