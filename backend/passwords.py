from __future__ import annotations

import bcrypt

MAX_PASSWORD_BYTES = 72


class PasswordTooLongError(ValueError):
    pass


def _encode_password(plain: str) -> bytes:
    data = plain.encode("utf-8")
    if len(data) > MAX_PASSWORD_BYTES:
        raise PasswordTooLongError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes (utf-8).")
    return data


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_encode_password(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        data = _encode_password(plain)
    except PasswordTooLongError:
        return False
    return bcrypt.checkpw(data, hashed.encode("utf-8"))
