#!/bin/bash

# Restore script for RehaAdvisor MongoDB database
# Restores a backup created by backup.sh
# Usage: ./restore.sh [mongodb-backup-file]

set -e

# Resolve repo root relative to this script
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# Configuration
BACKUP_DIR="$REPO_DIR/backups"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.reha-advisor.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Read MongoDB credentials from .env.prod if present
MONGO_USER=""
MONGO_PASSWORD=""
ENV_FILE="$REPO_DIR/.env.prod"
if [ -f "$ENV_FILE" ]; then
    MONGO_USER=$(grep -E '^MONGO_INITDB_ROOT_USERNAME=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '"'"'" | xargs)
    MONGO_PASSWORD=$(grep -E '^MONGO_INITDB_ROOT_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '"'"'" | xargs)
fi

MONGO_AUTH_ARGS=""
if [ -n "$MONGO_USER" ] && [ -n "$MONGO_PASSWORD" ]; then
    MONGO_AUTH_ARGS="-u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin"
fi

# Function to list available backups
list_backups() {
    echo -e "${BLUE}Available MongoDB backups:${NC}"
    echo ""
    ls -1 "$BACKUP_DIR"/mongodb_*.archive 2>/dev/null | nl -ba || echo "  No backups found in $BACKUP_DIR"
    echo ""
}

# Get backup file
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
    list_backups
    read -rp "Enter backup file name or number: " BACKUP_INPUT

    if [[ "$BACKUP_INPUT" =~ ^[0-9]+$ ]]; then
        BACKUP_FILE=$(ls -1 "$BACKUP_DIR"/mongodb_*.archive 2>/dev/null | sed -n "${BACKUP_INPUT}p")
    else
        # Accept bare filename (no path) or full path
        if [ -f "$BACKUP_INPUT" ]; then
            BACKUP_FILE="$BACKUP_INPUT"
        else
            BACKUP_FILE="$BACKUP_DIR/$BACKUP_INPUT"
        fi
    fi
fi

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}✗ Backup file not found: $BACKUP_FILE${NC}"
    list_backups
    exit 1
fi

echo -e "${BLUE}=== RehaAdvisor Database Restore ===${NC}"
echo -e "${BLUE}Backup file : $(basename "$BACKUP_FILE")${NC}"
echo -e "${BLUE}Backup size : $(du -h "$BACKUP_FILE" | cut -f1)${NC}"
echo -e "${BLUE}Timestamp   : $(date)${NC}"
echo ""

# Confirm restore
echo -e "${YELLOW}⚠️  WARNING: This will OVERWRITE the current database!${NC}"
read -rp "Type 'yes' to confirm: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Restore cancelled${NC}"
    exit 0
fi

# Check if MongoDB container is running
if ! docker ps --format '{{.Names}}' | grep -q "^db-prod$"; then
    echo -e "${RED}✗ MongoDB container (db-prod) is not running${NC}"
    exit 1
fi

# Wait for MongoDB to be ready
echo ""
echo -e "${YELLOW}Waiting for MongoDB to be ready...${NC}"
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker exec db-prod mongosh --eval 'db.adminCommand("ping")' >/dev/null 2>&1; then
        echo -e "${GREEN}✓ MongoDB is ready${NC}"
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}✗ MongoDB failed to become ready after $((max_attempts * 2))s${NC}"
    exit 1
fi

# Restore — --drop removes each collection before restoring it (atomic, no manual dropDatabase needed)
echo ""
echo -e "${YELLOW}Restoring backup...${NC}"
# shellcheck disable=SC2086
docker exec -i db-prod mongorestore \
    --archive --gzip \
    --drop \
    $MONGO_AUTH_ARGS \
    < "$BACKUP_FILE"

# Verify restore
echo ""
echo -e "${YELLOW}Verifying restore...${NC}"
COLLECTION_COUNT=$(docker exec db-prod mongosh reha_advisor \
    --eval 'db.getCollectionNames().length' \
    --quiet 2>/dev/null | tail -1)

if [ "${COLLECTION_COUNT:-0}" -gt 0 ]; then
    echo -e "${GREEN}✓ Restore verified — $COLLECTION_COUNT collections found${NC}"

    echo ""
    echo -e "${BLUE}Document counts per collection:${NC}"
    docker exec db-prod mongosh reha_advisor --quiet << 'EOF'
db.getCollectionNames().forEach(function(name) {
    print("  " + name + ": " + db[name].countDocuments({}));
});
EOF

else
    echo -e "${RED}✗ Restore failed — no collections found${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Database restore complete${NC}"
