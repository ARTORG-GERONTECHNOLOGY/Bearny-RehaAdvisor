# EVA Views — Test Documentation

Tests in [`test_eva_view.py`](test_eva_view.py) cover `core/views/eva_view.py`.

## Covered scenarios
- helper coverage: `_safe_slug`, `_safe_filename`, `_guess_ext`
- `submit_healthslider_item`: method check, required fields, success save, and audio upload save path
- `list_healthslider_items`: required param + success listing
- `download_healthslider_audio`: method guard, not-found branches, missing-storage-file branch, and streamed success headers
- `download_healthslider_session_zip`: no-files branch and direct success ZIP response
- `delete_healthslider_session`: direct view method/validation/not-found branches + successful delete with mocked storage

## Running
```bash
pytest tests/eva_views/ -v
```
