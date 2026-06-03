#!/usr/bin/env bats
# Tests for scripts/backup.sh
# Run: bats scripts/tests/test_backup.bats

load 'helpers'

setup()    { setup_repo; }
teardown() { teardown_repo; }

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

@test "unknown flag exits 1 and prints usage" {
    run bash "$REPO_DIR/scripts/backup.sh" --bad-flag
    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown option"* ]]
    [[ "$output" == *"Usage:"* ]]
}

@test "--upload-s3 without --s3-bucket exits 1 after successful backup" {
    export MOCK_DOCKER_CONTAINERS="db-prod"
    run bash "$REPO_DIR/scripts/backup.sh" --upload-s3
    [ "$status" -eq 1 ]
    [[ "$output" == *"S3 bucket not specified"* ]]
}

# ---------------------------------------------------------------------------
# MongoDB backup
# ---------------------------------------------------------------------------

@test "mongodb container not running exits 1" {
    # MOCK_DOCKER_CONTAINERS is empty — docker ps returns nothing
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not running"* ]]
}

@test "mongodb backup creates archive file with content" {
    export MOCK_DOCKER_CONTAINERS="db-prod"
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 0 ]
    local count
    count=$(ls "$REPO_DIR/backups/mongodb_"*.archive 2>/dev/null | wc -l)
    [ "$count" -eq 1 ]
    # Archive must be non-empty (mock writes "archive-data")
    local f
    f=$(ls "$REPO_DIR/backups/mongodb_"*.archive)
    [ -s "$f" ]
}

@test "mongodump failure exits 1 and removes partial archive" {
    export MOCK_DOCKER_CONTAINERS="db-prod"
    export MOCK_MONGODUMP_FAIL="true"
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 1 ]
    local count
    count=$(ls "$REPO_DIR/backups/mongodb_"*.archive 2>/dev/null | wc -l)
    [ "$count" -eq 0 ]
}

# ---------------------------------------------------------------------------
# SQLite backup
# ---------------------------------------------------------------------------

@test "sqlite file absent skips without error and exits 0" {
    export MOCK_DOCKER_CONTAINERS="db-prod"
    # data/db.sqlite3 deliberately not created
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"SQLite file not found"* ]]
    local count
    count=$(ls "$REPO_DIR/backups/sqlite_"*.db 2>/dev/null | wc -l)
    [ "$count" -eq 0 ]
}

@test "sqlite file present creates backup" {
    export MOCK_DOCKER_CONTAINERS="db-prod"
    touch "$REPO_DIR/data/db.sqlite3"
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 0 ]
    local count
    count=$(ls "$REPO_DIR/backups/sqlite_"*.db 2>/dev/null | wc -l)
    [ "$count" -eq 1 ]
}

# ---------------------------------------------------------------------------
# Media backup
# ---------------------------------------------------------------------------

@test "media backup is skipped with a message (volume too large for CI)" {
    export MOCK_DOCKER_CONTAINERS="db-prod django-prod"
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Media backup skipped"* ]]
    local count
    count=$(ls "$REPO_DIR/backups/media_"*.tar.gz 2>/dev/null | wc -l)
    [ "$count" -eq 0 ]
}

@test "full backup creates mongodb and sqlite files but no media archive" {
    export MOCK_DOCKER_CONTAINERS="db-prod django-prod"
    touch "$REPO_DIR/data/db.sqlite3"
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 0 ]
    [ "$(ls "$REPO_DIR/backups/mongodb_"*.archive 2>/dev/null | wc -l)" -eq 1 ]
    [ "$(ls "$REPO_DIR/backups/sqlite_"*.db 2>/dev/null | wc -l)" -eq 1 ]
    [ "$(ls "$REPO_DIR/backups/media_"*.tar.gz 2>/dev/null | wc -l)" -eq 0 ]
}

# ---------------------------------------------------------------------------
# Credentials and metadata
# ---------------------------------------------------------------------------

@test "reads mongodb credentials from .env.prod and passes to docker" {
    cat > "$REPO_DIR/.env.prod" << 'ENV_EOF'
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=secret99
ENV_EOF

    export MOCK_DOCKER_CONTAINERS="db-prod"
    export DOCKER_CAPTURE_LOG="$REPO_DIR/docker-calls.log"
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 0 ]

    # Auth args must appear in the mongodump invocation
    grep -q "\-u admin" "$DOCKER_CAPTURE_LOG"
    grep -q "\-p secret99" "$DOCKER_CAPTURE_LOG"
}

@test "creates .meta file with correct json fields after backup" {
    export MOCK_DOCKER_CONTAINERS="db-prod"
    run bash "$REPO_DIR/scripts/backup.sh"
    [ "$status" -eq 0 ]

    local meta
    meta=$(ls "$REPO_DIR/backups/backup_"*.meta 2>/dev/null | head -1)
    [ -n "$meta" ]
    # Required JSON keys must be present
    grep -q '"timestamp"' "$meta"
    grep -q '"mongodb"'   "$meta"
    grep -q '"sqlite"'    "$meta"
    grep -q '"media"'     "$meta"
    grep -q '"retention_days"' "$meta"
}
