from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:
    from backend.models.word import Word


class ReviewRecord(Base):
    __tablename__ = "review_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    word_id: Mapped[int] = mapped_column(
        ForeignKey("words.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    algorithm: Mapped[str] = mapped_column(String(32), default="sm2")
    phase: Mapped[str] = mapped_column(String(32), default="new")
    difficulty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    retrievability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    scheduled_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    learning_step: Mapped[int] = mapped_column(Integer, default=0)
    learning_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    next_review: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    last_review: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_quality: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    word: Mapped["Word"] = relationship(back_populates="review_record")


class ReviewLog(Base):
    __tablename__ = "review_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    word_id: Mapped[int] = mapped_column(
        ForeignKey("words.id", ondelete="CASCADE"), nullable=False
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    quality: Mapped[int] = mapped_column(Integer, nullable=False)
    phase_before: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    phase_after: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    scheduled_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    elapsed_days: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    algorithm: Mapped[str] = mapped_column(String(32), default="sm2")
