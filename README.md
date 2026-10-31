# EdCap

**Early-Support & Teacher Capacity Platform for Variable-Pace Learners**  
_Problem Statement: SIH1432_

---

## 🎯 Overview

EdCap is an intelligent educational platform that detects students who are falling behind early and provides teachers with actionable playbooks. The system combines rule-based detection, ML classification, and automated pedagogical recommendations.

### Key Features

- **Multi-track Student Triage**: Classifies at-risk students into 3 support tracks (Foundational, Language, Engagement) plus normal
- **Rule Engine**: 3 configurable threshold rules for early detection from assessment data
- **ML Classifier**: LightGBM model trained on 9 behavioural features with SHAP explainability
- **Automated Quiz Generation**: Daily micro-tests generated from uploaded lecture content
- **Teacher Playbooks**: RAG-based intervention plans backed by 30+ pedagogical strategies
- **Spaced Repetition**: Configurable SR queue for remedial topics
- **Full Security**: MFA, rate limiting, session management, audit logging, RBAC

---

## 🏗 Architecture

```
miniproject/
├── backend/           FastAPI + SQLAlchemy (async)
│   ├── app/
│   │   ├── api/v1/    14 route modules (60+ endpoints)
│   │   ├── core/      Config, DB, security, middleware
│   │   ├── models/    8 ORM models (23 tables)
│   │   ├── schemas/   Pydantic v2 schemas
│   │   ├── services/  Business logic + rule engine
│   │   ├── security/  Rate limiter, CAPTCHA, MFA
│   │   └── ml/        LLM client
│   ├── alembic/       DB migrations
│   └── tests/         pytest integration & unit tests
├── ml/                ML pipeline
│   ├── data/          Synthetic training data
│   ├── models/        Trained classifier artifacts
│   └── strategies/    6 pedagogical strategy JSONs
├── docs/              PLAN, ASSUMPTIONS, SECURITY, SCALING, API, UML
├── scripts/           Seed data script
├── docker-compose.yml PostgreSQL + Redis + API
└── .env.example       All config with docs
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- pip

### Development Setup

```bash
# Clone and enter
cd miniproject

# Copy environment config
cp .env.example .env

# Install backend dependencies
cd backend
pip install -r requirements.txt

# Seed demo data (creates SQLite DB + sample data)
cd ..
python scripts/seed_demo_data.py

# Run the API server
cd backend
uvicorn main:app --reload --port 8000

# In a separate terminal, run the Next.js frontend
cd frontend
npm install
npm run dev

# Visit http://localhost:3000 for web interface
# Visit http://localhost:8000/docs for Swagger UI
```

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@edcap.demo` | `Admin@123456789` |
| Faculty | `prof.sharma@edcap.demo` | `Faculty@123456789` |
| Student | `arjun.mehta@edcap.demo` | `Student@123456789` |

### Docker Setup (Production-like)

```bash
docker-compose up --build
```

---

## 🤖 ML Pipeline

### Train the Classifier

```bash
# 1. Generate synthetic data (3000 rows, 4 classes)
python ml/generate_synthetic_data.py

# 2. Train LightGBM classifier
python ml/train.py

# 3. Evaluate (accuracy, F1, confusion matrix, SHAP)
python ml/evaluate.py
```

### Features (§6.1)

| # | Feature | Description |
|---|---------|-------------|
| 1 | `velocity_decay_score` | Score trend normalised 0-1 |
| 2 | `format_preference_delta` | Non-default format usage ratio |
| 3 | `hesitation_index` | Average hesitations per event |
| 4 | `persistence_decay_rate` | Drop in recent quiz attempts |
| 5 | `topic_accuracy` | Average accuracy across topics |
| 6 | `trend_slope` | Linear regression slope of scores |
| 7 | `streak_consistency` | Current/longest streak ratio |
| 8 | `prereq_accuracy` | Accuracy on prerequisite questions |
| 9 | `reading_speed` | Inverse submission latency (normalised) |

### Support Tracks

| Track | Description | Strategy Focus |
|-------|-------------|----------------|
| `A_foundational` | Core concept gaps | Scaffolding, prerequisite bridging |
| `B_language` | Academic language barriers | Vocabulary support, multimodal content |
| `C_engagement` | Declining participation | Motivation, streak recovery, goal setting |
| `normal` | On track | Standard pathway |

---

## 🔒 Security

- **Argon2id** password hashing with NIST-compliant policy
- **TOTP MFA** with encrypted secrets and recovery codes
- **HttpOnly cookie** JWT sessions with idle + absolute timeouts
- **Rate limiting** on login (5/15min) and API (200/min)
- **CAPTCHA** integration (stub/Turnstile/hCaptcha/reCAPTCHA)
- **Step-up MFA** for sensitive admin actions
- **Append-only audit log** (never stores PII or tokens)
- **Input sanitisation** against prompt injection in LLM inputs

See [SECURITY.md](docs/SECURITY.md) for full details.

---

## 📊 Testing

```bash
cd backend

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=app --cov-report=term-missing

# Run only rule engine unit tests
pytest tests/test_rule_engine.py -v
```

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [PLAN.md](docs/PLAN.md) | Implementation plan + phase checklist |
| [ASSUMPTIONS.md](docs/ASSUMPTIONS.md) | Design decisions and assumptions |
| [SECURITY.md](docs/SECURITY.md) | Security architecture |
| [SCALING.md](docs/SCALING.md) | Scaling and performance considerations |
| [API.md](docs/API.md) | Full API endpoint reference |
| [UML/erd.md](docs/UML/erd.md) | Entity Relationship Diagram |
| [UML/architecture.md](docs/UML/architecture.md) | System architecture + data flow |

---

## 📄 License

Educational project — SIH 2024, Problem Statement 1432.
