# docker-django-react

## Project

original template: https://github.com/cglusky/docker-django-react/tree/master (modified heavily by Noora)

## Basics

Full stack using docker-compose with Django backend and React (Vite) frontend; all served behind NGINX with MongoDB Database.

## Main Frameworks/Libraries/Packages

Please see requirements.txt and package.json for full details.

Django

- Docker ubuntu:22.04
- Django v5
- Django Rest Framework
- Django Rest Framework Simple JWT
- PyTest

### Notes

- One backend app created/installed called core

React

- Docker ubuntu:22.04
- Vite
- Hot reload (for dev)

MongoDB

- Docker mongo:8.0.3

Ngnix

- Docker nginx:stable-alpine
- Serves Django's static and media files as well.  See conf for details.

### Useful Commands

Build containers. Add -up flag to bring services up after build.

```sh

$> docker compose -f docker-compose.dev.yml build --no-cache
or
$> docker compose -f docker-compose.prod.yml build --no-cache

```

Bring containers up. Add -d flag to run output detached from current shell.

```sh

$> docker compose -f docker-compose.dev.yml up -d
or
$> docker compose -f docker-compose.prod.yml up -d
```

Bring containers down. Add -v flag to also delete named volumes

```sh

$>  docker compose -f docker-compose.dev.yml down --volumes --remove-orphans
$>  docker compose -f docker-compose.prod.yml down --volumes --remove-orphans

```

View logs by service name.

```sh

$> docker compose logs <service-name>

```

Enter shell for specified container (must be running)

```sh

$> docker exec -it <container-name> sh

```

See all logs and container details.
```sh

$> lazydocker

```
### Containers, Services and Ports

| Container  | Service | Host Port | Docker Port |
|------------|---------|-----------|-------------|
|[dev-]django| django  | 8001      | 8000        |
|[dev-]react | react   | 3001      | 3000        |
|[dev-]db    | db      | 27017     | 27017       |
|[dev-]nginx | nginx   | 8080 443  | 80  443     |

## Testing

RehaAdvisor includes comprehensive test suites for both frontend and backend with continuous integration via GitHub Actions.

### Quick Start

```sh
# Run all tests
make dev_test

# Frontend tests (Jest)
cd frontend && npm test

# Backend tests (Pytest)
cd backend && pytest
```

### Test Documentation

Complete testing documentation is available in these guides:

- **[Master Testing Guide](MASTER_TESTING_GUIDE.md)** - Overview and quick reference for all testing
- **[Frontend Testing Guide](FRONTEND_TEST_DOCUMENTATION.md)** - Jest, React Testing Library, component tests (45+ files)
- **[Backend Testing Guide](BACKEND_TEST_DOCUMENTATION.md)** - Pytest, Django, model/view tests (40+ files)
- **[CI/CD Testing Guide](CICD_TESTING_GUIDE.md)** - GitHub Actions, coverage reporting, deployment validation

### Test Coverage

| Framework | Target | Status |
|-----------|--------|--------|
| Frontend (Jest) | 70% | ✅ Active |
| Backend (Pytest) | 75% | ✅ Active |
| Overall Coverage | 72% | ✅ Tracked in Codecov |

### Running Tests Locally

**Frontend**
```bash
cd frontend

# All tests with coverage
npm test -- --coverage --watchAll=false

# Watch mode (during development)
npm test

# Specific test file
npm test -- LoginForm.test.tsx
```

**Backend**
```bash
cd backend

# All tests
pytest

# With coverage report
pytest --cov=. --cov-report=html

# Specific test file
pytest tests/models/test_patient.py

# Verbose output
pytest -vv
```

### CI/CD Pipeline

Tests automatically run on GitHub Actions for:
- Every push to `main` and `develop` branches
- Every pull request
- Triggered by changes to backend/, frontend/, or workflow files

**Pipeline Steps**:
1. Frontend tests (Jest) → Coverage upload
2. Backend tests (Pytest) → Coverage upload
3. Docker build validation
4. Security scanning (Trivy)
5. Test summary and reporting

View detailed workflow: [.github/workflows/tests.yml](.github/workflows/tests.yml)

### Coverage Reporting

Coverage reports are automatically uploaded to [Codecov](https://codecov.io/) for:
- Trend tracking over time
- PR impact analysis
- File-level coverage details
- Coverage badges for README
