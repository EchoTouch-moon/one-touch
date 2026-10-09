from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class KaoyanWord(Base):
    __tablename__ = "kaoyan_words"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    word: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    translation: Mapped[str] = mapped_column(Text, nullable=False)
    phonetic: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    frq: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)
    bnc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ExamSentence(Base):
    __tablename__ = "exam_sentences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    exam_type: Mapped[str] = mapped_column(String(8), nullable=False, default="英语一")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON array of kaoyan words present in this sentence; an in-memory inverted
    # index is rebuilt at startup for exact lookups.
    words_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
