#!/bin/bash

# Restore script for RehaAdvisor MongoDB database
# Restores a backup created by backup.sh
# Usage: ./restore.sh [backup-file]

set -e

# Configuration
BACKUP_DIR="/opt/reha-advisor/backups"
COMPOSE_FILE="/opt/reha-advisor/docker-compose.prod.reha-advisor.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to list available backups
list_backups() {
    echo -e "${BLUE}Available backups:${NC}"
    echo ""
    ls -1 "$BACKUP_DIR"/mongodb_*.archive 2>/dev/null | nl || echo "No backups found"
    echo ""
}

# Get backup file
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
    list_backups
    read -p "Enter backup file name or number: " BACKUP_INPUT
    
    # Check if input is a number
    if [[ "$BACKUP_INPUT" =~ ^[0-9]+$ ]]; then
        BACKUP_FILE=$(ls -1 "$BACKUP_DIR"/mongodb_*.archive 2>/dev/null | sed -n "${BACKUP_INPUT}p")
    else
        BACKUP_FILE="$BACKUP_DIR/$BACKUP_INPUT"
    fi
fi

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}✗ Backup file not found: $BACKUP_FILE${NC}"
    list_backups
    exit 1
fi

echo -e "${BLUE}=== RehaAdvisor Database Restore ===${NC}"
echo -e "${BLUE}Backup file: $(basename $BACKUP_FILE)${NC}"
echo -e "${BLUE}Backup size: $(du -h "$BACKUP_FILE" | cut -f1)${NC}"
echo -e "${BLUE}Timestamp: $(date)${NC}"
echo ""

# Confirm restore
echo -e "${YELLOW}⚠️  WARNING: This will overwrite the current database!${NC}"
read -p "Are you sure you want to restore from this backup? Type 'yes' to confirm: " CONFIRM

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
    if docker exec db-prod mongosh --eval 'db.adminCommand("ping")' > /dev/null 2>&1; then
        echo -e "${GREEN}✓ MongoDB is ready${NC}"
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}✗ MongoDB failed to become ready${NC}"
    exit 1
fi

# Drop existing database (confirmation already received above)
echo ""
echo -e "${YELLOW}Dropping current database...${NC}"
docker exec db-prod mongosh reha_advisor --eval 'db.dropDatabase()' > /dev/null 2>&1

# Restore backup
echo -e "${YELLOW}Restoring backup...${NC}"
docker exec -i db-prod mongorestore --archive --gzip < "$BACKUP_FILE"

# Verify restore
echo ""
echo -e "${YELLOW}Verifying restore...${NC}"
COLLECTION_COUNT=$(docker exec db-prod mongosh reha_advisor --eval 'db.getCollectionNames().length' 2>/dev/null | tail -1)

if [ "$COLLECTION_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Restore completed successfully${NC}"
    
    # Show collections
    echo ""
    echo -e "${BLUE}Collections in restored database:${NC}"
    docker exec db-prod mongosh reha_advisor --eval 'db.getCollectionNames()' 2>/dev/null | tail -1
    
    # Show document counts
    echo ""
    echo -e "${BLUE}Document counts:${NC}"
    docker exec db-prod mongosh reha_advisor << 'EOF'
db.getCollectionNames().forEach(function(name) {
    var count = db[name].countDocuments({});
    print(name + ': ' + count);
});
EOF
    
else
    echo -e "${RED}✗ Restore failed - no collections found${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Database restore process completed${NC}"
