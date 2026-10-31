# EdCap — Assumptions

All assumptions were made where the specification left a choice open.

| # | Area | Assumption | Impact |
|---|---|---|---|
| A1 | Database | SQLite used for local dev (no Docker); PostgreSQL in Docker Compose | Backend code uses same SQLAlchemy models |
| A2 | LLM | Default LLM provider is OpenAI (`gpt-4o-mini`); a deterministic offline stub is used when `LLM_API_KEY` is absent | Tests always run offline |
| A3 | PDF parsing | `pdfminer.six` used for text extraction; scanned PDFs (no text layer) are rejected with a clear error message | No OCR dependency |
| A4 | CAPTCHA | A dev stub that auto-passes in test/dev environments; Cloudflare Turnstile in production | Configured by `CAPTCHA_PROVIDER` env var |
| A5 | Email | SMTP adapter with a dev console logger when `EMAIL_PROVIDER=console` | Zero external dependency in dev |
| A6 | Frontend port | Next.js runs on port 3000; FastAPI on port 8000 | Configured in docker-compose.yml |
| A7 | MFA enforcement | Faculty and Admin must enrol MFA on first login after account creation | Enforced by middleware |
| A8 | Telemetry dedup | `event_id` is a UUID generated client-side; server deduplicates on insert | Requires unique index on `event_id` |
| A9 | Synthetic data seed | Random seed is fixed at 42 for reproducibility | Stated clearly in README |
| A10 | Spaced repetition | If a student misses a review, the interval resets to 1 day at the next attempt | Configurable via `SR_INTERVALS_DAYS` |
| A11 | Playbook RAG | TF-IDF cosine similarity over the strategy library; LLM used only for synthesis | Falls back to top retrieved strategy if LLM unavailable |
| A12 | Auth token type | Short-lived JWT (15 min access, 7 day refresh) stored in HttpOnly cookies | No localStorage |
| A13 | Multi-course | A student can be enrolled in multiple courses simultaneously | Risk scores are computed per course |
| A14 | Admin MFA step-up | Step-up prompts re-verify TOTP; session marked `mfa_stepped_up` for 30 min | Configurable |
| A15 | Audit log | Append-only; deletes from audit_logs are forbidden at DB level via trigger | PostgreSQL trigger added in migration |
