# Frequently Asked Questions (FAQ)

## Development & Setup

### Q: How do I set up the development environment?
A: Follow the [Getting Started Guide](./01-GETTING_STARTED.md). Quick start:
```bash
git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git
cd RehaAdvisor
make build_dev
make dev_up
```
Access frontend at http://localhost:3001 and backend at http://localhost:8001

### Q: What are the system requirements?
A: 
- Docker and Docker Compose
- 4GB RAM minimum (8GB recommended)
- 10GB free disk space
- Linux, macOS, or Windows (with WSL2)

### Q: Can I run RehaAdvisor without Docker?
A: Technically yes, but it's not recommended. Docker ensures consistency and ease of setup. If you need to run locally without Docker:
- Install Python 3.9+
- Install Node.js 16+
- Install MongoDB 8.0.3
- Follow manual setup in [Getting Started Guide](./01-GETTING_STARTED.md)

### Q: How do I reset the database to initial state?
A:
```bash
make dev_down
docker volume rm rehaadvisor_mongo_data
make build_dev
make dev_up
```
This removes all data, so use carefully!

### Q: How do I access MongoDB directly?
A:
```bash
docker exec -it telerehabapp-db-1 mongosh
use rehaadvisor
db.users.find()  # View users collection
```

## Deployment

### Q: What's the difference between development and production builds?
A: 
- **Development**: Hot reload enabled, debug info included, minimal optimization
- **Production**: Fully optimized, debug disabled, minified code, SSL/TLS required

### Q: How do I deploy to production?
A: Follow [Deployment Guide](./06-DEPLOYMENT_GUIDE.md). Options include:
- Docker Compose on single server
- Kubernetes clusters
- Cloud platforms (Heroku, AWS, Google Cloud)

### Q: What SSL/TLS certificate should I use?
A: Use Let's Encrypt (free) for production:
```bash
sudo certbot certonly --standalone -d yourdomain.com
```
Then configure in NGINX to point to certificates.

### Q: How do I handle database migrations in production?
A:
```bash
# Backup first
docker exec mongodb mongodump --archive=/backup/db.archive

# Run migrations
docker exec django python manage.py migrate

# Verify
docker exec django python manage.py showmigrations
```

## Frontend Development

### Q: How do I add a new page/route?
A:
1. Create component in `src/pages/MyNewPage.tsx`
2. Add route in `src/routes/Routes.tsx`:
```typescript
{ path: '/my-new-page', element: <MyNewPage /> }
```
3. Add navigation link in navigation component

### Q: How do I use MobX stores in components?
A:
```typescript
import { observer } from 'mobx-react-lite';
import { myStore } from '../stores/myStore';

export const MyComponent = observer(() => {
  return <div>{myStore.someValue}</div>;
});
```
Remember to use `observer` HOC to make component reactive.

### Q: How do I make API calls?
A:
```typescript
import { api } from '../api/axios';

async function fetchData() {
  try {
    const response = await api.get('/endpoint/');
    return response.data;
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Q: How do I add authentication to a component?
A:
```typescript
import { authStore } from '../stores/authStore';

export const ProtectedComponent = () => {
  if (!authStore.token) {
    return <Redirect to="/login" />;
  }
  return <YourComponent />;
};
```

### Q: How do I add internationalization (i18n)?
A:
1. Add translation to `src/assets/lang/en.json`:
```json
{
  "common": {
    "hello": "Hello"
  }
}
```
2. Use in component:
```typescript
import { useTranslation } from 'i18next';

const { t } = useTranslation();
return <h1>{t('common.hello')}</h1>;
```

### Q: How do I test components?
A:
```bash
npm test  # Run all tests
npm test -- MyComponent.test.tsx  # Run specific test
npm test -- --coverage  # Generate coverage report
```

## Backend Development

### Q: How do I create a new API endpoint?
A:
1. Create model in `core/models.py`
2. Create serializer in `api/serializers.py`
3. Create viewset in `api/views.py`:
```python
class MyModelViewSet(viewsets.ModelViewSet):
    queryset = MyModel.objects.all()
    serializer_class = MyModelSerializer
```
4. Register in `api/urls.py`:
```python
router.register(r'mymodel', MyModelViewSet)
```

### Q: How do I add authentication to an endpoint?
A:
```python
from rest_framework.permissions import IsAuthenticated

class MyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
```

### Q: How do I add custom permissions?
A:
```python
from rest_framework import permissions

class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user
```
Then use: `permission_classes = [IsOwner]`

### Q: How do I test an endpoint?
A:
```bash
pytest tests/test_api.py  # Run API tests
pytest tests/test_api.py::TestPatient::test_list  # Specific test
pytest --cov=api  # With coverage
```

### Q: How do I add validation to a model?
A:
```python
from django.core.validators import MinValueValidator

class MyModel(models.Model):
    age = models.IntegerField(validators=[MinValueValidator(0)])
    
    def clean(self):
        if self.age > 150:
            raise ValidationError('Age must be less than 150')
```

### Q: How do I handle async tasks?
A: Use Celery:
```python
from celery import shared_task

@shared_task
def send_email(recipient):
    # Long running task
    send_mail(...)
    return 'Email sent'

# In view:
send_email.delay(recipient_email)
```

## Database

### Q: How do I backup the database?
A:
```bash
# Backup
docker exec mongodb mongodump --archive=/backup/db.archive

# Restore
docker exec mongodb mongorestore --archive=/backup/db.archive
```

### Q: How do I add an index to improve query performance?
A:
```python
class MyModel(Document):
    email = StringField(unique=True)  # Creates index
    
    meta = {
        'indexes': ['email', ('-created_at', 'user_id')]
    }
```

### Q: How do I migrate data between collections?
A:
```python
from mongoengine import Document

# In Django shell
from core.models import OldModel, NewModel

for old_obj in OldModel.objects:
    NewModel.objects.create(
        field=old_obj.field,
        ...
    )
```

### Q: What's the MongoDB connection string format?
A:
- **Local**: `mongodb://localhost:27017/`
- **With auth**: `mongodb://user:password@host:27017/`
- **Atlas**: `mongodb+srv://user:password@cluster.mongodb.net/`

### Q: How do I handle transactions in MongoDB?
A:
```python
from pymongo import MongoClient

client = MongoClient()
with client.start_session() as session:
    with session.start_transaction():
        collection.insert_one({...}, session=session)
        collection.update_one({...}, session=session)
```

## Troubleshooting

### Q: My containers won't start. What do I do?
A:
```bash
# Check logs
docker compose logs -f

# Check if ports are in use
lsof -i :3001
lsof -i :8001

# Rebuild
make build_dev

# Full reset
docker compose down -v
make build_dev
```
See [Troubleshooting Guide](./08-TROUBLESHOOTING.md) for more details.

### Q: I'm getting CORS errors. How do I fix this?
A: Update `CORS_ALLOWED_ORIGINS` in `.env`:
```bash
CORS_ALLOWED_ORIGINS=http://localhost:3001,http://localhost:8001
```

### Q: Tests are failing. What should I do?
A:
```bash
# Run with verbose output
pytest -v

# Run specific test
pytest tests/test_file.py::test_name

# Clear cache
pytest --cache-clear
```

### Q: Hot reload isn't working. How do I fix this?
A:
```bash
# Increase file watcher limit (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Restart container
docker compose restart react
```

### Q: I forgot my admin password. How do I reset it?
A:
```bash
docker exec -it <django-container> python manage.py changepassword admin
```

## Performance

### Q: How do I improve API response times?
A:
- Add database indexes
- Implement caching (Redis)
- Use pagination for large datasets
- Optimize queries with select_related/prefetch_related
- Implement rate limiting

### Q: How do I check what's slowing down the application?
A:
- Use Django Debug Toolbar (dev only)
- Check database query logs
- Monitor with `docker stats`
- Profile code with Python profilers

### Q: How do I optimize database queries?
A:
- Use `select_related()` for ForeignKey
- Use `prefetch_related()` for reverse relations
- Create indexes on frequently queried fields
- Avoid N+1 query problems
- Use aggregation pipelines for complex queries

## Security

### Q: How secure is RehaAdvisor?
A: RehaAdvisor includes:
- JWT-based authentication
- Role-based access control (RBAC)
- HTTPS/SSL support
- Input validation
- CSRF protection
- Secure password hashing (bcrypt)

### Q: How should I handle sensitive data?
A:
- Use environment variables for secrets (never commit)
- Enable HTTPS in production
- Use strong passwords
- Implement regular backups
- Follow HIPAA compliance if handling medical data

### Q: How often should I update dependencies?
A: Regularly check for security updates:
```bash
# Frontend
npm audit
npm update

# Backend
pip install --upgrade <package>
```

## General

### Q: Where can I find more documentation?
A: See [Technical Documentation](./README.md) for comprehensive guides.

### Q: How do I contribute to the project?
A: Follow [Contributing Guidelines](./12-CONTRIBUTING.md).

### Q: How do I report a bug?
A:
1. Check [Troubleshooting Guide](./08-TROUBLESHOOTING.md)
2. Check existing GitHub issues
3. Create new GitHub issue with:
   - Description of bug
   - Steps to reproduce
   - Expected vs actual behavior
   - System info (OS, Docker version, etc.)
   - Screenshots if applicable

### Q: How do I request a feature?
A:
1. Check if feature already exists
2. Create GitHub issue labeled "feature-request"
3. Describe use case and expected behavior
4. Provide any mockups or examples

### Q: What's the project license?
A: Check LICENSE file in repository root.

### Q: How can I get commercial support?
A: Contact: support@yourdomain.com or visit project repository.

---

**Still have questions?** Check:
- [Getting Started](./01-GETTING_STARTED.md)
- [Troubleshooting Guide](./08-TROUBLESHOOTING.md)
- [API Documentation](./09-API_DOCUMENTATION.md)
- [User Guide](./10-USER_GUIDE.md)
