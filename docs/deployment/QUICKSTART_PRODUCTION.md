# Production Deployment Quick Start Guide

> Canonical entry point: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).  
> Use this quickstart as supplementary material only.

This guide provides a fast-track to deploying RehaAdvisor to reha-advisor.ch.

## 30-Minute Quick Start

### Prerequisites Checklist
- [ ] Server with Docker 20.10+ and Docker Compose 1.29+
- [ ] Domain reha-advisor.ch configured
- [ ] Static IP address assigned to server
- [ ] 100GB+ disk space available
- [ ] 8GB+ RAM available

### Step 1: Prepare Server (5 minutes)

```bash
# SSH into your server
ssh root@your.server.ip

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Clone repository
cd /opt
sudo git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git reha-advisor
cd reha-advisor
sudo chown -R $USER:$USER .
```

### Step 2: Configure Environment (5 minutes)

```bash
# Generate secure secrets
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
MONGODB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# Create environment file
cp .env.prod.reha-advisor .env.prod

# Update with your values
cat >> .env.prod << EOF
DEBUG=False
SECRET_KEY=$SECRET_KEY
ALLOWED_HOSTS=reha-advisor.ch,www.reha-advisor.ch
MONGODB_PASSWORD=$MONGODB_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
EMAIL_HOST_USER=admin@reha-advisor.ch
EMAIL_HOST_PASSWORD=your-email-password
ADMIN_EMAIL=admin@reha-advisor.ch
EOF
```

### Step 3: Setup SSL Certificates (5 minutes)

```bash
# Create SSL directory
mkdir -p nginx/certbot/{conf,www}

# Get Let's Encrypt certificate
sudo certbot certonly --webroot -w nginx/certbot/www \
  -d reha-advisor.ch -d www.reha-advisor.ch \
  -m admin@reha-advisor.ch \
  --agree-tos --non-interactive

# Copy to Docker location
sudo cp /etc/letsencrypt/live/reha-advisor.ch/fullchain.pem nginx/certbot/conf/live/reha-advisor.ch/ 2>/dev/null || echo "Create symlink if needed"
sudo cp /etc/letsencrypt/live/reha-advisor.ch/privkey.pem nginx/certbot/conf/live/reha-advisor.ch/ 2>/dev/null || echo "Create symlink if needed"
```

### Step 4: Launch Production (5 minutes)

```bash
# Start all services
make build_prod
make prod_up

# Wait for containers to start (30 seconds)
sleep 30

# Initialize database
make prod_migrate

# Create admin user
make prod_superuser

# Verify health
make prod_health
```

### Step 5: Configure DNS (5 minutes)

Update your DNS provider to point to your server:

```
reha-advisor.ch    A       your.server.ip.address
www.reha-advisor.ch CNAME  reha-advisor.ch
```

## Verification Steps

### 1. Check Services Running
```bash
make prod_health
```

Expected: All 9 services should show "Up" or "Healthy"

### 2. Test HTTPS
```bash
curl -v https://reha-advisor.ch/
```

Expected: No SSL certificate errors, HTTP 200 response

### 3. Test API
```bash
curl https://reha-advisor.ch/api/health/
```

Expected: `{"status": "ok"}` response

### 4. Access Admin Panel
```
https://reha-advisor.ch/admin
Username: (your superuser username)
Password: (your superuser password)
```

## Daily Operations

### View Logs
```bash
# All services
make prod_logs

# Specific service
make prod_logs_django
make prod_logs_nginx
```

### Backup Database
```bash
# Manual backup
make prod_backup

# Schedule daily backup (2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/reha-advisor && make prod_backup") | crontab -
```

### Monitor Health
```bash
# One-time check
make prod_health

# Continuous monitoring (every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * cd /opt/reha-advisor && make prod_health") | crontab -
```

### Restart Services
```bash
# Graceful restart
make prod_restart

# Restart specific service
docker restart django-prod
docker restart nginx-prod
```

## Common Tasks

### Add New User
```bash
make prod_shell_django
>>> from django.contrib.auth.models import User
>>> User.objects.create_user(username='username', email='user@example.com', password='password')
>>> exit()
```

### View Database
```bash
make prod_shell_mongo
> use reha_advisor
> db.users.find()
```

### Update Application
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
make build_prod
make prod_restart

# Run migrations if needed
make prod_migrate
```

### Check Disk Space
```bash
df -h /opt/reha-advisor

# If low on space, clean old backups
find /opt/reha-advisor/backups -name "mongodb_*.archive" -mtime +30 -delete
```

## Troubleshooting Quick Fixes

### Services not starting
```bash
# Check logs
make prod_logs

# Rebuild containers
make build_prod --no-cache

# Restart
make prod_restart
```

### HTTPS not working
```bash
# Check SSL certificates
ls -la nginx/certbot/conf/live/reha-advisor.ch/

# Verify NGINX config
docker exec nginx-prod nginx -t

# Restart NGINX
docker restart nginx-prod
```

### Database connection fails
```bash
# Check MongoDB status
docker logs db-prod | tail -20

# Verify credentials in .env.prod
grep MONGODB .env.prod

# Restart database
docker restart db-prod
```

### Out of memory
```bash
# Check resource usage
docker stats

# Restart service consuming too much
docker restart django-prod

# Check for memory leaks in logs
make prod_logs_django | grep -i "memory\|leak"
```

## Performance Tuning

### Increase Celery Workers
Edit `docker-compose.prod.reha-advisor.yml`:
```yaml
services:
  celery-prod:
    command: celery -A api worker --loglevel=info -c 8  # Change from 4 to 8
```

Then: `make build_prod && make prod_restart`

### Enable Caching
Check Redis is running:
```bash
docker exec redis-prod redis-cli ping
# Should return: PONG
```

### Database Optimization
```bash
make prod_shell_mongo
> db.users.getIndexes()
> db.patients.getIndexes()
```

## Security Checklist

- [ ] Change admin password immediately
- [ ] Enable two-factor authentication
- [ ] Configure firewall (only allow 80, 443, 22)
- [ ] Set strong SECRET_KEY in .env.prod
- [ ] Review ALLOWED_HOSTS in .env.prod
- [ ] Enable email notifications
- [ ] Schedule regular backups
- [ ] Monitor logs for suspicious activity
- [ ] Keep Docker images updated
- [ ] Review database permissions

## Monitoring Dashboard

Access monitoring and logs:

```bash
# Real-time logs
tail -f /opt/reha-advisor/logs/*.log

# Container metrics
docker stats

# System metrics
free -h  # Memory
df -h /opt/reha-advisor  # Disk
top  # CPU
```

## When Things Break

### Complete Service Restart
```bash
# Stop all services
make prod_down

# Remove volumes (CAUTION - data loss!)
# Only if absolutely necessary:
# docker volume rm telereha-prod_mongo_data_prod

# Start fresh
make prod_up
make prod_migrate
```

### Database Recovery from Backup
```bash
# List available backups
ls -lh /opt/reha-advisor/backups/

# Restore from backup
./scripts/restore.sh /opt/reha-advisor/backups/mongodb_YYYYMMDD_HHMMSS.archive
```

### Emergency Contact
If services are down and you need help:
1. Check logs: `make prod_logs`
2. Try restart: `make prod_restart`
3. Review [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)
4. Contact support team

## Next Steps

1. ✅ Deployment complete!
2. 📋 Review [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) for detailed guide
3. 📊 Set up monitoring with [health-check.sh](../scripts/health-check.sh)
4. 💾 Configure automated backups with [backup.sh](../scripts/backup.sh)
5. 👥 Train team on operational procedures
6. 📚 Read [Architecture Guide](../docs/02-ARCHITECTURE.md)
7. 🔒 Review [Security Guide](../docs/10-SECURITY_BEST_PRACTICES.md)

---

**Estimated Time:** 30 minutes
**Difficulty:** Intermediate
**Support:** See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)

For detailed information on each component, see the complete documentation in `/docs/`
