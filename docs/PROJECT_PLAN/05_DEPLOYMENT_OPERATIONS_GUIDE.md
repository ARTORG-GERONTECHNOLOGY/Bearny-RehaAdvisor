# RehaAdvisor - Deployment & Operations Guide

## Overview

This document provides comprehensive instructions for deploying, configuring, and operating the RehaAdvisor platform in various environments (development, staging, production).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Staging Deployment](#staging-deployment)
4. [Production Deployment](#production-deployment)
5. [Configuration Management](#configuration-management)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Backup & Recovery](#backup--recovery)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

#### Minimum Requirements
- **CPU**: 2 cores (4+ cores recommended)
- **RAM**: 4GB (8GB+ recommended)
- **Storage**: 20GB (100GB+ for production with data)
- **OS**: Linux (Ubuntu 20.04+ recommended)

#### Required Software
- Docker 20.10+
- Docker Compose 2.0+
- Git 2.25+
- Python 3.10+ (for local testing)
- Node.js 16+ (for frontend local development)

### Required Accounts & Services

- **AWS Account**: For S3 storage and optional RDS
- **Fitbit Developer Account**: For health data integration
- **Email Provider**: AWS SES or SendGrid
- **Domain Name**: For production deployment
- **SSL Certificate**: Let's Encrypt or commercial CA

### Network Configuration

- **Ports Required**:
  - 80 (HTTP, redirect to HTTPS)
  - 443 (HTTPS)
  - 5432 (PostgreSQL, internal only)
  - 6379 (Redis, internal only)
  - 27017 (MongoDB, internal only)

---

## Development Setup

### Quick Start (Docker Compose)

```bash
# Clone repository
git clone https://github.com/your-org/telerehabapp.git
cd telerehabapp

# Create environment file
cp .env.example .env.dev

# Edit environment variables
nano .env.dev
# Set: DEBUG=True, DB_HOST=mongo, REDIS_URL=redis://redis:6379

# Build Docker images
make build

# Start services
make dev_up

# Initialize database (in new terminal)
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate

# Create superuser (optional, for admin access)
docker-compose -f docker-compose.dev.yml exec backend python manage.py createsuperuser

# Access application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# Admin Panel: http://localhost:8000/admin/
```

### Manual Setup (Without Docker)

#### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env.local

# Configure environment variables
# Edit .env.local with local settings

# Install MongoDB locally
sudo apt-get install -y mongodb

# Start MongoDB
sudo service mongod start

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start Django development server
python manage.py runserver 0.0.0.0:8000
```

#### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Configure API URL
echo "VITE_API_URL=http://localhost:8000" >> .env.local

# Start development server
npm run dev

# Application available at http://localhost:5173
```

#### 3. Redis Setup

```bash
# Install Redis
sudo apt-get install -y redis-server

# Start Redis
sudo service redis-server start

# Verify connection
redis-cli ping
# Should respond: PONG
```

### Development Workflow

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
python manage.py runserver

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Celery Worker (for async tasks)
cd backend
source venv/bin/activate
celery -A config worker -l info

# Terminal 4: Celery Beat (for scheduled tasks)
cd backend
source venv/bin/activate
celery -A config beat -l info
```

---

## Staging Deployment

### Infrastructure Setup

#### 1. Server Provisioning

```bash
# On cloud provider (AWS, Azure, DigitalOcean, etc.)

# Recommended Instance:
# - Ubuntu 20.04 or 22.04 LTS
# - 4 CPU cores
# - 8GB RAM
# - 50GB SSD storage
# - Static IP address
# - Security group allowing ports 22, 80, 443

# SSH into server
ssh -i your-key.pem ubuntu@staging.rehaadvisor.com

# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker and Docker Compose
sudo apt-get install -y docker.io docker-compose git

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker-compose --version
```

#### 2. Clone Repository

```bash
# Clone repository
git clone https://github.com/your-org/telerehabapp.git
cd telerehabapp

# Checkout main/staging branch
git checkout staging
```

#### 3. Configure Environment

```bash
# Create environment file for staging
cp .env.example .env.staging

# Edit with staging values
cat > .env.staging << EOF
# Django Settings
DEBUG=False
ALLOWED_HOSTS=staging.rehaadvisor.com,www.staging.rehaadvisor.com
SECRET_KEY=your-very-secure-random-key-here

# Database
MONGO_URL=mongodb://mongo:27017/rehaadvisor_staging
MONGODB_USER=staging_user
MONGODB_PASSWORD=your-secure-password

# Redis
REDIS_URL=redis://redis:6379/0

# AWS
AWS_ACCESS_KEY_ID=your-staging-access-key
AWS_SECRET_ACCESS_KEY=your-staging-secret-key
AWS_STORAGE_BUCKET_NAME=rehaadvisor-staging

# Email
EMAIL_BACKEND=sendgrid
SENDGRID_API_KEY=your-sendgrid-key

# Fitbit
FITBIT_CLIENT_ID=your-staging-client-id
FITBIT_CLIENT_SECRET=your-staging-client-secret

# Frontend
VITE_API_URL=https://api.staging.rehaadvisor.com
VITE_ENV=staging

# Security
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
SESSION_COOKIE_HTTPONLY=True
CSRF_COOKIE_SECURE=True
EOF
```

#### 4. Deploy with Docker Compose

```bash
# Copy staging docker-compose file
cp docker-compose.yml docker-compose.staging.yml

# Build images
docker-compose -f docker-compose.staging.yml build

# Start services
docker-compose -f docker-compose.staging.yml up -d

# Check service status
docker-compose -f docker-compose.staging.yml ps

# Initialize database
docker-compose -f docker-compose.staging.yml exec backend python manage.py migrate

# Create superuser
docker-compose -f docker-compose.staging.yml exec backend python manage.py createsuperuser

# Collect static files
docker-compose -f docker-compose.staging.yml exec backend python manage.py collectstatic --noinput
```

#### 5. Configure NGINX

```bash
# Create NGINX configuration
sudo tee /etc/nginx/sites-available/rehaadvisor-staging << EOF
server {
    listen 80;
    server_name staging.rehaadvisor.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.rehaadvisor.com;

    # SSL Certificate (via Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/staging.rehaadvisor.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.rehaadvisor.com/privkey.pem;
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Compression
    gzip on;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss application/json;

    # Proxy to Django API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Serve frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /static/ {
        alias /var/www/rehaadvisor/static/;
        expires 1y;
    }

    # Media files
    location /media/ {
        alias /var/www/rehaadvisor/media/;
        expires 1d;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/rehaadvisor-staging /etc/nginx/sites-enabled/

# Test NGINX configuration
sudo nginx -t

# Reload NGINX
sudo systemctl reload nginx
```

#### 6. Setup SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot certonly --standalone \
  -d staging.rehaadvisor.com \
  -d www.staging.rehaadvisor.com \
  --email admin@rehaadvisor.com \
  --agree-tos \
  --non-interactive

# Setup auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Test renewal
sudo certbot renew --dry-run
```

---

## Production Deployment

### Production Architecture

```
┌─────────────────────────────────────────────────────────┐
│           CloudFlare / CDN (Optional)                  │
│              DNS & DDoS Protection                     │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              Load Balancer (NGINX)                      │
│         (SSL Termination, Traffic Distribution)        │
└──┬──────────────────────────────────────┬───────────────┘
   │                                      │
┌──▼─────────────────────┐     ┌──────────▼──────────────┐
│ Application Server 1   │     │ Application Server 2    │
│ (Docker Containers)    │     │ (Docker Containers)     │
│ - Django API (Gunicorn)│     │ - Django API (Gunicorn) │
│ - React Frontend       │     │ - React Frontend        │
│ - Celery Worker        │     │ - Celery Worker         │
└──┬─────────────────────┘     └──────────┬──────────────┘
   │                                      │
   └──────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼────┐   ┌────▼────┐   ┌───▼──────┐
│ MongoDB │   │  Redis  │   │  AWS S3  │
│ (Prod)  │   │ (Cluster)│  │ (Media)  │
└─────────┘   └─────────┘   └──────────┘
```

### High-Availability Production Setup

#### 1. Multi-Server Deployment

```bash
# On each production server (3+ servers recommended)

# Initialize server (same as staging)
sudo apt-get update
sudo apt-get install -y docker.io docker-compose git
sudo usermod -aG docker ubuntu

# Clone repository with production branch
git clone https://github.com/your-org/telerehabapp.git
cd telerehabapp
git checkout main

# Create production environment file
cp .env.example .env.prod

# Edit with production values
# (More secure credentials, production domains, etc.)
nano .env.prod
```

#### 2. Managed Database Setup

```bash
# MongoDB Atlas (Recommended for production)
# 1. Create MongoDB Atlas cluster
# 2. Configure whitelist IPs (application servers)
# 3. Get connection string: 
#    mongodb+srv://user:password@cluster.mongodb.net/rehaadvisor?retryWrites=true&w=majority

# Update .env.prod
echo "MONGO_URL=mongodb+srv://user:password@cluster.mongodb.net/rehaadvisor" >> .env.prod

# AWS ElastiCache for Redis
# 1. Create Redis cluster
# 2. Configure security group
# 3. Get endpoint: rehaadvisor-redis.abc123.ng.0001.use1.cache.amazonaws.com:6379

# Update .env.prod
echo "REDIS_URL=redis://rehaadvisor-redis.abc123.ng.0001.use1.cache.amazonaws.com:6379" >> .env.prod
```

#### 3. Load Balancer Configuration

```bash
# On primary application server (acts as load balancer)

# Install HAProxy or use cloud provider's load balancer
sudo apt-get install -y haproxy

# Configure HAProxy
sudo tee /etc/haproxy/haproxy.cfg << 'EOF'
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    daemon

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000
    timeout client  50000
    timeout server  50000

frontend rehaadvisor_front
    bind *:80
    redirect scheme https code 301 if !{ ssl_fc }
    stats enable
    stats uri /haproxy?stats
    default_backend rehaadvisor_back

frontend rehaadvisor_https
    bind *:443 ssl crt /etc/ssl/certs/rehaadvisor.pem
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    default_backend rehaadvisor_back

backend rehaadvisor_back
    balance roundrobin
    option httpchk GET /api/health/
    
    # Application servers
    server app1 10.0.1.10:8000 check
    server app2 10.0.1.11:8000 check
    server app3 10.0.1.12:8000 check
    
    # Session persistence
    cookie JSESSIONID prefix
    option httpclose
EOF

# Start HAProxy
sudo systemctl restart haproxy
```

#### 4. Deploy Production Containers

```bash
# On each application server
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Initialize database (on primary server only, once)
docker-compose -f docker-compose.prod.yml exec backend python manage.py migrate

# Create superuser
docker-compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser

# Collect static files
docker-compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --noinput
```

#### 5. Configure CloudFlare (Optional, Recommended)

```
1. Update DNS records to point to load balancer IP
2. In CloudFlare:
   - Enable SSL/TLS (Full Strict)
   - Enable Page Rules:
     * Cache level: Cache everything
     * Browser cache TTL: 1 month
   - Enable DDoS protection
   - Enable WAF
   - Enable rate limiting
```

---

## Configuration Management

### Environment Variables by Environment

#### Development (.env.dev)
```bash
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
SECRET_KEY=dev-key-not-secure
LOG_LEVEL=DEBUG
CELERY_ALWAYS_EAGER=True  # Execute tasks immediately
```

#### Staging (.env.staging)
```bash
DEBUG=False
ALLOWED_HOSTS=staging.rehaadvisor.com
SECRET_KEY=staging-key-somewhat-secure
LOG_LEVEL=INFO
CELERY_ALWAYS_EAGER=False
```

#### Production (.env.prod)
```bash
DEBUG=False
ALLOWED_HOSTS=rehaadvisor.com,www.rehaadvisor.com
SECRET_KEY=production-key-very-secure-random-string
LOG_LEVEL=WARNING
CELERY_ALWAYS_EAGER=False
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=True
SECURE_HSTS_PRELOAD=True
```

### Secrets Management

#### Option 1: AWS Secrets Manager (Recommended)

```bash
# Store secrets in AWS Secrets Manager
aws secretsmanager create-secret --name rehaadvisor/prod --secret-string '{
  "MONGO_URL": "mongodb+srv://...",
  "REDIS_URL": "redis://...",
  "AWS_ACCESS_KEY_ID": "...",
  "AWS_SECRET_ACCESS_KEY": "...",
  "SECRET_KEY": "..."
}'

# Retrieve in application
aws secretsmanager get-secret-value --secret-id rehaadvisor/prod
```

#### Option 2: Docker Secrets

```bash
# Create secrets
echo "mongodb+srv://user:pass@host/db" | docker secret create mongo_url -
echo "very-secure-key" | docker secret create django_secret_key -

# Reference in docker-compose.yml
services:
  backend:
    secrets:
      - mongo_url
      - django_secret_key
```

#### Option 3: .env File (Least Secure)

```bash
# Never commit .env files to version control
echo ".env*" >> .gitignore

# Use secure file transfer or configuration management
scp .env.prod user@prod-server:/app/.env
```

---

## Monitoring & Maintenance

### Application Monitoring

#### Health Checks

```bash
# Add health check endpoint to Django
# urls.py
urlpatterns = [
    path('api/health/', HealthCheckView.as_view()),
]

# Check endpoint
curl https://rehaadvisor.com/api/health/
# Expected response: {"status": "healthy", "timestamp": "2025-12-01T10:00:00Z"}
```

#### Logging Setup

```bash
# Configure ELK Stack (Elasticsearch, Logstash, Kibana)
docker run -d -p 9200:9200 docker.elastic.co/elasticsearch/elasticsearch:8.0.0
docker run -d -p 5601:5601 docker.elastic.co/kibana/kibana:8.0.0

# Configure application logging to Elasticsearch
# settings.py
LOGGING = {
    'version': 1,
    'handlers': {
        'elasticsearch': {
            'level': 'DEBUG',
            'class': 'pythonjsonlogger.jsonlogger.JsonFormatter',
        },
    },
}
```

#### Performance Monitoring

```bash
# Use Datadog, New Relic, or similar
# Add monitoring agent to container
RUN pip install datadog

# Configure in application
from datadog import initialize, api
initialize(api_key=os.getenv('DATADOG_API_KEY'))
```

### Database Maintenance

#### MongoDB Backup

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

# Local backup
mongodump --uri="$MONGO_URL" --out="$BACKUP_DIR/backup_$DATE"

# Upload to S3
aws s3 sync "$BACKUP_DIR/backup_$DATE" s3://rehaadvisor-backups/mongodb/

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -type d -mtime +30 -exec rm -rf {} \;
```

#### Schedule with Cron

```bash
# Add to crontab
0 2 * * * /scripts/backup-mongodb.sh  # Daily at 2 AM
0 * * * * /scripts/backup-redis.sh    # Hourly
```

### Log Rotation

```bash
# Configure logrotate
sudo tee /etc/logrotate.d/rehaadvisor << EOF
/var/log/rehaadvisor/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 docker docker
    sharedscripts
    postrotate
        docker exec rehaadvisor_backend kill -HUP 1
    endscript
}
EOF
```

### Automatic Updates

```bash
# Setup automatic security updates
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Configure
sudo tee /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
EOF
```

---

## Backup & Recovery

### Backup Strategy

```
Daily Backups:
- Database (full backup)
- Configuration files
- User uploads

Weekly Backups:
- Complete application snapshot

Monthly Backups:
- Archive for compliance (keep 7 years for healthcare)
```

### Automated Backup Script

```bash
#!/bin/bash
# backup-all.sh

BACKUP_ROOT="/backup"
DATE=$(date +%Y%m%d_%H%M%S)
S3_BUCKET="rehaadvisor-backups"

# Create backup directory
mkdir -p "$BACKUP_ROOT/daily/$DATE"

# Backup MongoDB
echo "Backing up MongoDB..."
mongodump --uri="$MONGO_URL" --out="$BACKUP_ROOT/daily/$DATE/mongodb"

# Backup Redis
echo "Backing up Redis..."
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb "$BACKUP_ROOT/daily/$DATE/redis_dump.rdb"

# Backup configuration
echo "Backing up configuration..."
cp .env.prod "$BACKUP_ROOT/daily/$DATE/.env.prod"
cp docker-compose.prod.yml "$BACKUP_ROOT/daily/$DATE/"

# Compress backup
echo "Compressing backup..."
tar -czf "$BACKUP_ROOT/daily/backup_$DATE.tar.gz" "$BACKUP_ROOT/daily/$DATE"

# Upload to S3
echo "Uploading to S3..."
aws s3 cp "$BACKUP_ROOT/daily/backup_$DATE.tar.gz" "s3://$S3_BUCKET/daily/" --storage-class GLACIER

# Cleanup local backups (keep 7 days)
find "$BACKUP_ROOT/daily" -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Recovery Procedure

```bash
# 1. List available backups
aws s3 ls s3://rehaadvisor-backups/daily/

# 2. Download backup
aws s3 cp s3://rehaadvisor-backups/daily/backup_20251201_020000.tar.gz /restore/

# 3. Extract backup
tar -xzf /restore/backup_20251201_020000.tar.gz

# 4. Stop services
docker-compose -f docker-compose.prod.yml stop

# 5. Restore database
mongorestore --uri="$MONGO_URL" /restore/mongodb/

# 6. Restore configuration (if needed)
cp /restore/.env.prod .env.prod

# 7. Start services
docker-compose -f docker-compose.prod.yml up -d

# 8. Verify restoration
docker-compose -f docker-compose.prod.yml exec backend python manage.py health_check
```

---

## Troubleshooting

### Common Issues & Solutions

#### Issue: Services Won't Start

```bash
# Check Docker status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Check specific service
docker-compose -f docker-compose.prod.yml logs backend

# Rebuild images
docker-compose -f docker-compose.prod.yml build --no-cache

# Clear volumes and restart
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

#### Issue: Database Connection Failed

```bash
# Verify connection string
echo $MONGO_URL

# Test MongoDB connection
docker-compose exec backend mongosh "$MONGO_URL"

# Check network connectivity
docker-compose exec backend curl -v mongodb://mongo:27017

# Verify credentials
docker-compose exec backend env | grep MONGO
```

#### Issue: High Memory Usage

```bash
# Check container stats
docker stats

# Find memory-heavy containers
docker-compose -f docker-compose.prod.yml exec backend ps aux

# Check Python processes
docker-compose -f docker-compose.prod.yml exec backend python -m memory_profiler

# Restart service
docker-compose -f docker-compose.prod.yml restart backend

# Increase memory limit
# Edit docker-compose.yml
# services:
#   backend:
#     mem_limit: 2g  # Increase from 1g to 2g
```

#### Issue: API Response Timeout

```bash
# Check API response time
curl -w "@curl-format.txt" -o /dev/null -s https://rehaadvisor.com/api/health/

# View NGINX access logs
docker-compose -f docker-compose.prod.yml logs nginx | grep "upstream timed out"

# Increase timeouts in NGINX
# proxy_connect_timeout 120s;
# proxy_send_timeout 120s;
# proxy_read_timeout 120s;

# Scale up backend workers
# Edit docker-compose.yml - increase Gunicorn workers
# command: gunicorn config.wsgi:application --workers 8 --threads 4
```

#### Issue: SSL Certificate Expired

```bash
# Check certificate expiration
openssl s_client -connect rehaadvisor.com:443 -showcerts

# Renew Let's Encrypt certificate
sudo certbot renew --force-renewal

# Verify renewal
sudo certbot certificates

# Reload NGINX
sudo systemctl reload nginx
```

### Emergency Procedures

#### Partial Service Outage

```bash
# 1. Identify affected service
docker-compose ps

# 2. Check service logs for errors
docker-compose logs affected-service --tail 100

# 3. Attempt restart
docker-compose restart affected-service

# 4. If restart fails, rebuild
docker-compose up -d affected-service

# 5. Monitor recovery
docker-compose logs -f affected-service
```

#### Complete Service Failure

```bash
# 1. Stop all services
docker-compose -f docker-compose.prod.yml stop

# 2. Restore from backup (see Recovery Procedure above)

# 3. Start services
docker-compose -f docker-compose.prod.yml up -d

# 4. Verify functionality
# - Check API health endpoint
# - Test user login
# - Verify data integrity
```

#### Rollback to Previous Version

```bash
# 1. Check version history
git log --oneline -n 20

# 2. Checkout previous version
git checkout abc123def456

# 3. Rebuild images
docker-compose -f docker-compose.prod.yml build

# 4. Start with previous version
docker-compose -f docker-compose.prod.yml up -d

# 5. Restore database if necessary
# (See Recovery Procedure if data was affected)
```

---

## Update & Upgrade Procedure

### Zero-Downtime Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Build new images
docker-compose -f docker-compose.prod.yml build

# 3. Start new containers (parallel deployment)
docker-compose -f docker-compose.prod.yml up -d

# 4. Run migrations (Django will wait for lock)
docker-compose -f docker-compose.prod.yml exec backend python manage.py migrate

# 5. Collect static files
docker-compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --noinput

# 6. Signal gunicorn to reload
docker-compose -f docker-compose.prod.yml exec backend kill -HUP 1

# 7. Verify new version
curl https://rehaadvisor.com/api/version/
```

### Database Migration

```bash
# 1. Backup database
./scripts/backup-mongodb.sh

# 2. Create migration
python manage.py makemigrations

# 3. Test migration locally
python manage.py migrate --plan

# 4. Apply migration to staging
docker-compose -f docker-compose.staging.yml exec backend python manage.py migrate

# 5. Test thoroughly in staging

# 6. Apply migration to production
docker-compose -f docker-compose.prod.yml exec backend python manage.py migrate

# 7. Monitor for issues
docker-compose logs -f backend
```

---

*Last Updated: February 17, 2026*
*Version: 1.0*
