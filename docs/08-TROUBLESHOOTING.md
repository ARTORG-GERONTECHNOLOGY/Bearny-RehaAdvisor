# Troubleshooting Guide

## Common Issues and Solutions

### Development Environment Issues

#### Issue: Docker containers not starting

**Symptoms**: Containers exit immediately or services are unavailable

**Solutions**:

```bash
# Check Docker daemon is running
sudo systemctl status docker

# Check container logs
docker compose logs <service-name>

# View detailed error
docker compose -f docker-compose.dev.yml up (without -d flag)

# Rebuild containers without cache
make build_dev --no-cache

# Remove volumes and rebuild
docker compose down -v
make build_dev
make dev_up
```

#### Issue: Port already in use

**Symptoms**: "Address already in use" or "Port X is already allocated"

**Solutions**:

```bash
# Find process using port
lsof -i :<port_number>
# or
sudo netstat -tulpn | grep :<port_number>

# Kill process
kill -9 <PID>
# or
sudo fuser -k <port_number>/tcp

# Change port in docker-compose.yml
# ports:
#   - "3002:3000"  # Changed from 3001
```

#### Issue: Database connection errors

**Symptoms**: "MongoDB connection refused" or "Cannot connect to database"

**Solutions**:

```bash
# Check if MongoDB container is running
docker ps | grep mongo

# Check MongoDB logs
docker compose logs db

# Verify MongoDB is accessible
docker exec -it <mongo-container-name> mongosh

# Check network connectivity
docker network ls
docker network inspect <network-name>

# Restart database service
docker compose restart db

# Reset MongoDB data (caution: data will be lost)
docker compose down -v
docker compose up -d db
```

#### Issue: Frontend API calls failing

**Symptoms**: 404 errors, CORS errors, or failed API requests

**Solutions**:

```bash
# Check VITE_API_URL environment variable
cat frontend/.env

# Verify backend is running
curl http://localhost:8001/api/

# Check CORS configuration
# Ensure frontend URL is in CORS_ALLOWED_ORIGINS

# Check browser console for specific error messages
# DevTools → Console tab

# Clear browser cache and cookies
# DevTools → Application → Clear site data
```

#### Issue: Hot reload not working

**Symptoms**: Changes to code don't reflect automatically

**Solutions**:

```bash
# Check file watcher limits (Linux)
cat /proc/sys/fs/inotify/max_user_watches

# Increase limit
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Restart frontend container
docker compose restart react

# Check frontend logs
docker compose logs -f react
```

### Backend Issues

#### Issue: Django migrations failing

**Symptoms**: "No such table" errors or migration conflicts

**Solutions**:

```bash
# Check migration status
docker exec <django-container> python manage.py showmigrations

# Apply migrations
docker exec <django-container> python manage.py migrate

# Create missing migrations
docker exec <django-container> python manage.py makemigrations

# Rollback migrations
docker exec <django-container> python manage.py migrate <app_name> <migration_number>

# Reset app migrations (development only)
docker exec <django-container> python manage.py migrate <app_name> zero
```

#### Issue: Django admin not accessible

**Symptoms**: "Not Found" or authentication errors at /admin/

**Solutions**:

```bash
# Create superuser
docker exec -it <django-container> python manage.py createsuperuser

# Reset superuser password
docker exec -it <django-container> python manage.py changepassword username

# Collect static files
docker exec <django-container> python manage.py collectstatic --noinput

# Check Django logs
docker compose logs django
```

#### Issue: Tests failing

**Symptoms**: Test errors when running `pytest`

**Solutions**:

```bash
# Run tests with verbose output
docker exec <django-container> pytest -v

# Run specific test file
docker exec <django-container> pytest tests/test_models.py -v

# Run tests with coverage
docker exec <django-container> pytest --cov=api --cov=core

# Show print statements
docker exec <django-container> pytest -s

# Stop on first failure
docker exec <django-container> pytest -x
```

#### Issue: Celery tasks not processing

**Symptoms**: Tasks queued but not executed, Celery worker not running

**Solutions**:

```bash
# Check if Celery worker is running
docker ps | grep celery

# Start Celery worker
docker compose exec django celery -A config worker -l info

# Check Celery logs
docker compose logs celery

# Verify Redis connection
docker exec <redis-container> redis-cli ping

# Inspect task queue
docker exec <redis-container> redis-cli KEYS "*"

# Purge all tasks (caution: deletes queued tasks)
docker exec <redis-container> redis-cli FLUSHDB
```

### Frontend Issues

#### Issue: npm install fails

**Symptoms**: "Module not found" or installation errors

**Solutions**:

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall dependencies
npm install

# Check for dependency conflicts
npm audit

# Fix vulnerabilities
npm audit fix
```

#### Issue: Build fails

**Symptoms**: "Build error" or compilation errors

**Solutions**:

```bash
# Check build output
npm run build

# Clear build cache
rm -rf dist/

# Check for TypeScript errors
npx tsc --noEmit

# Lint code for errors
npm run lint

# Fix linting issues
npm run lint -- --fix
```

#### Issue: Tests not running

**Symptoms**: Jest fails to start or tests don't execute

**Solutions**:

```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- __tests__/components/Button.test.tsx

# Update Jest snapshots
npm test -- --updateSnapshot

# Clear Jest cache
npm test -- --clearCache

# Run tests in watch mode
npm test -- --watch
```

### Docker-Related Issues

#### Issue: Docker image build fails

**Symptoms**: "Build error" or "Failed to build image"

**Solutions**:

```bash
# View detailed build logs
docker compose build --verbose

# Build specific service
docker compose build django

# Remove dangling images
docker image prune

# Build without cache
docker compose build --no-cache

# Check Docker disk usage
docker system df

# Clean up unused resources
docker system prune -a
```

#### Issue: Out of disk space

**Symptoms**: "No space left on device" errors

**Solutions**:

```bash
# Check disk usage
docker system df

# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune

# Remove all stopped containers
docker container prune

# Deep cleanup (caution: removes everything unused)
docker system prune -a --volumes
```

#### Issue: Docker daemon not responding

**Symptoms**: "Cannot connect to Docker daemon" errors

**Solutions**:

```bash
# Check Docker service status
sudo systemctl status docker

# Start Docker daemon
sudo systemctl start docker

# Restart Docker daemon
sudo systemctl restart docker

# Check Docker logs (Linux)
journalctl -u docker.service -n 50

# On macOS, restart Docker Desktop
# Applications → Docker.app → Quit
# Then reopen Docker.app
```

### Network Issues

#### Issue: Containers can't communicate

**Symptoms**: Connection refused, host unreachable errors

**Solutions**:

```bash
# Check network
docker network ls

# Inspect network
docker network inspect <network-name>

# Test connectivity between containers
docker exec <container1> ping <container2-name>

# Check service DNS resolution
docker exec <container> nslookup <service-name>

# Verify exposed ports
docker port <container>

# Check firewall rules (Linux)
sudo iptables -L -n
```

#### Issue: SSL/TLS certificate errors

**Symptoms**: "Certificate verification failed" or "NET::ERR_CERT_AUTHORITY_INVALID"

**Solutions**:

```bash
# For development, trust self-signed certificates
# Or configure Django to allow HTTP

# Check certificate validity
openssl x509 -in /path/to/cert.pem -text -noout

# For Let's Encrypt, verify certificate
sudo certbot certificates

# Renew certificate
sudo certbot renew --dry-run

# Update NGINX configuration
# Ensure ssl_certificate and ssl_certificate_key point to correct files
```

### Performance Issues

#### Issue: Application running slowly

**Symptoms**: Slow response times, high latency

**Solutions**:

```bash
# Check resource usage
docker stats

# View container logs for errors
docker compose logs

# Check database performance
docker exec <mongo-container> mongosh
db.system.profile.find().sort({ts: -1}).limit(5)

# Check for slow queries (Django)
# Enable Django debug toolbar

# Optimize database queries
# Add indexes to frequently queried fields

# Check NGINX proxy settings
cat nginx/conf/nginx.conf
```

#### Issue: High memory usage

**Symptoms**: Docker containers consuming excessive memory

**Solutions**:

```bash
# View memory usage
docker stats

# Set memory limits
docker update --memory 1g <container>

# Check for memory leaks
# Monitor memory over time with `docker stats`

# Restart container
docker compose restart <service>

# Increase Docker memory allocation (macOS/Windows)
# Docker Desktop Settings → Resources → Memory
```

### Database Issues

#### Issue: MongoDB connection pool exhausted

**Symptoms**: "Cannot connect to database" after many requests

**Solutions**:

```bash
# Check MongoDB connection limit
docker exec <mongo-container> mongosh
db.adminCommand({serverStatus: 1}).connections

# Adjust connection pool size in Django settings
DATABASES = {
    'default': {
        'ENGINE': 'djongo',
        'CLIENT': {
            'maxPoolSize': 50,
            'minPoolSize': 10,
        }
    }
}

# Restart MongoDB
docker compose restart db
```

#### Issue: MongoDB data corruption

**Symptoms**: Unable to read data, database errors

**Solutions**:

```bash
# Check database integrity
docker exec <mongo-container> mongosh
db.adminCommand({repairDatabase: 1})

# Restore from backup
mongorestore --archive=/backup/db.archive

# Rebuild indexes
docker exec <mongo-container> mongosh
db.collection.reIndex()
```

## Debugging Tips

### Enable Debug Mode

```python
# backend/config/settings/development.py
DEBUG = True
DEBUG_TOOLBAR = True  # Django Debug Toolbar

# Add logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'DEBUG',
    },
}
```

### Browser Developer Tools

```bash
# View network requests
DevTools → Network → Monitor API calls

# Check console for JavaScript errors
DevTools → Console → View error messages

# Inspect elements and styles
DevTools → Elements → Inspect components

# View application data
DevTools → Application → LocalStorage, SessionStorage, Cookies
```

### Logging Best Practices

```python
import logging

logger = logging.getLogger(__name__)

# Log at appropriate levels
logger.debug("Debug information")
logger.info("General information")
logger.warning("Warning messages")
logger.error("Error messages")
logger.critical("Critical errors")

# Include context
logger.error(f"Failed to create user: {email}", exc_info=True)
```

## Getting Help

1. **Check Logs First**:
   ```bash
   docker compose logs -f <service>
   ```

2. **Search Documentation**:
   - Check the specific guide for your issue
   - Search [FAQ](./11-FAQ.md)

3. **Check Dependencies**:
   - Verify all services are running: `docker compose ps`
   - Test network connectivity

4. **Report Issues**:
   - Include error logs
   - Describe steps to reproduce
   - Include environment details (OS, Docker version, etc.)

---

**Related Documentation**:
- [Getting Started](./01-GETTING_STARTED.md)
- [FAQ](./11-FAQ.md)
- [Environment Configuration](./07-ENVIRONMENT_CONFIG.md)
