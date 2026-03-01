# RehaAdvisor Technical Documentation

Welcome to the RehaAdvisor technical documentation. This comprehensive guide is designed to help developers, system administrators, and users understand, develop, and deploy the RehaAdvisor application.

## Quick Navigation

### For New Developers
- [Getting Started](./01-GETTING_STARTED.md) - Set up your development environment
- [Project Architecture](./02-ARCHITECTURE.md) - Understand the system design
- [Frontend Development Guide](./03-FRONTEND_GUIDE.md) - React/Vite development
- [Backend Development Guide](./04-BACKEND_GUIDE.md) - Django development
- [Database Documentation](./05-DATABASE_GUIDE.md) - MongoDB schema and data models

### For System Administrators
- [Deployment Guide](./06-DEPLOYMENT_GUIDE.md) - Production deployment instructions
- [Environment Configuration](./07-ENVIRONMENT_CONFIG.md) - Configuration files and variables
- [CI Environment Contract](./14-CI_ENVIRONMENT_CONTRACT.md) - Required CI test/runtime env rules
- [Troubleshooting](./08-TROUBLESHOOTING.md) - Common issues and solutions

### For Users & API Consumers
- [API Documentation](./09-API_DOCUMENTATION.md) - REST API endpoints and usage
- [User Guide](./10-USER_GUIDE.md) - Application features and workflows
- [FAQ](./11-FAQ.md) - Frequently asked questions

### For Contributors
- [Contributing Guidelines](./12-CONTRIBUTING.md) - How to contribute to the project
- [Code Standards](./13-CODE_STANDARDS.md) - Coding conventions and best practices

### For Testing
- [Testing Documentation Index](../TESTING_DOCUMENTATION_INDEX.md) - Central index for all testing guides
- [Frontend E2E Test Documentation](../FRONTEND_E2E_TEST_DOCUMENTATION.md) - Playwright FE↔BE E2E setup and flows

## Project Overview

**RehaAdvisor** is a comprehensive web application designed for rehabilitation management. It integrates multiple user roles including therapists, researchers, and administrators, providing a platform for managing rehabilitation programs, patient data, and research activities.

### Technology Stack
- **Frontend**: React with Vite, TypeScript, MobX, Axios, PWA
- **Backend**: Django 5, Django REST Framework, PyTest
- **Database**: MongoDB 8.0.3
- **Infrastructure**: Docker, Docker Compose, NGINX, Celery
- **Localization**: i18next (supporting multiple languages)

## Project Structure

```
telerehabapp/
├── frontend/              # React application with Vite
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── stores/       # MobX state management
│   │   ├── api/          # API communication layer
│   │   ├── hooks/        # Custom React hooks
│   │   ├── utils/        # Utility functions
│   │   ├── types/        # TypeScript type definitions
│   │   └── assets/       # Images, styles, language files
│   └── package.json      # Frontend dependencies
├── backend/              # Django application
│   ├── api/              # Django REST API endpoints
│   ├── core/             # Core Django app
│   ├── config/           # Django settings
│   ├── utils/            # Utility modules
│   ├── tests/            # Test suite
│   └── manage.py         # Django management script
├── mongo/                # MongoDB configuration
├── nginx/                # NGINX reverse proxy configuration
├── docker-compose.dev.yml    # Development Docker Compose
├── docker-compose.prod.yml   # Production Docker Compose
├── makefile              # Build and deployment commands
└── docs/                 # Documentation (this folder)
```

## Quick Commands

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

# Restart development environment
make dev_restart
```

### Production
```bash
# Build production containers
make build

# Start production environment
make up

# Stop production environment
make down
```

### Testing
```bash
# Frontend tests
cd frontend && npm test

# Backend tests
cd backend && pytest
```

## Getting Help

If you have questions or need clarification on any topic:
1. Check the [FAQ](./11-FAQ.md) section
2. Review [Troubleshooting](./08-TROUBLESHOOTING.md) for common issues
3. Refer to specific documentation sections for detailed guidance
4. Check the [Contributing Guidelines](./12-CONTRIBUTING.md) for community support

## Version Information

- **Django**: 5.x
- **React**: Latest with Vite
- **MongoDB**: 8.0.3
- **Python**: 3.x
- **Node.js**: LTS recommended

---

**Last Updated**: February 2026
**Documentation Version**: 1.0
