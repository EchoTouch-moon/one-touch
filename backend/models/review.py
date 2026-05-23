from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer
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

    next_review: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    last_review: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_quality: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    word: Mapped["Word"] = relationship(back_populates="review_record")
