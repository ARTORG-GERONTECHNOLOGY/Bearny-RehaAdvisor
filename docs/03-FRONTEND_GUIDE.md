# Frontend Development Guide

## Overview

The RehaAdvisor frontend is a modern React application built with Vite, providing a fast development experience and optimized production builds. This guide covers development practices, component structure, state management, and best practices.

## Project Structure

```
frontend/
├── src/
│   ├── api/                    # API communication layer
│   │   ├── axios.ts           # Axios instance configuration
│   │   └── endpoints.ts        # API endpoint definitions
│   │
│   ├── assets/                # Static assets
│   │   ├── lang/              # i18n language files (de.json, etc.)
│   │   ├── images/
│   │   └── styles/
│   │
│   ├── components/            # Reusable UI components
│   │   ├── Button/
│   │   ├── Form/
│   │   ├── Header/
│   │   ├── Sidebar/
│   │   └── ...
│   │
│   ├── pages/                 # Page-level components (routed views)
│   │   ├── Dashboard/
│   │   ├── Profile/
│   │   ├── Settings/
│   │   └── ...
│   │
│   ├── stores/                # MobX state management
│   │   ├── authStore.ts       # Authentication state
│   │   ├── userStore.ts       # User data state
│   │   ├── appStore.ts        # Global app state
│   │   └── ...
│   │
│   ├── hooks/                 # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useFetch.ts
│   │   └── ...
│   │
│   ├── routes/                # Route configuration
│   │   └── Routes.tsx
│   │
│   ├── types/                 # TypeScript type definitions
│   │   ├── api.ts
│   │   ├── models.ts
│   │   └── ...
│   │
│   ├── utils/                 # Utility functions
│   │   ├── validators.ts
│   │   ├── formatters.ts
│   │   └── ...
│   │
│   ├── __tests__/             # Unit tests
│   │   ├── components/
│   │   ├── stores/
│   │   └── ...
│   │
│   ├── main.tsx               # Application entry point
│   ├── RootLayout.tsx         # Root layout component
│   └── vite-env.d.ts          # Vite environment types
│
├── public/                    # Static files (copied as-is)
├── index.html                 # HTML entry point
├── vite.config.js             # Vite configuration
├── tsconfig.json              # TypeScript configuration
├── jest.config.ts             # Jest test configuration
├── jest.setup.ts              # Jest setup file
├── package.json               # Dependencies and scripts
├── babel.config.js            # Babel configuration
├── i18n.js                    # Internationalization setup
└── .env.example               # Environment variables template
```

## Development Setup

### Install Dependencies

```bash
cd frontend
npm install
```

### Available Scripts

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Lint code
npm run lint

# Format code
npm run format
```

## State Management with MobX

### Concepts

MobX uses **observables** and **actions** for reactive state management:

- **Observable**: A value that MobX tracks for changes
- **Action**: A method that modifies observables
- **Reaction**: Automatically re-runs when observables change
- **Computed**: Derived values based on observables

### Creating a Store

```typescript
// stores/exampleStore.ts
import { makeObservable, observable, action, computed } from 'mobx';

class ExampleStore {
  count = 0;
  items: string[] = [];

  constructor() {
    makeObservable(this, {
      count: observable,
      items: observable,
      increment: action,
      decrement: action,
      addItem: action,
      itemCount: computed,
    });
  }

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }

  addItem(item: string) {
    this.items.push(item);
  }

  get itemCount() {
    return this.items.length;
  }
}

export const exampleStore = new ExampleStore();
```

### Using Stores in Components

```typescript
// Component
import { observer } from 'mobx-react-lite';
import { exampleStore } from '../stores/exampleStore';

export const ExampleComponent = observer(() => {
  return (
    <div>
      <p>Count: {exampleStore.count}</p>
      <p>Items: {exampleStore.itemCount}</p>
      <button onClick={() => exampleStore.increment()}>Increment</button>
      <button onClick={() => exampleStore.addItem('new')}>Add Item</button>
    </div>
  );
});
```

### AuthStore Pattern

```typescript
// stores/authStore.ts
import { makeObservable, observable, action } from 'mobx';
import { api } from '../api/axios';

class AuthStore {
  token: string | null = null;
  user: User | null = null;
  isLoading = false;
  error: string | null = null;

  constructor() {
    makeObservable(this, {
      token: observable,
      user: observable,
      isLoading: observable,
      error: observable,
      login: action,
      logout: action,
      setToken: action,
    });

    // Load token from localStorage on init
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      this.token = savedToken;
      api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
    }
  }

  async login(email: string, password: string) {
    this.isLoading = true;
    try {
      const response = await api.post('/token/', { email, password });
      this.setToken(response.data.access);
      this.user = response.data.user;
    } catch (error) {
      this.error = 'Login failed';
    } finally {
      this.isLoading = false;
    }
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('authToken', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('authToken');
    delete api.defaults.headers.common['Authorization'];
  }
}

export const authStore = new AuthStore();
```

## API Communication

### Axios Configuration

```typescript
// api/axios.ts
import axios from 'axios';

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:8001';

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### API Endpoints

```typescript
// api/endpoints.ts
export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/token/',
    REFRESH: '/token/refresh/',
    LOGOUT: '/logout/',
  },
  USERS: {
    LIST: '/users/',
    DETAIL: (id: string) => `/users/${id}/`,
    CREATE: '/users/',
    UPDATE: (id: string) => `/users/${id}/`,
    DELETE: (id: string) => `/users/${id}/`,
  },
  // Add more endpoints
};
```

### Using API in Components

```typescript
// Example: Fetch data in component
import { useEffect, useState } from 'react';
import { api } from '../api/axios';

export const UserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get('/users/');
        setUsers(response.data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
};
```

## Component Patterns

### Functional Component

```typescript
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ label, onClick, disabled = false }) => {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
};
```

### Form Component

```typescript
import React, { useState } from 'react';

interface FormData {
  name: string;
  email: string;
}

export const UserForm: React.FC<{ onSubmit: (data: FormData) => void }> = ({ onSubmit }) => {
  const [formData, setFormData] = useState<FormData>({ name: '', email: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        name="name"
        value={formData.name}
        onChange={handleChange}
        placeholder="Name"
      />
      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="Email"
      />
      <button type="submit">Submit</button>
    </form>
  );
};
```

## Internationalization (i18n)

### Language Files

Language files are stored in `src/assets/lang/`:
```
lang/
├── de.json      # German
├── en.json      # English
├── fr.json      # French
└── ...
```

### Using Translations

```typescript
import { useTranslation } from 'i18next';

export const MyComponent = () => {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.title')}</h1>
      <p>{t('common.description')}</p>
    </div>
  );
};
```

## Testing

### Jest Setup

Tests use Jest and React Testing Library:

```typescript
// __tests__/components/Button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../../components/Button';

describe('Button Component', () => {
  it('renders button with label', () => {
    render(<Button label="Click me" onClick={() => {}} />);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const mockClick = jest.fn();
    render(<Button label="Click me" onClick={mockClick} />);
    
    await userEvent.click(screen.getByText('Click me'));
    expect(mockClick).toHaveBeenCalled();
  });
});
```

## Best Practices

1. **Component Organization**:
   - Keep components small and focused
   - Use descriptive names
   - Extract reusable logic into custom hooks

2. **State Management**:
   - Use MobX stores for global state
   - Use useState for local component state
   - Minimize state prop drilling with context or stores

3. **Type Safety**:
   - Use TypeScript for all components
   - Define prop interfaces explicitly
   - Use strict mode in tsconfig

4. **Performance**:
   - Use `observer` HOC for MobX components
   - Memoize expensive computations
   - Lazy load routes and components

5. **Error Handling**:
   - Wrap API calls in try-catch
   - Display user-friendly error messages
   - Log errors for debugging

6. **Accessibility**:
   - Use semantic HTML
   - Add ARIA labels where needed
   - Test keyboard navigation

7. **Code Quality**:
   - Follow consistent naming conventions
   - Write unit tests for components
   - Use TypeScript strict mode

## Environment Variables

Create a `.env` file in the frontend directory:

```
VITE_API_URL=http://localhost:8001
VITE_APP_NAME=RehaAdvisor
VITE_DEBUG=true
```

Access them in code:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

---

**Related Documentation**:
- [Backend Development Guide](./04-BACKEND_GUIDE.md)
- [API Documentation](./09-API_DOCUMENTATION.md)
- [Code Standards](./13-CODE_STANDARDS.md)
