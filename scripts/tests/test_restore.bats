#!/usr/bin/env bats
# Tests for scripts/restore.sh
# Run: bats scripts/tests/test_restore.bats

load 'helpers'

setup() {
    setup_repo
    # Pre-create a fake backup archive so restore tests have something to work with
    export FAKE_ARCHIVE="$REPO_DIR/backups/mongodb_20260101_030000.archive"
    printf 'fake-archive-data' > "$FAKE_ARCHIVE"
}
teardown() { teardown_repo; }

# ---------------------------------------------------------------------------
# File resolution
# ---------------------------------------------------------------------------

@test "non-existent file argument exits 1 with not-found message" {
    run bash "$REPO_DIR/scripts/restore.sh" "/no/such/file.archive"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not found"* ]]
}

@test "interactive mode resolves bare filename to backups directory" {
    # No positional arg → interactive. Two lines piped: filename then cancel.
    run bash -c "printf 'mongodb_20260101_030000.archive\nno\n' | bash '$REPO_DIR/scripts/restore.sh'"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Restore cancelled"* ]]
}

@test "interactive mode accepts number to select backup" {
    run bash -c "printf '1\nno\n' | bash '$REPO_DIR/scripts/restore.sh'"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Restore cancelled"* ]]
}

# ---------------------------------------------------------------------------
# Confirmation prompt
# ---------------------------------------------------------------------------

@test "typing anything other than yes cancels restore" {
    run bash "$REPO_DIR/scripts/restore.sh" "$FAKE_ARCHIVE" <<< "no"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Restore cancelled"* ]]
}

@test "empty confirmation cancels restore" {
    run bash "$REPO_DIR/scripts/restore.sh" "$FAKE_ARCHIVE" <<< ""
    [ "$status" -eq 0 ]
    [[ "$output" == *"Restore cancelled"* ]]
}

# ---------------------------------------------------------------------------
# Container checks
# ---------------------------------------------------------------------------

@test "mongodb container not running after confirmation exits 1" {
    # MOCK_DOCKER_CONTAINERS is empty — db-prod not running
    run bash "$REPO_DIR/scripts/restore.sh" "$FAKE_ARCHIVE" <<< "yes"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not running"* ]]
}

# ---------------------------------------------------------------------------
# Successful restore
# ---------------------------------------------------------------------------

@test "successful restore exits 0 and reports collection count" {
    export MOCK_DOCKER_CONTAINERS="db-prod"
    run bash "$REPO_DIR/scripts/restore.sh" "$FAKE_ARCHIVE" <<< "yes"
    [ "$status" -eq 0 ]
    [[ "$output" == *"3 collections found"* ]]
    [[ "$output" == *"restore complete"* ]]
}

@test "restore reads mongodb credentials from .env.prod and passes to docker" {
    cat > "$REPO_DIR/.env.prod" << 'ENV_EOF'
MONGO_INITDB_ROOT_USERNAME=restoreuser
MONGO_INITDB_ROOT_PASSWORD=restorepass
ENV_EOF

    export MOCK_DOCKER_CONTAINERS="db-prod"
    export DOCKER_CAPTURE_LOG="$REPO_DIR/docker-calls.log"
    run bash "$REPO_DIR/scripts/restore.sh" "$FAKE_ARCHIVE" <<< "yes"
    [ "$status" -eq 0 ]

    grep -q "\-u restoreuser" "$DOCKER_CAPTURE_LOG"
    grep -q "\-p restorepass" "$DOCKER_CAPTURE_LOG"
}

@test "mongorestore failure exits 1" {
    export MOCK_DOCKER_CONTAINERS="db-prod"
    export MOCK_MONGORESTORE_FAIL="true"
    run bash "$REPO_DIR/scripts/restore.sh" "$FAKE_ARCHIVE" <<< "yes"
    [ "$status" -eq 1 ]
}
