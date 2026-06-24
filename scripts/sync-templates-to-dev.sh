#!/bin/bash
# Sync reference/template collections from local-prod MongoDB into dev MongoDB.
#
# Collections copied (non-patient, shared reference data):
#   Interventions, InterventionTemplates, FeedbackQuestions, HealthQuestionnaires
#
# Usage:  ./scripts/sync-templates-to-dev.sh
#
# Requires both the dev stack (container: db) and local-prod stack
# (container: db-localprod) to be running.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# ---- Colours ---------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---- Read credentials from env files (same pattern as backup.sh) -----------
_get_env() { grep -E "^${1}=" "$2" | head -1 | cut -d= -f2 | tr -d '"'"'" | xargs; }

SRC_ENV="$REPO_DIR/.env.local-prod"
DST_ENV="$REPO_DIR/.env.dev"

for f in "$SRC_ENV" "$DST_ENV"; do
    if [ ! -f "$f" ]; then
        echo -e "${RED}✗ Missing env file: $f${NC}" >&2
        exit 1
    fi
done

SRC_USER=$(_get_env MONGO_INITDB_ROOT_USERNAME "$SRC_ENV")
SRC_PASS=$(_get_env MONGO_INITDB_ROOT_PASSWORD "$SRC_ENV")
SRC_DB=$(_get_env DB_NAME "$SRC_ENV")

DST_USER=$(_get_env MONGO_INITDB_ROOT_USERNAME "$DST_ENV")
DST_PASS=$(_get_env MONGO_INITDB_ROOT_PASSWORD "$DST_ENV")
DST_DB=$(_get_env DB_NAME "$DST_ENV")

# ---- Check containers are running ------------------------------------------
for container in db-localprod db; do
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${RED}✗ Container '$container' is not running.${NC}" >&2
        echo    "  Start it with:  docker compose -f docker-compose.$([ "$container" = db ] && echo dev || echo local-prod).yml up -d" >&2
        exit 1
    fi
done

# ---- Confirmation prompt ----------------------------------------------------
echo -e "${BLUE}=== Sync templates: local-prod → dev ===${NC}"
echo    "  Source DB : $SRC_DB  (container: db-localprod)"
echo    "  Target DB : $DST_DB  (container: db)"
echo
echo -e "${YELLOW}This will OVERWRITE the following collections in dev:${NC}"
echo    "  Interventions, InterventionTemplates, FeedbackQuestions, HealthQuestionnaires"
echo
read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi
echo

# ---- Sync each collection ---------------------------------------------------
COLLECTIONS=(Interventions InterventionTemplates FeedbackQuestions HealthQuestionnaires)

for coll in "${COLLECTIONS[@]}"; do
    echo -e "${YELLOW}Syncing ${coll}...${NC}"
    # shellcheck disable=SC2094
    docker exec db-localprod mongodump \
        --archive \
        --ssl --tlsInsecure \
        -u "$SRC_USER" -p "$SRC_PASS" \
        --authenticationDatabase admin \
        --db "$SRC_DB" \
        --collection "$coll" |
    docker exec -i db mongorestore \
        --archive \
        --ssl --tlsInsecure \
        -u "$DST_USER" -p "$DST_PASS" \
        --authenticationDatabase admin \
        --nsFrom "${SRC_DB}.${coll}" \
        --nsTo "${DST_DB}.${coll}" \
        --drop \
        --quiet
    echo -e "${GREEN}  ✓ ${coll}${NC}"
done

echo
echo -e "${GREEN}Done. All collections synced to dev.${NC}"
