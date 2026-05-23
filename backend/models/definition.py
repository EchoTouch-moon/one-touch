from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:
    from backend.models.collocation import Collocation
    from backend.models.example import ExampleSentence
    from backend.models.word import Word


class Definition(Base):
    __tablename__ = "definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    word_id: Mapped[int] = mapped_column(
        ForeignKey("words.id", ondelete="CASCADE"), nullable=False
    )
    pos: Mapped[str] = mapped_column(String(32), nullable=False)
    meaning_en: Mapped[str] = mapped_column(Text, nullable=False)
    meaning_zh: Mapped[str] = mapped_column(Text, nullable=False)
    canvas_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    ink_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)

    word: Mapped["Word"] = relationship(back_populates="definitions")
    examples: Mapped[list["ExampleSentence"]] = relationship(
        back_populates="definition", cascade="all, delete-orphan"
    )
    collocations: Mapped[list["Collocation"]] = relationship(
        back_populates="definition", cascade="all, delete-orphan"
    )
