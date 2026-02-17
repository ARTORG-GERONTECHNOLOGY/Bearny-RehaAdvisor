# Production Deployment Guide for reha-advisor.ch

## Overview

This guide provides step-by-step instructions for deploying RehaAdvisor to production at reha-advisor.ch using the separate production Docker Compose configuration.

## Pre-Deployment Checklist

- [ ] Server prepared with Docker and Docker Compose
- [ ] Domain `reha-advisor.ch` DNS configured
- [ ] SSL certificates ready or Let's Encrypt configured
- [ ] Production environment variables configured
- [ ] Database backup strategy planned
- [ ] Monitoring and logging configured
- [ ] Security review completed
- [ ] Team members trained on deployment

## System Requirements

### Hardware
- CPU: 4+ cores recommended
- RAM: 8GB minimum (16GB recommended)
- Disk: 100GB+ available space
- Network: Static IP address recommended

### Software
- Docker Engine 20.10+
- Docker Compose 1.29+
- Linux (Ubuntu 22.04 LTS recommended)
- SSL/TLS certificate (Let's Encrypt or commercial)

## Initial Server Setup

### 1. Prepare Server

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group (optional)
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker compose --version
```

### 2. Create Application Directory

```bash
# Create app directory
sudo mkdir -p /opt/reha-advisor
cd /opt/reha-advisor

# Clone repository (use HTTPS for production)
git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git .

# Set proper permissions
sudo chown -R $USER:$USER /opt/reha-advisor
chmod 755 /opt/reha-advisor
```

### 3. Configure SSL/TLS Certificates

#### Option A: Let's Encrypt (Recommended)

```bash
# Create certificate directories
mkdir -p nginx/certbot/{conf,www}

# Obtain certificate using certbot
sudo certbot certonly --webroot -w nginx/certbot/www \
  -d reha-advisor.ch -d www.reha-advisor.ch \
  -m admin@reha-advisor.ch \
  --agree-tos \
  --non-interactive

# Copy certificates to proper location
sudo cp /etc/letsencrypt/live/reha-advisor.ch/fullchain.pem nginx/certbot/conf/live/reha-advisor.ch/
sudo cp /etc/letsencrypt/live/reha-advisor.ch/privkey.pem nginx/certbot/conf/live/reha-advisor.ch/

# Set permissions
sudo chown -R $USER:$USER nginx/certbot/
chmod 755 nginx/certbot/conf
chmod 644 nginx/certbot/conf/live/reha-advisor.ch/*
```

#### Option B: Commercial Certificate

```bash
# Copy your certificate files to:
# - nginx/certbot/conf/live/reha-advisor.ch/fullchain.pem
# - nginx/certbot/conf/live/reha-advisor.ch/privkey.pem

mkdir -p nginx/certbot/conf/live/reha-advisor.ch
cp /path/to/your/fullchain.pem nginx/certbot/conf/live/reha-advisor.ch/
cp /path/to/your/privkey.pem nginx/certbot/conf/live/reha-advisor.ch/
```

### 4. Create MongoDB TLS Certificates

```bash
# Create certificate directory
mkdir -p mongo/tls

# Generate self-signed certificate for MongoDB (for internal TLS)
openssl req -nodes -new -x509 -keyout mongo/tls/mongodb.key -out mongo/tls/mongodb.crt \
  -subj "/CN=db-prod" -days 3650

# Create PEM file
cat mongo/tls/mongodb.key mongo/tls/mongodb.crt > mongo/tls/server.pem

# Create CA certificate
cp mongo/tls/mongodb.crt mongo/tls/ca.crt

# Set permissions
chmod 600 mongo/tls/server.pem
chmod 644 mongo/tls/ca.crt
```

### 5. Configure Environment Variables

```bash
# Copy template and edit
cp .env.prod.reha-advisor .env.prod

# Edit with your configuration
nano .env.prod
```

**Critical settings to update:**

```bash
# Generate secure keys
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
REDIS_PASSWORD=$(openssl rand -base64 32)
MONGODB_PASSWORD=$(openssl rand -base64 32)

# Update in .env.prod
sed -i "s/change-this-to-a-very-secure-random-key.*/SECRET_KEY=$SECRET_KEY/" .env.prod
sed -i "s/change-this-to-secure-redis-password/$REDIS_PASSWORD/g" .env.prod
sed -i "s/change-this-to-secure-password/$MONGODB_PASSWORD/g" .env.prod
```

**Email Configuration (example with Gmail):**

```bash
# Generate Gmail App Password
# 1. Enable 2FA on Gmail account
# 2. Generate App Password at myaccount.google.com/apppasswords
# 3. Add to .env.prod:

EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-specific-password
```

### 6. Create MongoDB Initialization Script

```bash
# Create initialization script
cat > mongo/init/01-init.js << 'EOF'
db.createUser({
  user: "admin",
  pwd: process.env.MONGODB_PASSWORD || "changeme",
  roles: ["root"]
});

db.createCollection("users");
db.createCollection("patients");
db.createCollection("sessions");
db.createCollection("therapies");
db.createCollection("assessments");
db.createCollection("feedback");

print("Database initialized successfully");
EOF
```

## Deployment Steps

### 1. Build Production Containers

```bash
# From /opt/reha-advisor directory
make build_prod

# Or manually:
docker compose -f docker-compose.prod.reha-advisor.yml build --no-cache
```

This will build:
- Django backend application
- React frontend application
- NGINX reverse proxy
- Redis cache
- MongoDB database

### 2. Start Production Services

```bash
# Start all services in background
make prod_up

# Or manually:
docker compose -f docker-compose.prod.reha-advisor.yml up -d
```

### 3. Verify Services Are Running

```bash
# Check container status
make prod_health

# Or manually:
docker compose -f docker-compose.prod.reha-advisor.yml ps
```

Expected output:
```
NAME                COMMAND                  STATUS
libretranslate-prod "libretranslate --load…" Up (healthy)
db-prod             "mongod --auth --tls…"  Up (healthy)
redis-prod          "redis-server --requi…" Up (healthy)
django-prod         "gunicorn api.wsgi:a…"  Up (healthy)
celery-prod         "python -m celery -A…"  Up (running)
celery-beat-prod    "python -m celery -A…"  Up (running)
react-prod          "nginx -g daemon off;…" Up (running)
nginx-prod          "nginx -g daemon off;…" Up (running)
certbot-prod        "/bin/sh -c 'trap exi…" Up (running)
```

### 4. Initialize Database

```bash
# Run Django migrations
make prod_migrate

# Or manually:
docker exec django-prod python manage.py migrate

# Create superuser for admin access
make prod_superuser

# Or manually:
docker exec -it django-prod python manage.py createsuperuser
```

### 5. Collect Static Files

```bash
# Collect Django static files
make prod_collectstatic

# Or manually:
docker exec django-prod python manage.py collectstatic --noinput
```

### 6. Test SSL Certificate

```bash
# Test certificate with curl
curl -v https://reha-advisor.ch/

# Should see SSL certificate details without warnings
```

## Post-Deployment Configuration

### 1. Configure DNS

Update your DNS records to point to your server:

```dns
reha-advisor.ch    A       your.server.ip.address
www.reha-advisor.ch CNAME  reha-advisor.ch
```

Verify DNS propagation:
```bash
dig reha-advisor.ch
nslookup reha-advisor.ch
```

### 2. Set Up Log Rotation

```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/reha-advisor > /dev/null << 'EOF'
/opt/reha-advisor/nginx/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
EOF

# Test configuration
sudo logrotate -d /etc/logrotate.d/reha-advisor
```

### 3. Set Up Monitoring

```bash
# Create monitoring script
cat > /opt/reha-advisor/scripts/health-check.sh << 'EOF'
#!/bin/bash

# Check HTTP
curl -f https://reha-advisor.ch/health || echo "Health check failed"

# Check API
curl -f https://reha-advisor.ch/api/health/ || echo "API health check failed"

# Check container status
docker compose -f /opt/reha-advisor/docker-compose.prod.reha-advisor.yml ps
EOF

chmod +x /opt/reha-advisor/scripts/health-check.sh

# Add to crontab for monitoring (every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/reha-advisor/scripts/health-check.sh") | crontab -
```

### 4. Configure Automated Backups

```bash
# Create backup script
mkdir -p /opt/reha-advisor/backups

cat > /opt/reha-advisor/scripts/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/reha-advisor/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# MongoDB backup
docker exec db-prod mongodump --archive=$BACKUP_DIR/mongodb_$TIMESTAMP.archive

# Upload to cloud storage (example: AWS S3)
# aws s3 cp $BACKUP_DIR/mongodb_$TIMESTAMP.archive s3://my-backups/reha-advisor/

# Keep only last 30 days
find $BACKUP_DIR -name "mongodb_*.archive" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/mongodb_$TIMESTAMP.archive"
EOF

chmod +x /opt/reha-advisor/scripts/backup.sh

# Schedule daily backup (2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/reha-advisor/scripts/backup.sh") | crontab -
```

## Operational Commands

### View Logs

```bash
# All services
make prod_logs

# Specific service
make prod_logs_django
make prod_logs_nginx
make prod_logs_celery
```

### Access Shell

```bash
# Django shell
make prod_shell_django

# MongoDB shell
make prod_shell_mongo

# Redis CLI
make prod_shell_redis
```

### Restart Services

```bash
# Full restart
make prod_restart

# Individual service
docker compose -f docker-compose.prod.reha-advisor.yml restart django-prod
```

### Database Operations

```bash
# Run migrations
make prod_migrate

# Create superuser
make prod_superuser

# Collect static files
make prod_collectstatic

# Backup database
make prod_backup
```

## Maintenance

### Certificate Renewal

Let's Encrypt certificates auto-renew via certbot container. Verify:

```bash
# Check certificate expiration
docker exec certbot-prod certbot certificates

# Manual renewal if needed
docker exec certbot-prod certbot renew --dry-run
```

### Database Maintenance

```bash
# Connect to MongoDB
docker exec -it db-prod mongosh

# Run diagnostics
> db.adminCommand({serverStatus: 1})

# Check collections
> db.getCollectionNames()

# Repair collection if corrupted
> db.collection.repair()
```

### Update Application

```bash
# Pull latest code
cd /opt/reha-advisor
git pull origin main

# Rebuild and restart
make build_prod
make prod_restart

# Verify deployment
make prod_health
```

## Troubleshooting

### Services Not Starting

```bash
# Check logs
make prod_logs

# Verify permissions
ls -la /opt/reha-advisor/

# Check Docker daemon
docker ps

# Rebuild if corrupted
make build_prod
```

### Database Connection Issues

```bash
# Test MongoDB connection
docker exec db-prod mongosh --eval 'db.adminCommand("ping")'

# Check connection string
grep MONGODB_URI .env.prod

# Verify TLS certificates
ls -la mongo/tls/
```

### SSL Certificate Issues

```bash
# Check certificate validity
docker exec certbot-prod certbot certificates

# Verify NGINX configuration
docker exec nginx-prod nginx -t

# Check certificate files
ls -la nginx/certbot/conf/live/reha-advisor.ch/
```

### High CPU/Memory Usage

```bash
# Monitor resource usage
docker stats

# Check for stuck processes
docker exec django-prod ps aux

# Scale Celery workers if needed
# Edit docker-compose.prod.reha-advisor.yml: change -c 4 to -c 8
```

## Security Best Practices

1. **Keep secrets secure**
   - Never commit .env.prod to version control
   - Use strong, random passwords
   - Rotate passwords regularly

2. **Enable SSL/TLS**
   - Always use HTTPS in production
   - Enforce SSL redirection
   - Keep certificates updated

3. **Regular backups**
   - Backup database daily
   - Store backups off-site
   - Test restore procedures

4. **Monitor and log**
   - Monitor application health
   - Review logs regularly
   - Set up alerts for errors

5. **Keep software updated**
   - Update Docker images
   - Update dependencies
   - Apply security patches

6. **Access control**
   - Use strong admin passwords
   - Limit SSH access
   - Use firewall rules

## Support

For issues or questions:
1. Check [Troubleshooting Guide](../docs/08-TROUBLESHOOTING.md)
2. Review logs: `make prod_logs`
3. Check [Documentation](../docs/README.md)
4. Contact support team

---

**Last Updated**: February 17, 2026
**Version**: 1.0
**Domain**: reha-advisor.ch
