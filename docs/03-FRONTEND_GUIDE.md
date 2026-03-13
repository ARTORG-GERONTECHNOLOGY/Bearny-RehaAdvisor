# Frontend Development Guide

## Overview

The RehaAdvisor frontend is a modern React application built with Vite, providing a fast development experience and optimized production builds. The application is configured as a Progressive Web App (PWA), enabling installation on devices and offline functionality. This guide covers development practices, component structure, state management, PWA features, and best practices.

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
│   ├── icons/                 # PWA icons (various sizes)
│   ├── screenshots/           # PWA screenshots for app stores
│   └── ...
│
├── dist/                      # Build output (generated)
│   ├── sw.js                  # Service worker (auto-generated)
│   ├── manifest.webmanifest   # PWA manifest (auto-generated)
│   └── ...
│
├── index.html                 # HTML entry point
├── vite.config.js             # Vite configuration (includes PWA)
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

## Progressive Web App (PWA)

### Overview

RehaAdvisor is configured as a Progressive Web App, allowing users to install it on their devices and use it offline. The PWA functionality is powered by `vite-plugin-pwa`.

### Key Features

1. **Installable**: Users can install the app on desktop and mobile devices
2. **Offline Support**: Service worker caches assets for offline access
3. **Auto-Update**: Automatically updates to new versions
4. **App Icons**: Multiple icon sizes for different devices and contexts
5. **Splash Screens**: Screenshots for app store listings

### PWA Configuration

The PWA is configured in [vite.config.js](../frontend/vite.config.js):

```javascript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          id: '/',
          name: 'Bearny',
          short_name: 'Bearny',
          description: 'Beaready after Rehab',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          start_url: '/',
          icons: [
            // Multiple icon sizes (48x48 to 512x512)
          ],
          screenshots: [
            // Desktop and mobile screenshots
          ],
        },
      }),
    ],
  };
});
```

### Icon Requirements

All PWA icons must be placed in `public/icons/`:

- **favicon.ico**: Browser tab icon
- **apple-touch-icon.png** (180x180): iOS home screen icon
- **mask-icon.svg**: Safari pinned tab icon
- **pwa-48x48.png** through **pwa-512x512.png**: Various sizes for different devices

Required sizes: 48, 72, 96, 128, 144, 152, 192, 256, 384, 512 pixels

### Service Worker

The service worker (`public/sw.js`) handles PWA functionality and browser notifications:

```bash
npm run build
# Uses public/sw.js and generates dist/manifest.webmanifest
```

**Features**:
- Caches static assets for offline access
- Automatically updates when new version is deployed
- Handles notification display and click events
- Manages 24-hour notification scheduling

### Testing the PWA

To test PWA functionality:

```bash
# Build the app
npm run build

# Preview the production build
npm run preview

# Test in Chrome DevTools
# 1. Open Chrome DevTools (F12)
# 2. Go to Application > Service Workers
# 3. Go to Application > Manifest to verify PWA config
```

### Installing the App

**Desktop (Chrome/Edge)**:
1. Visit the app URL
2. Look for the install icon in the address bar
3. Click "Install" to add to desktop

**Mobile (iOS Safari)**:
1. Visit the app URL
2. Tap the Share button
3. Select "Add to Home Screen"

**Mobile (Android Chrome)**:
1. Visit the app URL
2. Tap the menu button (⋮)
3. Select "Install app" or "Add to Home Screen"

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

## Named Template System

### Overview

The named template system exposes a set of reusable rehabilitation schedules (InterventionTemplates) in the therapist's Interventions page. The feature is split across:

| Layer | File | Role |
|---|---|---|
| Types | `src/types/templates.ts` | `TemplateDoc`, `TemplateItem`, `TemplateRecommendation`, `TemplateScheduleBlock` |
| Store | `src/stores/templateStore.ts` | MobX store for CRUD operations |
| Modal | `src/components/TherapistInterventionPage/TemplateAssignModal.tsx` | Assign an intervention to a template |
| Modal | `src/components/TherapistInterventionPage/ApplyTemplateModal.tsx` | Apply a template to a patient |
| Page | `src/pages/TherapistInterventions.tsx` | Hosts the Templates tab with the management bar |

### TypeScript types

```typescript
// src/types/templates.ts

type TemplateDoc = {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  created_by: string;
  created_by_name: string;
  specialization: string | null;
  diagnosis: string | null;
  intervention_count: number;
  createdAt: string;
  updatedAt: string;
  recommendations?: TemplateRecommendation[];
};

type TemplateRecommendation = {
  intervention_id: string | null;
  intervention_title: string | null;
  diagnosis_assignments: Record<string, TemplateScheduleBlock[]>;
};

type TemplateScheduleBlock = {
  active: boolean;
  interval: number;
  unit: 'day' | 'week' | 'month';
  selected_days: string[];
  start_day: number;
  end_day: number | null;
  suggested_execution_time: number | null;
};

// Calendar preview (from GET /api/templates/<id>/calendar/)
type TemplateItem = {
  diagnosis: string;        // "" when the _all sentinel was used
  intervention: { _id, title, duration?, content_type?, tags? };
  schedule: { unit, interval, selectedDays, end };
  occurrences: { day: number; time?: string }[];
};
```

### `templateStore`

Location: `src/stores/templateStore.ts`

A singleton MobX store (`makeAutoObservable`) with the following observable state and async actions:

| Property / Method | Type | Description |
|---|---|---|
| `templates` | `TemplateDoc[]` | List of visible templates (loaded by `fetchTemplates`) |
| `loading` | `boolean` | True while any request is in flight |
| `error` | `string` | Last error message, `""` when clear |
| `fetchTemplates(filters?)` | `async void` | `GET templates/?[name=&specialization=&diagnosis=]` |
| `createTemplate(payload)` | `async TemplateDoc` | `POST templates/` — prepends result to `templates` |
| `deleteTemplate(id)` | `async void` | `DELETE templates/<id>/` — removes from `templates` |
| `copyTemplate(id, name?)` | `async TemplateDoc` | `POST templates/<id>/copy/` — prepends copy to `templates` |
| `updateTemplate(id, patch)` | `async TemplateDoc` | `PATCH templates/<id>/` — replaces matching entry in `templates` |
| `clearError()` | `void` | Resets `error` to `""` |

```typescript
// Usage in a component
import { observer } from 'mobx-react-lite';
import templateStore from '@/stores/templateStore';

const TemplateList = observer(() => {
  useEffect(() => { templateStore.fetchTemplates(); }, []);
  if (templateStore.loading) return <Spinner />;
  return <>{templateStore.templates.map(t => <div key={t.id}>{t.name}</div>)}</>;
});
```

### `TemplateAssignModal`

Assigns a single intervention to either a named template or the therapist's legacy implicit template.

**Key prop:**

```typescript
templateId?: string   // When set → named-template mode
```

**Behavioural differences by mode:**

| Aspect | Legacy mode (`templateId` absent) | Named-template mode |
|---|---|---|
| API endpoint | `therapists/<id>/interventions/assign-to-patient-types/` | `templates/<id>/interventions/` |
| Diagnosis | Required (blocks Save) | Optional — blank sends `diagnosis: ""` → stored under `_all` |
| Default option | "Choose…" | "All diagnoses" |
| Label hint | — | "(optional — leave blank for all)" |

### `ApplyTemplateModal`

Applies a template to a patient's rehabilitation plan.

**Key prop:**

```typescript
templateId?: string   // When set → named-template mode
```

**Behavioural differences by mode:**

| Aspect | Legacy mode | Named-template mode |
|---|---|---|
| API endpoint | `therapists/<id>/templates/apply` | `templates/<id>/apply/` |
| Diagnosis | Required for Submit | Optional — blank applies all diagnosis keys |
| canSubmit | `patientId && effectiveFrom && !!diagnosis` | `patientId && effectiveFrom` |

### Templates tab — management bar

The Templates tab in `TherapistInterventions.tsx` renders a Card above the schedule grid with:

1. **Selector dropdown** — "Implicit template" option + one `<option>` per `TemplateDoc` from `templateStore.templates`.
2. **"+ New" button** — opens the New Template modal (name, description, public checkbox).
3. **Apply / Copy / Delete buttons** — only shown when a named template is selected (`activeTemplateId` state is set).
4. **Description text** — shown beneath the selector when the active template has a `description`.

**`fetchTemplates` routing** — the page-level function accepts an optional `namedId` parameter:

```typescript
const fetchTemplates = async (namedId?: string) => {
  if (namedId) {
    // Named template calendar
    await apiClient.get(`templates/${namedId}/calendar/?horizon_days=...`);
  } else {
    // Legacy implicit template
    await apiClient.get(`therapists/${authStore.id}/template-plan`);
  }
};
```

**`removeTemplateItem` routing** — similarly routes to `DELETE templates/<id>/interventions/<int_id>/` for named templates or the legacy POST for the implicit template.

---

**Related Documentation**:
- [Backend Development Guide](./04-BACKEND_GUIDE.md)
- [API Documentation](./09-API_DOCUMENTATION.md)
- [Code Standards](./13-CODE_STANDARDS.md)
