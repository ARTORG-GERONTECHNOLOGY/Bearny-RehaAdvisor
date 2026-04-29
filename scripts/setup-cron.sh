#!/bin/bash

# Installs a daily backup cron job for RehaAdvisor.
# Idempotent — safe to run multiple times; will not duplicate the entry.
# Usage: ./setup-cron.sh [--hour H] [--minute M]
# Default: runs daily at 03:00.

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

CRON_HOUR=3
CRON_MINUTE=0

while [[ $# -gt 0 ]]; do
    case $1 in
        --hour)   CRON_HOUR="$2";   shift 2 ;;
        --minute) CRON_MINUTE="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; echo "Usage: $0 [--hour H] [--minute M]"; exit 1 ;;
    esac
done

BACKUP_SCRIPT="$REPO_DIR/scripts/backup.sh"
CRON_LOG="$REPO_DIR/backups/cron.log"
CRON_LINE="$CRON_MINUTE $CRON_HOUR * * * $BACKUP_SCRIPT >> $CRON_LOG 2>&1"

if ! crontab -l 2>/dev/null | grep -qF "$BACKUP_SCRIPT"; then
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    echo "Cron job installed: daily at $(printf '%02d:%02d' "$CRON_HOUR" "$CRON_MINUTE")"
else
    echo "Cron job already installed — no changes made"
fi

echo ""
echo "Current backup cron entries:"
crontab -l 2>/dev/null | grep backup || echo "  (none)"
