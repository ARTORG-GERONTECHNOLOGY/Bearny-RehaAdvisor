#!/usr/bin/env bats
# Tests for scripts/setup-cron.sh
# Run: bats scripts/tests/test_setup_cron.bats

load 'helpers'

setup()    { setup_repo; }
teardown() { teardown_repo; }

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

@test "unknown flag exits 1 and prints usage" {
    run bash "$REPO_DIR/scripts/setup-cron.sh" --bad-flag
    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown option"* ]]
    [[ "$output" == *"Usage:"* ]]
}

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------

@test "default installs cron entry at 03:00" {
    run bash "$REPO_DIR/scripts/setup-cron.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"03:00"* ]]

    # The crontab file should contain the correct time fields
    grep -qE '^0 3 \* \* \*' "$MOCK_CRONTAB_FILE"
}

@test "--hour and --minute flags set custom timing" {
    run bash "$REPO_DIR/scripts/setup-cron.sh" --hour 2 --minute 30
    [ "$status" -eq 0 ]
    [[ "$output" == *"02:30"* ]]
    grep -qE '^30 2 \* \* \*' "$MOCK_CRONTAB_FILE"
}

@test "cron entry points to backup.sh inside the repo" {
    run bash "$REPO_DIR/scripts/setup-cron.sh"
    [ "$status" -eq 0 ]

    # The installed line must reference the backup.sh in the same repo
    grep -q "$REPO_DIR/scripts/backup.sh" "$MOCK_CRONTAB_FILE"
}

@test "cron entry redirects output to cron.log inside backups dir" {
    run bash "$REPO_DIR/scripts/setup-cron.sh"
    [ "$status" -eq 0 ]
    grep -q "$REPO_DIR/backups/cron.log" "$MOCK_CRONTAB_FILE"
}

# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

@test "running twice does not duplicate the cron entry" {
    run bash "$REPO_DIR/scripts/setup-cron.sh"
    [ "$status" -eq 0 ]

    run bash "$REPO_DIR/scripts/setup-cron.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"already installed"* ]]

    # Exactly one backup entry in the crontab file
    local count
    count=$(grep -c "backup.sh" "$MOCK_CRONTAB_FILE")
    [ "$count" -eq 1 ]
}
