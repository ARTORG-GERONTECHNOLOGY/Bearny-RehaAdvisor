# Intervention Import Views — Test Documentation

Tests in [`test_intervention_import_view.py`](test_intervention_import_view.py)
cover `core/views/intervention_import.py`.

## Coverage summary
- Total tests: 8
- Focus: parser helpers + import endpoint validation + workbook import branches

## Covered scenarios
- parser helpers (`content_type`, duration, ID/language split, list split)
- extended helper coverage:
  - boolean/int parsing
  - language normalization
  - provider detection + embed URL parsing (Spotify/YouTube)
  - URL/file media-type inference and raw-file detection
- endpoint validation (method, missing file, invalid file type)
- endpoint success path with mocked import service
- end-to-end workbook import via `import_interventions_from_excel` (dry-run and real save)
- required-column failure path in workbook import
- fallback workbook/header branch coverage:
  - alternate sheet name (`Content (2)`)
  - header aliases (`id`, `format`, `link (text input)`)
  - dedupe update-vs-create behavior for repeated IDs

## Running
```bash
pytest tests/intervention_import_views/ -v
```
