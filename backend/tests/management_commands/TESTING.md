# Management Commands — Test Documentation

Tests in [`test_commands.py`](test_commands.py) cover:
- `core/management/commands/fetch_fitbit_data.py`
- `core/management/commands/seed_periodic_tasks.py`
- `core/management/commands/set_celerybeat_every_minute.py`

## Covered scenarios
- Seeding periodic tasks (`update_or_create` called for both tasks)
- Setting minute-level beat schedule for both task names
- Fitbit fetch command with no users (clean exit)
- Fitbit fetch command with one mocked user and mocked Fitbit API responses

## Running
```bash
pytest tests/management_commands/ -v
```
