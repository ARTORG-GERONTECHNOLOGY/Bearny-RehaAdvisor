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

## Running
```bash
pytest tests/core_infra/ -v
```
