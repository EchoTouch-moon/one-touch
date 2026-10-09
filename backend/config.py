import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Configuration used to be read from GLM_WORDS_* variables. The current prefix
# is ONETOUCH_*; the old names are still honoured as a fallback so an existing
# deployment (a .env file, a compose file, a container started months ago)
# keeps working without edits. Rename them when convenient — a warning is
# logged the first time a legacy name is used.
ENV_PREFIX = "ONETOUCH_"
LEGACY_ENV_PREFIX = "GLM_WORDS_"
_LEGACY_WARNED: set[str] = set()


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    """Read ``ONETOUCH_<name>``, falling back to the legacy ``GLM_WORDS_<name>``."""
    value = os.getenv(ENV_PREFIX + name)
    if value is not None:
        return value
    legacy = os.getenv(LEGACY_ENV_PREFIX + name)
    if legacy is not None:
        if name not in _LEGACY_WARNED:
            _LEGACY_WARNED.add(name)
            logger.warning(
                "%s%s is deprecated, rename it to %s%s.",
                LEGACY_ENV_PREFIX, name, ENV_PREFIX, name,
            )
        return legacy
    return default


def _data_dir() -> Path:
    """Where local state lives (~/.one-touch, previously ~/.glm-words)."""
    return Path.home() / ".one-touch"


def ensure_data_dir() -> Path:
    """Create the local state directory, adopting ``~/.glm-words`` on first run.

    The directory used to be ``~/.glm-words``. Instead of silently starting
    from an empty database after the rename, the old directory is moved once,
    so local data (SQLite file, backups, logs) keeps working untouched.
    """
    current = _data_dir()
    legacy = Path.home() / ".glm-words"
    if legacy.is_dir() and not current.exists():
        try:
            legacy.rename(current)
            logger.info("Moved local data directory %s to %s", legacy, current)
        except OSError as exc:  # pragma: no cover - depends on the filesystem
            logger.warning("Could not move %s to %s (%s); keeping the old path", legacy, current, exc)
            return legacy
    current.mkdir(parents=True, exist_ok=True)
    return current


@dataclass(frozen=True)
class DatabaseConfig:
    url: str
    echo: bool = False


@dataclass(frozen=True)
class LLMProviderConfig:
    provider: str
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.3
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    doubao_api_key: Optional[str] = None


@dataclass(frozen=True)
class ReviewConfig:
    algorithm: str = _env("REVIEW_ALGORITHM", "sm2")
    new_cards_per_day: int = 20
    max_review_per_day: int = 100
    timezone: str = _env("REVIEW_TIMEZONE", "Asia/Shanghai")
    day_boundary_hour: int = int(_env("REVIEW_DAY_BOUNDARY_HOUR", "4"))
    target_retrievability: float = float(_env("TARGET_RETRIEVABILITY", "0.9"))


@dataclass(frozen=True)
class EnrichConfig:
    daily_limit: int = int(_env("ENRICH_DAILY_LIMIT", "5"))


@dataclass(frozen=True)
class OpsConfig:
    backup_enabled: bool = _env("BACKUP_ENABLED", "true").lower() == "true"
    backup_dir: str = _env("BACKUP_DIR", str(_data_dir() / "backups"))
    backup_retention_days: int = int(_env("BACKUP_RETENTION_DAYS", "7"))
    backup_interval_hours: int = int(_env("BACKUP_INTERVAL_HOURS", "24"))
    log_dir: str = _env("LOG_DIR", str(_data_dir() / "logs"))
    app_version: str = _env("APP_VERSION", "dev")
    build_date: str = _env("BUILD_DATE", "")


@dataclass(frozen=True)
class RegistrationConfig:
    enabled: bool = _env("REGISTRATION_ENABLED", "false").lower() == "true"
    max_users: int = int(_env("REGISTRATION_MAX_USERS", "30"))
    verification_ttl_minutes: int = int(_env("EMAIL_VERIFICATION_TTL_MINUTES", "10"))
    mail_provider: str = _env("MAIL_PROVIDER", "console")
    smtp_host: Optional[str] = _env("SMTP_HOST")
    smtp_port: int = int(_env("SMTP_PORT", "587"))
    smtp_username: Optional[str] = _env("SMTP_USERNAME")
    smtp_password: Optional[str] = _env("SMTP_PASSWORD")
    smtp_from: str = _env("SMTP_FROM", _env("ADMIN_USERNAME", "admin"))
    smtp_tls: bool = _env("SMTP_TLS", "true").lower() == "true"


@dataclass(frozen=True)
class AppConfig:
    database: DatabaseConfig = field(default_factory=lambda: DatabaseConfig(
        url=_env("DATABASE_URL", f"sqlite+aiosqlite:///{_data_dir() / 'words.db'}"),
        echo=_env("DATABASE_ECHO", "false").lower() == "true",
    ))
    llm: LLMProviderConfig = field(default_factory=lambda: LLMProviderConfig(
        provider=_env("LLM_PROVIDER", "ollama"),
        model=_env("LLM_MODEL", "llama3"),
        api_key=_env("LLM_API_KEY"),
        base_url=_env("LLM_BASE_URL"),
        max_tokens=int(_env("LLM_MAX_TOKENS", "2048")),
        temperature=float(_env("LLM_TEMPERATURE", "0.3")),
        openai_api_key=_env("OPENAI_API_KEY"),
        anthropic_api_key=_env("ANTHROPIC_API_KEY"),
        doubao_api_key=_env("DOUBAO_API_KEY"),
    ))
    review: ReviewConfig = field(default_factory=ReviewConfig)
    enrich: EnrichConfig = field(default_factory=EnrichConfig)
    ops: OpsConfig = field(default_factory=OpsConfig)
    debug: bool = _env("DEBUG", "false").lower() == "true"
    host: str = _env("HOST", "0.0.0.0")
    port: int = int(_env("PORT", "8000"))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        origin.strip()
        for origin in _env(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ))
    admin_username: str = _env("ADMIN_USERNAME", "admin")
    admin_password: str = _env("ADMIN_PASSWORD", "change-me")
    auth_secret: str = _env("AUTH_SECRET", "change-this-secret")
    auth_token_ttl_hours: int = int(_env("AUTH_TOKEN_TTL_HOURS", "168"))
    registration: RegistrationConfig = field(default_factory=RegistrationConfig)
    registration_enabled: bool = _env("REGISTRATION_ENABLED", "false").lower() == "true"
    invite_codes: tuple[str, ...] = field(default_factory=lambda: tuple(
        code.strip()
        for code in _env("INVITE_CODES", "").split(",")
        if code.strip()
    ))
