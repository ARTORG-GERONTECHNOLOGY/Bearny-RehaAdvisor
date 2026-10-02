# Core Infra Modules — Test Documentation

Tests in [`test_redcap_router_tasks.py`](test_redcap_router_tasks.py) cover:
- `core/redcap.py`
- `core/routers.py`
- `core/tasks.py`

## Covered scenarios
- REDCap export payload construction and first-record extraction
- REDCap export empty response behavior
- Celery beat DB router read/write/migrate rules
- Celery task wrappers for command execution (success and error)
- Async Fitbit task behavior when user exists or is missing
- Tasks dispatched from web requests (`fetch_google_health_data_async`, both OAuth backfills) ignore results
- `gunicorn.conf.py` watchdog ([`test_gunicorn_conf.py`](test_gunicorn_conf.py)): restarts the worker when a
  request outlives `--timeout` (naming it in the log), lets other running and queued requests finish first
  (up to 10 s), flushes Sentry before exiting, exits even if logging fails, ignores finished requests, stays
  off with `--timeout 0`; `on_starting` records the master's start time for workers to inherit

## Running
```bash
pytest tests/core_infra/ -v
```
