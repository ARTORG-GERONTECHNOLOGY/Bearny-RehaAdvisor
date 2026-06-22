# Environment Configuration

## Overview

This document describes how to configure RehaAdvisor for different environments (development, staging, production) using environment variables and configuration files.

## Environment Variables

### File Locations

```
rehaadvisor/
├── .env                      # Development (local) - DO NOT COMMIT
├── .env.example              # Template
├── .env.staging              # Staging environment
├── .env.production           # Production environment (secure storage)
├── backend/.env              # Backend specific (optional)
└── frontend/.env             # Frontend specific (optional)
```

### Example Environment Files

#### .env.example

```bash
# Django Settings
DEBUG=True
SECRET_KEY=your-secret-key-change-in-production

# Allowed Hosts
ALLOWED_HOSTS=localhost,127.0.0.1,localhost:3000,localhost:8001

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB_NAME=rehaadvisor
MONGODB_USER=admin
MONGODB_PASSWORD=password

# Frontend
VITE_API_URL=http://localhost:8001

# Email Configuration (for notifications)
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_HOST=localhost
EMAIL_PORT=1025
EMAIL_USE_TLS=False
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=

# Celery Configuration
CELERY_BROKER_URL=rediss://localhost:6379/0
CELERY_RESULT_BACKEND=rediss://localhost:6379/0

# CORS Settings
CORS_ALLOWED_ORIGINS=http://localhost:3001,http://localhost:8001

# Timezone and Language
TIME_ZONE=Europe/Zurich
LANGUAGE_CODE=de-ch

# Sentry (Error Tracking) - Optional
SENTRY_DSN=

# Other Settings
ENVIRONMENT=development
LOG_LEVEL=DEBUG
```

#### Development Environment (.env)

```bash
DEBUG=True
SECRET_KEY=dev-secret-key-not-secure

ALLOWED_HOSTS=localhost,127.0.0.1,localhost:3000,localhost:8001

MONGODB_URI=mongodb://db:27017/
MONGODB_DB_NAME=rehaadvisor_dev

VITE_API_URL=http://localhost:8001

EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend

CELERY_BROKER_URL=rediss://:${REDIS_PASSWORD}@redis:6379/0
CELERY_RESULT_BACKEND=rediss://:${REDIS_PASSWORD}@redis:6379/0

CORS_ALLOWED_ORIGINS=http://localhost:3001,http://localhost:8001

TIME_ZONE=Europe/Zurich
LANGUAGE_CODE=de-ch

ENVIRONMENT=development
LOG_LEVEL=DEBUG
```

#### Staging Environment (.env.staging)

```bash
DEBUG=False
SECRET_KEY=staging-secret-key-change-this

ALLOWED_HOSTS=staging.yourdomain.com,www-staging.yourdomain.com

MONGODB_URI=mongodb://staging-user:password@mongodb.staging.example.com:27017/
MONGODB_DB_NAME=rehaadvisor_staging

VITE_API_URL=https://staging.yourdomain.com

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=staging-email@example.com
EMAIL_HOST_PASSWORD=app-password

CELERY_BROKER_URL=rediss://:${REDIS_PASSWORD}@redis-staging:6379/0
CELERY_RESULT_BACKEND=rediss://:${REDIS_PASSWORD}@redis-staging:6379/0

CORS_ALLOWED_ORIGINS=https://staging.yourdomain.com

TIME_ZONE=Europe/Zurich
LANGUAGE_CODE=de-ch

ENVIRONMENT=staging
LOG_LEVEL=INFO
SENTRY_DSN=https://your-staging-sentry-dsn
```

#### Production Environment (.env.production)

```bash
DEBUG=False
SECRET_KEY=production-secret-key-use-strong-random-value

ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

MONGODB_URI=mongodb+srv://prod-user:secure-password@prod-cluster.mongodb.net/
MONGODB_DB_NAME=rehaadvisor_prod

VITE_API_URL=https://yourdomain.com

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=noreply@yourdomain.com
EMAIL_HOST_PASSWORD=secure-app-password

CELERY_BROKER_URL=rediss://:${REDIS_PASSWORD}@redis-prod:6379/0
CELERY_RESULT_BACKEND=rediss://:${REDIS_PASSWORD}@redis-prod:6379/0

CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

TIME_ZONE=Europe/Zurich
LANGUAGE_CODE=de-ch

ENVIRONMENT=production
LOG_LEVEL=WARNING
SENTRY_DSN=https://your-production-sentry-dsn

# Additional Security
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

## Configuration Files

### Docker Compose Configuration

#### docker-compose.dev.yml

Includes hot reload and debugging:

```yaml
version: '3.8'

services:
  django:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    env_file: .env
    ports:
      - "8001:8000"
    volumes:
      - ./backend:/app
    environment:
      - DEBUG=True
      - PYTHONUNBUFFERED=1
    command: python manage.py runserver 0.0.0.0:8000

  react:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    env_file: .env
    ports:
      - "3001:3000"
    volumes:
      - ./frontend:/app
    environment:
      - VITE_API_URL=http://localhost:8001

  db:
    image: mongo:8.0.3
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=rehaadvisor

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  mongo_data:
```

#### docker-compose.prod.yml

Production-optimized configuration:

```yaml
version: '3.8'

services:
  django:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    env_file: .env.production
    environment:
      - DEBUG=False
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health/"]
      interval: 30s
      timeout: 10s
      retries: 3

  react:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    env_file: .env.production
    restart: always

  nginx:
    image: nginx:stable-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf/nginx.prod.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt/live/yourdomain.com:/etc/nginx/ssl:ro
      - ./static:/static:ro
      - ./media:/media:rw
    depends_on:
      - django
      - react
    restart: always

  db:
    image: mongo:8.0.3
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=${MONGODB_PASSWORD}
    volumes:
      - mongo_data:/data/db
    restart: always

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: always

volumes:
  mongo_data:
  redis_data:
```

### Django Settings

#### config/settings/base.py

```python
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Read from environment variables
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key')
DEBUG = os.environ.get('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '').split(',')

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mongodb',
        'NAME': os.environ.get('MONGODB_DB_NAME', 'rehaadvisor'),
        'HOST': os.environ.get('MONGODB_HOST', 'localhost'),
        'PORT': int(os.environ.get('MONGODB_PORT', 27017)),
        'USER': os.environ.get('MONGODB_USER', ''),
        'PASSWORD': os.environ.get('MONGODB_PASSWORD', ''),
    }
}

# Email Configuration
EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend'
)
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 1025))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'False') == 'True'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')

# Celery Configuration
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')

# CORS
CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')

# Timezone
TIME_ZONE = os.environ.get('TIME_ZONE', 'UTC')
LANGUAGE_CODE = os.environ.get('LANGUAGE_CODE', 'en-us')

# Logging
LOGLEVEL = os.environ.get('LOG_LEVEL', 'INFO')
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': LOGLEVEL,
            'class': 'logging.FileHandler',
            'filename': '/var/log/rehaadvisor/django.log',
            'formatter': 'verbose',
        },
        'console': {
            'level': LOGLEVEL,
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': LOGLEVEL,
    },
}
```

#### config/settings/production.py

```python
from .base import *

DEBUG = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True

# Security Headers
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = '/app/static'
MEDIA_URL = '/media/'
MEDIA_ROOT = '/app/media'

# Allowed hosts must be set in environment
if not ALLOWED_HOSTS:
    raise ValueError("ALLOWED_HOSTS environment variable must be set in production")
```

### Frontend Configuration

#### vite.config.js

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      }
    }
  },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || 'http://localhost:8001'
    ),
  }
})
```

#### .env.frontend (Development)

```bash
VITE_API_URL=http://localhost:8001
VITE_APP_NAME=RehaAdvisor
VITE_DEBUG=true
```

## Loading Environment Variables

### Python (Backend)

```python
import os
from dotenv import load_dotenv

# Load from .env file (development)
load_dotenv()

# Get variable with default
debug = os.getenv('DEBUG', 'False') == 'True'
database_url = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/')
```

### JavaScript (Frontend)

```javascript
// Vite automatically loads .env files
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const isDebug = import.meta.env.VITE_DEBUG === 'true'

// Access in components
console.log(import.meta.env.MODE)  // 'development' or 'production'
```

## Secure Secret Management

### For Production

```bash
# Use environment-specific secret storage
# AWS Secrets Manager, HashiCorp Vault, etc.

# Never commit .env files
echo ".env.production" >> .gitignore
echo ".env.staging" >> .gitignore
echo ".env.local" >> .gitignore

# Generate secure secret key
python -c 'import secrets; print(secrets.token_urlsafe(50))'
```

### Docker Secrets (Swarm Mode)

```bash
# Create secret
echo "super-secret-password" | docker secret create db_password -

# Use in service
services:
  app:
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    external: true
```

### Kubernetes Secrets

```bash
# Create secret from environment file
kubectl create secret generic rehaadvisor-secrets \
  --from-env-file=.env.production \
  -n rehaadvisor

# Reference in Pod
env:
- name: DEBUG
  valueFrom:
    secretKeyRef:
      name: rehaadvisor-secrets
      key: DEBUG
```

## Configuration Validation

```python
# config/validators.py
import os
from django.core.exceptions import ImproperlyConfigured

def validate_required_env_vars():
    """Validate that all required environment variables are set."""
    required_vars = [
        'SECRET_KEY',
        'MONGODB_URI',
        'ALLOWED_HOSTS',
    ]
    
    for var in required_vars:
        if not os.getenv(var):
            raise ImproperlyConfigured(
                f"Required environment variable '{var}' is not set"
            )

# Call in settings/__init__.py
validate_required_env_vars()
```

---

## Operating Mode

Two env vars control which features are active at runtime. Set them in the `environment:` block of the Django service in your Compose file (not in `.env`) so the mode is visible in the Compose diff.

| Variable | Default | Description |
|---|---|---|
| `APP_MODE` | `normal` | `dev` — all features on; `normal` — manual creation on, REDCap hidden; `study` — REDCap only, PII fields hidden |
| `STUDY_REDCAP_VISIBLE` | `true` | In `study` mode only: set to `false` to also hide the REDCap tab in the patient profile popup |

Current defaults per stack:

| Stack | `APP_MODE` |
|---|---|
| `docker-compose.dev.yml` | `dev` |
| `docker-compose.prod.reha-advisor.yml` | `study` |

The frontend fetches the active mode from `GET /api/app-mode/` at startup — no rebuild needed when the env var changes, just restart the django container.

See [Study Integration Guide](./15-STUDY_INTEGRATION.md) for the full feature matrix.

---

## Certificate Renewal

Automatic Let's Encrypt renewal is handled by the Celery beat task `core.tasks.renew_certificates`, which runs daily at 03:00 UTC. It is opt-in: set `CERTBOT_ENABLED=true` to activate.

### Variables (add to `.env.dev` and `.env.prod`)

| Variable | Required | Description |
|---|---|---|
| `CERTBOT_ENABLED` | Yes (to activate) | Set to `true` to enable automatic renewal. Task silently skips if absent or false. |
| `CERTBOT_CONF_PATH` | Yes | **Host-absolute** path to `nginx/certbot/conf` — e.g. `/home/ubuntu/repos/telerehabapp/nginx/certbot/conf`. Must be the host path, not the container path, because certbot is launched via `docker run`. |
| `CERTBOT_WWW_PATH` | Yes | **Host-absolute** path to `nginx/certbot/www` — the webroot used by certbot for ACME challenges. |
| `CERTBOT_NGINX_CONTAINER` | No | Name of the gateway nginx container to reload after renewal. Defaults to `gateway`. |

### Dev example (`.env.dev`)

```env
CERTBOT_ENABLED=true
CERTBOT_CONF_PATH=/home/ubuntu/repos/telerehabapp/nginx/certbot/conf
CERTBOT_WWW_PATH=/home/ubuntu/repos/telerehabapp/nginx/certbot/www
CERTBOT_NGINX_CONTAINER=gateway
```

### Prod example (`.env.prod`)

```env
CERTBOT_ENABLED=true
CERTBOT_CONF_PATH=/home/ubuntu/repos/telerehabapp-prod/nginx/certbot/conf
CERTBOT_WWW_PATH=/home/ubuntu/repos/telerehabapp-prod/nginx/certbot/www
CERTBOT_NGINX_CONTAINER=gateway
```

See [Deployment Guide — SSL/TLS Certificate Management](./06-DEPLOYMENT_GUIDE.md#ssltls-certificate-management) for the full operational guide.

---

## LibreTranslate Service

RehaAdvisor bundles a self-hosted [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) container for machine translation of intervention content. It is **not optional** — the backend calls it whenever a therapist requests translation of an intervention.

### Required environment variables (set inside `docker-compose.*.yml`)

| Variable | Value | Description |
|---|---|---|
| `LT_LOAD_ONLY` | `en,fr,de,it,nl,pt` | Comma-separated list of language pairs to load. Reducing this list speeds up startup and saves disk. |
| `LT_UPDATE_MODELS` | `true` | Re-downloads updated language models when the container image is updated. |
| `LT_PACKAGES_ROOT` | `/app/packages` | Path inside the container where downloaded language model packages are stored. |

### Named volume

```yaml
volumes:
  libretranslate_packages:/app/packages
```

The `libretranslate_packages` named volume **must** be declared. Without it:

- Language models are re-downloaded from the internet on every container restart.
- The service is unavailable for several minutes after each restart.
- Translations fail with "language pair not available" errors during the download window.

If you see those errors, check that the volume exists:

```bash
docker volume ls | grep libretranslate
```

If it is missing, recreate it and restart the service:

```bash
docker volume create libretranslate_packages
docker compose -f docker-compose.dev.yml restart libretranslate
```

---

## Admin Dashboard Features

The Admin Dashboard (`/admin`) provides several management tabs. Access requires a user account with the `Admin` role.

### Health Questionnaires tab

Allows admins to browse, search, edit, and delete `HealthQuestionnaire` documents stored in MongoDB.

| Action | API endpoint | Notes |
|---|---|---|
| List / search | `GET /api/admin/questionnaires/?q=<search>` | Returns all questionnaires with `usage_count` (# plans referencing each) |
| Update metadata | `PUT /api/admin/questionnaires/<id>/` | Editable fields: `title`, `description`, `tags` |
| Delete | `DELETE /api/admin/questionnaires/<id>/` | Cascades: removes the questionnaire from all `RehabilitationPlan.questionnaires` entries |

**Cascade delete behaviour**: when a questionnaire is deleted, all `QuestionnaireAssignment` embedded documents referencing it are stripped from every `RehabilitationPlan`. If `usage_count > 0` the delete confirmation modal shows a warning.

### E2E test credentials

The questionnaire admin E2E tests (`frontend/e2e/admin-questionnaires.spec.ts`) require:

```env
E2E_ADMIN_LOGIN=admin@example.com
E2E_ADMIN_PASSWORD=...
E2E_EMAIL_DIR=/path/to/django/email/output   # same as therapist tests
```

All tests skip gracefully when these variables are absent.

---

## Three-Environment Setup

The project runs three distinct Docker Compose stacks on the same server host:

| Stack | Compose file | `.env` file | Purpose |
|---|---|---|---|
| **dev** | `docker-compose.dev.yml` | `.env.dev` | Active development — code mounted as volumes, hot-reload enabled |
| **local-prod** | `docker-compose.local-prod.yml` | `.env.local-prod` | Staging on the same host — built images, prod-like settings, accessible on port 8080 |
| **prod** | `docker-compose.prod.reha-advisor.yml` (in `/home/ubuntu/repos/telerehabapp-prod`) | `.env.prod` | Live production — pulls images from GHCR, accessible on port 443 |

### Gateway nginx

A dedicated `docker-compose.gateway.yml` runs an nginx reverse proxy that routes incoming HTTPS traffic to either the local-prod or production stack depending on the hostname. Both stacks attach to separate Docker networks (`telereha` and `telereha-prod`); the gateway container joins both:

```bash
docker network connect telereha-prod gateway
```

When adding a new service to either stack that should be reachable through the gateway, update `docker-compose.gateway.yml` to proxy the relevant upstream.

### Dev vs local-prod differences

| Feature | dev | local-prod |
|---|---|---|
| Code mounting | `./backend:/app` volume | Image only (no bind mount) |
| Settings module | `api.settings.dev` | `api.settings.local_prod` |
| Debug | `True` | `False` |
| Hot reload | Vite HMR active | Static build served by nginx |
| Celery broker | `rediss://redis:6379/0` | `rediss://redis-localprod:6379/0` |

---

## Security Variables

### Redis TLS

Redis requires TLS in all environments. The broker URL scheme must be `rediss://` (double-s). The CA certificate used to verify the Redis server cert is shared with the Mongo CA.

| Variable | Default | Description |
|---|---|---|
| `REDIS_PASSWORD` | *(required)* | Password for the Redis `requirepass` directive. Set in `.env.dev` / `.env.prod`. |
| `REDIS_CA_CERT` | `/etc/ssl/redis/ca.crt` (prod) / `/etc/ssl/mongo/ca.crt` (dev) | Path inside the container to the CA certificate used to verify the Redis TLS connection. Set in `docker-compose.*.yml` via the `environment:` section, not `.env` files. |
| `CELERY_BROKER_URL` | `rediss://redis:6379/0` | Must use `rediss://` scheme. Dev compose injects this automatically. |
| `CELERY_RESULT_BACKEND` | `rediss://redis:6379/0` | Must match broker scheme. |

The TLS certs for Redis live in `redis/tls/` (gitignored). See the [Deployment Guide — Redis TLS](./06-DEPLOYMENT_GUIDE.md#redis-tls-certificate-setup) for the generation steps.

### Log Retention

The Celery Beat task `core.tasks.prune_old_logs` runs weekly (Sunday 04:00 UTC) and deletes old audit log entries. `ADMIN_EXPORT` entries are kept longer to satisfy data access compliance requirements.

| Variable | Default | Description |
|---|---|---|
| `LOG_RETENTION_DAYS` | `365` | Delete regular activity `Logs` entries older than this many days. Set to `0` to disable pruning entirely. |
| `AUDIT_EXPORT_RETENTION_DAYS` | `1825` (5 years) | Retain `ADMIN_EXPORT` log entries for this many days. These record who downloaded patient data and must be kept for compliance. |

---

**Related Documentation**:
- [Getting Started](./01-GETTING_STARTED.md)
- [Deployment Guide](./06-DEPLOYMENT_GUIDE.md)
- [Production Deploy Runbook](./PRODUCTION_DEPLOY_RUNBOOK.md)
- [Troubleshooting](./08-TROUBLESHOOTING.md)
