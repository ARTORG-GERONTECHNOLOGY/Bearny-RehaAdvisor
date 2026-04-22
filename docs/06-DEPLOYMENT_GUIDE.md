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

1. **Prepare Server**

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **Clone Repository**

```bash
cd /opt
sudo git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git
cd RehaAdvisor
```

3. **Configure Environment**

```bash
# Create production environment file
sudo cat > .env.prod << EOF
DEBUG=False
SECRET_KEY=$(python -c 'import secrets; print(secrets.token_urlsafe(50))')
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@yourdomain.com
DJANGO_SUPERUSER_PASSWORD=secure_password_here
MONGODB_URI=mongodb://mongo:27017/
MONGODB_DB_NAME=rehaadvisor
EOF

sudo chmod 600 .env.prod
```

4. **Configure NGINX**

```bash
# Edit nginx configuration
sudo vim nginx/conf/nginx.conf

# Add SSL configuration
sudo cp nginx/conf/nginx.prod.conf nginx/conf/nginx.conf
```

Example NGINX production config:

```nginx
upstream backend {
    server django:8000;
}

upstream frontend {
    server react:3000;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL certificates
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # API proxy
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

5. **Set Up SSL with Certbot**

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx -y

# Obtain certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Renew certificates automatically
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

6. **Build and Deploy**

```bash
# Build production images
make build

# Start services
make up

# Verify services running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose logs -f
```

7. **Post-Deployment**

```bash
# Run migrations
docker exec telerehabapp-django-1 python manage.py migrate

# Create superuser
docker exec -it telerehabapp-django-1 python manage.py createsuperuser

# Collect static files
docker exec telerehabapp-django-1 python manage.py collectstatic --noinput

# Test health endpoints
curl https://yourdomain.com/api/health/
```

### Option 2: Kubernetes Deployment

For larger, scalable deployments.

#### Prerequisites

- Kubernetes cluster (AWS EKS, Google GKE, or self-managed)
- kubectl configured
- Docker images pushed to registry

#### Kubernetes Manifests

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: rehaadvisor
---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: rehaadvisor
data:
  DEBUG: "False"
  ALLOWED_HOSTS: "yourdomain.com,www.yourdomain.com"
---
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: rehaadvisor
type: Opaque
stringData:
  SECRET_KEY: "your-secret-key"
  DATABASE_PASSWORD: "your-db-password"
---
# k8s/deployment-django.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: django-deployment
  namespace: rehaadvisor
spec:
  replicas: 2
  selector:
    matchLabels:
      app: django
  template:
    metadata:
      labels:
        app: django
    spec:
      containers:
      - name: django
        image: yourdocker/rehaadvisor-backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: DEBUG
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: DEBUG
        - name: SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: SECRET_KEY
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health/
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
---
# k8s/service-django.yaml
apiVersion: v1
kind: Service
metadata:
  name: django-service
  namespace: rehaadvisor
spec:
  selector:
    app: django
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000
  type: LoadBalancer
```

#### Deploy to Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get deployments -n rehaadvisor

# Check pods
kubectl get pods -n rehaadvisor

# View logs
kubectl logs -n rehaadvisor deployment/django-deployment

# Scale deployment
kubectl scale deployment django-deployment --replicas=3 -n rehaadvisor
```

### Option 3: Cloud Platform (Heroku, AWS, Google Cloud)

#### Heroku Deployment

```bash
# Login to Heroku
heroku login

# Create app
heroku create rehaadvisor-app

# Set environment variables
heroku config:set DEBUG=False
heroku config:set SECRET_KEY=your-secret-key

# Deploy
git push heroku main

# View logs
heroku logs --tail

# Open app
heroku open
```

#### AWS Deployment (Elastic Beanstalk)

```bash
# Install EB CLI
pip install awsebcli

# Initialize
eb init -p docker rehaadvisor-app --region us-east-1

# Create environment
eb create production

# Deploy
eb deploy

# View logs
eb logs

# Open app
eb open
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

# Celery
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

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

## SSL/TLS Certificate Management

### Using Let's Encrypt with Auto-Renewal

```bash
# Install Certbot
sudo apt-get install certbot -y

# Obtain certificate
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com

# Auto-renew
sudo certbot renew --dry-run
sudo systemctl enable certbot.timer
```

### Certificate Mounting in Docker

```yaml
# docker-compose.prod.yml
services:
  nginx:
    volumes:
      - /etc/letsencrypt/live/yourdomain.com:/etc/nginx/ssl:ro
```

## Monitoring and Logging

### Application Monitoring

```bash
# Health check endpoint
curl https://yourdomain.com/api/health/

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
docker compose down

# Start with previous version
docker compose -f docker-compose.prod.yml up -d

# Verify services
docker compose ps

# Check logs for errors
docker compose logs
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

```python
# Django settings
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
    }
}

# Database connection pooling
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mongodb',
        'NAME': 'rehaadvisor',
        'CONN_MAX_AGE': 600,
    }
}
```

## Troubleshooting Deployment

### Common Issues

```bash
# Services not starting
docker compose logs -f

# Port already in use
sudo lsof -i :8001
sudo kill -9 <PID>

# Database connection errors
docker exec django python manage.py dbshell

# Memory issues
docker stats
docker update --memory 2g container-name
```

---

**Related Documentation**:
- [Getting Started](./01-GETTING_STARTED.md)
- [Environment Configuration](./07-ENVIRONMENT_CONFIG.md)
- [Troubleshooting](./08-TROUBLESHOOTING.md)
