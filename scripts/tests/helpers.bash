# Shared test helpers for backup/restore/cron script tests.
# Loaded by each .bats file via: load 'helpers'

setup_repo() {
    export REPO_DIR
    REPO_DIR=$(mktemp -d -t bats-backup-XXXXX)
    mkdir -p "$REPO_DIR"/{scripts,backups,data,bin}

    cp "${BATS_TEST_DIRNAME}/../backup.sh"     "$REPO_DIR/scripts/"
    cp "${BATS_TEST_DIRNAME}/../restore.sh"    "$REPO_DIR/scripts/"
    cp "${BATS_TEST_DIRNAME}/../setup-cron.sh" "$REPO_DIR/scripts/"

    # Control variables read by mock docker at runtime
    export MOCK_DOCKER_CONTAINERS=""   # space-separated running container names
    export MOCK_MONGODUMP_FAIL="false"
    export MOCK_MEDIA_FAIL="false"
    export MOCK_MONGORESTORE_FAIL="false"
    export DOCKER_CAPTURE_LOG=""       # if set, each docker call appends "$@" here

    # Crontab mock stores state in a file
    export MOCK_CRONTAB_FILE="$REPO_DIR/.crontab"

    _write_mock_docker
    _write_mock_crontab
    _write_mock_aws

    # Prepend temp bin dir so mocks take precedence over real commands
    export PATH="$REPO_DIR/bin:$PATH"
}

teardown_repo() {
    rm -rf "$REPO_DIR"
}

# ---------------------------------------------------------------------------
# Mock writers
# ---------------------------------------------------------------------------

_write_mock_docker() {
    # Single-quoted heredoc — variable expansions happen at mock runtime,
    # so MOCK_* env vars are read from the test's exported environment.
    cat > "$REPO_DIR/bin/docker" << 'DOCKER_EOF'
#!/bin/bash
# Optionally capture every call for assertion in tests
[ -n "${DOCKER_CAPTURE_LOG:-}" ] && echo "$*" >> "$DOCKER_CAPTURE_LOG"

case "$1" in
    ps)
        # Simulate "docker ps --format '{{.Names}}'" — print running containers
        for name in ${MOCK_DOCKER_CONTAINERS:-}; do echo "$name"; done
        ;;
    exec)
        shift
        # Consume optional flags (-i, -t, ...)
        while [[ "$1" == -* ]]; do shift; done
        container="$1"; shift
        cmd="$1";       shift

        case "$container.$cmd" in
            db-prod.mongodump)
                [ "${MOCK_MONGODUMP_FAIL:-false}" = "true" ] && exit 1
                printf 'archive-data'
                ;;
            db-prod.mongorestore)
                cat > /dev/null          # consume stdin (the archive pipe)
                [ "${MOCK_MONGORESTORE_FAIL:-false}" = "true" ] && exit 1
                ;;
            db-prod.mongosh)
                all_args="$*"
                if   echo "$all_args" | grep -q 'ping';   then echo '{ ok: 1 }'
                elif echo "$all_args" | grep -q 'length'; then echo '3'
                else cat > /dev/null     # consume heredoc stdin
                fi
                ;;
            django-prod.tar)
                [ "${MOCK_MEDIA_FAIL:-false}" = "true" ] && exit 1
                printf 'tar-data'
                ;;
        esac
        ;;
esac
exit 0
DOCKER_EOF
    chmod +x "$REPO_DIR/bin/docker"
}

_write_mock_crontab() {
    # Unquoted heredoc so $MOCK_CRONTAB_FILE expands now (the path is fixed per test).
    # \$1 stays literal so $1 is expanded when the mock runs.
    cat > "$REPO_DIR/bin/crontab" << CRON_EOF
#!/bin/bash
case "\$1" in
    -l) cat "${MOCK_CRONTAB_FILE}" 2>/dev/null || true ;;
    -)  cat > "${MOCK_CRONTAB_FILE}" ;;
esac
CRON_EOF
    chmod +x "$REPO_DIR/bin/crontab"
}

_write_mock_aws() {
    cat > "$REPO_DIR/bin/aws" << 'AWS_EOF'
#!/bin/bash
[ "${MOCK_AWS_FAIL:-false}" = "true" ] && exit 1
exit 0
AWS_EOF
    chmod +x "$REPO_DIR/bin/aws"
}
