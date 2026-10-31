# EdCap AI — Security Reference

This document maps each of the nine security requirements (§9) to the implementing code and tests.

---

## §9.1 Login Protection

| Control | Code | Test |
|---|---|---|
| IP + account rate limiting (5/15 min) | `backend/app/security/rate_limiter.py` | `tests/test_auth.py::test_login_rate_limit_ip`, `test_login_rate_limit_account` |
| Failed-attempt counter + lockout (15 min, exponential back-off) | `backend/app/services/auth_service.py::record_failed_login` | `tests/test_auth.py::test_account_lockout` |
| Lockout email notification | `backend/app/services/notification_service.py` | `tests/test_auth.py::test_lockout_email_sent` |
| CAPTCHA after 3 failures | `backend/app/security/captcha.py` (pluggable adapter) | `tests/test_auth.py::test_captcha_triggered` |

---

## §9.2 Signup & Verification

| Control | Code | Test |
|---|---|---|
| Email verification (single-use token, 24 h, hashed) | `backend/app/api/v1/auth.py::signup`, `verify_email` | `tests/test_auth.py::test_email_verification` |
| Duplicate account prevention (case-insensitive) | `backend/app/models/user.py` (unique constraint + normalise) | `tests/test_auth.py::test_duplicate_email` |
| Generic signup/verify responses (timing equalised) | `backend/app/api/v1/auth.py` | `tests/test_auth.py::test_enumeration_signup`, `test_enumeration_verify` |
| Password policy (12+ chars, common-password check, Argon2id) | `backend/app/core/security.py` | `tests/test_auth.py::test_password_policy` |

---

## §9.3 Session Security

| Control | Code | Test |
|---|---|---|
| HttpOnly, Secure, SameSite cookies | `backend/app/api/v1/auth.py` (set_cookie calls) | `tests/test_auth.py::test_cookie_flags` |
| Idle (30 min) + absolute (8 h) timeout | `backend/app/services/auth_service.py::validate_session` | `tests/test_auth.py::test_session_idle_expiry`, `test_session_absolute_expiry` |
| Session rotation on login + privilege change | `backend/app/services/auth_service.py::rotate_session` | `tests/test_auth.py::test_session_rotation` |
| CSRF protection (SameSite + X-CSRF-Token header) | `backend/app/core/middleware.py` | `tests/test_security.py::test_csrf_protection` |
| Log out all devices | `backend/app/api/v1/users.py::revoke_all_sessions` | `tests/test_auth.py::test_logout_all_devices` |

---

## §9.4 Error Messages

| Control | Code | Test |
|---|---|---|
| Generic "Invalid credentials." on login failure | `backend/app/api/v1/auth.py` | `tests/test_auth.py::test_generic_login_error` |
| Global exception handler (no stack traces) | `backend/main.py::add_exception_handlers` | `tests/test_security.py::test_no_stack_trace_in_response` |
| Dummy hash on unknown emails (timing uniformity) | `backend/app/services/auth_service.py` | `tests/test_auth.py::test_timing_attack_mitigation` |

---

## §9.5 Password Reset Flow

| Control | Code | Test |
|---|---|---|
| 30-min single-use token (32 random bytes, hashed) | `backend/app/services/auth_service.py::create_password_reset` | `tests/test_auth.py::test_reset_token_single_use`, `test_reset_token_expiry` |
| Generic response (timing equalised) | `backend/app/api/v1/auth.py::password_reset_request` | `tests/test_auth.py::test_enumeration_reset` |
| Invalidate all sessions on reset | `backend/app/services/auth_service.py::confirm_password_reset` | `tests/test_auth.py::test_reset_invalidates_sessions` |
| Email notification on reset | `backend/app/services/notification_service.py` | `tests/test_auth.py::test_reset_email_notification` |

---

## §9.6 Multi-Factor Authentication

| Control | Code | Test |
|---|---|---|
| TOTP setup + verify + recovery codes | `backend/app/security/mfa.py` | `tests/test_auth.py::test_totp_setup`, `test_recovery_codes` |
| MFA mandatory for Faculty + Admin | `backend/app/api/deps.py::require_mfa` | `tests/test_auth.py::test_mfa_enforced_faculty`, `test_mfa_enforced_admin` |
| Step-up MFA for sensitive actions | `backend/app/api/deps.py::require_mfa_stepup` | `tests/test_auth.py::test_stepup_quiz_publish`, `test_stepup_export` |
| OTP rate limiting | `backend/app/security/rate_limiter.py` | `tests/test_auth.py::test_otp_rate_limit` |
| TOTP secret encrypted at rest | `backend/app/security/mfa.py::encrypt_secret` | `tests/test_auth.py::test_secret_encrypted_in_db` |

---

## §9.7 Backend & API Security

| Control | Code | Test |
|---|---|---|
| Pydantic strict validation on all endpoints | `backend/app/schemas/` | `tests/test_security.py::test_input_validation_*` |
| ORM-only queries (no string SQL) | All `backend/app/services/` + `backend/app/models/` | Code review + grep: `rg "text(" backend/` |
| File upload hardening (extension + MIME + magic byte + random name + out-of-web-root) | `backend/app/services/module_service.py` | `tests/test_security.py::test_upload_invalid_extension`, `test_upload_magic_byte` |
| LLM output schema validation before storage | `backend/app/services/quiz_service.py` | `tests/test_security.py::test_llm_output_validation` |
| Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy) | `backend/app/core/middleware.py` | `tests/test_security.py::test_security_headers` |
| CORS allow-list | `backend/main.py` | `tests/test_security.py::test_cors_origin` |
| Global rate limiting + request size limits | `backend/app/core/middleware.py` | `tests/test_security.py::test_global_rate_limit`, `test_request_size_limit` |
| Secrets from env only | `backend/app/core/config.py` | No secrets found: `rg "SECRET|KEY" --type py | grep -v env` |

---

## §9.8 Logging & Monitoring

| Control | Code | Test |
|---|---|---|
| Append-only audit log (failed logins, lockouts, role changes, exports) | `backend/app/models/audit.py`, `audit_service.py` | `tests/test_security.py::test_audit_log_written` |
| New device / IP-change detection | `backend/app/services/auth_service.py::detect_anomalous_device` | `tests/test_security.py::test_new_device_alert` |
| Admin console suspicious-activity view | `backend/app/api/v1/admin.py` | Manual: admin can see alert list |
| No passwords/tokens/OTPs in logs | `backend/app/core/logging.py` (field redaction) | `tests/test_security.py::test_no_secrets_in_logs` |

---

## §9.9 Authorisation (RBAC + IDOR prevention)

| Control | Code | Test |
|---|---|---|
| RBAC middleware on every protected route | `backend/app/api/deps.py` | `tests/test_rbac.py::test_student_cannot_access_faculty_routes` |
| Object-level checks (student sees own data only) | `backend/app/api/v1/students.py`, `attempts.py` | `tests/test_rbac.py::test_student_idor_prevention` |
| Faculty sees only enrolled students | `backend/app/api/deps.py::require_course_faculty` | `tests/test_rbac.py::test_faculty_cross_course_forbidden` |
| Admin actions audited | `backend/app/api/v1/admin.py` + `audit_service.py` | `tests/test_rbac.py::test_admin_action_audit` |
