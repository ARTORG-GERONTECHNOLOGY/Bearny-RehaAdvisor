# Code Standards and Best Practices

## Overview

This document outlines the coding standards, conventions, and best practices for the RehaAdvisor project. All contributors should follow these guidelines to maintain code quality and consistency.

## General Principles

1. **Readability**: Code should be easy to understand
2. **Maintainability**: Code should be easy to modify and extend
3. **Performance**: Code should be efficient and not waste resources
4. **Security**: Code should be secure and protect user data
5. **Testing**: Code should be thoroughly tested

## Python/Django Standards

### Code Style

Follow **PEP 8** with these modifications:

- Line length: 88 characters (Black formatter default)
- Indentation: 4 spaces
- Imports: Organized in three groups (stdlib, third-party, local)

```python
# Good example
from typing import Optional, List
from datetime import datetime

from django.db import models
from rest_framework import serializers

from core.models import Patient
from utils.validators import validate_email
```

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Classes | PascalCase | `TherapySession` |
| Functions/Methods | snake_case | `create_patient()` |
| Constants | UPPER_SNAKE_CASE | `MAX_SESSIONS = 100` |
| Private | Leading underscore | `_internal_method()` |
| Modules | snake_case | `therapy_utils.py` |

### Documentation

```python
def calculate_therapy_progress(
    patient_id: str,
    start_date: datetime,
    end_date: datetime
) -> float:
    """
    Calculate therapy progress percentage for a patient.
    
    This function computes the progress based on completed
    sessions and therapy goals.
    
    Args:
        patient_id: Unique patient identifier
        start_date: Start date for calculation
        end_date: End date for calculation
        
    Returns:
        Progress percentage (0-100)
        
    Raises:
        PatientNotFound: If patient doesn't exist
        InvalidDateRange: If end_date < start_date
        
    Example:
        >>> progress = calculate_therapy_progress(
        ...     "patient123",
        ...     datetime(2024, 1, 1),
        ...     datetime(2024, 2, 1)
        ... )
        >>> print(f"Progress: {progress}%")
        Progress: 75.5%
    """
```

### Type Hints

Always use type hints:

```python
# Good
def get_patient_sessions(
    patient_id: str,
    limit: int = 10
) -> List[TherapySession]:
    sessions: List[TherapySession] = []
    # Implementation
    return sessions

# Avoid
def get_patient_sessions(patient_id, limit=10):
    sessions = []
    # Implementation
    return sessions
```

### Error Handling

```python
# Good
try:
    patient = Patient.objects.get(id=patient_id)
except Patient.DoesNotExist:
    logger.error(f"Patient not found: {patient_id}")
    raise PatientNotFound(f"Patient {patient_id} does not exist")
except Exception as e:
    logger.error(f"Unexpected error: {str(e)}", exc_info=True)
    raise

# Avoid
try:
    patient = Patient.objects.get(id=patient_id)
except:
    pass
```

### Database Models

```python
class TherapySession(models.Model):
    """Model representing a therapy session."""
    
    DURATION_CHOICES = (
        (30, '30 minutes'),
        (60, '60 minutes'),
        (90, '90 minutes'),
    )
    
    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='sessions'
    )
    therapist = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True
    )
    scheduled_date = models.DateTimeField()
    duration = models.IntegerField(choices=DURATION_CHOICES, default=60)
    status = models.CharField(max_length=20, default='scheduled')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-scheduled_date']
        indexes = [
            models.Index(fields=['patient', '-scheduled_date']),
            models.Index(fields=['therapist', 'status']),
        ]
    
    def __str__(self) -> str:
        return f"Session: {self.patient} - {self.scheduled_date}"
    
    def is_completed(self) -> bool:
        """Check if session is completed."""
        return self.status == 'completed'
```

### API Views and Serializers

```python
class TherapySessionSerializer(serializers.ModelSerializer):
    """Serializer for TherapySession model."""
    
    patient_name = serializers.CharField(
        source='patient.get_full_name',
        read_only=True
    )
    therapist_name = serializers.CharField(
        source='therapist.get_full_name',
        read_only=True
    )
    
    class Meta:
        model = TherapySession
        fields = (
            'id', 'patient', 'patient_name', 'therapist',
            'therapist_name', 'scheduled_date', 'duration',
            'status', 'notes', 'created_at'
        )
        read_only_fields = ('id', 'created_at', 'patient_name', 'therapist_name')


class TherapySessionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing therapy sessions."""
    
    queryset = TherapySession.objects.all()
    serializer_class = TherapySessionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['patient_id', 'status']
    ordering_fields = ['scheduled_date', 'created_at']
    
    def get_queryset(self):
        """Filter sessions based on user role."""
        user = self.request.user
        if user.role == 'therapist':
            return self.queryset.filter(therapist=user)
        return self.queryset
```

## TypeScript/React Standards

### Code Style

- Line length: 100 characters
- Indentation: 2 spaces
- Quotes: Single quotes for strings
- Semicolons: Always use

```typescript
// Good
const MyComponent = (): JSX.Element => {
  const [isLoading, setIsLoading] = useState(false);
  
  return <div>Loading...</div>;
};

// Avoid
const MyComponent = () => {
  const [isLoading, setIsLoading] = useState(false)
  return <div>Loading...</div>
}
```

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `PatientForm.tsx` |
| Files | kebab-case | `patient-form.tsx` |
| Functions | camelCase | `formatDate()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Interfaces | PascalCase, I prefix | `IPatient` |
| Types | PascalCase | `TherapyStatus` |
| CSS Classes | kebab-case | `.patient-form__input` |

### Type Safety

Always use TypeScript types:

```typescript
// Good
interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  therapistId?: string;
}

const PatientCard: React.FC<{ patient: Patient }> = ({ patient }) => {
  return <div>{patient.firstName}</div>;
};

// Avoid
const PatientCard = ({ patient }) => {
  return <div>{patient.firstName}</div>;
};
```

### Component Structure

```typescript
// PatientForm.tsx
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { patientStore } from '../stores/patientStore';
import { Button } from './Button';
import { IPatient } from '../types';

interface PatientFormProps {
  onSubmit: (patient: IPatient) => void;
  initialData?: IPatient;
}

/**
 * Form component for creating and editing patients.
 */
export const PatientForm: React.FC<PatientFormProps> = observer(
  ({ onSubmit, initialData }) => {
    const [formData, setFormData] = useState<IPatient>(
      initialData || {
        id: '',
        firstName: '',
        lastName: '',
        email: '',
      }
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Validation
      const newErrors: Record<string, string> = {};
      if (!formData.firstName) newErrors.firstName = 'Required';
      if (!formData.email) newErrors.email = 'Required';
      
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      try {
        await onSubmit(formData);
      } catch (error) {
        console.error('Error submitting form:', error);
      }
    };

    return (
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="firstName"
          value={formData.firstName}
          onChange={handleChange}
          placeholder="First Name"
        />
        {errors.firstName && (
          <span className="error">{errors.firstName}</span>
        )}
        <Button type="submit">Submit</Button>
      </form>
    );
  }
);
```

### State Management with MobX

```typescript
// stores/patientStore.ts
import { makeObservable, observable, action, computed } from 'mobx';
import { api } from '../api/axios';
import { IPatient } from '../types';

class PatientStore {
  patients: IPatient[] = [];
  selectedPatient: IPatient | null = null;
  isLoading = false;
  error: string | null = null;

  constructor() {
    makeObservable(this, {
      patients: observable,
      selectedPatient: observable,
      isLoading: observable,
      error: observable,
      fetchPatients: action,
      createPatient: action,
      selectPatient: action,
      patientCount: computed,
    });
  }

  async fetchPatients() {
    this.isLoading = true;
    try {
      const response = await api.get('/patients/');
      this.patients = response.data;
      this.error = null;
    } catch (error) {
      this.error = 'Failed to fetch patients';
    } finally {
      this.isLoading = false;
    }
  }

  async createPatient(patient: IPatient) {
    try {
      const response = await api.post('/patients/', patient);
      this.patients.push(response.data);
    } catch (error) {
      this.error = 'Failed to create patient';
      throw error;
    }
  }

  selectPatient(patient: IPatient) {
    this.selectedPatient = patient;
  }

  get patientCount(): number {
    return this.patients.length;
  }
}

export const patientStore = new PatientStore();
```

### Testing

```typescript
// __tests__/components/PatientForm.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientForm } from '../../components/PatientForm';

describe('PatientForm', () => {
  it('renders form fields', () => {
    render(<PatientForm onSubmit={jest.fn()} />);
    expect(screen.getByPlaceholderText('First Name')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    const mockSubmit = jest.fn();
    render(<PatientForm onSubmit={mockSubmit} />);

    const button = screen.getByRole('button', { name: /submit/i });
    await userEvent.click(button);

    expect(mockSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('submits form with valid data', async () => {
    const mockSubmit = jest.fn();
    render(<PatientForm onSubmit={mockSubmit} />);

    await userEvent.type(
      screen.getByPlaceholderText('First Name'),
      'John'
    );
    await userEvent.type(screen.getByPlaceholderText('Email'), 'john@example.com');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(mockSubmit).toHaveBeenCalled();
  });
});
```

## Common Anti-Patterns to Avoid

### Python/Django

```python
# ❌ Don't: Multiple nested if statements
if user:
    if user.is_active:
        if user.role == 'therapist':
            # Do something

# ✅ Do: Early returns
def get_therapist(user):
    if not user:
        return None
    if not user.is_active:
        return None
    if user.role != 'therapist':
        return None
    return user

# ❌ Don't: Catch all exceptions
try:
    result = risky_operation()
except:
    pass

# ✅ Do: Catch specific exceptions
try:
    result = risky_operation()
except ValueError as e:
    logger.error(f"Invalid value: {e}")
    raise
```

### TypeScript/React

```typescript
// ❌ Don't: useEffect with missing dependencies
useEffect(() => {
  fetchData(userId);
}, []); // Missing userId dependency

// ✅ Do: Include all dependencies
useEffect(() => {
  fetchData(userId);
}, [userId]);

// ❌ Don't: Inline styles
<div style={{ color: 'red', fontSize: '16px' }}>Content</div>

// ✅ Do: Use CSS classes
<div className="alert alert--danger">Content</div>

// ❌ Don't: Prop drilling
<Component prop1={prop1} prop2={prop2} prop3={prop3} ... />

// ✅ Do: Use context or state management
const MyContext = createContext();
<MyContext.Provider value={{ prop1, prop2, prop3 }}>
  <Component />
</MyContext.Provider>
```

## Performance Best Practices

### Python/Django

```python
# ❌ Don't: N+1 queries
for patient in Patient.objects.all():
    print(patient.therapist.name)  # Query per patient

# ✅ Do: Use select_related
patients = Patient.objects.select_related('therapist').all()
for patient in patients:
    print(patient.therapist.name)

# ✅ Do: Use prefetch_related for reverse relations
therapists = CustomUser.objects.prefetch_related('patients').filter(role='therapist')
```

### TypeScript/React

```typescript
// ❌ Don't: Create objects in render
const MyComponent = () => {
  const style = { color: 'blue' }; // New object each render
  return <div style={style}>Content</div>;
};

// ✅ Do: Memoize objects
const myStyle = { color: 'blue' };
const MyComponent = () => {
  return <div style={myStyle}>Content</div>;
};

// ❌ Don't: Missing memoization
const ParentComponent = () => {
  return <ChildComponent data={complexData} />;
};

// ✅ Do: Memoize expensive components
const ChildComponent = React.memo(({ data }) => {
  return <div>{data}</div>;
});
```

## Security Best Practices

### Python/Django

```python
# ❌ Don't: SQL injection vulnerability
query = f"SELECT * FROM patients WHERE name = '{user_input}'"

# ✅ Do: Use ORM or parameterized queries
patients = Patient.objects.filter(name=user_input)

# ❌ Don't: Expose sensitive data in logs
logger.info(f"Password: {password}")

# ✅ Do: Log safely
logger.info("User authentication attempt")

# ❌ Don't: Store passwords in plain text
user.password = plain_text_password

# ✅ Do: Use Django's password hashing
user.set_password(plain_text_password)
```

### TypeScript/React

```typescript
// ❌ Don't: XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// ✅ Do: Sanitize or use trusted content
<div>{sanitizeHtml(userContent)}</div>

// ❌ Don't: Store sensitive data in localStorage
localStorage.setItem('authToken', token);

// ✅ Do: Use httpOnly cookies or sessionStorage
sessionStorage.setItem('temp_token', token);
```

---

**Related Documentation**:
- [Backend Development Guide](./04-BACKEND_GUIDE.md)
- [Frontend Development Guide](./03-FRONTEND_GUIDE.md)
- [Contributing Guidelines](./12-CONTRIBUTING.md)
