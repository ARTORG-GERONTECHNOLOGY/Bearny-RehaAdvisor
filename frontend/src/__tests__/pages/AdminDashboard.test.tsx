// ✅ Mock navigate before anything else
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
        this.loading = true;
        const authStore = require('@/stores/authStore').default;
        await authStore.checkAuthentication();

        if (!authStore.isAuthenticated || authStore.userType !== 'Admin') {
          navigate('/unauthorized');
          this.loading = false;
          return;
        }

        const adminStore = require('@/stores/adminStore').default;
        await adminStore.fetchPendingEntries();
        this.loading = false;
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

// ✅ Mock authStore properly BEFORE importing it!
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
  });

  it('redirects to unauthorized if user is not authenticated or not admin', async () => {
    mockAuthStore.isAuthenticated = false;
    mockAuthStore.userType = 'Therapist'; // Not admin

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
    });
  });

  it('renders pending entries correctly', async () => {
    mockAuthStore.checkAuthentication.mockResolvedValue(undefined);
    mockAuthStore.isAuthenticated = true;
    mockAuthStore.userType = 'Admin';

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
    mockAuthStore.checkAuthentication.mockResolvedValue(undefined);
    mockAuthStore.isAuthenticated = true;
    mockAuthStore.userType = 'Admin';

    mockAdminStore.fetchPendingEntries.mockResolvedValue(undefined);
    mockAdminStore.acceptEntry = jest.fn();
    mockAdminStore.pendingEntries = [
      { id: '1', name: 'Test User', email: 'test@example.com', type: 'Therapist' },
    ];

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    const acceptButton = screen.getByText('Accept');
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(mockAdminStore.acceptEntry).toHaveBeenCalledWith('1');
    });
  });

  it('calls declineEntry when Decline button is clicked and confirmed', async () => {
    mockAuthStore.checkAuthentication.mockResolvedValue(undefined);
    mockAuthStore.isAuthenticated = true;
    mockAuthStore.userType = 'Admin';

    mockAdminStore.fetchPendingEntries.mockResolvedValue(undefined);
    mockAdminStore.declineEntry = jest.fn().mockResolvedValue(undefined);
    mockAdminStore.pendingEntries = [
      { id: '1', name: 'Test User', email: 'test@example.com', type: 'Therapist' },
    ];

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    const declineButton = screen.getByText('Decline');
    fireEvent.click(declineButton);

    // The component uses a ConfirmModal, so we need to check that showDeclineConfirm was set
    await waitFor(() => {
      expect(mockStoreInstance?.showDeclineConfirm).toBe(true);
      expect(mockStoreInstance?.declineEntryId).toBe('1');
    });

    // Manually trigger the confirm action since we mocked the ConfirmModal
    await mockStoreInstance.declineConfirmed();

    expect(mockAdminStore.declineEntry).toHaveBeenCalledWith('1');
  });
});
