# REDCap Project Views — Test Documentation

Tests in [`test_redcap_project_views.py`](test_redcap_project_views.py)
cover `core/views/redcap_project_views.py` directly.

---

## Coverage

| Function | Scenarios | Tests |
|---|---|---|
| `redcap_projects` | therapist missing, success, method not allowed | 3 |

---

## Running

```bash
pytest tests/redcap_project_views/ -v
```

