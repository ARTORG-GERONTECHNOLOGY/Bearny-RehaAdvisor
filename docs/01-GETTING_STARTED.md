# Getting Started - Development Environment Setup

## Prerequisites

Before setting up RehaAdvisor, ensure you have the following installed on your system:

- **Docker** (v20.10+) - [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** (v1.29+) - Usually included with Docker Desktop
- **Git** - For version control
- **Make** - For running development commands
  - Linux/Mac: Usually pre-installed
  - Windows: Install via [MinGW](http://www.mingw.org/) or use WSL2

## Quick Start (5 minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git
cd RehaAdvisor
```

### 2. Build Development Containers

```bash
make build_dev
```

This command will build Docker images for:
- Django backend
- React frontend
- MongoDB database
- NGINX reverse proxy

### 3. Start the Application

```bash
make dev_up
```

### 4. Access the Application

Open your browser and navigate to:
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:8001
- **Django Admin**: http://localhost:8001/admin

### 5. Stop the Application

```bash
make dev_down
```

## Detailed Setup Instructions

### Step 1: Install Docker and Docker Compose

#### On Linux (Ubuntu/Debian):
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (optional, to avoid sudo)
sudo usermod -aG docker $USER
newgrp docker
```

#### On macOS:
```bash
# Using Homebrew
brew install docker docker-compose

# Or download Docker Desktop: https://www.docker.com/products/docker-desktop
```

#### On Windows:
- Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop)
- Ensure WSL2 backend is enabled

### Step 2: Verify Installation

```bash
docker --version
docker compose --version
make --version
```

### Step 3: Clone and Setup

```bash
git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git
cd RehaAdvisor
```

### Step 4: Review Environment Variables

The backend, celery, and celery-beat services all load `./.env.dev` (see `env_file:` in `docker-compose.dev.yml`). Create it at the repo root before starting the stack. At minimum for local dev you'll need Django settings plus, if you want to exercise wearable/study features, Fitbit OAuth credentials and REDCap API tokens — see [Environment Configuration](./07-ENVIRONMENT_CONFIG.md) for the full variable list (including `FITBIT_CLIENT_ID`/`FITBIT_CLIENT_SECRET`, `REDCAP_API_URL`/`REDCAP_TOKEN_*`, and `APP_MODE`, which gates whether manual patient creation or REDCap-only import is available).

### Step 5: Build and Start

```bash
# Build all containers
make build_dev

# Start all services
make dev_up

# Check service status
docker compose -f docker-compose.dev.yml ps
```

### Step 6: Verify Services

Check that all services are running:

```bash
# View logs
make dev_logs

# Or check specific service
docker compose -f docker-compose.dev.yml logs django
docker compose -f docker-compose.dev.yml logs react
docker compose -f docker-compose.dev.yml logs db
```

## Accessing Services

### Frontend Application
- **URL**: http://localhost:3001
- **Technology**: React with Vite
- **Hot Reload**: Enabled for development

### Backend API
- **URL**: http://localhost:8001
- **API Base**: http://localhost:8001/api/
- **Admin Panel**: http://localhost:8001/admin/

### Database
- **Type**: MongoDB
- **Host**: localhost
- **Port**: 27017
- **Database Name**: rehaadvisor

### NGINX Reverse Proxy
- Ports 80/443 are commented out by default in `docker-compose.dev.yml` (they're owned by a shared gateway when multi-stack routing is active). For a standalone dev setup without the gateway, uncomment the `"80:80"` / `"443:443"` port mappings on the `nginx-dev` service.

## Common Development Tasks

### View Application Logs

```bash
# All services
make dev_logs

# Specific service
docker compose -f docker-compose.dev.yml logs -f django
docker compose -f docker-compose.dev.yml logs -f react
docker compose -f docker-compose.dev.yml logs -f db
```

### Execute Commands in Containers

```bash
# Access Django shell
docker exec -it django python manage.py shell

# Run Django migrations
docker exec -it django python manage.py migrate

# Access frontend container
docker exec -it react sh

# Access MongoDB
docker exec -it db mongosh
```

### Run Tests

```bash
# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
pytest

# With coverage
pytest --cov
```

### Restart Services

```bash
# Restart all
make dev_restart

# Or restart specific service
docker compose -f docker-compose.dev.yml restart django
docker compose -f docker-compose.dev.yml restart react
```

### Clean Up

```bash
# Stop and remove containers, volumes, and orphans
make dev_down

# Or with docker compose directly
docker compose -f docker-compose.dev.yml down --volumes --remove-orphans
```

## Troubleshooting Setup Issues

### Issue: "Cannot connect to Docker daemon"

**Solution**: Ensure Docker is running and your user has permission:
```bash
# Start Docker (Linux)
sudo systemctl start docker

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Issue: "Port already in use"

**Solution**: Identify and stop the service using the port:
```bash
# Find process using port 3001 (frontend)
lsof -i :3001

# Kill the process
kill -9 <PID>
```

### Issue: "Cannot find module" errors

**Solution**: Rebuild containers without cache:
```bash
make build_dev --no-cache
```

### Issue: Database connection errors

**Solution**: Ensure MongoDB is running and volumes are properly mounted:
```bash
# Check database logs
docker compose -f docker-compose.dev.yml logs db

# Remove and recreate volumes
docker compose -f docker-compose.dev.yml down --volumes
make build_dev
make dev_up
```

## Next Steps

1. Read [Project Architecture](./02-ARCHITECTURE.md) to understand the system design
2. Explore [Frontend Development Guide](./03-FRONTEND_GUIDE.md) if working on UI
3. Check [Backend Development Guide](./04-BACKEND_GUIDE.md) if working on APIs
4. Review [Code Standards](./13-CODE_STANDARDS.md) before making changes

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Django Documentation](https://docs.djangoproject.com/)
- [React Documentation](https://react.dev/)
- [MongoDB Documentation](https://docs.mongodb.com/)

---

**Need Help?** Check the [Troubleshooting Guide](./08-TROUBLESHOOTING.md) or [FAQ](./11-FAQ.md).
