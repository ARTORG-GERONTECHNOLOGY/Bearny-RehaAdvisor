# Project Architecture

## System Overview

RehaAdvisor is built using a modern microservices-based architecture with clear separation of concerns. The system is containerized using Docker and consists of four main components:

```
┌─────────────────────────────────────────────────────────────┐
│                     NGINX Reverse Proxy                      │
│                      (Port 80, 443)                          │
└────────┬──────────────────────────┬────────────────────────┘
         │                          │
    ┌────▼────┐             ┌──────▼──────┐
    │ Frontend │             │   Backend   │
    │ (React)  │             │  (Django)   │
    │ Port 3001│             │  Port 8001  │
    └────┬────┘             └──────┬──────┘
         │                         │
         │  HTTP/REST API          │
         └────────────┬────────────┘
                      │
                 ┌────▼─────┐
                 │ MongoDB   │
                 │ Port 27017│
                 └──────────┘
```

## Architecture Components

### 1. Frontend (React + Vite)

**Location**: `/frontend`

**Technologies**:
- **Framework**: React 18+
- **Build Tool**: Vite (fast development and production builds)
- **Language**: TypeScript
- **State Management**: MobX (stores in `/frontend/src/stores`)
- **HTTP Client**: Axios (for API communication)
- **Internationalization**: i18next
- **Testing**: Jest
- **Styling**: CSS (configurable)

**Key Directories**:
```
frontend/src/
├── api/              # API communication layer (Axios configuration)
├── assets/           # Static assets (images, styles, language files)
├── components/       # Reusable UI components
├── config/           # Application configuration
├── hooks/            # Custom React hooks
├── pages/            # Page-level components (routed views)
├── routes/           # Route definitions
├── stores/           # MobX state stores
├── types/            # TypeScript type definitions
├── utils/            # Utility functions and helpers
├── __tests__/        # Unit tests
└── main.tsx          # Application entry point
```

**Key Features**:
- Hot module replacement (HMR) for instant feedback during development
- Component-based UI architecture
- Centralized state management via MobX stores
- Internationalization support for multiple languages
- Responsive design with mobile support
- Progressive Web App (PWA) with offline capabilities
- Daily notification reminders (frontend-only, browser-based)

### 2. Backend (Django + Django REST Framework)

**Location**: `/backend`

**Technologies**:
- **Framework**: Django 5.x
- **REST API**: Django REST Framework (DRF)
- **Authentication**: JWT (JSON Web Tokens) via `drf-simplejwt`
- **Database ORM**: Django ORM (for MongoDB via Mongoengine or through native Django support)
- **Task Queue**: Celery with Redis/RabbitMQ (for async tasks)
- **Testing**: PyTest
- **API Documentation**: DRF built-in tools

**Key Directories**:
```
backend/
├── api/              # REST API endpoints and views
├── core/             # Core Django application
├── config/           # Django settings (development, production)
├── utils/            # Utility modules and helpers
├── tests/            # Test suite
├── manage.py         # Django management script
├── requirements.txt  # Python dependencies
└── celery.py         # Celery configuration
```

**Key Features**:
- RESTful API design
- JWT-based authentication
- Permission-based access control
- Async task processing with Celery
- Comprehensive error handling
- API versioning support

**API Structure**:
- Base URL: `http://localhost:8001/api/`
- Authentication: Bearer tokens in Authorization header
- Response Format: JSON with standardized error handling

### 3. Database (MongoDB)

**Location**: `/mongo`

**Technologies**:
- **Database**: MongoDB 8.0.3
- **Data Format**: BSON (Binary JSON)
- **Schema**: Flexible document-based schema

**Key Concepts**:
- Document-based NoSQL database
- No rigid schema (flexible collections)
- Collections for different entities (users, patients, interventions, etc.)
- Indexes for performance optimization
- Transactions for data consistency

**Data Organization**:
- Each entity type stored in separate collections
- Documents contain embedded or referenced data
- Unique indexes on critical fields (emails, usernames, etc.)

### 4. Web Server (NGINX)

**Location**: `/nginx`

**Technologies**:
- **Web Server**: NGINX (stable-alpine image)
- **Functions**: Reverse proxy, static file serving, SSL termination (production)

**Configuration**:
- Proxies requests to Django backend (`/api/*` → backend port 8000)
- Proxies requests to React frontend (static files)
- Serves Django static files and media uploads
- SSL/TLS termination in production
- Load balancing capability

## Data Flow

### Authentication Flow

```
User Login Request
    ↓
React Form → POST /api/token/ (Axios)
    ↓
Django Authenticates Credentials
    ↓
Returns JWT Token (access + refresh)
    ↓
Frontend Stores Token (localStorage/sessionStorage)
    ↓
Subsequent Requests → Include Token in Authorization Header
    ↓
Django Validates JWT → Processes Request
```

### API Communication Flow

```
React Component
    ↓
MobX Store (State Management)
    ↓
Axios API Call (with auth token)
    ↓
NGINX Reverse Proxy
    ↓
Django REST API Endpoint
    ↓
Database Query (MongoDB)
    ↓
JSON Response → Axios → MobX Store
    ↓
React Component Updates UI
```

### Asynchronous Task Flow

```
User Action
    ↓
Django View Enqueues Task (Celery)
    ↓
Task Broker (RabbitMQ/Redis)
    ↓
Celery Worker Processes Task
    ↓
MongoDB Updated with Results
    ↓
Status Update to Frontend (WebSocket or Polling)
    ↓
UI Updated with Results
```

## Technology Integration Points

### Frontend-Backend Communication

1. **REST API**: Primary method for communication
   - HTTP methods: GET, POST, PUT, DELETE, PATCH
   - JSON request/response bodies
   - Status codes for result indication

2. **Authentication**:
   - JWT tokens for stateless authentication
   - Refresh tokens for long-lived sessions
   - CORS headers for cross-origin requests

3. **Error Handling**:
   - Standardized error response format
   - HTTP status codes
   - Detailed error messages for debugging

### Backend-Database Communication

1. **Django ORM**: Query builder and object mapper
2. **Mongoengine** (if used): MongoDB-specific ORM
3. **Transactions**: For data consistency across operations
4. **Indexes**: For query performance optimization

### Asynchronous Processing

1. **Celery**: Task queue for long-running operations
2. **Message Broker**: RabbitMQ or Redis
3. **Celery Beat**: Scheduler for periodic tasks
4. **Worker Processes**: Execute tasks asynchronously

## Deployment Architecture

### Development Environment
- Docker Compose orchestrates containers
- Host ports map to container ports
- Database persists to local volumes
- Code mounted as volumes for hot reload

### Production Environment
- Scaled Docker deployment or Kubernetes
- Environment-specific configurations
- SSL/TLS encryption
- Database backups and replication
- Load balancing with NGINX
- Monitoring and logging infrastructure

## Security Architecture

### Authentication & Authorization
- JWT tokens for API authentication
- Role-based access control (RBAC)
- Permission decorators on endpoints
- Secure password hashing

### Therapist Access Control Model

Therapists are scoped to a subset of patients via two independent dimensions:

| Dimension | Model field | Description |
|---|---|---|
| Clinic | `Therapist.clinics` | List of clinic names the therapist belongs to |
| Project | `Therapist.projects` | List of research/care projects (e.g. `COPAIN`, `COMPASS`) |

Patient records carry matching `clinic` and `project` fields. The patient list endpoint (`GET /api/therapists/<id>/patients/`) always filters by `clinic__in` and, when projects are assigned, also by `project__in`. Therapists with no projects assigned fall back to clinic-only filtering for backward compatibility.

**REDCap DAG mapping** (`config.json` → `therapistInfo.clinic_dag`):

REDCap uses Data Access Groups (DAGs) to scope records to clinics. DAG names may differ from the application's clinic names (e.g. `"Lumezzane"` in the app vs. `"lumezzane"` as the REDCap DAG). The `clinic_dag` config provides an explicit clinic → DAG mapping used to:
1. Filter candidates returned by `GET /api/redcap/available-patients/` to DAGs the therapist can access.
2. Set the correct `clinic` value on a `Patient` document when importing from REDCap (using the reverse DAG → clinic lookup).

Adding a new clinic to the system requires updating both `clinic_projects` (which projects that clinic runs) and `clinic_dag` (the REDCap DAG name) in `backend/config.json`.

### Data Protection
- HTTPS/TLS in production
- CORS policy configuration
- CSRF protection
- Input validation and sanitization
- SQL/NoSQL injection prevention

### Infrastructure Security
- Containerized isolation
- Minimal base images
- Environment variable management
- Secrets management (production)

## Performance Considerations

### Frontend Optimization
- Code splitting and lazy loading
- Asset bundling with Vite
- Image optimization
- Browser caching with service workers

### Backend Optimization
- Database indexing strategy
- Query optimization
- Caching layer (Redis)
- Async task processing
- Connection pooling

### Database Optimization
- Strategic indexing
- Query optimization
- Data archiving strategy
- Backup and recovery procedures

## Scalability

### Horizontal Scaling
- Multiple backend instances behind load balancer
- Database replication sets
- Celery worker scaling
- Session storage (Redis)

### Vertical Scaling
- Container resource limits (CPU, Memory)
- Database optimization
- Cache optimization

## Development Workflow

1. **Code Changes**: Made locally with hot reload
2. **Version Control**: Git for collaboration
3. **Testing**: Unit tests in containers
4. **Build**: Docker images created
5. **Deployment**: Docker Compose or Kubernetes orchestration

---

**Related Documentation**:
- [Frontend Development Guide](./03-FRONTEND_GUIDE.md)
- [Backend Development Guide](./04-BACKEND_GUIDE.md)
- [Database Documentation](./05-DATABASE_GUIDE.md)
- [Deployment Guide](./06-DEPLOYMENT_GUIDE.md)
