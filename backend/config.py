import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


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
    algorithm: str = os.getenv("GLM_WORDS_REVIEW_ALGORITHM", "sm2")
    new_cards_per_day: int = 20
    max_review_per_day: int = 100
    timezone: str = os.getenv("GLM_WORDS_REVIEW_TIMEZONE", "Asia/Shanghai")
    day_boundary_hour: int = int(os.getenv("GLM_WORDS_REVIEW_DAY_BOUNDARY_HOUR", "4"))
    target_retrievability: float = float(os.getenv("GLM_WORDS_TARGET_RETRIEVABILITY", "0.9"))


@dataclass(frozen=True)
class EnrichConfig:
    daily_limit: int = int(os.getenv("GLM_WORDS_ENRICH_DAILY_LIMIT", "5"))


@dataclass(frozen=True)
class OpsConfig:
    backup_enabled: bool = os.getenv("GLM_WORDS_BACKUP_ENABLED", "true").lower() == "true"
    backup_dir: str = os.getenv("GLM_WORDS_BACKUP_DIR", str(Path.home() / ".glm-words" / "backups"))
    backup_retention_days: int = int(os.getenv("GLM_WORDS_BACKUP_RETENTION_DAYS", "7"))
    backup_interval_hours: int = int(os.getenv("GLM_WORDS_BACKUP_INTERVAL_HOURS", "24"))
    log_dir: str = os.getenv("GLM_WORDS_LOG_DIR", str(Path.home() / ".glm-words" / "logs"))
    app_version: str = os.getenv("GLM_WORDS_APP_VERSION", "dev")
    build_date: str = os.getenv("GLM_WORDS_BUILD_DATE", "")


@dataclass(frozen=True)
class RegistrationConfig:
    enabled: bool = os.getenv("GLM_WORDS_REGISTRATION_ENABLED", "false").lower() == "true"
    max_users: int = int(os.getenv("GLM_WORDS_REGISTRATION_MAX_USERS", "30"))
    verification_ttl_minutes: int = int(os.getenv("GLM_WORDS_EMAIL_VERIFICATION_TTL_MINUTES", "10"))
    mail_provider: str = os.getenv("GLM_WORDS_MAIL_PROVIDER", "console")
    smtp_host: Optional[str] = os.getenv("GLM_WORDS_SMTP_HOST")
    smtp_port: int = int(os.getenv("GLM_WORDS_SMTP_PORT", "587"))
    smtp_username: Optional[str] = os.getenv("GLM_WORDS_SMTP_USERNAME")
    smtp_password: Optional[str] = os.getenv("GLM_WORDS_SMTP_PASSWORD")
    smtp_from: str = os.getenv("GLM_WORDS_SMTP_FROM", os.getenv("GLM_WORDS_ADMIN_USERNAME", "admin"))
    smtp_tls: bool = os.getenv("GLM_WORDS_SMTP_TLS", "true").lower() == "true"


@dataclass(frozen=True)
class AppConfig:
    database: DatabaseConfig = field(default_factory=lambda: DatabaseConfig(
        url=os.getenv("GLM_WORDS_DATABASE_URL", f"sqlite+aiosqlite:///{Path.home() / '.glm-words' / 'words.db'}"),
        echo=os.getenv("GLM_WORDS_DATABASE_ECHO", "false").lower() == "true",
    ))
    llm: LLMProviderConfig = field(default_factory=lambda: LLMProviderConfig(
        provider=os.getenv("GLM_WORDS_LLM_PROVIDER", "ollama"),
        model=os.getenv("GLM_WORDS_LLM_MODEL", "llama3"),
        api_key=os.getenv("GLM_WORDS_LLM_API_KEY"),
        base_url=os.getenv("GLM_WORDS_LLM_BASE_URL"),
        max_tokens=int(os.getenv("GLM_WORDS_LLM_MAX_TOKENS", "2048")),
        temperature=float(os.getenv("GLM_WORDS_LLM_TEMPERATURE", "0.3")),
        openai_api_key=os.getenv("GLM_WORDS_OPENAI_API_KEY"),
        anthropic_api_key=os.getenv("GLM_WORDS_ANTHROPIC_API_KEY"),
        doubao_api_key=os.getenv("GLM_WORDS_DOUBAO_API_KEY"),
    ))
    review: ReviewConfig = field(default_factory=ReviewConfig)
    enrich: EnrichConfig = field(default_factory=EnrichConfig)
    ops: OpsConfig = field(default_factory=OpsConfig)
    debug: bool = os.getenv("GLM_WORDS_DEBUG", "false").lower() == "true"
    host: str = os.getenv("GLM_WORDS_HOST", "0.0.0.0")
    port: int = int(os.getenv("GLM_WORDS_PORT", "8000"))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        origin.strip()
        for origin in os.getenv(
            "GLM_WORDS_ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ))
    admin_username: str = os.getenv("GLM_WORDS_ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("GLM_WORDS_ADMIN_PASSWORD", "change-me")
    auth_secret: str = os.getenv("GLM_WORDS_AUTH_SECRET", "change-this-secret")
    auth_token_ttl_hours: int = int(os.getenv("GLM_WORDS_AUTH_TOKEN_TTL_HOURS", "168"))
    registration: RegistrationConfig = field(default_factory=RegistrationConfig)
    registration_enabled: bool = os.getenv("GLM_WORDS_REGISTRATION_ENABLED", "false").lower() == "true"
    invite_codes: tuple[str, ...] = field(default_factory=lambda: tuple(
        code.strip()
        for code in os.getenv("GLM_WORDS_INVITE_CODES", "").split(",")
        if code.strip()
    ))
