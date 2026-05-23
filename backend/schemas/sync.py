from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SyncExample(BaseModel):
    sentence_en: str = Field("", max_length=800)
    sentence_zh: str = Field("", max_length=800)
    source: str | None = Field(None, max_length=64)


class SyncCollocation(BaseModel):
    pattern: str = Field("", max_length=256)
    meaning_zh: str | None = Field(None, max_length=500)


class SyncDefinition(BaseModel):
    pos: str = Field("unknown", max_length=32)
    meaning_en: str = Field("", max_length=500)
    meaning_zh: str = Field("", max_length=500)
    examples: list[SyncExample] = Field(default_factory=list, max_length=8)
    collocations: list[SyncCollocation] = Field(default_factory=list, max_length=8)


class SyncReviewRecord(BaseModel):
    ease_factor: float = Field(2.5, ge=1.3, le=5.0)
    interval_days: int = Field(0, ge=0, le=36500)
    repetitions: int = Field(0, ge=0, le=10000)
    next_review: datetime | None = None
    last_review: datetime | None = None
    last_quality: int | None = Field(None, ge=0, le=5)


class SyncWord(BaseModel):
    text: str = Field(..., min_length=1, max_length=128)
    phonetic: str | None = Field(None, max_length=128)
    status: str = Field("captured", max_length=20)
    created_at: datetime | None = None
    definitions: list[SyncDefinition] = Field(default_factory=list, max_length=20)
    review_record: SyncReviewRecord | None = None


class SyncPayload(BaseModel):
    version: str = Field("1.0", max_length=16)
    exported_at: datetime | None = None
    words: list[SyncWord] = Field(default_factory=list, max_length=5000)


class ImportRequest(BaseModel):
    data: SyncPayload
    mode: Literal["merge", "replace"] = "merge"
