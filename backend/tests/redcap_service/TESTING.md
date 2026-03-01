# REDCap Service — Test Documentation

Tests in [`test_redcap_service.py`](test_redcap_service.py) cover
`core/services/redcap_service.py`.

## Covered scenarios
- normalization helper and REDCap API URL resolution
- token resolution from environment and missing-token error
- POST wrapper success, non-200 API error, and network error
- export by `pat_id`:
- empty identifier short-circuit
- primary filter success
- fallback to `record_id`
- invalid JSON handling
- propagated REDCap errors

## Running
```bash
pytest tests/redcap_service/ -v
```
