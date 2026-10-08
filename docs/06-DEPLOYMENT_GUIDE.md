# Deployment Guide

## Overview

This guide covers deploying RehaAdvisor to production environments. It includes instructions for deploying using Docker, configuring infrastructure, setting up SSL/TLS, and monitoring.

For the current release-driven production process (GitHub Release -> GHCR images -> production compose deploy), use:

- [PRODUCTION_DEPLOY_RUNBOOK.md](./PRODUCTION_DEPLOY_RUNBOOK.md)

The runbook is the canonical source for:

- Release tag and GHCR image tag mapping (`vX.Y.Z` -> `X.Y.Z`)
- Required server runtime values in `/home/ubuntu/repos/telerehabapp-prod/.env.prod`
- Deterministic rerun commands and post-deploy verification
- Production deploy troubleshooting decision tree

## Pre-Deployment Checklist

- [ ] All tests passing (frontend and backend)
- [ ] Environment variables configured
- [ ] `GHCR_IMAGE` on production server points to expected namespace (`ghcr.io/artorg-gerontechnology/bearny-rehaadvisor`)
- [ ] Release tag exists in git (`vX.Y.Z`) and matching GHCR tags exist (`X.Y.Z`)
- [ ] SSL/TLS certificates obtained
- [ ] Database backups configured
- [ ] Monitoring and logging set up
- [ ] Security review completed
- [ ] Load testing performed
- [ ] Rollback plan documented

## Deployment Options

### Option 1: Docker Compose (Single Server)

Best for small deployments and staging environments.

#### Prerequisites

- Docker and Docker Compose installed
- Domain name configured
- SSL certificate (Let's Encrypt or commercial)

#### Steps

> **For the full step-by-step production deploy, follow [PRODUCTION_DEPLOY_RUNBOOK.md](./PRODUCTION_DEPLOY_RUNBOOK.md).** The outline below is a summary; the runbook is authoritative.

1. **Prepare Server**

```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
```

2. **Clone Repository**

```bash
# Production stack lives in a separate clone
git clone https://github.com/ARTORG-GERONTECHNOLOGY/Bearny-RehaAdvisor.git \
  /home/ubuntu/repos/telerehabapp-prod
cd /home/ubuntu/repos/telerehabapp-prod
```

3. **Configure Environment**

```bash
# Production env file (see docs/07-ENVIRONMENT_CONFIG.md for required variables)
cp /dev/null .env.prod
chmod 600 .env.prod
# Edit .env.prod and fill in all required values
```

4. **Pull GHCR Images and Start**

Production images are pre-built by the GitHub Actions release workflow and pushed to GHCR. Do **not** build from source on the production server.

```bash
# Authenticate to GHCR (one-time)
docker login ghcr.io

# Pull and start
docker compose -f docker-compose.prod.reha-advisor.yml pull
docker compose -f docker-compose.prod.reha-advisor.yml up -d

# Verify services
docker compose -f docker-compose.prod.reha-advisor.yml ps
docker compose -f docker-compose.prod.reha-advisor.yml logs -f
```

5. **Post-Deployment**

```bash
# Seed admin user and periodic tasks
docker exec django-prod python manage.py seed_admin
docker exec django-prod python manage.py seed_periodic_tasks

# Verify API is reachable
curl https://reha-advisor.ch/api/
```

## Environment Configuration

### Production Environment Variables

```bash
# Django settings
DEBUG=False
SECRET_KEY=your-very-secret-key-here
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Database
MONGODB_URI=mongodb://user:password@mongo.example.com:27017/
MONGODB_DB_NAME=rehaadvisor_prod

# Email (for notifications)
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@example.com
EMAIL_HOST_PASSWORD=your-app-password

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Celery (rediss:// — TLS is required)
CELERY_BROKER_URL=rediss://:${REDIS_PASSWORD}@redis:6379/0
CELERY_RESULT_BACKEND=rediss://:${REDIS_PASSWORD}@redis:6379/0

# Sentry (error tracking)
SENTRY_DSN=https://your-sentry-dsn

# Other
TIME_ZONE=Europe/Zurich
LANGUAGE_CODE=de-ch
```

### Secrets Management

Using Docker Secrets (Swarm) or Kubernetes Secrets:

```bash
# Docker Swarm
echo "your-secret-value" | docker secret create my_secret -

# Kubernetes
kubectl create secret generic app-secrets \
  --from-literal=SECRET_KEY=value \
  --from-literal=DATABASE_PASSWORD=value
```

## Database Migration in Production

```bash
# Backup before migration
docker exec mongodb mongodump --archive=/backup/db.archive

# Run migrations
docker exec django python manage.py migrate

# Verify data
docker exec mongodb mongosh << EOF
use rehaadvisor
db.getCollectionNames()
db.users.count()
EOF
```

## Redis TLS Certificate Setup

Redis requires TLS in all environments. The Redis server certificate is signed by the same CA as the MongoDB certificate, so no extra CA infrastructure is needed.

Run these commands from the repo root **once per environment** (dev or prod). The private key is gitignored; the generated files live in `redis/tls/`.

```bash
mkdir -p redis/tls

# Sign the Redis server cert with the existing Mongo CA
openssl genrsa -out redis/tls/server.key 2048

openssl req -new \
  -key redis/tls/server.key \
  -out redis/tls/server.csr \
  -subj "/CN=redis"

openssl x509 -req \
  -in redis/tls/server.csr \
  -CA mongo/tls/ca.crt \
  -CAkey mongo/tls/ca.key \
  -CAcreateserial \
  -out redis/tls/server.crt \
  -days 3650

# Copy the CA cert so containers have a single path to trust
cp mongo/tls/ca.crt redis/tls/ca.crt
```

After generating the certs, restart the Redis container:

```bash
docker compose -f docker-compose.dev.yml restart redis   # dev
# or
docker compose -f docker-compose.prod.reha-advisor.yml restart redis-prod  # prod
```

Verify TLS is working:

```bash
docker exec redis redis-cli \
  --tls \
  --cacert /etc/ssl/redis/ca.crt \
  -a "${REDIS_PASSWORD}" \
  ping
# → PONG
```

The `redis/tls/` directory is gitignored. Copy or regenerate the certs on every fresh server clone.

---

## SSL/TLS Certificate Management

Certificates for `dev.reha-advisor.ch` and `reha-advisor.ch` are issued by Let's Encrypt and expire every 90 days. Renewal is handled automatically by a **Celery beat task** (`core.tasks.renew_certificates`) that runs daily at 03:00 UTC.

### How it works

The task runs inside the `celery` / `celery-prod` container and calls certbot via the Docker socket — no certbot installation is required in the backend image:

1. `docker run certbot/certbot renew --non-interactive --quiet` — attempts renewal for all configured domains; certbot skips certs that still have more than 30 days left.
2. `docker exec gateway nginx -s reload` — reloads the gateway nginx to serve the new certificate.
3. On failure the task retries up to 3 times with a 5-minute backoff, then raises so Celery logs a failure and Sentry captures it.

### Required environment variables

Add these to `.env.dev` and `.env.prod`:

| Variable | Dev value | Prod value |
|---|---|---|
| `CERTBOT_ENABLED` | `true` | `true` |
| `CERTBOT_CONF_PATH` | `/home/ubuntu/repos/telerehabapp/nginx/certbot/conf` | `/home/ubuntu/repos/telerehabapp/nginx/certbot/conf` |
| `CERTBOT_WWW_PATH` | `/home/ubuntu/repos/telerehabapp/nginx/certbot/www` | `/home/ubuntu/repos/telerehabapp/nginx/certbot/www` |
| `CERTBOT_NGINX_CONTAINER` | `gateway` | `gateway` |

Dev and prod use the same paths because there is one gateway, started from the `telerehabapp` checkout, and it serves both domains from that checkout's `nginx/certbot/` folder. Renewing into any other folder leaves the gateway with old or missing certificates.

> **Important:** `CERTBOT_CONF_PATH` and `CERTBOT_WWW_PATH` must be **host-absolute paths**, not container paths. When the Celery task calls `docker run -v <path>:...`, Docker resolves the paths on the host, not inside the Celery container.

### Required compose volumes

The celery services in both `docker-compose.dev.yml` and `docker-compose.prod.reha-advisor.yml` already declare:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock   # allows calling docker run / exec
  - ./nginx/certbot/conf:/etc/letsencrypt        # certbot reads/writes cert storage
  - ./nginx/certbot/www:/var/www/certbot         # certbot writes ACME challenges
```

### Triggering renewal manually

```bash
# Dev
docker exec celery python -m celery -A api.celery:app call core.tasks.renew_certificates

# Prod
docker exec celery-prod python -m celery -A api.celery:app call core.tasks.renew_certificates
```

### Verifying the certificate

```bash
openssl s_client -connect dev.reha-advisor.ch:443 -servername dev.reha-advisor.ch </dev/null 2>&1 \
  | grep -E "notAfter|Verify return code"
# Expected: Verify return code: 0 (ok)
```

### Emergency manual renewal (if Celery is down)

```bash
docker run --rm \
  -v /home/ubuntu/repos/telerehabapp/nginx/certbot/conf:/etc/letsencrypt \
  -v /home/ubuntu/repos/telerehabapp/nginx/certbot/www:/var/www/certbot \
  certbot/certbot renew --non-interactive
docker exec gateway nginx -s reload
```

### Gateway nginx and the ACME challenge

The gateway nginx serves `/.well-known/acme-challenge/` on HTTP port 80 for all domains — this is what certbot uses to prove domain ownership during webroot validation. The relevant block in `nginx/gateway.nginx.conf`:

```nginx
location /.well-known/acme-challenge/ {
    root /var/www/certbot;
}
```

This block must remain in the HTTP server blocks for all domains. Do not add an HTTPS redirect that catches ACME challenge paths.

## Monitoring and Logging

### Application Monitoring

```bash
# Health check endpoint
curl https://yourdomain.com/api/

# Setup monitoring with Prometheus + Grafana
docker run -d -p 9090:9090 prom/prometheus
docker run -d -p 3000:3000 grafana/grafana
```

### Log Aggregation

```bash
# Using ELK Stack (Elasticsearch, Logstash, Kibana)
docker run -d -p 9200:9200 docker.elastic.co/elasticsearch/elasticsearch:8.0.0
docker run -d -p 5601:5601 docker.elastic.co/kibana/kibana:8.0.0
```

### Backup Strategy

```bash
#!/bin/bash
# backup.sh - Automated backup script

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# MongoDB backup
docker exec mongodb mongodump \
  --archive=$BACKUP_DIR/mongodb_$TIMESTAMP.archive

# Upload to cloud storage
aws s3 cp $BACKUP_DIR/mongodb_$TIMESTAMP.archive \
  s3://my-backup-bucket/mongodb/

# Keep only last 7 days
find $BACKUP_DIR -name "mongodb_*.archive" -mtime +7 -delete
```

Schedule with cron:

```bash
0 2 * * * /path/to/backup.sh
```

## Rollback Procedure

```bash
# Identify previous working version
docker images | grep rehaadvisor

# Stop current services
docker compose -f docker-compose.prod.reha-advisor.yml down

# Pull and start the previous image tag
IMAGE_TAG=<previous-tag> docker compose -f docker-compose.prod.reha-advisor.yml up -d

# Verify services
docker compose -f docker-compose.prod.reha-advisor.yml ps

# Check logs for errors
docker compose -f docker-compose.prod.reha-advisor.yml logs
```

## Performance Optimization

### Frontend Optimization

```nginx
# Gzip compression
gzip on;
gzip_types text/css application/javascript;

# Browser caching
location ~* .(jpg|jpeg|png|gif|ico|css|js)$ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}
```

### Backend Optimization

The database is MongoDB accessed via MongoEngine — there is no Django `DATABASES` block for the primary store. Optimization levers:

- **MongoEngine connection pool**: set `maxPoolSize` in `connect()` inside `api/settings/*.py` (default is 100).
- **Redis caching**: the Celery broker is already on Redis (`rediss://`). Add `django-redis` to `requirements.txt` and configure `CACHES` if view-level caching is needed.
- **Indexes**: add MongoEngine `meta = {"indexes": [...]}` to hot query paths in `core/models.py`.

## Troubleshooting Deployment

### Common Issues

```bash
# Services not starting
docker compose logs -f

# Port already in use
sudo lsof -i :8001
sudo kill -9 <PID>

# Database connection errors
docker exec django-prod python manage.py shell  # MongoDB — no dbshell

# Memory issues
docker stats
docker update --memory 2g container-name
```

---

## Management Commands Reference

All commands run inside the `django-dev` (dev) or `django-prod` (production) container.

```bash
# Dev
docker exec django-dev python manage.py <command>

# Production
docker exec django-prod python manage.py <command>
```

| Command | What it does | Notes |
|---|---|---|
| `seed_admin` | Creates admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Idempotent; run after every deploy |
| `seed_periodic_tasks` | Registers Celery-beat `PeriodicTask` entries | Idempotent; run after adding new scheduled tasks |
| `seed_feedback_questions` | Upserts canonical `FeedbackQuestion` records | Non-destructive by default |
| `seed_e2e` | Creates E2E test accounts from `E2E_*` env vars | Destroys and recreates on every run |
| `fetch_fitbit_data` | Pulls Fitbit data for all connected users (`--days N`) | Default 30 days |
| `fetch_google_health_data` | Pulls Google Health data for all/one connected user | `--days N`, `--user <uid>` |
| `backfill_existing_google_health_patients` | Dispatches 365-day backfill for GH patients with sparse data | `--min-days N` |
| `backfill_wearable_device` | Sets `wearable_device` on Patient docs where null | `--dry-run`, `--project`, `--clinic` |
| `backfill_study_groups` | Sets `patient.study_group` from REDCap `rando_res` | `--dry-run`, `--all`, `--project` |
| `backfill_creator_name` | Populates `creator_name` on InterventionTemplate docs | `--dry-run` |
| `migrate_to_google_health` | Switches `wearable_device` from fitbit → google_health | `--project` filter |
| `encrypt_tokens` | One-time re-encryption of plaintext OAuth tokens | Idempotent |
| `delete_expired_videos` | Deletes feedback video/audio files past retention window | Gated by `ENABLE_MEDIA_AUTO_DELETE` |
| `set_celerybeat_every_minute` | Sets named tasks to run every minute | Development helper only |

---

**Related Documentation**:
- [Getting Started](./01-GETTING_STARTED.md)
- [Environment Configuration](./07-ENVIRONMENT_CONFIG.md)
- [Troubleshooting](./08-TROUBLESHOOTING.md)
