# RehaAdvisor Production Scripts

This directory contains utility scripts for managing the RehaAdvisor production environment at reha-advisor.ch.

## Available Scripts

### 1. `backup.sh` - Database Backup
Creates compressed backups of the MongoDB database with optional cloud upload.

**Usage:**
```bash
# Create local backup
./scripts/backup.sh

# Create backup and upload to S3
./scripts/backup.sh --upload-s3 --s3-bucket my-backup-bucket
```

**Features:**
- Automated gzip compression
- Backup metadata tracking
- Automatic cleanup of old backups (30 days retention)
- Optional AWS S3 upload
- Detailed logging

**Cron Setup:**
```bash
# Daily backup at 2 AM
0 2 * * * cd /opt/reha-advisor && ./scripts/backup.sh

# Daily backup at 2 AM with S3 upload
0 2 * * * cd /opt/reha-advisor && ./scripts/backup.sh --upload-s3 --s3-bucket reha-advisor-backups
```

**Output:**
```
=== RehaAdvisor Database Backup ===
Timestamp: 2024-02-17T14:30:45+00:00
Backup File: /opt/reha-advisor/backups/mongodb_20240217_143045.archive
✓ Backup created successfully
  Size: 125M
```

---

### 2. `restore.sh` - Database Restore
Restores a backup created by backup.sh with confirmation prompts.

**Usage:**
```bash
# Interactive restore (shows available backups)
./scripts/restore.sh

# Restore specific backup
./scripts/restore.sh /opt/reha-advisor/backups/mongodb_20240217_143045.archive
```

**Features:**
- List available backups
- Interactive selection
- Confirmation prompt for safety
- Restore verification
- Collection and document count reporting

**Example Output:**
```
=== RehaAdvisor Database Restore ===
Available backups:
1	/opt/reha-advisor/backups/mongodb_20240217_143045.archive
2	/opt/reha-advisor/backups/mongodb_20240217_020045.archive

Enter backup file name or number: 1
⚠️  WARNING: This will overwrite the current database!
Are you sure you want to restore from this backup? Type 'yes' to confirm: yes

✓ Restore completed successfully
Collections in restored database:
[ "users", "patients", "sessions", "assessments", "feedback" ]

Document counts:
users: 42
patients: 156
sessions: 1203
```

---

### 3. `init-db.sh` - Database Initialization
Initializes MongoDB with schema validation, collections, and indexes after first deployment.

**Usage:**
```bash
./scripts/init-db.sh
```

**Features:**
- Creates required collections with schema validation
- Sets up performance indexes
- Creates admin user
- Validates MongoDB connectivity
- Detailed initialization logging

**Collections Created:**
- `users` - User accounts and profiles
- `patients` - Patient records
- `sessions` - Therapy sessions
- `therapies` - Available therapies
- `assessments` - Patient assessments
- `feedback` - User feedback

**Indexes Created:**
- Unique email index on users
- Foreign key indexes (therapist_id, patient_id, user_id)
- Query optimization indexes (status, created_at, etc.)

**Example Output:**
```
=== RehaAdvisor MongoDB Initialization ===
Waiting for MongoDB to be ready...
✓ MongoDB is ready
Creating collections...
✓ users collection created
✓ patients collection created
✓ sessions collection created
✓ assessments collection created
✓ feedback collection created

Creating indexes...
✓ users indexes created
✓ patients indexes created
✓ sessions indexes created
✓ assessments indexes created
✓ feedback indexes created

=== Database initialization complete ===
```

---

### 4. `health-check.sh` - Service Health Monitor
Comprehensive health check for all services with optional Slack notifications.

**Usage:**
```bash
# Basic health check
./scripts/health-check.sh

# Detailed check with resource usage
./scripts/health-check.sh --detailed

# Health check with Slack notifications
./scripts/health-check.sh --slack-webhook https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Features:**
- Container status verification
- HTTP/HTTPS endpoint testing
- Resource usage monitoring (with --detailed)
- Slack notifications
- Detailed logging
- Exit codes for monitoring systems

**Services Checked:**
- Docker daemon
- LibreTranslate
- MongoDB
- Redis
- Django Backend
- Celery Worker
- Celery Beat
- React Frontend
- NGINX Proxy
- HTTPS/HTTP endpoints

**Cron Setup:**
```bash
# Health check every 5 minutes
*/5 * * * * cd /opt/reha-advisor && ./scripts/health-check.sh --slack-webhook https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Example Output:**
```
=== RehaAdvisor Health Check ===
Domain: reha-advisor.ch
Timestamp: 2024-02-17T14:35:22+00:00

Docker Status:
✓ Docker daemon is running

Container Status:
✓ LibreTranslate: Running
✓ MongoDB: Healthy
✓ Redis: Healthy
✓ Django Backend: Healthy
✓ Celery Worker: Running
✓ Celery Beat: Running
✓ React Frontend: Running
✓ NGINX: Running

HTTP/HTTPS Endpoints:
✓ HTTPS Health: OK
✓ API Health: OK
✓ Frontend: OK

=== Summary ===
Services OK: 12

Status: HEALTHY
```

---

## Integration with Makefile

All scripts can be run via the Makefile:

```bash
# Production commands
make prod_backup              # Run backup script
make prod_migrate             # Initialize database
make prod_health              # Run health check
make prod_logs                # View all logs
make prod_logs_django         # View Django logs
make prod_shell_django        # Access Django shell
```

---

## Production Deployment Workflow

1. **Initial Setup:**
   ```bash
   make build_prod
   make prod_up
   make prod_migrate
   ```

2. **Database Initialization:**
   ```bash
   ./scripts/init-db.sh
   make prod_superuser
   ```

3. **Verify Health:**
   ```bash
   ./scripts/health-check.sh --detailed
   ```

4. **Schedule Backups:**
   ```bash
   # Add cron jobs for backup and health checks
   (crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/reha-advisor && ./scripts/backup.sh") | crontab -
   (crontab -l 2>/dev/null; echo "*/5 * * * * cd /opt/reha-advisor && ./scripts/health-check.sh") | crontab -
   ```

---

## Troubleshooting

### Backup script fails
```bash
# Check if MongoDB is running
docker ps | grep db-prod

# Check MongoDB logs
docker logs db-prod

# Verify disk space
df -h /opt/reha-advisor
```

### Restore fails
```bash
# Check if backup file exists
ls -lh /opt/reha-advisor/backups/

# Verify MongoDB connectivity
docker exec db-prod mongosh --eval 'db.adminCommand("ping")'

# Check MongoDB logs
docker logs db-prod
```

### Health check reports failures
```bash
# Check individual service logs
make prod_logs_django
make prod_logs_nginx

# Check Docker resources
docker stats

# Run detailed health check
./scripts/health-check.sh --detailed
```

---

## Best Practices

1. **Backups:**
   - Run daily backups at low-traffic hours
   - Test restores monthly
   - Store backups off-site
   - Monitor backup size trends

2. **Health Checks:**
   - Run every 5 minutes in production
   - Enable Slack notifications
   - Monitor check logs
   - Alert on consecutive failures

3. **Database:**
   - Keep indexes optimized
   - Monitor collection sizes
   - Archive old data regularly
   - Validate data integrity monthly

4. **Monitoring:**
   - Track response times
   - Monitor error rates
   - Review security logs
   - Track resource usage

---

## Support

For issues or questions:
1. Review [PRODUCTION_DEPLOYMENT.md](../docs/deployment/PRODUCTION_DEPLOYMENT.md)
2. Check [Troubleshooting Guide](../docs/08-TROUBLESHOOTING.md)
3. Review script logs in `/opt/reha-advisor/logs/`
4. Contact support team

---

**Last Updated:** February 17, 2024
**Version:** 1.0
