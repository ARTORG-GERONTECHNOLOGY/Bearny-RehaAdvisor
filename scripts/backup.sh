#!/bin/bash

# Backup script for RehaAdvisor
# Backs up: MongoDB (main DB), SQLite (celery-beat schedules), media volume (uploads)
# Usage: ./backup.sh [--upload-s3] [--s3-bucket bucket-name]

set -e

# Resolve repo root relative to this script so it works from any working directory
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# Configuration
BACKUP_DIR="$REPO_DIR/backups"
RETENTION_DAYS=30
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.reha-advisor.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
UPLOAD_S3=false
S3_BUCKET=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --upload-s3)
            UPLOAD_S3=true
            shift
            ;;
        --s3-bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--upload-s3] [--s3-bucket bucket-name]"
            exit 1
            ;;
    esac
done

# Read MongoDB credentials from .env.prod if present
MONGO_USER=""
MONGO_PASSWORD=""
ENV_FILE="$REPO_DIR/.env.prod"
if [ -f "$ENV_FILE" ]; then
    MONGO_USER=$(grep -E '^MONGO_INITDB_ROOT_USERNAME=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '"'"'" | xargs)
    MONGO_PASSWORD=$(grep -E '^MONGO_INITDB_ROOT_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '"'"'" | xargs)
fi

# Build auth args for mongodump/mongorestore
MONGO_AUTH_ARGS=""
if [ -n "$MONGO_USER" ] && [ -n "$MONGO_PASSWORD" ]; then
    MONGO_AUTH_ARGS="-u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin"
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MONGODB_BACKUP="$BACKUP_DIR/mongodb_${TIMESTAMP}.archive"
SQLITE_BACKUP="$BACKUP_DIR/sqlite_${TIMESTAMP}.db"
MEDIA_BACKUP="$BACKUP_DIR/media_${TIMESTAMP}.tar.gz"
BACKUP_LOG="$BACKUP_DIR/backup_${TIMESTAMP}.log"

echo -e "${BLUE}=== RehaAdvisor Database Backup ===${NC}"
echo -e "${BLUE}Timestamp: $(date)${NC}"
echo -e "${BLUE}Backup dir: $BACKUP_DIR${NC}"
echo ""

MONGODB_OK=false
SQLITE_OK=false
MEDIA_OK=false

# ---------------------------------------------------------------------------
# 1. MongoDB
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[1/3] MongoDB backup...${NC}"

if ! docker ps --format '{{.Names}}' | grep -q "^db-prod$"; then
    echo -e "${RED}✗ MongoDB container (db-prod) is not running — skipping${NC}" | tee -a "$BACKUP_LOG"
else
    # Pipe mongodump stdout to a host file — the only correct way with --archive
    # shellcheck disable=SC2086
    if docker exec db-prod mongodump \
            --archive --gzip \
            $MONGO_AUTH_ARGS \
            2>>"$BACKUP_LOG" > "$MONGODB_BACKUP"; then
        MONGO_SIZE=$(du -h "$MONGODB_BACKUP" | cut -f1)
        echo -e "${GREEN}✓ MongoDB backup: $MONGODB_BACKUP ($MONGO_SIZE)${NC}"
        MONGODB_OK=true
    else
        echo -e "${RED}✗ MongoDB backup failed — check $BACKUP_LOG${NC}"
        rm -f "$MONGODB_BACKUP"
    fi
fi

# ---------------------------------------------------------------------------
# 2. SQLite (celery-beat schedule DB — bind mount at ./data/db.sqlite3)
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[2/3] SQLite backup...${NC}"

SQLITE_SRC="$REPO_DIR/data/db.sqlite3"
if [ -f "$SQLITE_SRC" ]; then
    if cp "$SQLITE_SRC" "$SQLITE_BACKUP"; then
        SQLITE_SIZE=$(du -h "$SQLITE_BACKUP" | cut -f1)
        echo -e "${GREEN}✓ SQLite backup: $SQLITE_BACKUP ($SQLITE_SIZE)${NC}"
        SQLITE_OK=true
    else
        echo -e "${RED}✗ SQLite backup failed${NC}"
        rm -f "$SQLITE_BACKUP"
    fi
else
    echo -e "${YELLOW}  SQLite file not found at $SQLITE_SRC — skipping${NC}"
fi

# ---------------------------------------------------------------------------
# 3. Media volume (uploaded files: videos, PDFs, images)
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[3/3] Media backup...${NC}"

if ! docker ps --format '{{.Names}}' | grep -q "^django-prod$"; then
    echo -e "${YELLOW}  django-prod not running — skipping media backup${NC}"
else
    if docker exec django-prod tar -czf - /srv/app/media 2>>"$BACKUP_LOG" > "$MEDIA_BACKUP"; then
        MEDIA_SIZE=$(du -h "$MEDIA_BACKUP" | cut -f1)
        echo -e "${GREEN}✓ Media backup: $MEDIA_BACKUP ($MEDIA_SIZE)${NC}"
        MEDIA_OK=true
    else
        echo -e "${RED}✗ Media backup failed — check $BACKUP_LOG${NC}"
        rm -f "$MEDIA_BACKUP"
    fi
fi

# ---------------------------------------------------------------------------
# Fail if MongoDB backup (the critical one) did not succeed
# ---------------------------------------------------------------------------
if [ "$MONGODB_OK" = false ]; then
    echo -e "${RED}✗ MongoDB backup failed — aborting${NC}"
    exit 1
fi

# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------
cat > "$BACKUP_DIR/backup_${TIMESTAMP}.meta" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "mongodb": $([ "$MONGODB_OK" = true ] && echo '"'$MONGODB_BACKUP'"' || echo 'null'),
  "sqlite":  $([ "$SQLITE_OK"  = true ] && echo '"'$SQLITE_BACKUP'"'  || echo 'null'),
  "media":   $([ "$MEDIA_OK"   = true ] && echo '"'$MEDIA_BACKUP'"'   || echo 'null'),
  "retention_days": $RETENTION_DAYS
}
EOF

# ---------------------------------------------------------------------------
# S3 upload (optional)
# ---------------------------------------------------------------------------
if [ "$UPLOAD_S3" = true ]; then
    if [ -z "$S3_BUCKET" ]; then
        echo -e "${RED}✗ S3 bucket not specified. Use --s3-bucket bucket-name${NC}"
        exit 1
    fi
    if ! command -v aws &>/dev/null; then
        echo -e "${RED}✗ AWS CLI not installed${NC}"
        exit 1
    fi
    echo ""
    echo -e "${YELLOW}Uploading to S3: s3://$S3_BUCKET/reha-advisor/backups/${NC}"
    for f in "$MONGODB_BACKUP" "$SQLITE_BACKUP" "$MEDIA_BACKUP"; do
        [ -f "$f" ] && aws s3 cp "$f" "s3://$S3_BUCKET/reha-advisor/backups/$(basename "$f")" 2>>"$BACKUP_LOG" \
            && echo -e "${GREEN}✓ Uploaded $(basename "$f")${NC}"
    done
fi

# ---------------------------------------------------------------------------
# Retention cleanup
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Cleaning up backups older than $RETENTION_DAYS days...${NC}"
find "$BACKUP_DIR" -name "mongodb_*.archive" -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null
find "$BACKUP_DIR" -name "sqlite_*.db"       -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null
find "$BACKUP_DIR" -name "media_*.tar.gz"    -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null
find "$BACKUP_DIR" -name "backup_*.log"      -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null
find "$BACKUP_DIR" -name "backup_*.meta"     -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null
echo -e "${GREEN}✓ Cleanup done${NC}"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BLUE}=== Backup Summary ===${NC}"
[ "$MONGODB_OK" = true ] && echo -e "  MongoDB : ${GREEN}$(du -h "$MONGODB_BACKUP" | cut -f1)${NC}  $MONGODB_BACKUP"
[ "$SQLITE_OK"  = true ] && echo -e "  SQLite  : ${GREEN}$(du -h "$SQLITE_BACKUP"  | cut -f1)${NC}  $SQLITE_BACKUP"
[ "$MEDIA_OK"   = true ] && echo -e "  Media   : ${GREEN}$(du -h "$MEDIA_BACKUP"   | cut -f1)${NC}  $MEDIA_BACKUP"
echo -e "  Log     : $BACKUP_LOG"
echo -e "  Retention: $RETENTION_DAYS days"
echo ""

echo -e "${BLUE}Recent backups:${NC}"
ls -lh "$BACKUP_DIR"/mongodb_*.archive 2>/dev/null | awk '{printf "  %-45s %s\n", $NF, $5}' | tail -5

echo ""
echo -e "${GREEN}✓ Backup complete${NC}"
