from datetime import datetime

from pydantic import BaseModel, Field


class WordCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=128)


class WordResponse(BaseModel):
    id: int
    text: str
    phonetic: str | None = None
    status: str
    definition_count: int = 0
    review_ready: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WordListResponse(BaseModel):
    items: list[WordResponse]
    total: int
    page: int
    page_size: int


class DefinitionBrief(BaseModel):
    id: int
    pos: str
    meaning_en: str
    meaning_zh: str
    canvas_image: str | None = None
    ink_data: str | None = None
    order: int = 0
    examples: list["ExampleBrief"] = []

    model_config = {"from_attributes": True}


class ExampleBrief(BaseModel):
    sentence_en: str
    sentence_zh: str
    source: str | None = None
    order: int = 0

    model_config = {"from_attributes": True}


class WordDetailResponse(WordResponse):
    definitions: list[DefinitionBrief] = []


class DefinitionCreate(BaseModel):
    pos: str = Field(..., min_length=1, max_length=32)
    meaning_en: str = ""
    meaning_zh: str = Field(..., min_length=1)
    canvas_image: str | None = None
    ink_data: str | None = None
    examples: list["ExampleCreate"] = []
    collocations: list["CollocationCreate"] = []


class DefinitionUpdate(BaseModel):
    pos: str | None = Field(default=None, min_length=1, max_length=32)
    meaning_en: str | None = None
    meaning_zh: str | None = Field(default=None, min_length=1)
    canvas_image: str | None = None
    ink_data: str | None = None


class ExampleCreate(BaseModel):
    sentence_en: str = Field(..., min_length=1)
    sentence_zh: str = ""


class CollocationCreate(BaseModel):
    pattern: str = Field(..., min_length=1)
    meaning_zh: str = ""


class WordUpdate(BaseModel):
    phonetic: str | None = None
