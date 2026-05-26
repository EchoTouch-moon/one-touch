from datetime import datetime

from pydantic import BaseModel, Field


class ReviewSubmit(BaseModel):
    word_id: int
    quality: int = Field(..., ge=0, le=5)
    reviewed_at: datetime | None = None


class ReviewStatsResponse(BaseModel):
    due_count: int
    reviewed_today: int
    total_words: int


class ReviewCardResponse(BaseModel):
    word_id: int
    text: str
    phonetic: str | None = None
    ease_factor: float
    interval_days: int
    repetitions: int
    next_review: datetime
    algorithm: str = "sm2"
    phase: str = "new"
    difficulty: float | None = None
    stability: float | None = None
    retrievability: float | None = None
    scheduled_days: int | None = None
    learning_step: int = 0
    learning_due_at: datetime | None = None
