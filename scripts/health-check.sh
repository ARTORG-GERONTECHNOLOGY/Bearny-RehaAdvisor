#!/bin/bash

# Health check script for RehaAdvisor production environment
# Monitors all critical services and reports status
# Usage: ./health-check.sh [--detailed] [--slack-webhook url]

set -e

# Configuration
COMPOSE_FILE="/opt/reha-advisor/docker-compose.prod.reha-advisor.yml"
DOMAIN="reha-advisor.ch"
HEALTH_CHECK_LOG="/opt/reha-advisor/logs/health-check.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
SERVICES_OK=0
SERVICES_FAILED=0
SERVICES_WARNING=0

# Parse arguments
DETAILED=false
SLACK_WEBHOOK=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --detailed)
            DETAILED=true
            shift
            ;;
        --slack-webhook)
            SLACK_WEBHOOK="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Initialize log
mkdir -p "$(dirname "$HEALTH_CHECK_LOG")"
echo "=== Health Check $(date -Iseconds) ===" >> "$HEALTH_CHECK_LOG"

# Function to send Slack notification
send_slack_notification() {
    local status=$1
    local message=$2
    
    if [ -z "$SLACK_WEBHOOK" ]; then
        return
    fi
    
    local color="danger"
    [ "$status" = "OK" ] && color="good"
    [ "$status" = "WARNING" ] && color="warning"
    
    local payload=$(cat <<EOF
{
    "attachments": [
        {
            "color": "$color",
            "title": "RehaAdvisor Health Check - $status",
            "text": "$message",
            "ts": $(date +%s)
        }
    ]
}
EOF
)
    
    curl -X POST -H 'Content-type: application/json' \
        --data "$payload" \
        "$SLACK_WEBHOOK" 2>/dev/null || true
}

# Function to check service health
check_service_health() {
    local service=$1
    local container=$2
    local health_cmd=$3
    
    local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
    
    case $status in
        running)
            # Check if container has health status
            local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
            
            if [ "$health_status" = "healthy" ] || [ "$health_status" = "none" ]; then
                echo -e "${GREEN}✓${NC} $service: Running"
                ((SERVICES_OK++))
                return 0
            elif [ "$health_status" = "unhealthy" ]; then
                echo -e "${RED}✗${NC} $service: Unhealthy"
                ((SERVICES_FAILED++))
                return 1
            else
                echo -e "${YELLOW}⚠${NC} $service: Starting"
                ((SERVICES_WARNING++))
                return 2
            fi
            ;;
        exited)
            echo -e "${RED}✗${NC} $service: Stopped"
            ((SERVICES_FAILED++))
            return 1
            ;;
        *)
            echo -e "${RED}✗${NC} $service: Not found"
            ((SERVICES_FAILED++))
            return 1
            ;;
    esac
}

echo -e "${BLUE}=== RehaAdvisor Health Check ===${NC}"
echo -e "${BLUE}Domain: $DOMAIN${NC}"
echo -e "${BLUE}Timestamp: $(date)${NC}"
echo ""

# Check Docker daemon
echo -e "${YELLOW}Docker Status:${NC}"
if docker ps > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Docker daemon is running"
else
    echo -e "${RED}✗${NC} Docker daemon is not responding"
    exit 1
fi
echo ""

# Check container status
echo -e "${YELLOW}Container Status:${NC}"
check_service_health "LibreTranslate" "libretranslate-prod"
check_service_health "MongoDB" "db-prod"
check_service_health "Redis" "redis-prod"
check_service_health "Django Backend" "django-prod"
check_service_health "Celery Worker" "celery-prod"
check_service_health "Celery Beat" "celery-beat-prod"
check_service_health "React Frontend" "react-prod"
check_service_health "NGINX" "nginx-prod"
echo ""

# Check HTTP endpoints
echo -e "${YELLOW}HTTP/HTTPS Endpoints:${NC}"

# Test HTTPS with certificate validation
if curl -sf https://$DOMAIN/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} HTTPS Health: OK"
    ((SERVICES_OK++))
else
    echo -e "${RED}✗${NC} HTTPS Health: Failed"
    ((SERVICES_FAILED++))
fi

# Test API endpoint
if curl -sf https://$DOMAIN/api/health/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} API Health: OK"
    ((SERVICES_OK++))
else
    echo -e "${YELLOW}⚠${NC} API Health: Checking..."
    ((SERVICES_WARNING++))
fi

# Test frontend
if curl -sf https://$DOMAIN/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Frontend: OK"
    ((SERVICES_OK++))
else
    echo -e "${RED}✗${NC} Frontend: Failed"
    ((SERVICES_FAILED++))
fi
echo ""

# Detailed checks
if [ "$DETAILED" = true ]; then
    echo -e "${YELLOW}Detailed Resource Usage:${NC}"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
    echo ""
    
    echo -e "${YELLOW}Disk Usage:${NC}"
    df -h /opt/reha-advisor | head -1
    df -h /opt/reha-advisor | tail -1
    echo ""
    
    echo -e "${YELLOW}Recent Errors:${NC}"
    docker logs --tail 10 django-prod 2>/dev/null | grep -i error || echo "No recent errors"
    echo ""
fi

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "Services OK: ${GREEN}$SERVICES_OK${NC}"
[ $SERVICES_WARNING -gt 0 ] && echo -e "Services Warning: ${YELLOW}$SERVICES_WARNING${NC}"
[ $SERVICES_FAILED -gt 0 ] && echo -e "Services Failed: ${RED}$SERVICES_FAILED${NC}"
echo ""

# Determine overall status
if [ $SERVICES_FAILED -gt 0 ]; then
    echo -e "${RED}Status: CRITICAL${NC}"
    echo "Services OK: $SERVICES_OK, Failed: $SERVICES_FAILED, Warning: $SERVICES_WARNING" >> "$HEALTH_CHECK_LOG"
    send_slack_notification "CRITICAL" "Some services are down: OK=$SERVICES_OK, Failed=$SERVICES_FAILED, Warning=$SERVICES_WARNING"
    exit 1
elif [ $SERVICES_WARNING -gt 0 ]; then
    echo -e "${YELLOW}Status: WARNING${NC}"
    echo "Services OK: $SERVICES_OK, Failed: $SERVICES_FAILED, Warning: $SERVICES_WARNING" >> "$HEALTH_CHECK_LOG"
    send_slack_notification "WARNING" "Some services have warnings: OK=$SERVICES_OK, Failed=$SERVICES_FAILED, Warning=$SERVICES_WARNING"
    exit 0
else
    echo -e "${GREEN}Status: HEALTHY${NC}"
    echo "Services OK: $SERVICES_OK" >> "$HEALTH_CHECK_LOG"
    exit 0
fi
