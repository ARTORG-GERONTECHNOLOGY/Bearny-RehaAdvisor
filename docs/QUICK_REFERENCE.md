# Quick Reference Guide

## Documentation Structure

This quick reference helps you find the information you need quickly.

### For Different Roles

#### 👨‍💻 **Developers**
- **New to the project?** → [Getting Started](./01-GETTING_STARTED.md)
- **Understanding the system?** → [Architecture](./02-ARCHITECTURE.md)
- **Working on frontend?** → [Frontend Guide](./03-FRONTEND_GUIDE.md)
- **Working on backend?** → [Backend Guide](./04-BACKEND_GUIDE.md)
- **Something not working?** → [Troubleshooting](./08-TROUBLESHOOTING.md)
- **Code questions?** → [Code Standards](./13-CODE_STANDARDS.md) or [FAQ](./11-FAQ.md)

#### 🚀 **DevOps / System Admins**
- **Deploying the app?** → [Deployment Guide](./06-DEPLOYMENT_GUIDE.md)
- **Configuring services?** → [Environment Configuration](./07-ENVIRONMENT_CONFIG.md)
- **Database issues?** → [Database Guide](./05-DATABASE_GUIDE.md)
- **Server problems?** → [Troubleshooting](./08-TROUBLESHOOTING.md)

#### 📚 **Product Managers / Users**
- **Learning the app?** → [User Guide](./10-USER_GUIDE.md)
- **Common questions?** → [FAQ](./11-FAQ.md)
- **API for integrations?** → [API Documentation](./09-API_DOCUMENTATION.md)

#### 🤝 **Contributors**
- **Contributing code?** → [Contributing Guidelines](./12-CONTRIBUTING.md)
- **Code style?** → [Code Standards](./13-CODE_STANDARDS.md)
- **Development workflow?** → [Contributing Guidelines](./12-CONTRIBUTING.md#development-workflow)

---

## Common Tasks

### Quick Start
```bash
git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git
cd RehaAdvisor
make build_dev
make dev_up
# Visit http://localhost:3001
```
→ [Full Getting Started Guide](./01-GETTING_STARTED.md)

### Deploy to Production
```bash
# Configure environment
cat > .env.production << EOF
DEBUG=False
SECRET_KEY=your-secret-key
ALLOWED_HOSTS=yourdomain.com
# ... more config
EOF

# Build and deploy
make build
make up
```
→ [Full Deployment Guide](./06-DEPLOYMENT_GUIDE.md)

### Troubleshoot Issue
1. Check [Troubleshooting Guide](./08-TROUBLESHOOTING.md)
2. Look in [FAQ](./11-FAQ.md)
3. Check logs: `docker compose logs -f`
4. Ask in [Contributing Guidelines](./12-CONTRIBUTING.md#reporting-issues)

### Add New Feature
1. Create branch: `git checkout -b feature/my-feature`
2. Write code and tests
3. Follow [Code Standards](./13-CODE_STANDARDS.md)
4. Submit PR following [Contributing Guidelines](./12-CONTRIBUTING.md)

### Make API Call
```typescript
import { api } from '../api/axios';

const response = await api.get('/endpoint/');
```
→ [Frontend Guide](./03-FRONTEND_GUIDE.md#api-communication) or [API Documentation](./09-API_DOCUMENTATION.md)

### Create Database Backup
```bash
docker exec mongodb mongodump --archive=/backup/db.archive
```
→ [Database Guide](./05-DATABASE_GUIDE.md#backup-and-restore)

---

## Technology Stack

| Component | Technology | Guide |
|-----------|-----------|-------|
| Frontend | React + Vite + TypeScript | [Frontend Guide](./03-FRONTEND_GUIDE.md) |
| Backend | Django + DRF | [Backend Guide](./04-BACKEND_GUIDE.md) |
| Database | MongoDB | [Database Guide](./05-DATABASE_GUIDE.md) |
| State Management | MobX | [Frontend Guide](./03-FRONTEND_GUIDE.md#state-management-with-mobx) |
| Authentication | JWT | [API Documentation](./09-API_DOCUMENTATION.md#authentication) |
| Testing | Jest + PyTest | [Contributing Guidelines](./12-CONTRIBUTING.md#write-tests) |
| Deployment | Docker + Docker Compose | [Deployment Guide](./06-DEPLOYMENT_GUIDE.md) |

---

## Essential Commands

### Development

```bash
# Build development containers
make build_dev

# Start development environment
make dev_up

# View logs
make dev_logs

# Stop development environment
make dev_down

# Run tests
npm test                    # Frontend
cd backend && pytest        # Backend

# Enter container shell
docker exec -it <container> sh

# Access MongoDB
docker exec -it telerehabapp-db-1 mongosh
```

### Production

```bash
# Build production containers
make build

# Start production services
make up

# Stop services
make down

# View logs
docker compose logs -f
```

---

## Useful Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3001 | http://localhost:3001 |
| Backend | 8001 | http://localhost:8001/api |
| Django Admin | 8001 | http://localhost:8001/admin |
| MongoDB | 27017 | mongodb://localhost:27017 |
| Redis | 6379 | redis://localhost:6379 |
| NGINX | 80/443 | http://localhost |

---

## File Locations

```
rehaadvisor/
├── frontend/              # React application
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── stores/       # MobX state
│   │   ├── api/          # API layer
│   │   └── types/        # TypeScript types
│   └── package.json      # Dependencies
│
├── backend/              # Django application
│   ├── api/              # REST API
│   ├── core/             # Core app
│   ├── config/           # Settings
│   ├── tests/            # Tests
│   └── manage.py         # Django CLI
│
├── docs/                 # Documentation (THIS FOLDER)
│   ├── README.md         # Documentation index
│   ├── 01-GETTING_STARTED.md
│   ├── 02-ARCHITECTURE.md
│   ├── ... (more guides)
│   └── QUICK_REFERENCE.md (this file)
│
├── mongo/                # MongoDB config
├── nginx/                # NGINX config
├── docker-compose.dev.yml
├── docker-compose.prod.yml
└── makefile
```

---

## Getting Help

### Documentation
- [Table of Contents](./README.md)
- [Troubleshooting Guide](./08-TROUBLESHOOTING.md)
- [FAQ](./11-FAQ.md)

### Community
- GitHub Issues for bug reports
- GitHub Discussions for questions
- Email: support@yourdomain.com

### Report a Bug
1. Check [FAQ](./11-FAQ.md) and [Troubleshooting](./08-TROUBLESHOOTING.md)
2. Create GitHub issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - System info

---

## Development Checklist

- [ ] Environment set up ([Getting Started](./01-GETTING_STARTED.md))
- [ ] Understand architecture ([Architecture](./02-ARCHITECTURE.md))
- [ ] Read relevant guide:
  - [ ] [Frontend Guide](./03-FRONTEND_GUIDE.md) if working on UI
  - [ ] [Backend Guide](./04-BACKEND_GUIDE.md) if working on API
  - [ ] [Database Guide](./05-DATABASE_GUIDE.md) if working with data
- [ ] Review [Code Standards](./13-CODE_STANDARDS.md)
- [ ] Write tests
- [ ] Follow [Contributing Guidelines](./12-CONTRIBUTING.md)
- [ ] Create Pull Request

---

## Documentation Index

1. **[README.md](./README.md)** - Main documentation hub
2. **[01-GETTING_STARTED.md](./01-GETTING_STARTED.md)** - Setup and quick start
3. **[02-ARCHITECTURE.md](./02-ARCHITECTURE.md)** - System design
4. **[03-FRONTEND_GUIDE.md](./03-FRONTEND_GUIDE.md)** - React development
5. **[04-BACKEND_GUIDE.md](./04-BACKEND_GUIDE.md)** - Django development
6. **[05-DATABASE_GUIDE.md](./05-DATABASE_GUIDE.md)** - MongoDB guide
7. **[06-DEPLOYMENT_GUIDE.md](./06-DEPLOYMENT_GUIDE.md)** - Production deployment
8. **[07-ENVIRONMENT_CONFIG.md](./07-ENVIRONMENT_CONFIG.md)** - Configuration
9. **[08-TROUBLESHOOTING.md](./08-TROUBLESHOOTING.md)** - Problem solving
10. **[09-API_DOCUMENTATION.md](./09-API_DOCUMENTATION.md)** - REST API reference
11. **[10-USER_GUIDE.md](./10-USER_GUIDE.md)** - End-user guide
12. **[11-FAQ.md](./11-FAQ.md)** - Common questions
13. **[12-CONTRIBUTING.md](./12-CONTRIBUTING.md)** - Contribution guidelines
14. **[13-CODE_STANDARDS.md](./13-CODE_STANDARDS.md)** - Code style guide

---

## Keyboard Shortcuts

### Development
- `npm run dev` - Start frontend dev server
- `python manage.py runserver` - Start backend server
- `docker compose up` - Start all services
- `npm test` - Run frontend tests
- `pytest` - Run backend tests

### Docker
- `docker compose logs -f` - View logs
- `docker exec -it <container> sh` - Enter container
- `docker compose ps` - List containers

---

**Updated**: February 2026
**Version**: 1.0

---

**Start Here**: [Getting Started Guide](./01-GETTING_STARTED.md)
