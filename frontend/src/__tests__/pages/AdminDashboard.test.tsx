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
      this.init = jest.fn(async () => {
        // Do not set this.loading — it's a plain property, not React state,
        // so changes won't trigger re-renders and will leave the component
        // stuck showing a spinner.
        const adminStore = jest.requireMock('@/stores/adminStore').default;
        await adminStore.fetchPendingEntries();
      });
      this.setError = jest.fn((err: string | null) => {
        this.error = err;
      });
      this.accept = jest.fn(async (id: string) => {
        const adminStore = jest.requireMock('@/stores/adminStore').default;
        await adminStore.acceptEntry(id);
      });
      this.declineConfirmed = jest.fn(async () => {
        if (!this.declineEntryId) return;
        const adminStore = jest.requireMock('@/stores/adminStore').default;
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
      // eslint-disable-next-line @typescript-eslint/no-this-alias
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
  logout: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  get default() {
    return mockAuthStore;
  },
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from '@/pages/AdminDashboard';
import '@testing-library/jest-dom';

jest.mock(
  '@/components/common/ErrorAlert',
  () =>
    function ErrorAlert() {
      return <div>Mock ErrorAlert</div>;
    }
);
jest.mock('@/components/common/ConfirmModal', () => ({
  __esModule: true,
  default: ({
    show,
    title,
    body,
    cancelText,
    confirmText,
    onHide,
    onConfirm,
    isConfirmDisabled,
  }: any) => {
    if (!show) return null;
    return (
      <div data-testid="confirm-modal">
        <div>{title}</div>
        <div>{body}</div>
        <button onClick={onHide}>{cancelText}</button>
        <button onClick={onConfirm} disabled={isConfirmDisabled}>
          {confirmText}
        </button>
      </div>
    );
  },
}));

// Mock the apiClient
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
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
      expect(
        screen.getByRole('heading', {
          name: 'Admin Dashboard',
          level: 1,
        })
      ).toBeInTheDocument();
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
      expect(apiClient.put).toHaveBeenCalledWith('/admin/access-change-requests/req-1/', {
        action: 'approve',
      });
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
      expect(screen.getByText('No pending access change requests')).toBeInTheDocument();
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  it('logs out and navigates to home when Logout is clicked', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Admin Dashboard', level: 1 })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(mockAuthStore.logout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // ── interventions tab ─────────────────────────────────────────────────────

  describe('interventions tab', () => {
    const mockApiGet = (overrides: Record<string, any> = {}) => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/interventions/') {
          return Promise.resolve({ data: { interventions: overrides.interventions || [] } });
        }
        return Promise.resolve({ data: {} });
      });
    };

    const sampleIntervention = {
      _id: 'iv-1',
      external_id: '3500_web',
      language: 'en',
      title: 'Breathing Exercise',
      content_type: 'video',
      is_private: false,
    };

    it('fetches interventions on mount and renders them', async () => {
      mockApiGet({ interventions: [sampleIntervention] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/admin/interventions/'));
      fireEvent.click(screen.getByText('Interventions'));

      await waitFor(() => {
        expect(screen.getByText('3500_web')).toBeInTheDocument();
        expect(screen.getByText('Breathing Exercise')).toBeInTheDocument();
        expect(screen.getByText('Public')).toBeInTheDocument();
      });
    });

    it('shows a Private badge for private interventions', async () => {
      mockApiGet({ interventions: [{ ...sampleIntervention, is_private: true }] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Interventions'));
      await waitFor(() =>
        expect(screen.getByText('Private', { selector: 'span.badge' })).toBeInTheDocument()
      );
    });

    it('shows an empty state when there are no interventions', async () => {
      mockApiGet({ interventions: [] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Interventions'));
      await waitFor(() => expect(screen.getByText('No interventions found')).toBeInTheDocument());
    });

    it('filters interventions by title via the search box', async () => {
      mockApiGet({
        interventions: [
          sampleIntervention,
          { ...sampleIntervention, _id: 'iv-2', external_id: '3600_aud', title: 'Relaxation Audio' },
        ],
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Interventions'));
      await waitFor(() => expect(screen.getByText('Relaxation Audio')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('Search by title or ID…'), {
        target: { value: 'breathing' },
      });

      expect(screen.getByText('Breathing Exercise')).toBeInTheDocument();
      expect(screen.queryByText('Relaxation Audio')).not.toBeInTheDocument();
    });

    it('shows an error alert when fetching interventions fails', async () => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/interventions/') return Promise.reject(new Error('network down'));
        return Promise.resolve({ data: {} });
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Interventions'));
      await waitFor(() => expect(screen.getByText('network down')).toBeInTheDocument());
    });

    it('deletes an intervention after confirming', async () => {
      mockApiGet({ interventions: [sampleIntervention] });
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Interventions'));
      await waitFor(() => expect(screen.getByText('Breathing Exercise')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      const modal = await screen.findByTestId('confirm-modal');
      fireEvent.click(within(modal).getByRole('button', { name: /^Delete$/ }));

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith('/admin/interventions/iv-1/');
      });
    });
  });

  // ── questionnaires tab ────────────────────────────────────────────────────

  describe('questionnaires tab', () => {
    const mockApiGet = (overrides: Record<string, any> = {}) => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/questionnaires/') {
          return Promise.resolve({ data: { questionnaires: overrides.questionnaires || [] } });
        }
        return Promise.resolve({ data: {} });
      });
    };

    const sampleQuestionnaire = {
      _id: 'q-1',
      key: 'PHQ9',
      title: 'PHQ-9',
      description: 'Depression screening',
      tags: ['mental-health'],
      question_count: 9,
      usage_count: 0,
      created_by_name: 'Dr. Admin',
      version: 1,
      updatedAt: null,
    };

    it('fetches questionnaires on mount and renders them', async () => {
      mockApiGet({ questionnaires: [sampleQuestionnaire] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/admin/questionnaires/'));
      fireEvent.click(screen.getByText('Questionnaires'));

      await waitFor(() => {
        expect(screen.getByText('PHQ9')).toBeInTheDocument();
        expect(screen.getByText('PHQ-9')).toBeInTheDocument();
        expect(screen.getByText('mental-health')).toBeInTheDocument();
        expect(screen.getByText('Dr. Admin')).toBeInTheDocument();
      });
    });

    it('shows an empty state when there are no questionnaires', async () => {
      mockApiGet({ questionnaires: [] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Questionnaires'));
      await waitFor(() => expect(screen.getByText('No questionnaires found')).toBeInTheDocument());
    });

    it('filters questionnaires by tag via the search box', async () => {
      mockApiGet({
        questionnaires: [
          sampleQuestionnaire,
          { ...sampleQuestionnaire, _id: 'q-2', key: 'GAD7', title: 'GAD-7', tags: ['anxiety'] },
        ],
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Questionnaires'));
      await waitFor(() => expect(screen.getByText('GAD-7')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('Search by title, key or tag…'), {
        target: { value: 'anxiety' },
      });

      expect(screen.getByText('GAD-7')).toBeInTheDocument();
      expect(screen.queryByText('PHQ-9')).not.toBeInTheDocument();
    });

    it('edits a questionnaire and saves the changes', async () => {
      mockApiGet({ questionnaires: [sampleQuestionnaire] });
      (apiClient.put as jest.Mock).mockResolvedValue({ data: {} });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Questionnaires'));
      await waitFor(() => expect(screen.getByText('PHQ-9')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      const titleInput = await screen.findByDisplayValue('PHQ-9');
      fireEvent.change(titleInput, { target: { value: 'PHQ-9 Updated' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/admin/questionnaires/q-1/', {
          title: 'PHQ-9 Updated',
          description: 'Depression screening',
          tags: ['mental-health'],
        });
      });
    });

    it('warns about existing plan assignments when deleting a used questionnaire', async () => {
      mockApiGet({ questionnaires: [{ ...sampleQuestionnaire, usage_count: 3 }] });
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Questionnaires'));
      await waitFor(() => expect(screen.getByText('PHQ-9')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      const modal = await screen.findByTestId('confirm-modal');
      expect(within(modal).getByText(/currently assigned to/)).toBeInTheDocument();

      fireEvent.click(within(modal).getByRole('button', { name: /^Delete$/ }));

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith('/admin/questionnaires/q-1/');
      });
    });
  });

  // ── export tab ─────────────────────────────────────────────────────────────

  describe('export tab', () => {
    const mockApiGet = (overrides: Record<string, any> = {}) => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/export/clinics/') {
          return Promise.resolve({ data: { clinics: overrides.clinics || [] } });
        }
        if (url.startsWith('/admin/export/patients/')) {
          return Promise.resolve({ data: new Blob(['zip-bytes']) });
        }
        return Promise.resolve({ data: {} });
      });
    };

    beforeEach(() => {
      (URL as any).createObjectURL = jest.fn(() => 'blob:mock-url');
      (URL as any).revokeObjectURL = jest.fn();
    });

    it('shows a message when there are no clinics in the database', async () => {
      mockApiGet({ clinics: [] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Export'));
      await waitFor(() =>
        expect(screen.getByText('No clinics found in the database.')).toBeInTheDocument()
      );
    });

    it('renders clinic checkboxes, all selected by default', async () => {
      mockApiGet({ clinics: ['Inselspital', 'Berner Reha Centrum'] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Export'));
      await waitFor(() => expect(screen.getByLabelText('Inselspital')).toBeInTheDocument());

      expect(screen.getByLabelText('Inselspital')).toBeChecked();
      expect(screen.getByLabelText('Berner Reha Centrum')).toBeChecked();
      expect(screen.getByText('Export selected clinics (2)')).toBeInTheDocument();
    });

    it('deselects all and re-selects all clinics', async () => {
      mockApiGet({ clinics: ['Inselspital', 'Berner Reha Centrum'] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Export'));
      await waitFor(() => expect(screen.getByLabelText('Inselspital')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }));
      expect(screen.getByLabelText('Inselspital')).not.toBeChecked();
      expect(screen.getByText('Export selected clinics (0)')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
      expect(screen.getByLabelText('Inselspital')).toBeChecked();
      expect(screen.getByText('Export selected clinics (2)')).toBeInTheDocument();
    });

    it('toggles an individual clinic checkbox', async () => {
      mockApiGet({ clinics: ['Inselspital', 'Berner Reha Centrum'] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Export'));
      await waitFor(() => expect(screen.getByLabelText('Inselspital')).toBeInTheDocument());

      fireEvent.click(screen.getByLabelText('Inselspital'));
      expect(screen.getByLabelText('Inselspital')).not.toBeChecked();
      expect(screen.getByText('Export selected clinics (1)')).toBeInTheDocument();
    });

    it('downloads a ZIP export for all patients', async () => {
      mockApiGet({ clinics: ['Inselspital'] });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Export'));
      await waitFor(() => expect(screen.getByLabelText('Inselspital')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Export all patients (ZIP)' }));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/admin/export/patients/?clinics=all', {
          responseType: 'blob',
        });
      });
    });

    it('shows an export error when the download fails', async () => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/export/clinics/') return Promise.resolve({ data: { clinics: ['A'] } });
        if (url.startsWith('/admin/export/patients/')) return Promise.reject(new Error('boom'));
        return Promise.resolve({ data: {} });
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Export'));
      await waitFor(() => expect(screen.getByLabelText('A')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Export all patients (ZIP)' }));
      await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    });
  });

  // ── analytics tab ─────────────────────────────────────────────────────────

  describe('analytics tab', () => {
    it('shows a placeholder before the tab has ever been opened', async () => {
      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Admin Dashboard', level: 1 })).toBeInTheDocument()
      );
      expect(screen.getByText('Click the Analytics tab to load data.')).toBeInTheDocument();
    });

    it('fetches and renders device analytics when the tab is opened', async () => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/analytics/devices/') {
          return Promise.resolve({
            data: {
              by_device: { Mobile: 5, Desktop: 2, Tablet: 0, Unknown: 0 },
              by_role: { Therapist: { Mobile: 3, Desktop: 1, Tablet: 0 } },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Analytics'));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/admin/analytics/devices/');
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('Therapist')).toBeInTheDocument();
      });
    });
  });

  // ── access modal (Edit access from pending tab) ───────────────────────────

  describe('access modal', () => {
    const therapistEntry = {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'Therapist',
      therapistId: 'th-99',
      clinics: ['Inselspital'],
      projects: ['COPAIN'],
    };

    const mockAccessGet = (accessData: any) => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/therapist/access/') return Promise.resolve({ data: accessData });
        return Promise.resolve({ data: {} });
      });
    };

    it('loads and displays projects/clinics for the therapist', async () => {
      mockAdminStore.pendingEntries = [therapistEntry];
      mockAccessGet({
        clinics: ['Inselspital'],
        projects: ['COPAIN'],
        availableClinics: ['Inselspital', 'Berner Reha Centrum'],
        availableProjects: ['COPAIN', 'OtherProject'],
        clinicProjects: { Inselspital: ['COPAIN'], 'Berner Reha Centrum': ['OtherProject'] },
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Edit access'));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/admin/therapist/access/', {
          params: { therapistId: 'th-99' },
        });
      });

      expect(await screen.findByLabelText('COPAIN')).toBeChecked();
      expect(screen.getByLabelText('Inselspital')).toBeChecked();
      expect(screen.queryByLabelText('Berner Reha Centrum')).not.toBeInTheDocument();
    });

    it('updates the allowed clinics when a project is toggled', async () => {
      mockAdminStore.pendingEntries = [therapistEntry];
      mockAccessGet({
        clinics: ['Inselspital'],
        projects: ['COPAIN'],
        availableClinics: ['Inselspital', 'Berner Reha Centrum'],
        availableProjects: ['COPAIN', 'OtherProject'],
        clinicProjects: { Inselspital: ['COPAIN'], 'Berner Reha Centrum': ['OtherProject'] },
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Edit access'));

      await screen.findByLabelText('COPAIN');
      fireEvent.click(screen.getByLabelText('OtherProject'));

      await waitFor(() => expect(screen.getByLabelText('Berner Reha Centrum')).toBeInTheDocument());
    });

    it('saves access changes and refreshes the pending list', async () => {
      mockAdminStore.pendingEntries = [therapistEntry];
      mockAccessGet({
        clinics: ['Inselspital'],
        projects: ['COPAIN'],
        availableClinics: ['Inselspital'],
        availableProjects: ['COPAIN'],
        clinicProjects: { Inselspital: ['COPAIN'] },
      });
      (apiClient.put as jest.Mock).mockResolvedValue({ data: {} });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Edit access'));
      await screen.findByLabelText('COPAIN');

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/admin/therapist/access/', {
          therapistId: 'th-99',
          clinics: ['Inselspital'],
          projects: ['COPAIN'],
        });
        expect(screen.getByText('Saved successfully.')).toBeInTheDocument();
      });
      expect(mockAdminStore.fetchPendingEntries).toHaveBeenCalledTimes(2);
    });

    it('closes the modal via the Close button', async () => {
      mockAdminStore.pendingEntries = [therapistEntry];
      mockAccessGet({
        clinics: [],
        projects: [],
        availableClinics: [],
        availableProjects: [],
        clinicProjects: {},
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Edit access'));

      const closeButton = await screen.findByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);

      await waitFor(() =>
        expect(screen.queryByText('No projects configured on the server.')).not.toBeInTheDocument()
      );
    });
  });

  // ── reject access-request modal ───────────────────────────────────────────

  describe('reject access-request modal', () => {
    it('submits a rejection with a note', async () => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/access-change-requests/') {
          return Promise.resolve({ data: { requests: [sampleChangeRequest] } });
        }
        return Promise.resolve({ data: {} });
      });
      (apiClient.put as jest.Mock).mockResolvedValue({ data: {} });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByText('Access change requests')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Access change requests'));
      await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Decline'));

      const noteInput = await screen.findByPlaceholderText(
        'Explain why the request is being declined...'
      );
      fireEvent.change(noteInput, { target: { value: 'Not enough justification' } });

      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/admin/access-change-requests/req-1/', {
          action: 'reject',
          note: 'Not enough justification',
        });
      });
    });

    it('cancels the rejection without calling the API', async () => {
      (apiClient.get as jest.Mock).mockImplementation((url: string) => {
        if (url === '/admin/access-change-requests/') {
          return Promise.resolve({ data: { requests: [sampleChangeRequest] } });
        }
        return Promise.resolve({ data: {} });
      });

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Access change requests'));
      await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Decline'));
      await screen.findByPlaceholderText('Explain why the request is being declined...');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() =>
        expect(
          screen.queryByPlaceholderText('Explain why the request is being declined...')
        ).not.toBeInTheDocument()
      );
      expect(apiClient.put).not.toHaveBeenCalledWith(
        expect.stringContaining('access-change-requests'),
        expect.objectContaining({ action: 'reject' })
      );
    });
  });
});
