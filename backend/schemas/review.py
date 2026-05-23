from datetime import datetime

from pydantic import BaseModel, Field


class ReviewSubmit(BaseModel):
    word_id: int
    quality: int = Field(..., ge=0, le=5)


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
