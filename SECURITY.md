# Security Policy

This repository is intended for self-hosted beta usage and public source release.

## Before publishing

- Remove real API keys, SMTP credentials, database files, logs, and diagnostic dumps.
- Do not commit `.env` files or deployment-specific certificate paths.
- Rotate any key that may have been exposed in screenshots, logs, or chat.

## Running a public copy

- Use `openssl rand -hex 32` for `GLM_WORDS_AUTH_SECRET`.
- Keep LLM provider keys server-side only.
- Enable HTTPS in production.
- Prefer a separate public repository or exported copy for open-source release.

## Reporting issues

Please open a GitHub issue for non-sensitive bugs and documentation problems.
Do not post secrets or user data in public issue reports.
