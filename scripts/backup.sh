#!/bin/bash

# Backup script for RehaAdvisor MongoDB database
# Creates compressed backups and optionally uploads to cloud storage
# Usage: ./backup.sh [--upload-s3] [--s3-bucket bucket-name]

set -e

# Configuration
BACKUP_DIR="/opt/reha-advisor/backups"
RETENTION_DAYS=30
COMPOSE_FILE="/opt/reha-advisor/docker-compose.prod.reha-advisor.yml"

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

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mongodb_$TIMESTAMP.archive"
BACKUP_LOG="$BACKUP_DIR/backup_$TIMESTAMP.log"

echo -e "${BLUE}=== RehaAdvisor Database Backup ===${NC}"
echo -e "${BLUE}Timestamp: $(date)${NC}"
echo -e "${BLUE}Backup File: $BACKUP_FILE${NC}"
echo ""

# Check if MongoDB container is running
if ! docker ps --format '{{.Names}}' | grep -q "^db-prod$"; then
    echo -e "${RED}✗ MongoDB container (db-prod) is not running${NC}"
    exit 1
fi

# Create backup
echo -e "${YELLOW}Starting MongoDB backup...${NC}"
{
    docker exec db-prod mongodump \
        --archive="$BACKUP_FILE" \
        --gzip \
        --out="/backups/$TIMESTAMP" \
        2>&1 || true
} | tee -a "$BACKUP_LOG"

# Check if backup was successful
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Backup created successfully${NC}"
    echo -e "${GREEN}  Size: $BACKUP_SIZE${NC}"
    
    # Create backup metadata
    cat > "$BACKUP_DIR/backup_$TIMESTAMP.meta" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "size_bytes": $(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE"),
  "size_human": "$BACKUP_SIZE",
  "database": "reha_advisor",
  "backup_type": "full",
  "compress": "gzip",
  "retention_days": $RETENTION_DAYS
}
EOF
    
else
    echo -e "${RED}✗ Backup failed${NC}"
    exit 1
fi

# Upload to S3 if requested
if [ "$UPLOAD_S3" = true ]; then
    if [ -z "$S3_BUCKET" ]; then
        echo -e "${RED}✗ S3 bucket not specified. Use --s3-bucket bucket-name${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${YELLOW}Uploading backup to S3...${NC}"
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}✗ AWS CLI is not installed${NC}"
        echo "Install with: pip install awscli or brew install awscli"
        exit 1
    fi
    
    # Upload backup and metadata
    if aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/reha-advisor/backups/$(basename $BACKUP_FILE)" 2>&1 | tee -a "$BACKUP_LOG"; then
        echo -e "${GREEN}✓ Backup uploaded to S3: s3://$S3_BUCKET/reha-advisor/backups/${BACKUP_FILE##*/}${NC}"
        
        # Upload metadata
        aws s3 cp "$BACKUP_DIR/backup_$TIMESTAMP.meta" "s3://$S3_BUCKET/reha-advisor/backups/backup_$TIMESTAMP.meta"
        echo -e "${GREEN}✓ Backup metadata uploaded${NC}"
    else
        echo -e "${RED}✗ Upload to S3 failed${NC}"
        exit 1
    fi
fi

# Clean up old backups
echo ""
echo -e "${YELLOW}Cleaning up old backups (older than $RETENTION_DAYS days)...${NC}"

find "$BACKUP_DIR" -name "mongodb_*.archive" -type f -mtime +$RETENTION_DAYS -exec rm -f {} \; 2>/dev/null
find "$BACKUP_DIR" -name "backup_*.meta" -type f -mtime +$RETENTION_DAYS -exec rm -f {} \; 2>/dev/null
find "$BACKUP_DIR" -name "backup_*.log" -type f -mtime +$RETENTION_DAYS -exec rm -f {} \; 2>/dev/null

DELETED_COUNT=$(find "$BACKUP_DIR" -name "mongodb_*.archive" -type f -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
if [ $DELETED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓ Deleted $DELETED_COUNT old backup(s)${NC}"
else
    echo -e "${GREEN}✓ No old backups to delete${NC}"
fi

# Display backup summary
echo ""
echo -e "${BLUE}=== Backup Summary ===${NC}"
echo -e "Backup location: ${GREEN}$BACKUP_FILE${NC}"
echo -e "Backup size: ${GREEN}$BACKUP_SIZE${NC}"
echo -e "Retention: ${GREEN}$RETENTION_DAYS days${NC}"
echo -e "Log file: ${GREEN}$BACKUP_LOG${NC}"

# List recent backups
echo ""
echo -e "${BLUE}=== Recent Backups ===${NC}"
ls -lh "$BACKUP_DIR"/mongodb_*.archive 2>/dev/null | awk '{printf "%-30s %8s\n", $9, $5}' | tail -5

echo ""
echo -e "${GREEN}✓ Backup process completed${NC}"
