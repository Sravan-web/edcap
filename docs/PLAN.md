# EdCap — Implementation Plan

> **Product:** EdCap · Early-Support & Teacher Capacity Platform for Variable-Pace Learners  
> **Problem Ref:** SIH1432  
> **Agent:** Antigravity-Edu (Principal Full-Stack + ML + Security + UI/UX)

---

## Folder Structure

```
miniproject/                          ← workspace root
├── backend/
│   ├── app/
│   │   ├── api/v1/                   ← Route handlers (versioned)
│   │   ├── core/                     ← Config, DB, security, logging, middleware
│   │   ├── models/                   ← SQLAlchemy ORM models
│   │   ├── schemas/                  ← Pydantic v2 schemas
│   │   ├── services/                 ← Business logic
│   │   ├── security/                 ← Rate limiter, CAPTCHA, MFA
│   │   └── ml/                       ← Feature computation, classifier, RAG
│   ├── alembic/                      ← DB migrations
│   ├── tests/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/                          ← Next.js App Router
│   ├── components/
│   ├── lib/
│   ├── tests/
│   └── Dockerfile
├── ml/
│   ├── generate_synthetic_data.py
│   ├── train.py
│   ├── evaluate.py
│   ├── strategies/                   ← 30+ pedagogy JSON files
│   └── models/
├── docs/
│   ├── PLAN.md, ASSUMPTIONS.md, SCALING.md, SECURITY.md, API.md
│   └── UML/
├── scripts/
│   └── seed_demo_data.py
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Data Model

| Table | Key fields |
|---|---|
| `users` | id, email, password_hash, role, mfa_secret_encrypted, mfa_enabled, failed_login_count, locked_until |
| `sessions` | id, user_id, token_hash, device_hash, ip_prefix, expires_at, revoked_at |
| `one_time_tokens` | id, user_id, purpose, token_hash, expires_at, used_at |
| `mfa_recovery_codes` | id, user_id, code_hash, used_at |
| `courses` | id, code, name, description |
| `enrollments` | student_id, course_id |
| `course_faculty` | faculty_id, course_id |
| `syllabus_topics` | id, course_id, name, tag, parent_id, prerequisite_ids |
| `lesson_modules` | id, course_id, topic_id, taught_on, filename, parsed_chunks |
| `assessments` | id, course_id, assessment_date, topic_tag |
| `assessment_scores` | id, student_id, assessment_id, topic_id, score, max_score |
| `quiz_sets` | id, course_id, module_id, date, status (draft/approved/live) |
| `quiz_questions` | id, quiz_set_id, full schema per §11.3 |
| `quiz_attempts` | id, student_id, quiz_set_id, started_at, completed_at |
| `quiz_answers` | id, attempt_id, question_id, chosen_option, is_correct, time_taken_s |
| `telemetry_events` | id, event_id, student_id, session_id, curriculum_node_id, metrics (JSON) |
| `student_features` | id, student_id, course_id, computed features, computed_at |
| `support_flags` | id, student_id, course_id, topic_id, track, risk_score, reasons (JSON), status |
| `remedial_queue_items` | id, student_id, topic_id, next_review_at, interval_days |
| `playbooks` | id, flag_id, content (JSON), approved_by |
| `engagement_stats` | id, student_id, course_id, streak, retention_points |
| `audit_logs` | id, actor_id, action, target, ip_prefix, timestamp, outcome |
| `settings` | key, value, updated_by |

---

## API Surface (`/api/v1`)

| Group | Endpoints |
|---|---|
| Auth | POST /auth/signup, /auth/verify-email, /auth/login, /auth/logout, /auth/refresh, /auth/password-reset/request, /auth/password-reset/confirm, /auth/mfa/setup, /auth/mfa/verify, /auth/mfa/recover |
| Users | GET/PATCH /users/me, GET /users/me/sessions, DELETE /users/me/sessions |
| Courses | CRUD /courses, GET /courses/{id}/students |
| Assessments | GET/POST /assessments, POST /assessments/import, GET /assessments/template |
| Modules | POST /modules, GET /modules/{id} |
| Quizzes | POST /quizzes/generate, GET /quizzes/{id}, PATCH questions, POST approve, GET today |
| Attempts | POST /attempts, PATCH /attempts/{id}, POST answers |
| Telemetry | POST /telemetry/events |
| Students | GET /students/{id}/profile, GET /students/{id}/flags |
| Flags | GET /flags, PATCH /flags/{id} |
| Playbooks | GET/POST /playbooks |
| Remedial | GET /remedial-queue, POST complete |
| Analytics | GET /analytics/class, GET /analytics/course/{id} |
| Admin | Full CRUD + audit logs + settings |
| Health | GET /healthz |

---

## Default Configuration Values

| Parameter | Default | Env Key |
|---|---|---|
| App name | EdCap | `APP_NAME` |
| Telemetry flush interval | 5 s | `TELEMETRY_FLUSH_INTERVAL_S` |
| CSV max size | 5 MB | `UPLOAD_MAX_CSV_MB` |
| Module max size | 20 MB | `UPLOAD_MAX_MODULE_MB` |
| Below-average threshold | 15% | `RULE_BELOW_AVG_PCT` |
| Below-average window | 5 | `RULE_BELOW_AVG_WINDOW` |
| Below-average min fires | 3 | `RULE_BELOW_AVG_MIN_FIRES` |
| Trend slope threshold | -2 | `RULE_TREND_SLOPE` |
| Trend min assessments | 4 | `RULE_TREND_MIN_ASSESSMENTS` |
| Topic accuracy threshold | 50% | `RULE_TOPIC_ACCURACY_PCT` |
| Topic min attempts | 5 | `RULE_TOPIC_MIN_ATTEMPTS` |
| Login rate limit | 5/15 min | `LOGIN_RATE_LIMIT` |
| Login lockout duration | 15 min | `LOGIN_LOCKOUT_MINUTES` |
| Email verify expiry | 24 h | `EMAIL_VERIFY_EXPIRY_H` |
| Password reset expiry | 30 min | `RESET_TOKEN_EXPIRY_MIN` |
| Session idle timeout | 30 min | `SESSION_IDLE_TIMEOUT_MIN` |
| Session absolute timeout | 8 h | `SESSION_ABS_TIMEOUT_H` |
| Data retention | 365 days | `DATA_RETENTION_DAYS` |
| Spaced repetition intervals | 1,3,7,14 | `SR_INTERVALS_DAYS` |
| Quiz questions per day | 20 | `QUIZ_QUESTIONS_PER_DAY` |
| LLM retry limit | 2 | `LLM_MAX_RETRIES` |

---

## Phase Checklist

### Phase 0 — Plan & Scaffold ✅
- Repo structure, Docker Compose, config, DB migrations, /healthz

### Phase 1 — Auth & Security Foundation ✅
- All §9 security items + tests; RBAC; MFA; audit log
- Argon2id hashing, TOTP MFA, recovery codes, step-up MFA
- Rate limiting, CAPTCHA integration, session management
- HttpOnly cookies, idle + absolute timeouts

### Phase 2 — Ingestion & Rule-Based Detection ✅
- CSV import, rule engine (3 threshold rules), support flags, basic faculty dashboard
- Assessment service with validation, faculty course ownership checks
- Rule engine: below-average, negative trend, topic accuracy
- Analytics endpoints: class + course-level dashboards

### Phase 3 — Content → Daily Micro-Test ✅
- Module upload, question generation, faculty approval, student workspace + micro-test UI
- LLM prompt engineering with prompt injection defence
- Quiz generation with validation (type mix, dedup, difficulty)
- Student attempt flow with auto-scoring

### Phase 4 — Telemetry, ML Triage, Playbooks ✅
- Telemetry ingestion with dedup and rate limiting
- 9-feature computation pipeline (§6.1)
- LightGBM 4-class classifier (F1-macro: 0.92, 5-fold CV)
- SHAP explainability per track
- RAG playbooks with 6 pedagogical strategy JSONs
- Spaced repetition remedial queue

### Phase 5 — Hardening & Handover ✅
- [x] Seed data script
- [x] UML diagrams (ERD + architecture + data flow)
- [x] README with quickstart
- [x] API documentation
- [x] Docker Compose + Dockerfile
- [x] .env.example
- [x] Frontend (Next.js) — Login, Dashboard (role-aware), Analytics, Flags, Quiz, Progress, Remedial, Playbooks, Courses, Admin
- [x] Notification delivery (email/push)
- [x] Accessibility audit (a11y)
- [x] Full acceptance criteria validation

