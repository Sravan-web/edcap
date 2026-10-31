# EdCap AI — Scale-Up Path (Documentation Only)

> **Note:** The items below are NOT built. They document the production-grade path for when EdCap AI grows beyond the single-institution baseline.

---

## Telemetry Ingestion

| Baseline (built) | Scale-up path |
|---|---|
| Batched `POST /telemetry/events` into PostgreSQL (synchronous, with dedup) | Apache Kafka event bus → Apache Flink or PySpark structured streaming → partitioned time-series store (Apache Iceberg or Delta Lake) |

**Migration path:** Add a Kafka producer adapter behind the existing `TelemetryService` interface. The API contract (`POST /telemetry/events`) does not change for the client.

---

## Feature Store

| Baseline (built) | Scale-up path |
|---|---|
| Pandas + SQLAlchemy computing features into `student_features` table on-demand | Feast feature store + Redis online store + Delta Lake offline store; hourly feature pipelines |

**Migration path:** Wrap feature reads behind a `FeatureStore` interface. Replace the SQL-backed implementation with Feast without changing ML inference code.

---

## Vector Database (Playbook Retrieval)

| Baseline (built) | Scale-up path |
|---|---|
| TF-IDF cosine similarity over 30+ strategy JSON files in memory | Qdrant or Pinecone vector database; embedding model (e.g., `text-embedding-3-small`) to encode strategies; ANN retrieval |

**Migration path:** Replace the `TFIDFRetriever` with an `EmbeddingRetriever` behind the same `StrategyRetriever` interface.

---

## ML Classifier

| Baseline (built) | Scale-up path |
|---|---|
| Scikit-Learn Gradient Boosting on tabular features (≤15 features) | Transformer/embedding hybrid; student behaviour encoded as sequences; fine-tuned on domain-specific labelled data |

**Migration path:** Register the new model as a versioned `ModelArtifact`; keep the same `ClassifierService.predict(features) → PredictionResult` interface.

---

## Infrastructure

| Concern | Scale-up path |
|---|---|
| Database | Read replicas + connection pooling (PgBouncer) |
| Caching | Redis for session store, rate limiter, and hot-path API responses |
| Object storage | AWS S3 / GCS for uploaded files and model artefacts instead of local disk |
| Search | Elasticsearch or OpenSearch for audit log and assessment search |
| Auth | Dedicated identity provider (Auth0, Keycloak) with SAML/OIDC federation for institutional SSO |
| Deployment | Kubernetes (EKS/GKE) with Helm charts; Horizontal Pod Autoscaler on the API tier |
| Observability | OpenTelemetry traces → Jaeger; metrics → Prometheus + Grafana; logs → Loki |
| CI/CD | GitHub Actions → staging → canary production with automated rollback |
| Compliance | SOC 2 Type II audit trail; FERPA data classification; GDPR data residency controls |
