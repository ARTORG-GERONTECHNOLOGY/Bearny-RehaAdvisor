# REDCap Access Service — Test Documentation

Tests in [`test_redcap_access.py`](test_redcap_access.py) cover
`core/services/redcap_access.py`.

## Covered scenarios
- `get_therapist_for_user` resolves by `request.user.id`
- `get_therapist_for_user` fallback resolution by `request.user.email`
- `get_therapist_for_user` returns `None` for unknown user identity
- `get_allowed_redcap_projects_for_therapist` union by clinic plus intersection with therapist projects
- `assert_project_allowed_for_therapist` allowed and denied project branches

## Running
```bash
pytest tests/redcap_access/ -v
```
