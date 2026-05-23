from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field

from fastapi import HTTPException, Request, status

from backend.config import AppConfig


DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "change-me"
DEFAULT_AUTH_SECRET = "change-this-secret"


def validate_production_secrets(config: AppConfig) -> None:
    if config.debug:
        return

    unsafe = []
    if config.admin_username == DEFAULT_ADMIN_USERNAME:
        unsafe.append("GLM_WORDS_ADMIN_USERNAME")
    if config.admin_password == DEFAULT_ADMIN_PASSWORD:
        unsafe.append("GLM_WORDS_ADMIN_PASSWORD")
    if config.auth_secret == DEFAULT_AUTH_SECRET or len(config.auth_secret) < 32:
        unsafe.append("GLM_WORDS_AUTH_SECRET")

    if unsafe:
        names = ", ".join(unsafe)
        raise RuntimeError(f"Unsafe production auth configuration: set strong values for {names}")


@dataclass
class LoginRateLimiter:
    max_attempts: int = 8
    window_seconds: int = 300
    attempts: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))

    def _key(self, request: Request, username: str) -> str:
        client = request.client.host if request.client else "unknown"
        return f"{client}:{username.strip().lower()}"

    def check(self, request: Request, username: str) -> None:
        key = self._key(request, username)
        now = time.monotonic()
        bucket = self.attempts[key]
        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.max_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again later.",
            )

    def record_failure(self, request: Request, username: str) -> None:
        key = self._key(request, username)
        self.attempts[key].append(time.monotonic())

    def reset(self, request: Request, username: str) -> None:
        key = self._key(request, username)
        self.attempts.pop(key, None)
