from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.config import AppConfig


class Base(DeclarativeBase):
    pass


def create_engine_and_session(
    config: AppConfig,
) -> tuple:
    engine = create_async_engine(config.database.url, echo=config.database.echo)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, session_maker


async def get_db(session_maker: async_sessionmaker[AsyncSession]) -> AsyncGenerator[AsyncSession, None]:
    async with session_maker() as session:
        yield session
