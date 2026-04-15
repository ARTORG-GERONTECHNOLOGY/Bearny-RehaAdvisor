# Troubleshooting Guide

## Common Issues and Solutions

### Authentication / Session Issues

#### Issue: Users are randomly logged out without clicking "Log out"

**Symptoms:**
- User is redirected to the login page mid-session with no action
- Happens after the app has been in a background tab, on mobile, or when multiple tabs are open
- No visible error message

**Root causes and fixes (all resolved as of `bug-log-out` branch):**

| Cause | Trigger | Fix |
|---|---|---|
| Refresh-token race condition | Multiple API calls fire simultaneously; both get 401; both try to rotate the refresh token; the second one hits a blacklisted token | Refresh queue in `client.js` — only one refresh runs at a time |
| Stale `expiresAt` on reload | Mobile OS suspends JS timers; device clock jumps; hard page reload after idle | `checkAuthentication()` now attempts a silent refresh before logging out |
| Corrupted `expiresAt` | Browser crash, storage quota exceeded, bug writing non-numeric value | `_armTimeoutFromStorage()` now attempts a silent refresh instead of immediate logout |

**Token lifetime configuration** (`backend/api/settings/base.py`):

```python
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=5),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}
```

Frontend inactivity timeout: **15 minutes** (`authStore.sessionTimeout`).

**Diagnosing a spurious logout:**

1. Open browser DevTools → Application → Local Storage
2. After the logout, check whether `authToken` and `refreshToken` were both cleared (race condition) or only `authToken` (interceptor cleared it without a refresh failure)
3. Check the network tab for a `POST /auth/token/refresh/` call — a 401 response there confirms the race condition
4. Check the console for `🔒 Token refresh failed:` — that is the interceptor logging the failure

**If the issue reappears:**
- Confirm `_isRefreshing` is exported and visible in `client.js`
- Confirm `_trySilentRefresh()` is calling `axios.post` (not `apiClient.post`) — using `apiClient` would re-enter the interceptor and cause an infinite loop

---

#### Issue: Logged out immediately after page reload

**Symptoms:** User is logged out every time the page is refreshed, even within the 15-minute inactivity window.

**Cause:** `expiresAt` in `localStorage` was already in the past at the time of reload. This happens when:
- The page was left open and inactive for slightly longer than 15 minutes
- The device clock changed while the tab was backgrounded

**Fix:** The silent-refresh path in `checkAuthentication()` handles this — as long as the refresh token (valid for 24 h) has not expired, the session is silently renewed on reload.

If this still happens after the fix: check that `localStorage.refreshToken` is present before reloading. If it is absent, the session has genuinely expired.

---

### REDCap Access and Import Issues

#### Issue: REDCap import modal shows an error instead of candidates

**Symptom:** Refreshing the candidate list shows an error such as:
```
COPAIN: REDCap API returned non-200. | COMPASS: REDCap API returned non-200.
```

**Cause:** The minimal REDCap export (`GET /api/redcap/available-patients/`) failed for one or more projects. Common reasons:

| Error detail | Cause | Fix |
|---|---|---|
| `"fields" are not valid: 'pat_id'` | The project (e.g. COMPASS) does not have a `pat_id` field. | Resolved automatically — the backend retries without invalid fields. Ensure the latest backend code is running. |
| `401 Unauthorized` | The REDCap token for the project is missing or expired. | Check `REDCAP_TOKEN_COPAIN` / `REDCAP_TOKEN_COMPASS` env vars in `.env.dev` or `.env.prod` and restart the `django` container. |
| `403 Forbidden` | The token exists but the REDCap project is not accessible with it. | Verify the token in REDCap → API → generate token. |

Partial failures return HTTP 200 with an `errors[]` array alongside any successful `candidates[]`. The modal will show both.

---

#### Issue: Therapist can see patients from another study at the same clinic

**Symptom:** A therapist assigned to COPAIN at Inselspital can see COMPASS patients (or vice versa) in the patient list.

**Cause:** The `Patient` document is missing a `project` field, or the `project` field does not match the therapist's assigned projects.

**How filtering works:**
- `list_therapist_patients` filters `patient.clinic in therapist.clinics` **and** `patient.project in therapist.projects` (when projects are assigned).
- REDCap-imported patients get `project` set to the REDCap project name at import time.
- Manually created patients must have `project` set explicitly.

**Fix for already-imported patients missing `project`:**

```python
# Django shell — update a specific patient
from core.models import Patient
p = Patient.objects.get(patient_code="905-2")
p.project = "COMPASS"
p.clinic = "Bern"   # correct clinic for this patient's DAG
p.save()
```

---

#### Issue: REDCap import modal shows candidates from clinics the therapist doesn't have access to

**Symptom:** The import modal shows records from DAGs (e.g. `leuven`, `lumezzane`) that the therapist's clinic list does not include.

**Cause:** The `clinic_dag` mapping in `config.json` may be missing or the clinic name may not exactly match the application's `therapistInfo.clinic_projects` list.

**Fix:** Check `backend/config.json` → `therapistInfo.clinic_dag`. Each clinic name must exactly match a key in `clinic_projects`, and the value must match the REDCap DAG name (lowercase, underscores). Example:

```json
"clinic_dag": {
  "Lumezzane": "lumezzane",
  "Leuven": "leuven"
}
```

If a DAG mapping is missing, the clinic is not included in the allowed set and records from that DAG will be filtered out. This is the safe default — add the mapping to grant access.

---

#### Issue: Imported patient is visible to the wrong therapist

**Symptom:** After import, a COMPASS patient at Bern appears in the list for a therapist who only has COPAIN access.

**Cause:** The patient's `clinic` or `project` field was not set correctly at import time (possible with the old import code).

**Diagnosis:**

```python
from core.models import Patient
p = Patient.objects.get(patient_code="905-2")
print(p.clinic, p.project)  # expect "Bern" and "COMPASS"
```

**Fix:** Update the patient record (see above). Future imports automatically derive `clinic` from the patient's REDCap DAG via the `clinic_dag` mapping.

---

### Intervention Import Issues

#### Issue: Excel import always fails with "Invalid file type"

**Symptom:** Uploading an `.xlsx` or `.xlsm` file returns a 400 error: `"Invalid file type. Only .xlsx or .xlsm are allowed."`

**Cause:** The file was saved or exported with a `.csv` extension even though it contains valid xlsx binary data (common when downloading from certain tools).

**Fix (resolved):** The backend now reads the first 4 bytes of the upload. Any file whose content starts with `PK\x03\x04` (the ZIP/xlsx magic bytes) is accepted regardless of extension. The frontend file picker also accepts `.csv` files for this reason.

If the error persists: confirm the file actually opens in Excel. If it is a genuine CSV (comma-separated text), it cannot be used — the import requires an Excel workbook.

---

#### Issue: Import succeeds but creates 0 rows (`created: 0, updated: 0, skipped: N`)

**Most common cause:** The sheet name does not match the default `"Content"`. The backend will raise a 500 error: `"Sheet 'Content' not found. Sheets: ['YourSheetName']"`.

**Fix:** Set the **Sheet name** field in the Import modal to the exact sheet name shown in the error, e.g. `MKS_Upload_links`.

Other causes:
- All data rows have an empty `intervention_id` cell → every row is counted as `skipped`.
- The `intervention_id` column header is not recognised — check it matches one of: `intervention_id`, `intervention id`, `id`.

---

#### Issue: Every row fails with `Field 'input_from': StringField only accepts string values`

**Cause (resolved):** An older version of the import code passed a Python list to the `input_from` field, which is a `StringField` on the `Intervention` model. The fix joins the parsed list to a comma-separated string before saving.

If this appears in a new deployment, ensure the latest `intervention_import.py` is running (restart the `django` container after a code update).

---

#### Issue: Import succeeds but taxonomy warnings on every row (`"X is not a valid topic"`)

**Cause:** A value in the Excel file doesn't exactly match any entry in the taxonomy (case-sensitive, including spelling). Common mismatches:

| Excel value | Expected taxonomy value |
|---|---|
| `ageing` | `ageing` ✓ (old files may have `ageing / geriatrics` — also accepted as an alias) |
| `text` or `image` | `brochure` / `graphics` (old files — accepted as aliases, no warning) |
| `hip fracture` | `hip Fracture` (capital F required) |

Warnings are non-fatal — the row is still imported with the invalid field left empty. To eliminate warnings, either update the Excel values to match the taxonomy exactly, or add the new value to `interventions.json` (both `backend/` and `frontend/src/config/` copies must be kept in sync).

---

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
