# Redcap View — Test Documentation

Tests in [`test_redcap_view.py`](test_redcap_view.py) cover
`core/views/redcap_view.py` via direct view invocation.

## Covered scenarios
- `import_redcap_participant`:
- method guard
- current runtime error path caused by missing `json` import
- missing `record_id` validation (with `json` patched)
- non-therapist rejection
- already-assigned (same therapist) return path
- conflict when assigned to different therapist
- REDCap not-found return path
- successful create path (with mocked REDCap + participant model)
- `list_my_redcap_participants`:
- method guard
- non-therapist rejection
- success listing
- query + clinic filtering

## Running
```bash
pytest tests/redcap_view/ -v
```
