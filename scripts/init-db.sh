#!/bin/bash

# Database initialization script for MongoDB
# This script initializes the MongoDB database with required collections and indexes
# Run this after first deployment: make prod_migrate

set -e

echo "=== RehaAdvisor MongoDB Initialization ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Wait for MongoDB to be ready
echo -e "${YELLOW}Waiting for MongoDB to be ready...${NC}"
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker exec db-prod mongosh --eval 'db.adminCommand("ping")' > /dev/null 2>&1; then
        echo -e "${GREEN}MongoDB is ready${NC}"
        break
    fi
    attempt=$((attempt + 1))
    echo "Attempt $attempt/$max_attempts..."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}MongoDB failed to start${NC}"
    exit 1
fi

# Create databases and collections
echo -e "${YELLOW}Creating databases and collections...${NC}"

docker exec db-prod mongosh << 'EOF'
// Switch to admin database for user management
use admin

// Verify admin user (created by docker-compose)
var adminUser = db.getUser('admin')
if (adminUser) {
    print('✓ Admin user exists')
} else {
    print('✗ Admin user not found - this may be expected if already created')
}

// Switch to reha_advisor database
use reha_advisor

// Create collections with schema validation
print('Creating collections...')

// Users collection
db.createCollection('users', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['email', 'first_name', 'last_name', 'role', 'created_at'],
            properties: {
                _id: { bsonType: 'objectId' },
                email: { bsonType: 'string', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' },
                first_name: { bsonType: 'string' },
                last_name: { bsonType: 'string' },
                role: { enum: ['therapist', 'researcher', 'admin', 'patient'] },
                password_hash: { bsonType: 'string' },
                is_active: { bsonType: 'bool' },
                is_staff: { bsonType: 'bool' },
                created_at: { bsonType: 'date' },
                updated_at: { bsonType: 'date' }
            }
        }
    }
})
print('✓ users collection created')

// Patients collection
db.createCollection('patients', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['first_name', 'last_name', 'date_of_birth', 'created_at'],
            properties: {
                _id: { bsonType: 'objectId' },
                first_name: { bsonType: 'string' },
                last_name: { bsonType: 'string' },
                date_of_birth: { bsonType: 'date' },
                gender: { enum: ['M', 'F', 'O'] },
                contact_email: { bsonType: 'string' },
                contact_phone: { bsonType: 'string' },
                diagnoses: { bsonType: 'array' },
                therapist_id: { bsonType: 'objectId' },
                created_at: { bsonType: 'date' },
                updated_at: { bsonType: 'date' }
            }
        }
    }
})
print('✓ patients collection created')

// Sessions collection
db.createCollection('sessions', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['patient_id', 'therapist_id', 'session_date', 'created_at'],
            properties: {
                _id: { bsonType: 'objectId' },
                patient_id: { bsonType: 'objectId' },
                therapist_id: { bsonType: 'objectId' },
                session_date: { bsonType: 'date' },
                duration_minutes: { bsonType: 'int' },
                notes: { bsonType: 'string' },
                status: { enum: ['scheduled', 'completed', 'cancelled'] },
                created_at: { bsonType: 'date' },
                updated_at: { bsonType: 'date' }
            }
        }
    }
})
print('✓ sessions collection created')

// Therapies collection
db.createCollection('therapies', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'description', 'created_at'],
            properties: {
                _id: { bsonType: 'objectId' },
                name: { bsonType: 'string' },
                description: { bsonType: 'string' },
                category: { bsonType: 'string' },
                duration_minutes: { bsonType: 'int' },
                difficulty_level: { enum: ['easy', 'medium', 'hard'] },
                is_active: { bsonType: 'bool' },
                created_at: { bsonType: 'date' },
                updated_at: { bsonType: 'date' }
            }
        }
    }
})
print('✓ therapies collection created')

// Assessments collection
db.createCollection('assessments', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['patient_id', 'session_id', 'assessment_type', 'created_at'],
            properties: {
                _id: { bsonType: 'objectId' },
                patient_id: { bsonType: 'objectId' },
                session_id: { bsonType: 'objectId' },
                assessment_type: { bsonType: 'string' },
                scores: { bsonType: 'object' },
                notes: { bsonType: 'string' },
                created_at: { bsonType: 'date' },
                updated_at: { bsonType: 'date' }
            }
        }
    }
})
print('✓ assessments collection created')

// Feedback collection
db.createCollection('feedback', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['user_id', 'content', 'rating', 'created_at'],
            properties: {
                _id: { bsonType: 'objectId' },
                user_id: { bsonType: 'objectId' },
                content: { bsonType: 'string' },
                rating: { bsonType: 'int', minimum: 1, maximum: 5 },
                category: { bsonType: 'string' },
                is_resolved: { bsonType: 'bool' },
                created_at: { bsonType: 'date' },
                updated_at: { bsonType: 'date' }
            }
        }
    }
})
print('✓ feedback collection created')

// Create indexes for performance
print('')
print('Creating indexes...')

// Users indexes
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ role: 1 })
db.users.createIndex({ created_at: -1 })
print('✓ users indexes created')

// Patients indexes
db.patients.createIndex({ therapist_id: 1 })
db.patients.createIndex({ created_at: -1 })
db.patients.createIndex({ first_name: 1, last_name: 1 })
print('✓ patients indexes created')

// Sessions indexes
db.sessions.createIndex({ patient_id: 1 })
db.sessions.createIndex({ therapist_id: 1 })
db.sessions.createIndex({ session_date: -1 })
db.sessions.createIndex({ status: 1 })
print('✓ sessions indexes created')

// Assessments indexes
db.assessments.createIndex({ patient_id: 1 })
db.assessments.createIndex({ session_id: 1 })
db.assessments.createIndex({ assessment_type: 1 })
db.assessments.createIndex({ created_at: -1 })
print('✓ assessments indexes created')

// Feedback indexes
db.feedback.createIndex({ user_id: 1 })
db.feedback.createIndex({ created_at: -1 })
db.feedback.createIndex({ is_resolved: 1 })
print('✓ feedback indexes created')

print('')
print('=== Database initialization complete ===')
EOF

echo -e "${GREEN}✓ MongoDB initialization completed successfully${NC}"
