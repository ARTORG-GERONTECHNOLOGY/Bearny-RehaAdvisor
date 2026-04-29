# RehaAdvisor Production Scripts

Utility scripts for managing the RehaAdvisor production environment.

---

## Backup system

Three data stores are backed up:

| Store | What | Where it lives |
|---|---|---|
| **MongoDB** | All patient/therapist data | `db-prod` Docker container |
| **SQLite** | Celery-beat task schedules | `./data/db.sqlite3` bind-mount on host |
| **Media** | Uploaded videos, PDFs, images | `/srv/app/media` inside `django-prod` container |

Backups land in `./backups/` (gitignored, 30-day retention).

---

## Scripts

### `backup.sh` — create a backup

```bash
./scripts/backup.sh
```

Backs up all three stores and exits 1 if MongoDB fails (MongoDB is the only critical store — missing SQLite or media is logged and skipped).

**Options:**

| Flag | Description |
|---|---|
| `--upload-s3 --s3-bucket <bucket>` | Upload all backup files to S3 after creating them |

**Output files per run:**

| File | Contents |
|---|---|
| `backups/mongodb_YYYYMMDD_HHMMSS.archive` | Compressed MongoDB dump (gzip archive) |
| `backups/sqlite_YYYYMMDD_HHMMSS.db` | Copy of Celery-beat SQLite database |
| `backups/media_YYYYMMDD_HHMMSS.tar.gz` | Tarball of the media volume |
| `backups/backup_YYYYMMDD_HHMMSS.log` | Stderr from mongodump/tar |
| `backups/backup_YYYYMMDD_HHMMSS.meta` | JSON manifest (paths, sizes, timestamp) |

**MongoDB credentials** are read automatically from `.env.prod` if present (`MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`).

---

### `restore.sh` — restore from a backup

```bash
# Interactive (lists available backups, prompts for selection and confirmation)
./scripts/restore.sh

# Non-interactive (pass the archive file directly)
./scripts/restore.sh backups/mongodb_20260101_030000.archive
```

Only MongoDB is restored. Uses `--drop` to atomically replace each collection before restoring. The script verifies the restore by counting collections and reporting document counts per collection.

**Safety:** A confirmation prompt (`Type 'yes' to confirm`) must be answered before any data is overwritten.

---

### `setup-cron.sh` — install the daily cron job

```bash
./scripts/setup-cron.sh                        # daily at 03:00 (default)
./scripts/setup-cron.sh --hour 2 --minute 30   # daily at 02:30
```

Idempotent — safe to run multiple times. If the backup cron entry already exists it prints "already installed" and exits without modifying anything.

The installed entry looks like:
```
0 3 * * * /path/to/scripts/backup.sh >> /path/to/backups/cron.log 2>&1
```

03:00 is chosen to run after the 02:30 Fitbit sync Celery task finishes.

---

## Other scripts

| Script | Purpose |
|---|---|
| `health-check.sh` | Check all container and endpoint health |
| `init-db.sh` | Initialise MongoDB schema on first deployment |
| `install-git-hooks.sh` | Install pre-push style hooks for contributors |

---

## First-time setup

```bash
cd /home/ubuntu/repos/telerehabapp-prod

# 1. Run a manual backup to verify it works before scheduling
bash scripts/backup.sh
ls -lh backups/

# 2. Schedule the daily cron job
bash scripts/setup-cron.sh

# 3. Confirm the entry was installed
crontab -l | grep backup
```

---

## Verifying a backup archive

```bash
docker exec db-prod mongorestore --archive --gzip --dryRun \
    -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    < backups/mongodb_YYYYMMDD_HHMMSS.archive
```

---

## Restoring in an emergency

```bash
cd /home/ubuntu/repos/telerehabapp-prod

# Interactive — lists available backups, prompts for selection and confirmation
bash scripts/restore.sh

# Or restore a specific archive directly
bash scripts/restore.sh backups/mongodb_20260101_030000.archive
```

---

## Running the tests

The test suite requires [bats](https://github.com/bats-core/bats-core):

```bash
sudo apt install bats
```

```bash
# All 26 tests
bats scripts/tests/

# Individual suites
bats scripts/tests/test_backup.bats
bats scripts/tests/test_restore.bats
bats scripts/tests/test_setup_cron.bats
```

Tests run against copies of the scripts in a temporary directory. `docker`, `crontab`, and `aws` are replaced with lightweight mocks — no real Docker or cloud access is needed.

| Test file | Tests | Covers |
|---|---|---|
| `test_backup.bats` | 11 | Arg parsing, MongoDB/SQLite/media backup paths, credential reading, meta file |
| `test_restore.bats` | 9 | File resolution, interactive mode, confirmation prompt, restore flow, credentials |
| `test_setup_cron.bats` | 6 | Default timing, custom timing, idempotency, correct paths |

---

## Troubleshooting

**Backup exits 1 immediately**
```bash
docker ps | grep db-prod   # MongoDB container must be running
```

**Backup log shows auth failure**
```bash
grep MONGO_INITDB_ROOT /home/ubuntu/repos/telerehabapp-prod/.env.prod
```

**Cron job not running**
```bash
crontab -l              # confirm entry exists
cat backups/cron.log    # check last run output
```

**Restore fails at collection verification**
```bash
# Check archive is non-empty
ls -lh backups/mongodb_*.archive

# Dry run to validate the archive
docker exec db-prod mongorestore --archive --gzip --dryRun \
    -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    < backups/mongodb_*.archive
```
