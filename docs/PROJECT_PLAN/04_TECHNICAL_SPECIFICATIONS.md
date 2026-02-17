# RehaAdvisor - Technical Architecture & Specifications

## Overview

This document describes the technical architecture, system design, data models, and API specifications for the RehaAdvisor platform.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Data Models](#data-models)
4. [API Specifications](#api-specifications)
5. [Security Architecture](#security-architecture)
6. [Integration Points](#integration-points)
7. [Performance Considerations](#performance-considerations)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Web Browser                         │
│                    (React + Vite Frontend)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    (HTTPS, WebSocket)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    NGINX Reverse Proxy                      │
│     (Load Balancing, SSL Termination, Static Files)        │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌───▼────────┐
    │ Django    │    │  Celery   │    │  Redis    │
    │ REST API  │    │ Task Queue│    │  Cache    │
    │ (Gunicorn)│    │ (Worker)  │    │           │
    └─────┬─────┘    └─────┬─────┘    └───┬───────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼──────┐   ┌────▼─────┐   ┌─────▼─────┐
    │ MongoDB    │   │  AWS S3   │   │ Fitbit    │
    │ Database   │   │  Storage  │   │ API       │
    └────────────┘   └───────────┘   └───────────┘
```

### Deployment Environment

- **Frontend**: React 18 with Vite, transpiled to ES2020
- **Backend**: Django 4.x with Django REST Framework
- **Containerization**: Docker containers orchestrated via Docker Compose
- **Reverse Proxy**: NGINX 1.25+
- **Task Processing**: Celery with Redis broker
- **Database**: MongoDB (document-based, no fixed schema)
- **Storage**: AWS S3 for media files
- **Cache**: Redis in-memory cache
- **External APIs**: Fitbit API for health data integration

---

## Technology Stack

### Frontend Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | React 18 | UI library |
| **Build Tool** | Vite | Fast build and dev server |
| **Language** | TypeScript | Type safety |
| **State Management** | MobX | Observable state patterns |
| **Routing** | React Router v6 | Client-side routing |
| **HTTP Client** | Axios | API communication |
| **i18n** | i18next | Multi-language support |
| **Styling** | CSS Modules + SCSS | Component-scoped styling |
| **UI Components** | Custom + HTML5 | Semantic, accessible components |
| **Testing** | Jest + React Testing Library | Unit and integration tests |

### Backend Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Django 4.x | Web framework |
| **API** | Django REST Framework | RESTful API |
| **Language** | Python 3.10+ | Backend language |
| **Database Driver** | pymongo | MongoDB driver |
| **Task Queue** | Celery | Async task processing |
| **Task Broker** | Redis | Message broker for Celery |
| **Cache** | Redis | In-memory caching |
| **Auth** | JWT (djangorestframework-simplejwt) | Token-based authentication |
| **Email** | Django-celery-email | Async email sending |
| **Testing** | pytest | Testing framework |
| **API Documentation** | DRF Spectacular (drf-spectacular) | OpenAPI/Swagger docs |

### Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Web Server** | Gunicorn | WSGI application server |
| **Reverse Proxy** | NGINX | Load balancing, SSL termination |
| **Container Runtime** | Docker | Application containerization |
| **Orchestration** | Docker Compose | Multi-container orchestration |
| **Version Control** | Git | Source code management |
| **CI/CD** | GitHub Actions | Automated testing and deployment |
| **Media Storage** | AWS S3 | Cloud file storage |
| **Container Registry** | Docker Hub | Container image repository |

---

## Data Models

### User Model

```javascript
{
  _id: ObjectId,
  username: String (unique),
  email: String (unique),
  first_name: String,
  last_name: String,
  password_hash: String (bcrypted),
  role: Enum['patient', 'therapist', 'researcher', 'admin'],
  is_active: Boolean,
  created_at: DateTime,
  updated_at: DateTime,
  last_login: DateTime,
  phone: String (optional),
  profile_picture_url: String (optional),
  
  // Therapist-specific
  license_number: String (if role === 'therapist'),
  specialization: String (if role === 'therapist'),
  bio: String (if role === 'therapist'),
  
  // Researcher-specific
  institution: String (if role === 'researcher'),
  research_interests: [String] (if role === 'researcher'),
  publications: [String] (if role === 'researcher'),
  
  // Security
  failed_login_attempts: Integer,
  is_locked_until: DateTime (null if not locked),
  mfa_enabled: Boolean,
  mfa_secret: String (encrypted, if MFA enabled),
  
  // Audit
  created_by: ObjectId (reference to admin),
  last_modified_by: ObjectId (reference to user/admin)
}
```

### Patient Model

```javascript
{
  _id: ObjectId,
  user_id: ObjectId (reference to User),
  therapist_id: ObjectId (reference to User - Therapist),
  
  // Demographics
  date_of_birth: Date,
  gender: Enum['M', 'F', 'Other'],
  medical_record_number: String (optional),
  
  // Medical Information
  primary_diagnosis: String,
  secondary_diagnoses: [String],
  medical_history: String,
  allergies: String,
  current_medications: [String],
  
  // Functional Assessment
  initial_functional_status: String,
  current_functional_status: String,
  activity_restrictions: String,
  
  // Device Connections
  connected_devices: [
    {
      type: Enum['fitbit', 'apple_watch', 'garmin'],
      device_id: String,
      access_token: String (encrypted),
      refresh_token: String (encrypted),
      connected_at: DateTime,
      last_sync: DateTime
    }
  ],
  
  // Contact Information
  primary_contact_name: String,
  primary_contact_phone: String,
  primary_contact_relationship: String,
  
  // Status
  enrollment_date: Date,
  discharge_date: Date (null if active),
  status: Enum['active', 'on_hold', 'discharged', 'inactive'],
  
  // Audit
  created_at: DateTime,
  updated_at: DateTime,
  created_by: ObjectId,
  last_modified_by: ObjectId
}
```

### Intervention Model

```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  type: Enum['exercise', 'questionnaire', 'breathing', 'meditation', 'education'],
  specialty: Enum['cardiology', 'neurology', 'orthopedics', 'pediatrics', 'sports_med', 'psychiatry', 'dermatology', 'oncology', 'endocrinology', 'pt'],
  difficulty: Enum['easy', 'moderate', 'hard'],
  duration_minutes: Integer,
  
  // Content
  instructions: String (detailed text),
  video_url: String (optional, AWS S3 URL),
  images: [String] (optional, AWS S3 URLs),
  attachments: [String] (optional, AWS S3 URLs),
  
  // Metadata
  tags: [String],
  health_benefits: [String],
  precautions: String,
  contraindications: String,
  patient_type: [Enum['geriatric', 'pediatric', 'general', 'post-surgical', 'chronic_disease']],
  
  // Relationships
  created_by: ObjectId (reference to Therapist),
  is_published: Boolean,
  is_template: Boolean,
  template_id: ObjectId (null if not from template),
  
  // Tracking
  usage_count: Integer (total assignments),
  completion_count: Integer (total completions),
  average_rating: Float (1-5),
  
  // Audit
  created_at: DateTime,
  updated_at: DateTime,
  reviewed_by: ObjectId (reference to Admin if published),
  review_date: DateTime
}
```

### Assignment Model

```javascript
{
  _id: ObjectId,
  patient_id: ObjectId (reference to Patient),
  therapist_id: ObjectId (reference to Therapist),
  intervention_id: ObjectId (reference to Intervention),
  
  // Schedule
  assigned_date: DateTime,
  start_date: Date,
  end_date: Date,
  frequency: Enum['daily', 'twice_daily', 'weekly', 'biweekly', 'monthly'],
  occurrence_days: [Integer] (0=Monday, 6=Sunday),
  
  // Instructions
  personalized_instructions: String,
  repetitions: Integer,
  sets: Integer,
  hold_duration_seconds: Integer (optional),
  rest_duration_seconds: Integer (optional),
  
  // Tracking
  total_scheduled: Integer,
  completed_count: Integer,
  compliance_rate: Float (0-1),
  status: Enum['active', 'completed', 'cancelled', 'on_hold'],
  
  // Audit
  created_at: DateTime,
  updated_at: DateTime
}
```

### Session Model

```javascript
{
  _id: ObjectId,
  assignment_id: ObjectId (reference to Assignment),
  patient_id: ObjectId (reference to Patient),
  intervention_id: ObjectId (reference to Intervention),
  
  // Execution
  session_date: DateTime,
  start_time: DateTime,
  end_time: DateTime,
  duration_actual_seconds: Integer,
  
  // Results
  status: Enum['not_started', 'in_progress', 'completed', 'skipped', 'incomplete'],
  completion_percentage: Float (0-100),
  notes: String,
  
  // Health Data
  health_data: {
    heart_rate_start: Integer (optional),
    heart_rate_end: Integer (optional),
    blood_pressure_start: String (optional, "120/80"),
    blood_pressure_end: String (optional),
    steps_during: Integer (optional, from Fitbit),
    distance_during: Float (optional, from Fitbit),
    calories_burned: Float (optional)
  },
  
  // Feedback
  feedback_rating: Integer (1-5, optional),
  feedback_text: String (optional),
  feedback_sentiment: Enum['positive', 'neutral', 'negative'] (computed),
  
  // Video Recording
  video_url: String (optional, AWS S3 URL for telehealth session),
  
  // Audit
  created_at: DateTime,
  completed_at: DateTime
}
```

### Questionnaire Model

```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  type: Enum['assessment', 'feedback', 'satisfaction', 'symptom_tracking', 'goal_tracking'],
  
  // Specification
  questions: [
    {
      id: String,
      question_text: String,
      question_type: Enum['text', 'number', 'scale_1_5', 'scale_0_10', 'multiple_choice', 'checkbox'],
      options: [String] (if multiple_choice or checkbox),
      required: Boolean,
      display_order: Integer,
      help_text: String (optional)
    }
  ],
  
  // Relationships
  created_by: ObjectId (reference to User),
  is_published: Boolean,
  
  // Tracking
  usage_count: Integer,
  
  // Audit
  created_at: DateTime,
  updated_at: DateTime
}
```

### HealthData Model

```javascript
{
  _id: ObjectId,
  patient_id: ObjectId (reference to Patient),
  data_date: Date,
  
  // Vitals
  weight_kg: Float (optional),
  height_cm: Float (optional),
  bmi: Float (optional, calculated),
  blood_pressure: String (optional, "120/80"),
  heart_rate: Integer (optional, bpm),
  respiratory_rate: Integer (optional),
  oxygen_saturation: Float (optional, 0-100%),
  temperature_c: Float (optional),
  
  // Fitbit Data
  steps: Integer (optional),
  distance_km: Float (optional),
  calories_burned: Float (optional),
  active_minutes: Integer (optional),
  sedentary_minutes: Integer (optional),
  sleep_duration_hours: Float (optional),
  sleep_quality: String (optional),
  
  // Patient-Reported
  pain_level: Integer (optional, 0-10),
  mood: Enum['excellent', 'good', 'fair', 'poor'] (optional),
  energy_level: Integer (optional, 0-10),
  notes: String (optional),
  
  // Source
  source: Enum['patient_reported', 'fitbit', 'apple_watch', 'manual_entry'],
  
  // Audit
  created_at: DateTime,
  updated_at: DateTime,
  created_by: ObjectId
}
```

### Report Model

```javascript
{
  _id: ObjectId,
  patient_id: ObjectId (reference to Patient),
  therapist_id: ObjectId (reference to Therapist),
  report_type: Enum['progress', 'outcome', 'compliance', 'discharge'],
  
  // Period
  start_date: Date,
  end_date: Date,
  
  // Content
  title: String,
  summary: String,
  
  // Metrics
  metrics: {
    sessions_assigned: Integer,
    sessions_completed: Integer,
    compliance_rate: Float,
    average_rating: Float,
    health_metrics_improvement: {
      weight_change_kg: Float,
      bp_change: String,
      heart_rate_change: Integer,
      other: Object
    }
  },
  
  // Observations
  therapist_observations: String,
  recommendations: String,
  goals_achieved: [String],
  goals_remaining: [String],
  
  // Sharing
  shared_with_patient: Boolean,
  share_date: DateTime (optional),
  patient_viewed: Boolean,
  patient_view_date: DateTime (optional),
  
  // Audit
  created_at: DateTime,
  created_by: ObjectId
}
```

---

## API Specifications

### Authentication Endpoints

#### POST /api/auth/register/
Register a new user account.

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "first_name": "John",
  "last_name": "Doe",
  "role": "patient"
}
```

**Response (201 Created):**
```json
{
  "user_id": "507f1f77bcf86cd799439011",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "patient",
  "created_at": "2025-12-01T10:00:00Z"
}
```

#### POST /api/auth/login/
Authenticate and receive JWT tokens.

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "role": "patient"
  }
}
```

#### POST /api/auth/refresh/
Refresh expired access token.

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Patient Endpoints

#### GET /api/patients/{patient_id}/
Get patient profile (for patient or assigned therapist).

**Response (200 OK):**
```json
{
  "patient_id": "507f1f77bcf86cd799439011",
  "user": {
    "username": "johndoe",
    "first_name": "John",
    "email": "john@example.com"
  },
  "therapist": {
    "therapist_id": "507f1f77bcf86cd799439012",
    "name": "Dr. Sarah Johnson"
  },
  "date_of_birth": "1965-05-15",
  "status": "active",
  "primary_diagnosis": "Cardiac Rehabilitation",
  "enrollment_date": "2025-11-01"
}
```

#### GET /api/patients/{patient_id}/dashboard/
Get patient dashboard with interventions and health data.

**Query Parameters:**
- `time_range`: 'week', 'month', 'year' (default: 'week')

**Response (200 OK):**
```json
{
  "today": {
    "interventions_assigned": 3,
    "interventions_completed": 2,
    "completion_percentage": 67
  },
  "this_week": {
    "sessions_assigned": 15,
    "sessions_completed": 12,
    "compliance_rate": 80
  },
  "health_summary": {
    "today": {
      "steps": 8234,
      "heart_rate": 72,
      "blood_pressure": "118/76"
    },
    "trend": "improving"
  },
  "upcoming_interventions": [
    {
      "assignment_id": "507f1f77bcf86cd799439013",
      "intervention_title": "Cardiac Walking",
      "scheduled_time": "2025-12-01T14:00:00Z",
      "duration_minutes": 20
    }
  ]
}
```

#### GET /api/patients/{patient_id}/interventions/
Get list of assigned interventions.

**Query Parameters:**
- `status`: 'active', 'completed', 'all' (default: 'active')
- `page`: integer (default: 1)
- `limit`: integer 1-100 (default: 20)

**Response (200 OK):**
```json
{
  "total": 12,
  "page": 1,
  "limit": 20,
  "items": [
    {
      "assignment_id": "507f1f77bcf86cd799439013",
      "intervention": {
        "intervention_id": "507f1f77bcf86cd799439014",
        "title": "Cardiac Walking",
        "type": "exercise",
        "duration_minutes": 20
      },
      "frequency": "daily",
      "status": "active",
      "assigned_date": "2025-11-15",
      "completed_sessions": 12,
      "scheduled_sessions": 15,
      "compliance_rate": 80
    }
  ]
}
```

#### POST /api/patients/{patient_id}/sessions/{assignment_id}/complete/
Record completion of an intervention session.

**Request Body:**
```json
{
  "status": "completed",
  "duration_actual_seconds": 1320,
  "completion_percentage": 100,
  "health_data": {
    "heart_rate_end": 85,
    "notes": "Felt good, not too strenuous"
  },
  "feedback": {
    "rating": 4,
    "text": "Great workout!",
    "descriptors": ["energizing", "effective"]
  }
}
```

**Response (201 Created):**
```json
{
  "session_id": "507f1f77bcf86cd799439015",
  "status": "completed",
  "created_at": "2025-12-01T14:20:00Z",
  "message": "Session recorded successfully"
}
```

### Therapist Endpoints

#### POST /api/therapists/{therapist_id}/patients/
Add a new patient to therapist's caseload.

**Request Body:**
```json
{
  "patient_user_id": "507f1f77bcf86cd799439011",
  "primary_diagnosis": "Cardiac Rehabilitation",
  "initial_functional_status": "Moderate restriction in cardio exercise"
}
```

**Response (201 Created):**
```json
{
  "patient_id": "507f1f77bcf86cd799439016",
  "patient_name": "John Doe",
  "status": "active",
  "enrollment_date": "2025-12-01T10:00:00Z"
}
```

#### GET /api/therapists/{therapist_id}/patients/
Get list of therapist's patients.

**Query Parameters:**
- `status`: 'active', 'discharged', 'all' (default: 'active')
- `sortBy`: 'name', 'enrollment_date', 'last_activity' (default: 'name')

**Response (200 OK):**
```json
{
  "total": 8,
  "items": [
    {
      "patient_id": "507f1f77bcf86cd799439011",
      "patient_name": "John Doe",
      "status": "active",
      "compliance_rate": 85,
      "last_activity": "2025-12-01T10:00:00Z",
      "primary_diagnosis": "Cardiac Rehabilitation"
    }
  ]
}
```

#### POST /api/therapists/{therapist_id}/interventions/
Create a new intervention.

**Request Body:**
```json
{
  "title": "Cardiac Walking Program",
  "description": "Graduated walking program for cardiac patients",
  "type": "exercise",
  "specialty": "cardiology",
  "difficulty": "moderate",
  "duration_minutes": 30,
  "instructions": "Walk at comfortable pace for 30 minutes...",
  "tags": ["walking", "cardio", "low-impact"],
  "health_benefits": ["Improved cardiovascular fitness", "Increased endurance"],
  "precautions": "Stop if experiencing chest pain or shortness of breath",
  "patient_type": ["geriatric", "general"]
}
```

**Response (201 Created):**
```json
{
  "intervention_id": "507f1f77bcf86cd799439017",
  "title": "Cardiac Walking Program",
  "status": "draft",
  "created_at": "2025-12-01T10:00:00Z",
  "message": "Intervention created. Submit for review to publish."
}
```

#### POST /api/therapists/{therapist_id}/patients/{patient_id}/assign-intervention/
Assign an intervention to a patient.

**Request Body:**
```json
{
  "intervention_id": "507f1f77bcf86cd799439014",
  "start_date": "2025-12-05",
  "end_date": "2025-12-31",
  "frequency": "daily",
  "occurrence_days": [1, 3, 5],
  "personalized_instructions": "Start with 15 minutes, increase by 5 min each week"
}
```

**Response (201 Created):**
```json
{
  "assignment_id": "507f1f77bcf86cd799439018",
  "intervention_title": "Cardiac Walking Program",
  "patient_name": "John Doe",
  "status": "active",
  "start_date": "2025-12-05",
  "assigned_at": "2025-12-01T10:00:00Z",
  "message": "Intervention assigned successfully"
}
```

#### GET /api/therapists/{therapist_id}/analytics/
Get analytics dashboard for therapist's patients.

**Query Parameters:**
- `time_range`: 'month', 'quarter', 'year' (default: 'month')

**Response (200 OK):**
```json
{
  "summary": {
    "total_patients": 8,
    "active_patients": 6,
    "average_compliance": 83,
    "total_sessions_completed": 342
  },
  "compliance_by_patient": [
    {
      "patient_name": "John Doe",
      "compliance_rate": 85,
      "status": "on_track",
      "trend": "improving"
    }
  ],
  "intervention_performance": [
    {
      "intervention_title": "Cardiac Walking",
      "assignments": 12,
      "completions": 10,
      "average_rating": 4.2,
      "effectiveness": "high"
    }
  ]
}
```

### Researcher Endpoints

#### GET /api/researchers/{researcher_id}/data/
Access de-identified patient data for analysis.

**Query Parameters:**
- `cohort_filters`: JSON object with filters
  - `diagnosis`: ['cardiology', 'neurology', ...]
  - `age_range`: [min, max]
  - `enrollment_date_range`: [start, end]
- `fields`: Comma-separated list of fields to return
- `page`: integer
- `limit`: integer 1-1000

**Response (200 OK):**
```json
{
  "total": 156,
  "de_identified": true,
  "items": [
    {
      "patient_id": "PATIENT_0001_HASH",
      "age_range": "60-70",
      "diagnosis": "cardiology",
      "baseline_metrics": {
        "bp": "140/90",
        "heart_rate": 78,
        "activity_level": "low"
      },
      "outcome_metrics": {
        "bp": "128/82",
        "heart_rate": 72,
        "activity_level": "moderate"
      },
      "sessions_completed": 24,
      "compliance_rate": 0.87
    }
  ]
}
```

#### GET /api/researchers/{researcher_id}/interventions/performance/
Get intervention performance statistics.

**Query Parameters:**
- `intervention_id`: optional filter
- `date_range`: [start, end]

**Response (200 OK):**
```json
{
  "interventions": [
    {
      "intervention_id": "507f1f77bcf86cd799439014",
      "title": "Cardiac Walking",
      "total_assignments": 156,
      "total_completions": 135,
      "completion_rate": 0.86,
      "average_rating": 4.3,
      "health_improvement": {
        "bp_reduction_mmhg": 12,
        "heart_rate_reduction_bpm": 8,
        "activity_increase_percent": 35
      },
      "statistical_significance": "p < 0.01"
    }
  ]
}
```

### Admin Endpoints

#### GET /api/admin/users/
Get all users with filtering and search.

**Query Parameters:**
- `role`: 'patient', 'therapist', 'researcher', 'admin'
- `status`: 'active', 'inactive', 'pending'
- `search`: text search on name/email
- `page`, `limit`

**Response (200 OK):**
```json
{
  "total": 342,
  "items": [
    {
      "user_id": "507f1f77bcf86cd799439011",
      "username": "johndoe",
      "email": "john@example.com",
      "role": "patient",
      "status": "active",
      "created_at": "2025-11-01"
    }
  ]
}
```

#### POST /api/admin/interventions/{intervention_id}/approve/
Approve a draft intervention for publication.

**Request Body:**
```json
{
  "approved": true,
  "comments": "Well-designed intervention with good safety precautions."
}
```

**Response (200 OK):**
```json
{
  "intervention_id": "507f1f77bcf86cd799439017",
  "status": "published",
  "approved_by": "admin_user",
  "approved_at": "2025-12-01T10:30:00Z",
  "message": "Intervention published and available to therapists"
}
```

#### GET /api/admin/system-health/
Get system health and performance metrics.

**Response (200 OK):**
```json
{
  "timestamp": "2025-12-01T10:00:00Z",
  "database": {
    "status": "healthy",
    "connection_time_ms": 2,
    "cpu_usage_percent": 35,
    "memory_usage_percent": 62,
    "storage_percent": 85
  },
  "api": {
    "uptime_percent": 99.97,
    "avg_response_time_ms": 125,
    "error_rate_percent": 0.02,
    "active_users": 342
  },
  "background_jobs": {
    "celery_workers": 2,
    "queued_jobs": 12,
    "failed_jobs_24h": 1
  }
}
```

---

## Security Architecture

### Authentication & Authorization

- **JWT Tokens**: Stateless authentication using JSON Web Tokens
- **Token Expiration**: Access tokens valid for 15 minutes, refresh tokens for 30 days
- **HTTPS**: All API communication encrypted with TLS 1.2+
- **Password Policy**: Minimum 10 characters, uppercase, lowercase, number, special character
- **Rate Limiting**: 100 requests per minute per user
- **MFA**: Optional two-factor authentication via TOTP

### Data Security

- **Encryption at Rest**: AES-256 encryption for sensitive data in MongoDB
- **Encryption in Transit**: TLS 1.2+ for all network communication
- **Sensitive Fields**: Password, tokens, health data encrypted in database
- **De-identification**: Researcher access to data with removed identifiers

### Access Control

- **Role-Based Access Control (RBAC)**: Permission-based on user role
- **Data Isolation**: Patients can only see own data, therapists only their patients' data
- **Audit Logging**: All user actions logged for compliance
- **Session Management**: Automatic logout after 30 minutes of inactivity

### Compliance

- **HIPAA Compliance**: Protected Health Information (PHI) handling
- **GDPR Compliance**: Data privacy and user rights
- **Data Retention**: Policy-based automatic archival and deletion
- **Backup & Recovery**: Daily encrypted backups with 30-day retention

---

## Integration Points

### Fitbit Integration

**OAuth 2.0 Flow:**
1. User clicks "Connect Fitbit"
2. Redirected to Fitbit OAuth authorization
3. User grants RehaAdvisor access
4. RehaAdvisor receives access token
5. Daily background job syncs data

**Data Synced:**
- Steps, distance, calories burned
- Heart rate zone minutes
- Sleep duration and quality
- Active minutes

**Endpoint:** `GET https://api.fitbit.com/1/user/[user-id]/activities/date/[date].json`

### Email Integration

**Provider:** AWS SES (Simple Email Service)
**Async Processing:** Celery task queue
**Templates:** 
- Welcome email
- Intervention assignment
- Progress reports
- Feedback requests

### External APIs

| Service | Purpose | Authentication | Rate Limit |
|---------|---------|-----------------|-----------|
| Fitbit | Health data sync | OAuth 2.0 | 150/hour |
| AWS S3 | Media storage | IAM credentials | Unlimited |
| SendGrid | Email delivery | API key | 100/second |

---

## Performance Considerations

### Caching Strategy

- **Redis**: In-memory cache for frequently accessed data
- **Cache TTL**: 5 minutes for user data, 1 hour for intervention library
- **Cache Invalidation**: Event-based invalidation on data changes

### Database Optimization

- **Indexing**: Indexes on frequently queried fields (user_id, patient_id, intervention_id)
- **Query Optimization**: Aggregation pipelines for complex queries
- **Batch Operations**: Bulk inserts/updates for health data

### Scalability

- **Horizontal Scaling**: Multiple Gunicorn workers and Celery workers
- **Load Balancing**: NGINX distributes traffic across backend instances
- **Async Processing**: Long-running tasks processed by Celery
- **CDN**: Static assets served from AWS CloudFront

### Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| API Response Time (p95) | < 500ms | 125ms |
| Page Load Time | < 2s | 1.2s |
| Database Query Time (p95) | < 100ms | 45ms |
| Uptime | 99.9% | 99.97% |
| Error Rate | < 0.1% | 0.02% |

---

*Last Updated: February 17, 2026*
