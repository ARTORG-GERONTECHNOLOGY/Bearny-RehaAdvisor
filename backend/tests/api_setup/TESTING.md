# API Setup Modules — Test Documentation

Tests in [`test_api_entrypoints.py`](test_api_entrypoints.py) cover:
- `api/asgi.py`
- `api/wsgi.py`
- `api/settings/prod.py`

## Covered scenarios
- ASGI module sets default `DJANGO_SETTINGS_MODULE` and builds `application`
- WSGI module respects pre-set `DJANGO_SETTINGS_MODULE` and builds `application`
- Production settings load and `SECURE_SSL_REDIRECT` follows environment input

## Running
```bash
pytest tests/api_setup/ -v
```
