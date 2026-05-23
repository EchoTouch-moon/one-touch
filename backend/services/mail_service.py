from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from backend.config import RegistrationConfig

logger = logging.getLogger(__name__)


def send_verification_email(config: RegistrationConfig, email: str, code: str, purpose: str = "register") -> None:
    subject = "一触注册验证码" if purpose == "register" else "一触密码重置验证码"
    body = (
        f"你的验证码是：{code}\n\n"
        f"验证码将在 {config.verification_ttl_minutes} 分钟后失效。"
    )

    if config.mail_provider != "smtp":
        logger.info("Email verification code for %s (%s): %s", email, purpose, code)
        return

    if not config.smtp_host:
        raise RuntimeError("SMTP host is not configured.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config.smtp_from
    message["To"] = email
    message.set_content(body)

    with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10) as smtp:
        if config.smtp_tls:
            smtp.starttls()
        if config.smtp_username and config.smtp_password:
            smtp.login(config.smtp_username, config.smtp_password)
        smtp.send_message(message)
