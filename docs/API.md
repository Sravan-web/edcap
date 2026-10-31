# EdCap AI — API Documentation

> **Base URL**: `http://localhost:8000/api/v1`  
> **Authentication**: HttpOnly cookie-based JWT sessions  
> **Content-Type**: `application/json` (unless file upload)

---

## Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | ✗ | Register a new account |
| POST | `/auth/verify-email` | ✗ | Verify email with token |
| POST | `/auth/login` | ✗ | Login, set session cookies |
| POST | `/auth/logout` | ✓ | Revoke session, clear cookies |
| POST | `/auth/password-reset/request` | ✗ | Request password reset email |
| POST | `/auth/password-reset/confirm` | ✗ | Confirm reset with token |
| POST | `/auth/mfa/setup` | ✓ | Generate TOTP secret + recovery codes |
| POST | `/auth/mfa/verify` | ✓ | Verify TOTP OTP |
| POST | `/auth/mfa/stepup` | ✓ | Step-up verification for sensitive actions |
| POST | `/auth/mfa/recover` | ✓ | Use recovery code |

## User Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | ✓ | Get current user profile |
| PATCH | `/users/me` | ✓ | Update profile (name, theme, font) |
| GET | `/users/me/sessions` | ✓ | List active sessions |
| DELETE | `/users/me/sessions` | ✓ | Revoke all sessions |

## Course Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/courses` | ✓ | Any |
| POST | `/courses` | ✓ | Admin |
| GET | `/courses/{id}` | ✓ | Any |
| PATCH | `/courses/{id}` | ✓ | Admin |
| GET | `/courses/{id}/students` | ✓ | Faculty/Admin |

## Assessment Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/assessments?course_id=` | ✓ | Any enrolled |
| GET | `/assessments/template` | ✗ | Any |
| POST | `/assessments/import?course_id=` | ✓ | Faculty |

## Module Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| POST | `/modules` | ✓ | Faculty |
| GET | `/modules/{id}` | ✓ | Any enrolled |

## Quiz Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| POST | `/quizzes/generate` | ✓ | Faculty |
| GET | `/quizzes/{id}` | ✓ | Any |
| PATCH | `/quizzes/{id}/questions` | ✓ | Faculty |
| POST | `/quizzes/{id}/approve` | ✓ | Faculty |
| GET | `/quizzes/today?course_id=` | ✓ | Student |

## Attempt Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| POST | `/attempts` | ✓ | Student |
| PATCH | `/attempts/{id}/finish` | ✓ | Student |
| GET | `/attempts/{id}` | ✓ | Student |

## Telemetry Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| POST | `/telemetry/events` | ✓ | Student |

## Student Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/students/{id}/profile` | ✓ | Faculty/Self |
| GET | `/students/{id}/flags` | ✓ | Faculty/Self |
| GET | `/students/{id}/remedial-queue` | ✓ | Faculty/Self |
| GET | `/students/{id}/assessment-history` | ✓ | Faculty/Self |

## Flag Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/flags` | ✓ | All (RBAC filtered) |
| PATCH | `/flags/{id}` | ✓ | Faculty/Admin |
| POST | `/flags/send-digest` | ✓ | Faculty/Admin |

## Playbook Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/playbooks` | ✓ | Faculty/Admin |
| POST | `/playbooks` | ✓ | Faculty/Admin |
| GET | `/playbooks/{id}` | ✓ | Faculty/Admin |

## Remedial Queue Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/remedial-queue` | ✓ | Student |
| POST | `/remedial-queue/{id}/complete` | ✓ | Student |

## Analytics Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/analytics/class` | ✓ | Faculty/Admin |
| GET | `/analytics/course/{id}` | ✓ | Faculty/Admin |

## Admin Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/admin/users` | ✓ | Admin |
| PATCH | `/admin/users/{id}/status` | ✓ | Admin + MFA Step-up |
| PATCH | `/admin/users/{id}/role` | ✓ | Admin + MFA Step-up |
| POST | `/admin/enrollments` | ✓ | Admin |
| POST | `/admin/course-faculty` | ✓ | Admin |
| GET | `/admin/audit-logs` | ✓ | Admin |
| GET | `/admin/settings` | ✓ | Admin |
| PUT | `/admin/settings/{key}` | ✓ | Admin |

## Health Endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | ✗ | System health check |

---

## Error Response Format

```json
{
  "detail": "Human-readable error message",
  "request_id": "uuid"
}
```

## Pagination

Most list endpoints accept `limit` and `offset` query parameters.

## Rate Limiting

- Global: 200 requests/minute
- Login: 5 attempts per 15 minutes
- Telemetry: 300 events/minute
