# RehaAdvisor — Developer Reference for Claude Code

## Stack at a glance

| Layer | Technology |
|---|---|
| Backend | Django 5 + MongoEngine (MongoDB), REST API, JWT auth |
| Frontend | React + TypeScript + MobX stores |
| Task queue | Celery + Redis |
| Translation | LibreTranslate (self-hosted) |
| Containers | Docker Compose — `django`, `react`, `celery`, `celery-beat`, `nginx`, `libretranslate`, `redis`, `db` |

## Running the project

```bash
# Development
docker compose -f docker-compose.dev.yml up -d

# Local-prod (staging-like, uses built images)
docker compose -f docker-compose.local-prod.yml up -d

# Production (separate clone at /home/ubuntu/repos/telerehabapp-prod)
docker compose -f docker-compose.prod.reha-advisor.yml up -d
```

## Running tests

Tests run inside the `django` container (Python env is Miniconda inside Docker, not on host):

```bash
# All tests
docker exec django pytest tests/ -v

# Single module
docker exec django pytest tests/template_views/ -v

# With coverage
docker exec django pytest tests/ --cov=. --cov-report=term-missing
```

The test suite uses `mongomock` for in-memory MongoDB — no real DB needed. All test files follow the pattern:

```python
@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    from mongoengine import connect, disconnect
    from mongoengine.connection import _connections
    alias = "default"
    if alias in _connections:
        disconnect(alias)
    conn = connect("mongoenginetest", alias=alias, host="mongodb://localhost",
                   mongo_client_class=mongomock.MongoClient)
    yield conn
    disconnect(alias)
```

DRF views use `APIRequestFactory` + `force_authenticate`, not Django's `Client`.

## Key file locations

| What | Where |
|---|---|
| Backend views | `backend/core/views/` (one file per domain) |
| Models | `backend/core/models.py` |
| URL routing | `backend/core/urls.py` |
| Tests | `backend/tests/<module>/` |
| Clinic/project config | `backend/config.json` |
| Config loader | `backend/utils/config.py` → `from utils.config import config` |
| Frontend stores (MobX) | `frontend/src/stores/` |
| Frontend components | `frontend/src/components/` |

## config.json — runtime configuration

`backend/config.json` is the **single source of truth** for clinic, project, and specialization choices. It is never committed with secrets — only structural data.

### `therapistInfo` section

```json
"therapistInfo": {
  "specializations": ["Cardiology", "Neurology", ...],
  "projects": ["COPAIN", "COMPASS"],
  "clinic_projects": {
    "Inselspital": ["COPAIN", "COMPASS"],
    "Berner Reha Centrum": ["COPAIN"],
    ...
  },
  "clinic_dag": {
    "Inselspital": "inselspital",
    "Berner Reha Centrum": "brc",
    ...
  }
}
```

- `projects` — master list of valid project choices for `Therapist.projects` (MongoEngine `choices=`).
- `clinic_projects` — maps each clinic to the REDCap projects accessible from it. **Used by `get_allowed_redcap_projects_for_therapist`** to derive access rights.
- `clinic_dag` — maps clinic name to REDCap Data Access Group identifier used during patient import.
- Adding a clinic or project: update both this file and the relevant `REDCAP_TOKEN_<PROJECT>` env var.

### `RedCap_Characteristics`

List of REDCap field names fetched when retrieving a patient record live (used by `export_record_by_pat_id`).

## MongoEngine patterns

**Do not** use Django ORM patterns — there are no migrations. Models inherit from `mongoengine.Document`.

ReferenceField dereference — always wrap in try/except because MongoEngine raises `DoesNotExist` on broken references:

```python
value = None
try:
    ref = doc.some_ref_field   # triggers dereference
    if ref is not None:
        value = ref.name
except Exception:
    logger.warning("Could not resolve some_ref_field for %s", doc.id)
```

## Authentication

JWT via `djangorestframework-simplejwt`. `request.user` on a DRF `@api_view` is a MongoEngine `User` document (not a Django auth user). `request.user.id` is the MongoEngine ObjectId string.

`@permission_classes([IsAuthenticated])` only works when paired with `@api_view`. Without `@api_view` it is a no-op.

## Environment files

| File | Used by |
|---|---|
| `.env.dev` | `docker-compose.dev.yml` |
| `.env.local-prod` | `docker-compose.local-prod.yml` |
| `.env.prod` (on server) | `docker-compose.prod.reha-advisor.yml` |

Key env vars (see `docs/07-ENVIRONMENT_CONFIG.md` for the full reference):

```
REDCAP_API_URL          # https://redcap.unibe.ch/api/
REDCAP_TOKEN_COPAIN     # per-project API tokens
REDCAP_TOKEN_COMPASS
SENTRY_DSN              # backend error tracking
VITE_SENTRY_DSN         # frontend error tracking
```

## LibreTranslate

The `libretranslate` container provides self-hosted machine translation for intervention content. Required env vars:

```
LT_LOAD_ONLY=en,fr,de,it,nl,pt
LT_UPDATE_MODELS=true
LT_PACKAGES_ROOT=/app/packages
```

The `libretranslate_packages` named volume must exist — without it the language models are re-downloaded on every restart and the service is unavailable during that window.

## Three-environment setup

| Stack | Compose file | Purpose |
|---|---|---|
| `dev` | `docker-compose.dev.yml` | Active development, hot-reload, code mounted as volume |
| `local-prod` | `docker-compose.local-prod.yml` | Staging on the same server, built images, prod-like settings |
| `prod` | `docker-compose.prod.reha-advisor.yml` (in `/home/ubuntu/repos/telerehabapp-prod`) | Live production, pulls from GHCR |

A gateway nginx (`docker-compose.gateway.yml`) routes incoming traffic between the local-prod and prod stacks on the same host. Both stacks sit on different Docker networks (`telereha` / `telereha-prod`).

## Deployment

Triggered automatically by publishing a GitHub Release. The workflow builds backend and frontend images, pushes to GHCR, then SSH-deploys to the production server. See `docs/PRODUCTION_DEPLOY_RUNBOOK.md` for step-by-step procedures and rollback.
