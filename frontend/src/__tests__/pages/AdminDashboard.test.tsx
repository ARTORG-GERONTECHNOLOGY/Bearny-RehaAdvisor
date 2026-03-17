// ✅ Mock navigate before anything else
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Stable t reference — avoids re-triggering useEffect([..., t]) on every render
const mockT = (key: string) => key;
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Mock mobx-react-lite
jest.mock('mobx-react-lite', () => ({
  observer: (component: React.ComponentType) => component,
}));

// Mock AdminDashboardStore
let mockStoreInstance: any = null;

jest.mock('@/stores/adminDashboardStore', () => {
  return {
    AdminDashboardStore: jest.fn().mockImplementation(function (this: any) {
      this.loading = false;
      this.error = null;
      this.showDeclineConfirm = false;
      this.declineEntryId = null;
      this.init = jest.fn(async (navigate: any) => {
        // Do not set this.loading — it's a plain property, not React state,
        // so changes won't trigger re-renders and will leave the component
        // stuck showing a spinner.
        const authStore = require('@/stores/authStore').default;
        await authStore.checkAuthentication();

        if (!authStore.isAuthenticated || authStore.userType !== 'Admin') {
          navigate('/unauthorized');
          return;
        }

        const adminStore = require('@/stores/adminStore').default;
        await adminStore.fetchPendingEntries();
      });
      this.setError = jest.fn((err: string | null) => {
        this.error = err;
      });
      this.accept = jest.fn(async (id: string) => {
        const adminStore = require('@/stores/adminStore').default;
        await adminStore.acceptEntry(id);
      });
      this.declineConfirmed = jest.fn(async () => {
        if (!this.declineEntryId) return;
        const adminStore = require('@/stores/adminStore').default;
        await adminStore.declineEntry(this.declineEntryId);
        this.closeDeclineConfirm();
      });
      this.openDeclineConfirm = jest.fn((id: string) => {
        this.declineEntryId = id;
        this.showDeclineConfirm = true;
      });
      this.closeDeclineConfirm = jest.fn(() => {
        this.showDeclineConfirm = false;
        this.declineEntryId = null;
      });
      mockStoreInstance = this;
      return this;
    }),
  };
});

// ✅ Mock authStore
const mockAuthStore = {
  id: 'mock-therapist-id',
  checkAuthentication: jest.fn(),
  isAuthenticated: true,
  userType: 'Admin',
};

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  get default() {
    return mockAuthStore;
  },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from '@/pages/AdminDashboard';
import '@testing-library/jest-dom';

jest.mock('@/components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('@/components/common/Footer', () => () => <div>Mock Footer</div>);
jest.mock('@/components/common/ErrorAlert', () => () => <div>Mock ErrorAlert</div>);
jest.mock('@/components/common/ConfirmModal', () => () => <div>Mock ConfirmModal</div>);

// Mock the apiClient
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));
import apiClient from '@/api/client';

// Mock MobX stores
const mockAdminStore = {
  pendingEntries: [] as any[],
  error: '',
  fetchPendingEntries: jest.fn().mockResolvedValue(undefined),
  acceptEntry: jest.fn().mockResolvedValue(undefined),
  declineEntry: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/stores/adminStore', () => ({
  __esModule: true,
  get default() {
    return mockAdminStore;
  },
}));

// ─── sample access change request ────────────────────────────────────────────

const sampleChangeRequest = {
  id: 'req-1',
  therapistId: 'th-1',
  therapistName: 'Jane Doe',
  therapistEmail: 'jane@example.com',
  currentClinics: ['Inselspital'],
  currentProjects: ['COPAIN'],
  requestedClinics: ['Berner Reha Centrum'],
  requestedProjects: ['COPAIN'],
  status: 'pending',
  createdAt: '2024-01-15T10:00:00Z',
  note: '',
};

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('AdminDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    mockAuthStore.isAuthenticated = true;
    mockAuthStore.userType = 'Admin';
    mockAuthStore.checkAuthentication.mockResolvedValue(undefined);
    mockAdminStore.pendingEntries = [];
    mockAdminStore.error = '';
    mockStoreInstance = null;

    // Default: no pending change requests
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { requests: [] } });
    (apiClient.put as jest.Mock).mockResolvedValue({ data: { ok: true } });
  });

  // ── auth / redirect ────────────────────────────────────────────────────────

  it('redirects to unauthorized if user is not authenticated', async () => {
    mockAuthStore.isAuthenticated = false;
    mockAuthStore.userType = 'Therapist';

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
    });
  });

  // ── pending registrations tab ─────────────────────────────────────────────

  it('renders pending entries correctly', async () => {
    mockAdminStore.fetchPendingEntries.mockResolvedValue(undefined);
    mockAdminStore.pendingEntries = [
      { id: '1', name: 'Test User', email: 'test@example.com', role: 'Therapist' },
    ];

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('calls acceptEntry when Accept button is clicked', async () => {
    mockAdminStore.acceptEntry = jest.fn();
    mockAdminStore.pendingEntries = [
      { id: '1', name: 'Test User', email: 'test@example.com', type: 'Therapist' },
    ];

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Accept'));

    await waitFor(() => {
      expect(mockAdminStore.acceptEntry).toHaveBeenCalledWith('1');
    });
  });

  it('calls declineEntry when Decline button is clicked and confirmed', async () => {
    mockAdminStore.declineEntry = jest.fn().mockResolvedValue(undefined);
    mockAdminStore.pendingEntries = [
      { id: '1', name: 'Test User', email: 'test@example.com', type: 'Therapist' },
    ];

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Decline'));

    await waitFor(() => {
      expect(mockStoreInstance?.showDeclineConfirm).toBe(true);
      expect(mockStoreInstance?.declineEntryId).toBe('1');
    });

    await mockStoreInstance.declineConfirmed();
    expect(mockAdminStore.declineEntry).toHaveBeenCalledWith('1');
  });

  // ── access change requests tab ────────────────────────────────────────────

  it('fetches access change requests on mount', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/admin/access-change-requests/');
    });
  });

  it('shows "Access change requests" tab with badge when requests exist', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { requests: [sampleChangeRequest] },
    });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Access change requests')).toBeInTheDocument();
    });
  });

  it('renders therapist name and email in access requests table', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { requests: [sampleChangeRequest] },
    });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    // Switch to access-requests tab
    await waitFor(() => expect(screen.getByText('Access change requests')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Access change requests'));

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    });
  });

  it('renders current and requested clinics/projects in access requests table', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { requests: [sampleChangeRequest] },
    });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Access change requests')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Access change requests'));

    await waitFor(() => {
      expect(screen.getByText('Inselspital')).toBeInTheDocument();
      expect(screen.getByText('Berner Reha Centrum')).toBeInTheDocument();
    });
  });

  it('calls approve endpoint when Approve button is clicked', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { requests: [sampleChangeRequest] },
    });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    // Switch to access-requests tab
    await waitFor(() => expect(screen.getByText('Access change requests')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Access change requests'));

    // Wait for tab-specific content ("Requested clinics" column only exists in this tab)
    // then wait for data to load (Jane Doe's row must be present)
    await waitFor(() => {
      expect(screen.getByText('Requested clinics')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    // Now click the Approve button — it's in the active pane
    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/admin/access-change-requests/req-1/',
        { action: 'approve' }
      );
    });
  });

  it('shows no pending message when change requests list is empty', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { requests: [] } });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Access change requests')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Access change requests'));

    await waitFor(() => {
      expect(
        screen.getByText('No pending access change requests')
      ).toBeInTheDocument();
    });
  });
});
