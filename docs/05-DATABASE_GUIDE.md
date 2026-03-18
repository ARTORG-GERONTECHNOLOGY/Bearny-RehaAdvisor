# Database Documentation

## Overview

RehaAdvisor uses MongoDB 8.0.3, a flexible, document-based NoSQL database. This guide covers database design, data modeling, querying, and best practices.

## MongoDB Basics

### Document Structure

MongoDB stores data as BSON documents (similar to JSON):

```json
{
  "_id": ObjectId("60f7b3c4d5e5f6g7h8i9j0k1"),
  "username": "john_doe",
  "email": "john@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "therapist",
  "created_at": ISODate("2024-01-15T10:30:00Z"),
  "updated_at": ISODate("2024-02-17T14:45:00Z"),
  "profile": {
    "bio": "Senior physiotherapist",
    "phone": "+1234567890",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "country": "USA"
    }
  },
  "specializations": ["orthopedic", "neurology"],
  "is_active": true
}
```

### Key Concepts

- **Collection**: A group of documents (similar to a table in SQL)
- **Document**: A record with fields (similar to a row in SQL)
- **Field**: A key-value pair within a document
- **_id**: Unique identifier for each document (auto-generated if not provided)
- **Embedding**: Storing related data within a document
- **Referencing**: Storing references to other documents

## Collections and Schema

### Collections in RehaAdvisor

```
rehaadvisor/
├── users                  # User accounts (therapists, researchers, admins)
├── patients               # Patient records
├── therapies              # Therapy programs and interventions
├── sessions               # Therapy sessions
├── assessments            # Patient assessments
├── progress_reports       # Treatment progress reports
├── feedback               # User feedback and ratings
├── interventions          # Rehabilitation interventions (Intervention documents)
├── InterventionTemplates  # Named shareable rehabilitation templates
├── settings               # Application settings
└── logs                   # Activity logs
```

### User Collection

```javascript
{
  "_id": ObjectId(...),
  "username": "therapist1",
  "email": "therapist1@example.com",
  "password_hash": "hashed_password",
  "first_name": "Jane",
  "last_name": "Smith",
  "role": "therapist",  // Values: "therapist", "researcher", "admin"
  "phone": "+1234567890",
  "bio": "Specialized in rehabilitation",
  "created_at": ISODate("2024-01-01"),
  "updated_at": ISODate("2024-02-17"),
  "is_active": true,
  "permissions": ["view_patients", "create_session", "edit_profile"],
  "last_login": ISODate("2024-02-17T10:00:00Z")
}
```

### Patient Collection

```javascript
{
  "_id": ObjectId(...),
  "first_name": "John",
  "last_name": "Doe",
  "date_of_birth": ISODate("1985-05-15"),
  "email": "john.doe@example.com",
  "phone": "+1234567890",
  "gender": "M",  // M, F, Other
  "medical_history": [
    {
      "condition": "Stroke",
      "diagnosis_date": ISODate("2023-01-10"),
      "status": "recovering",
      "notes": "Left side weakness"
    }
  ],
  "therapist_id": ObjectId("..."),  // Reference to therapist
  "current_therapy_id": ObjectId("..."),  // Reference to active therapy
  "emergency_contact": {
    "name": "Jane Doe",
    "relationship": "Spouse",
    "phone": "+1987654321"
  },
  "created_at": ISODate("2024-01-15"),
  "updated_at": ISODate("2024-02-17"),
  "status": "active"  // active, inactive, completed
}
```

### Session Collection

```javascript
{
  "_id": ObjectId(...),
  "patient_id": ObjectId("..."),
  "therapist_id": ObjectId("..."),
  "therapy_id": ObjectId("..."),
  "scheduled_date": ISODate("2024-02-20T14:00:00Z"),
  "duration_minutes": 60,
  "session_type": "assessment",  // assessment, treatment, follow-up
  "status": "completed",  // scheduled, completed, cancelled, rescheduled
  "notes": "Patient showed good progress",
  "exercises_performed": [
    {
      "exercise_id": "ex001",
      "name": "Range of Motion Test",
      "repetitions": 10,
      "sets": 3,
      "feedback": "Good"
    }
  ],
  "measurements": {
    "pain_level": 4,  // 1-10 scale
    "range_of_motion": 45,  // degrees
    "strength_score": 8  // 1-10 scale
  },
  "created_at": ISODate("2024-02-20T14:00:00Z"),
  "updated_at": ISODate("2024-02-20T15:15:00Z")
}
```

## Database Connection

### Configuration

```python
# config/settings/base.py
import os
from pymongo import MongoClient

# MongoDB Connection
MONGODB_URI = os.environ.get('MONGODB_URI', 'mongodb://localhost:27017/')
MONGODB_DB_NAME = os.environ.get('MONGODB_DB_NAME', 'rehaadvisor')

# Connect to MongoDB
mongo_client = MongoClient(MONGODB_URI)
mongo_db = mongo_client[MONGODB_DB_NAME]
```

### Using MongoEngine (Django ODM)

If using MongoEngine for ORM abstraction:

```python
# requirements.txt
mongoengine==0.27.0
```

```python
# core/models.py
from mongoengine import connect, Document, StringField, EmailField, DateTimeField, EmbeddedDocumentListField

connect('rehaadvisor')

class User(Document):
    username = StringField(required=True, unique=True)
    email = EmailField(required=True, unique=True)
    first_name = StringField(max_length=100)
    last_name = StringField(max_length=100)
    created_at = DateTimeField(default=datetime.datetime.now)
    
    meta = {
        'collection': 'users',
        'indexes': ['email', 'username']
    }
```

## Querying Data

### Using PyMongo (Direct MongoDB Driver)

```python
from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017/')
db = client['rehaadvisor']
users_collection = db['users']

# Find one user
user = users_collection.find_one({'email': 'john@example.com'})

# Find multiple users
therapists = users_collection.find({'role': 'therapist'})

# Insert document
new_user = {
    'username': 'newuser',
    'email': 'new@example.com',
    'role': 'patient'
}
result = users_collection.insert_one(new_user)

# Update document
users_collection.update_one(
    {'_id': ObjectId('...')},
    {'$set': {'email': 'newemail@example.com'}}
)

# Delete document
users_collection.delete_one({'_id': ObjectId('...')})

# Aggregation pipeline
pipeline = [
    {'$match': {'role': 'therapist'}},
    {'$group': {'_id': '$role', 'count': {'$sum': 1}}},
    {'$sort': {'count': -1}}
]
results = list(users_collection.aggregate(pipeline))
```

### Using MongoEngine

```python
# Query operations
users = User.objects(role='therapist')
active_users = User.objects(is_active=True)
user = User.objects.get(email='john@example.com')

# Filtering and projection
therapists = User.objects(role='therapist').only('email', 'first_name')

# Updating
user.update(set__email='newemail@example.com')

# Deletion
User.objects(id=user_id).delete()

# Aggregation
from mongoengine import aggregation
pipeline = [
    {'$group': {'_id': '$role', 'count': {'$sum': 1}}}
]
results = User.objects().aggregate(pipeline)
```

## Indexing

### Create Indexes

```python
# Indexes improve query performance
users_collection.create_index('email', unique=True)
users_collection.create_index('username', unique=True)
sessions_collection.create_index([('patient_id', 1), ('created_at', -1)])
patients_collection.create_index('therapist_id')
```

### Index Best Practices

- Index frequently queried fields
- Use compound indexes for multi-field queries
- Monitor index performance
- Avoid unnecessary indexes (they slow writes)

```python
# Check existing indexes
indexes = users_collection.list_indexes()
for index in indexes:
    print(index)

# Drop index
users_collection.drop_index('email_1')
```

## Data Relationships

### Embedding (De-normalized)

Use when related data is frequently accessed together:

```javascript
{
  "_id": ObjectId(...),
  "patient_id": ObjectId(...),
  "therapist": {  // Embedded therapist data
    "id": ObjectId(...),
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+1234567890"
  },
  "therapy": {  // Embedded therapy data
    "id": ObjectId(...),
    "name": "Stroke Rehabilitation",
    "type": "physical"
  }
}
```

### Referencing (Normalized)

Use when you need to update data independently:

```javascript
{
  "_id": ObjectId(...),
  "patient_id": ObjectId("patient_123"),
  "therapist_id": ObjectId("therapist_456"),  // Just store ID
  "therapy_id": ObjectId("therapy_789")
}
```

## Transactions

MongoDB 4.0+ supports multi-document transactions:

```python
from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017/')

with client.start_session() as session:
    with session.start_transaction():
        # Multiple operations
        users_collection.insert_one({'username': 'user1'}, session=session)
        sessions_collection.insert_one({'user_id': ..., 'date': ...}, session=session)
        # All succeed or all rollback
```

## Backup and Restore

### Backup Database

```bash
# Full database backup
mongodump --uri="mongodb://localhost:27017/" --out=/path/to/backup/

# Backup specific database
mongodump --db=rehaadvisor --out=/path/to/backup/

# Backup with compression
mongodump --uri="mongodb://localhost:27017/" --archive=/path/to/backup.archive --gzip
```

### Restore Database

```bash
# Restore from directory
mongorestore --uri="mongodb://localhost:27017/" /path/to/backup/

# Restore from archive
mongorestore --uri="mongodb://localhost:27017/" --archive=/path/to/backup.archive --gzip

# Restore to specific database
mongorestore --uri="mongodb://localhost:27017/" --db=rehaadvisor /path/to/backup/rehaadvisor/
```

## Performance Optimization

### Query Optimization

```python
# Use aggregation pipeline for complex queries
pipeline = [
    {'$match': {'role': 'therapist', 'is_active': True}},
    {'$lookup': {
        'from': 'patients',
        'localField': '_id',
        'foreignField': 'therapist_id',
        'as': 'patients'
    }},
    {'$project': {
        'name': 1,
        'email': 1,
        'patient_count': {'$size': '$patients'}
    }},
    {'$sort': {'patient_count': -1}},
    {'$limit': 10}
]
results = db['users'].aggregate(pipeline)
```

### Connection Pooling

```python
# Configure connection pool
client = MongoClient(
    'mongodb://localhost:27017/',
    maxPoolSize=50,
    minPoolSize=10,
    maxIdleTimeMS=45000
)
```

## Monitoring and Maintenance

### Monitor Database

```bash
# Connect to MongoDB shell
mongosh --connection-string "mongodb://localhost:27017/"

# Check database stats
db.stats()

# Check collection size
db.collection.stats()

# List all collections
db.getCollectionNames()

# Check slow queries
db.setProfilingLevel(1, {slowms: 100})
db.system.profile.find().limit(5).sort({ts: -1})
```

### Common Maintenance Tasks

```bash
# Compact database (reclaim space)
db.runCommand({compact: 'collection_name'})

# Rebuild indexes
db.collection.reIndex()

# Validate collection
db.collection.validate()
```

## Data Migration

### Migration Script Example

```python
# Migration to update existing documents
from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017/')
db = client['rehaadvisor']
users = db['users']

# Add new field to all documents
users.update_many(
    {},
    {'$set': {'last_login': None}}
)

# Rename field
users.update_many(
    {},
    {'$rename': {'old_field': 'new_field'}}
)

# Migrate data type
for user in users.find():
    users.update_one(
        {'_id': user['_id']},
        {'$set': {'created_at': user['created_at']}}  # Ensure date format
    )
```

---

## InterventionTemplates Collection

MongoDB collection: `InterventionTemplates`
MongoEngine model: `InterventionTemplate` (`backend/core/models.py`)

### Document schema

```javascript
{
  "_id": ObjectId("..."),

  // Metadata
  "name": "Stroke Recovery Week 1",          // required, max 200 chars
  "description": "Standard week 1 protocol", // optional, default ""
  "is_public": false,                         // visible to all therapists when true
  "created_by": ObjectId("..."),              // ReferenceField → Therapist

  // Optional filter tags
  "specialization": "Neurology",             // nullable
  "diagnosis": "Stroke",                     // nullable

  // Schedule payload — list of DefaultInterventions embedded documents
  "recommendations": [
    {
      "recommendation": ObjectId("..."),      // ReferenceField → Intervention

      // Keys are diagnosis strings, or "_all" for any-diagnosis entries
      "diagnosis_assignments": {
        "Stroke": [
          {
            "active": true,
            "interval": 1,
            "unit": "week",                   // "day" | "week" | "month"
            "selected_days": ["Mon", "Wed", "Fri"],
            "start_day": 1,
            "end_day": 14,
            "suggested_execution_time": 30    // minutes, nullable
          }
        ],
        "_all": [
          { "active": true, "interval": 1, "unit": "day", ... }
        ]
      }
    }
  ],

  "createdAt": ISODate("2026-01-01T00:00:00Z"),
  "updatedAt": ISODate("2026-01-02T00:00:00Z")
}
```

### Embedded sub-documents

#### `DefaultInterventions`

| Field | Type | Notes |
|---|---|---|
| `recommendation` | ReferenceField(Intervention) | Required — the referenced exercise/activity |
| `diagnosis_assignments` | DictField | Keys are diagnosis strings or `"_all"`; values are lists of `DiagnosisAssignmentSettings` |

#### `DiagnosisAssignmentSettings`

| Field | Type | Default | Notes |
|---|---|---|---|
| `active` | boolean | `true` | |
| `interval` | integer | `1` | Repeat every N units |
| `unit` | string | — | `"day"` \| `"week"` \| `"month"` |
| `selected_days` | list\[string\] | `[]` | e.g. `["Mon","Wed"]` |
| `start_day` | integer | `1` | Day 1 = effective start |
| `end_day` | integer | — | Last day (inclusive) |
| `suggested_execution_time` | integer | `null` | Minutes |

### `_all` sentinel

When an intervention is added without specifying a diagnosis (via `POST /api/templates/<id>/interventions/` with `diagnosis: ""`), the backend stores the schedule block under the key `"_all"`. When the template is applied to a patient, `_all` blocks match regardless of the patient's diagnosis filter.

### Ownership and visibility

- `is_public: false` → only `created_by` can see, modify, or delete.
- `is_public: true` → all authenticated therapists can see and copy.
- Only `created_by` may update or delete regardless of `is_public`.
- Copying produces a new private document owned by the copying therapist.

### MongoEngine query pattern

```python
from mongoengine.queryset.visitor import Q
from core.models import InterventionTemplate

# Templates visible to a therapist
visible = InterventionTemplate.objects.filter(
    Q(is_public=True) | Q(created_by=therapist)
)

# Filter by name substring
visible.filter(name__icontains="stroke")
```

---

## Best Practices

1. **Schema Design**:
   - Think about query patterns
   - Decide between embedding and referencing
   - Document your schema

2. **Indexing**:
   - Index frequently queried fields
   - Use compound indexes wisely
   - Monitor index performance

3. **Performance**:
   - Use projection to limit returned fields
   - Batch operations when possible
   - Use aggregation for complex queries

4. **Data Integrity**:
   - Validate data at application level
   - Use transactions for critical operations
   - Implement proper error handling

5. **Security**:
   - Use authentication
   - Encrypt sensitive data
   - Implement access control

6. **Backup**:
   - Regular automated backups
   - Test restore procedures
   - Keep backups offsite

---

**Related Documentation**:
- [Backend Development Guide](./04-BACKEND_GUIDE.md)
- [Deployment Guide](./06-DEPLOYMENT_GUIDE.md)
- [Troubleshooting](./08-TROUBLESHOOTING.md)
