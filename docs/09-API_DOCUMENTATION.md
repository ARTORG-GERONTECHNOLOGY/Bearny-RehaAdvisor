# REST API Documentation

## Overview

RehaAdvisor provides a comprehensive REST API for managing rehabilitation programs, patient data, therapies, and user management. This document describes all available endpoints, request/response formats, authentication, and error handling.

## API Base URL

```
Development:  http://localhost:8001/api/
Production:   https://yourdomain.com/api/
```

## Authentication

### JWT (JSON Web Tokens)

RehaAdvisor uses JWT-based authentication. All authenticated endpoints require a bearer token in the Authorization header.

### Obtaining a Token

**Endpoint**: `POST /api/token/`

```bash
curl -X POST http://localhost:8001/api/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

**Response**:
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 1,
    "username": "username",
    "email": "user@example.com",
    "role": "therapist"
  }
}
```

### Using the Token

Include the access token in the Authorization header:

```bash
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:8001/api/patients/
```

### Refreshing Token

**Endpoint**: `POST /api/token/refresh/`

```bash
curl -X POST http://localhost:8001/api/token/refresh/ \
  -H "Content-Type: application/json" \
  -d '{
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
  }'
```

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "message": "Operation successful"
}
```

### Error Response

```json
{
  "success": false,
  "error": "Validation Error",
  "details": {
    "email": ["This field may not be blank."],
    "name": ["This field is required."]
  },
  "code": "VALIDATION_ERROR"
}
```

### List Response (Pagination)

```json
{
  "success": true,
  "data": [
    {"id": 1, "name": "Item 1"},
    {"id": 2, "name": "Item 2"}
  ],
  "pagination": {
    "count": 100,
    "next": "http://localhost:8001/api/endpoint/?page=2",
    "previous": null,
    "page_size": 20,
    "total_pages": 5
  }
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created successfully |
| 204 | No Content - Successful but no content returned |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource conflict |
| 422 | Unprocessable Entity - Validation failed |
| 500 | Internal Server Error - Server error |

## API Endpoints

### Users

#### List Users

**Endpoint**: `GET /api/users/`

**Authentication**: Required (Admin or staff only)

**Parameters**:
- `page` (int): Page number for pagination (default: 1)
- `search` (string): Search by name or email
- `role` (string): Filter by role (therapist, researcher, admin)
- `is_active` (boolean): Filter by active status

**Example**:
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8001/api/users/?role=therapist&is_active=true"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "therapist",
      "is_active": true,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {...}
}
```

#### Get User Details

**Endpoint**: `GET /api/users/{id}/`

**Example**:
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8001/api/users/1/
```

#### Create User

**Endpoint**: `POST /api/users/`

**Parameters** (JSON body):
- `username` (string, required): Unique username
- `email` (string, required): Valid email address
- `password` (string, required): Secure password
- `first_name` (string): First name
- `last_name` (string): Last name
- `role` (string): Role (therapist, researcher, admin)

**Example**:
```bash
curl -X POST http://localhost:8001/api/users/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jane_doe",
    "email": "jane@example.com",
    "password": "secure_password",
    "first_name": "Jane",
    "role": "therapist"
  }'
```

#### Update User

**Endpoint**: `PUT /api/users/{id}/` (full update) or `PATCH /api/users/{id}/` (partial update)

**Example**:
```bash
curl -X PATCH http://localhost:8001/api/users/1/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com"
  }'
```

#### Delete User

**Endpoint**: `DELETE /api/users/{id}/`

**Example**:
```bash
curl -X DELETE http://localhost:8001/api/users/1/ \
  -H "Authorization: Bearer <token>"
```

### Patients

#### List Patients

**Endpoint**: `GET /api/patients/`

**Authentication**: Required (Therapist or Admin)

**Parameters**:
- `page` (int): Page number
- `search` (string): Search by name or email
- `therapist_id` (int): Filter by therapist
- `status` (string): Filter by status (active, inactive, completed)

**Example**:
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8001/api/patients/?status=active"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "first_name": "John",
      "last_name": "Patient",
      "email": "patient@example.com",
      "phone": "+1234567890",
      "date_of_birth": "1985-05-15",
      "gender": "M",
      "therapist_id": 1,
      "therapist_name": "Jane Doe",
      "status": "active",
      "created_at": "2024-01-20T14:30:00Z",
      "updated_at": "2024-02-17T10:15:00Z"
    }
  ],
  "pagination": {...}
}
```

#### Get Patient Details

**Endpoint**: `GET /api/patients/{id}/`

**Example**:
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8001/api/patients/1/
```

#### Create Patient

**Endpoint**: `POST /api/patients/`

**Parameters** (JSON body):
- `first_name` (string, required)
- `last_name` (string, required)
- `email` (string, required): Unique email
- `phone` (string): Contact phone number
- `date_of_birth` (date): YYYY-MM-DD format
- `gender` (string): M, F, or Other
- `medical_history` (array): Medical conditions

**Example**:
```bash
curl -X POST http://localhost:8001/api/patients/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Patient",
    "email": "john@example.com",
    "phone": "+1234567890",
    "date_of_birth": "1985-05-15",
    "gender": "M"
  }'
```

#### Update Patient

**Endpoint**: `PATCH /api/patients/{id}/`

**Example**:
```bash
curl -X PATCH http://localhost:8001/api/patients/1/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+9876543210"
  }'
```

#### Delete Patient

**Endpoint**: `DELETE /api/patients/{id}/`

#### Get Therapist's Patients

**Endpoint**: `GET /api/patients/{id}/`

Returns all patients assigned to the current therapist.

#### Get Patients Plan for Patient

**Endpoint**: `GET /https://dev.reha-advisor.ch/api/patients/rehabilitation-plan/patient/{id}}/`

**Example Response**:

```bash
[
  {"intervention": 
    {"_id": "698de5deb2a641c5da612721", 
      "external_id": "4001", 
      "language": "de", 
      "provider": "Zentrum f\u00fcr Rehabilitation und Sportmedizin", 
      "title": "Steigerung des atmungsgekoppelten Gehtrainings von 90 auf 100 Schritte pro Minute", 
      "description": "Erkl\u00e4rungsvideos zu unterschiedlichen Schrittfrequenzen f\u00fcr unterschiedliche St\u00e4rkeklassen. Hier starten wir mit einer Schrittfrequenz von 90 Schritten pro Minute. Daran koppeln wir eine Atemfrequenz von drei Schritten w\u00e4hrend dem Einatmen und drei Schritte w\u00e4hrend dem Ausatmen.", 
      "content_type": "Video", 
      "input_from": null, "lc9": ["physiscal activity"], 
      "original_language": "de", "primary_diagnosis": null, 
      "aim": "Instructions", "topic": ["physical aciticity", "breathing"], 
      "cognitive_level": null, 
      "physical_level": null, 
      "frequency_time": null, 
      "timing": null, 
      "duration_bucket": "<5min", 
      "sex_specific": null, 
      "where": ["outside"], 
      "setting": ["individual"], 
      "keywords": [], "duration": 5, 
      "patient_types": [], "is_private": false, 
      "private_patient_id": null, 
      "preview_img": "", 
      "media": [{
        "kind": "external", 
        "media_type": "video", 
        "provider": "vimeo", 
        "title": "Steigerung des atmungsgekoppelten Gehtrainings von 90 auf 100 Schritte pro Minute", 
        "url": "https://vimeo.com/822621731?share=copy", 
        "embed_url": null, 
        "file_path": null, 
        "mime": null, 
        "thumbnail": null
      }]
    },
  }
]
```

#### Get Therapist's Patients

**Endpoint**: `GET /api/patients/{id}/`

Returns all patients assigned to the current therapist.


### Sessions

#### List Sessions

**Endpoint**: `GET /api/sessions/`

**Parameters**:
- `patient_id` (int): Filter by patient
- `therapist_id` (int): Filter by therapist
- `status` (string): Filter by status (scheduled, completed, cancelled)
- `date_from` (date): Filter from date (YYYY-MM-DD)
- `date_to` (date): Filter to date (YYYY-MM-DD)

**Example**:
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8001/api/sessions/?patient_id=1&status=completed"
```

#### Create Session

**Endpoint**: `POST /api/sessions/`

**Parameters**:
- `patient_id` (int, required)
- `therapy_id` (int, required)
- `scheduled_date` (datetime, required): ISO 8601 format
- `duration_minutes` (int): Session duration
- `session_type` (string): assessment, treatment, follow-up
- `notes` (string): Session notes

**Example**:
```bash
curl -X POST http://localhost:8001/api/sessions/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": 1,
    "therapy_id": 1,
    "scheduled_date": "2024-02-20T14:00:00Z",
    "duration_minutes": 60,
    "session_type": "treatment",
    "notes": "Good progress"
  }'
```

#### Complete Session

**Endpoint**: `POST /api/sessions/{id}/complete/`

**Parameters** (JSON body):
- `notes` (string): Session completion notes
- `measurements` (object): Session measurements
- `exercises_performed` (array): Exercises completed

**Example**:
```bash
curl -X POST http://localhost:8001/api/sessions/1/complete/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Patient completed all exercises",
    "measurements": {
      "pain_level": 4,
      "range_of_motion": 45
    },
    "exercises_performed": [
      {
        "exercise_id": "ex001",
        "repetitions": 10,
        "sets": 3
      }
    ]
  }'
```

### Therapies

#### List Therapies

**Endpoint**: `GET /api/therapies/`

**Parameters**:
- `type` (string): Filter by therapy type
- `is_active` (boolean): Filter by active status

**Example**:
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8001/api/therapies/?type=physical"
```

#### Get Therapy Details

**Endpoint**: `GET /api/therapies/{id}/`

### Assessments

#### List Assessments

**Endpoint**: `GET /api/assessments/`

**Parameters**:
- `patient_id` (int): Filter by patient
- `assessment_type` (string): Filter by type
- `date_from` (date): From date
- `date_to` (date): To date

#### Create Assessment

**Endpoint**: `POST /api/assessments/`

**Parameters**:
- `patient_id` (int, required)
- `assessment_type` (string, required): Type of assessment
- `results` (object): Assessment results and measurements
- `notes` (string): Additional notes

### Feedback

#### Submit Feedback

**Endpoint**: `POST /api/feedback/`

**Parameters** (JSON body):
- `subject` (string): Feedback subject
- `message` (string): Feedback message
- `rating` (int): Rating (1-5)
- `type` (string): bug, feature_request, general_feedback

**Example**:
```bash
curl -X POST http://localhost:8001/api/feedback/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Feature Request",
    "message": "Add support for video sessions",
    "rating": 4,
    "type": "feature_request"
  }'
```

#### List Feedback

**Endpoint**: `GET /api/feedback/`

**Authentication**: Admin only

## Error Codes

| Code | Description |
|------|-------------|
| VALIDATION_ERROR | Input validation failed |
| AUTHENTICATION_ERROR | Authentication required or invalid |
| AUTHORIZATION_ERROR | Insufficient permissions |
| NOT_FOUND | Resource not found |
| CONFLICT | Resource conflict (e.g., duplicate email) |
| SERVER_ERROR | Internal server error |
| SERVICE_UNAVAILABLE | Service temporarily unavailable |

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **Authenticated Requests**: 1000 requests per hour per user
- **Unauthenticated Requests**: 100 requests per hour per IP

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1645161600
```

## Pagination

List endpoints support pagination:

**Parameters**:
- `page` (int): Page number (default: 1)
- `page_size` (int): Items per page (default: 20, max: 100)

**Response**:
```json
{
  "pagination": {
    "count": 150,
    "next": "http://localhost:8001/api/endpoint/?page=2",
    "previous": null,
    "page_size": 20,
    "total_pages": 8
  }
}
```

## Filtering and Search

Most list endpoints support filtering:

```bash
# Search
curl "http://localhost:8001/api/patients/?search=john"

# Filter by field
curl "http://localhost:8001/api/patients/?status=active&gender=M"

# Combine search and filters
curl "http://localhost:8001/api/patients/?search=john&status=active"
```

## Sorting

Endpoints support sorting by prefixing field names with `-` for descending order:

```bash
# Ascending
curl "http://localhost:8001/api/patients/?ordering=first_name"

# Descending
curl "http://localhost:8001/api/patients/?ordering=-created_at"
```

## Webhooks (if implemented)

Webhooks allow your application to receive real-time notifications of events:

**Available Events**:
- `patient.created`
- `patient.updated`
- `session.completed`
- `feedback.submitted`

**Configuration**:
1. Go to `/api/settings/webhooks/`
2. Configure webhook URL and events
3. Receive POST requests with event data

---

**Related Documentation**:
- [Backend Development Guide](./04-BACKEND_GUIDE.md)
- [Frontend Development Guide](./03-FRONTEND_GUIDE.md)
- [Deployment Guide](./06-DEPLOYMENT_GUIDE.md)
