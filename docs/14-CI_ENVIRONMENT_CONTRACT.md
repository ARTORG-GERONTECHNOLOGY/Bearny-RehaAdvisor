# CI Environment Contract

This document defines the required CI runtime contract for backend tests and quality jobs.

Goal:
- Keep tests reproducible on remote CI.
- Avoid committing Mongo credentials/cert files.
- Prevent workflow drift that reintroduces secret leakage or flaky setup.

## Scope

Applies to:
- `.github/workflows/tests.yml`
- `.github/workflows/code-quality.yml`
- `.github/workflows/deploy-prod.yml` (pre-deploy test step)

## Required Backend CI Variables

Use these in CI jobs that run backend `pytest`:

```yaml
DJANGO_SETTINGS_MODULE: api.settings.dev
SECRET_KEY: test-secret-key-for-ci-cd
DEBUG: 'False'
DB_HOST: localhost
DB_PORT: '27017'
DB_NAME: reha_advisor_test
MONGO_TLS: 'false'
DISABLE_MONGO_CONNECT: '1'
REDIS_URL: redis://localhost:6379/0
```

## Security Rules

Do not add hardcoded DB credentials in workflows:
- `MONGO_INITDB_ROOT_USERNAME`
- `MONGO_INITDB_ROOT_PASSWORD`
- `mongodb://admin:password@...`

Do not commit local Mongo cert paths or private files for CI.

## Why `DISABLE_MONGO_CONNECT=1` Exists

Backend startup (`core.apps` and `api.celery`) historically tried to connect to Mongo with TLS cert assumptions.
In tests, suites usually reconnect with `mongomock`. This flag prevents startup-time failures before fixtures run.

## Expected Behavior

- CI test jobs should pass without any committed `.env` or Mongo secret file.
- API/unit tests using `mongomock` continue to run isolated in-memory DBs.
- Workflow runs remain deterministic across forks and PRs.

## Change Checklist (When Editing CI)

1. Keep the variable set above for backend pytest jobs.
2. Do not introduce plaintext Mongo credentials.
3. Validate workflow YAML syntax before pushing.
4. If Mongo connectivity behavior changes, update:
   - `backend/core/apps.py`
   - `backend/api/celery.py`
   - this document

## Verification Commands

Local sanity checks:

```bash
python3 - <<'PY'
import yaml, pathlib
for p in [
  '.github/workflows/tests.yml',
  '.github/workflows/code-quality.yml',
  '.github/workflows/deploy-prod.yml',
]:
    yaml.safe_load(pathlib.Path(p).read_text())
    print('ok', p)
PY
```

Search for accidental credential leaks:

```bash
rg -n "admin:password|MONGO_INITDB_ROOT_PASSWORD|MONGO_INITDB_ROOT_USERNAME|mongodb://admin" .github/workflows -S
```

