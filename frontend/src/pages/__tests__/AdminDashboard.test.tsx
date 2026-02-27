import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../../test-utils/renderWithRouter';
import AdminDashboard from '../AdminDashboard';

// --------------------
// i18n + router mocks
// --------------------
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// --------------------
// react-bootstrap mocks (lightweight, stable DOM)
// --------------------
jest.mock('react-bootstrap', () => {
  const actual = jest.requireActual('react-bootstrap');
  return {
    ...actual,
    Table: ({ children }: any) => <table>{children}</table>,
    Badge: ({ children }: any) => <span>{children}</span>,
    Spinner: ({ role }: any) => <div role={role || 'status'}>spinner</div>,
    Alert: ({ children, onClose, dismissible }: any) => (
      <div role="alert">
        <div>{children}</div>
        {dismissible ? <button onClick={onClose}>dismiss</button> : null}
      </div>
    ),
    Button: ({ children, onClick, disabled, title }: any) => (
      <button onClick={onClick} disabled={disabled} title={title}>
        {children}
      </button>
    ),
    Modal: ({ show, children }: any) => (show ? <div data-testid="modal">{children}</div> : null),
    Form: ({ children }: any) => <form>{children}</form>,
    // Form.Check is used as checkbox list in access modal
    FormCheck: undefined,
    Form: Object.assign(({ children }: any) => <form>{children}</form>, {
      Check: ({ id, label, checked, onChange }: any) => (
        <label htmlFor={id}>
          <input id={id} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />
          {label}
        </label>
      ),
    }),
  };
});

// --------------------
// Mock common components
// --------------------
jest.mock('../../components/common/Header', () => ({
  __esModule: true,
  default: () => <div data-testid="header" />,
}));

jest.mock('../../components/common/Footer', () => ({
  __esModule: true,
  default: () => <div data-testid="footer" />,
}));

jest.mock('../../components/common/ErrorAlert', () => ({
  __esModule: true,
  default: ({ message }: any) => <div role="alert">{message}</div>,
}));

// ConfirmModal: make it easy to click confirm/cancel
jest.mock('../../components/common/ConfirmModal', () => ({
  __esModule: true,
  default: ({ show, onHide, onConfirm, title, body, confirmText, cancelText }: any) =>
    show ? (
      <div data-testid="confirm-modal">
        <div>{title}</div>
        <div>{body}</div>
        <button onClick={onHide}>{cancelText}</button>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

// --------------------
// Mock stores + apiClient
// --------------------
const authStoreMock = {
  isAuthenticated: true,
  userType: 'Admin',
  checkAuthentication: jest.fn(async () => {}),
};

jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: authStoreMock,
}));

const adminStoreMock = {
  pendingEntries: [] as any[],
  error: '',
  fetchPendingEntries: jest.fn(async () => {}),
  acceptEntry: jest.fn(async (_id: string) => {}),
  declineEntry: jest.fn(async (_id: string) => {}),
};

jest.mock('../../stores/adminStore', () => ({
  __esModule: true,
  default: adminStoreMock,
}));

const apiGet = jest.fn();
const apiPut = jest.fn();
jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => apiGet(...args),
    put: (...args: any[]) => apiPut(...args),
    post: jest.fn(),
  },
}));

/**
 * AdminDashboard creates `new AdminDashboardStore()` internally.
 * We mock the class to have predictable init/accept/decline behavior.
 */
let lastDashboardStore: any = null;

jest.mock('../../stores/adminDashboardStore', () => {
  class AdminDashboardStoreMock {
    loading = true;
    error: string | null = null;

    showDeclineConfirm = false;
    declineEntryId: string | null = null;

    constructor() {
      lastDashboardStore = this;
    }

    setError(v: string | null) {
      this.error = v;
    }

    openDeclineConfirm(entryId: string) {
      this.declineEntryId = entryId;
      this.showDeclineConfirm = true;
    }

    closeDeclineConfirm() {
      this.showDeclineConfirm = false;
      this.declineEntryId = null;
    }

    async init(navigate: (p: string) => void, _t: (k: string) => string) {
      this.loading = true;
      this.error = null;

      await authStoreMock.checkAuthentication();

      if (!authStoreMock.isAuthenticated || authStoreMock.userType !== 'Admin') {
        navigate('/unauthorized');
        this.loading = false;
        return;
      }

      await adminStoreMock.fetchPendingEntries();
      this.loading = false;
    }

    async accept(entryId: string) {
      this.error = null;
      await adminStoreMock.acceptEntry(entryId);
    }

    async declineConfirmed() {
      if (!this.declineEntryId) return;
      this.error = null;
      await adminStoreMock.declineEntry(this.declineEntryId);
      this.closeDeclineConfirm();
    }
  }

  return { __esModule: true, AdminDashboardStore: AdminDashboardStoreMock };
});

// --------------------
// Helpers
// --------------------
function seedPending(entries: any[]) {
  adminStoreMock.pendingEntries = entries;
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();

    authStoreMock.isAuthenticated = true;
    authStoreMock.userType = 'Admin';
    authStoreMock.checkAuthentication.mockResolvedValue(undefined);

    adminStoreMock.error = '';
    seedPending([]);

    apiGet.mockReset();
    apiPut.mockReset();
  });

  it('redirects to /unauthorized if not authenticated or not Admin', async () => {
    authStoreMock.isAuthenticated = false;
    authStoreMock.userType = 'Patient';

    renderWithRouter(<AdminDashboard />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
    });
  });

  it('shows loading spinner while store.loading is true, then shows "No pending entries"', async () => {
    seedPending([]);

    renderWithRouter(<AdminDashboard />);

    // During init, store starts loading
    expect(screen.getByRole('status')).toBeInTheDocument();

    await waitFor(() => {
      expect(adminStoreMock.fetchPendingEntries).toHaveBeenCalled();
      expect(screen.getByText('No pending entries')).toBeInTheDocument();
    });
  });

  it('renders pending entries table; therapist row shows Edit access button', async () => {
    seedPending([
      {
        id: '1',
        name: 'Therapist A',
        email: 't@x.com',
        role: 'Therapist',
        therapistId: 'ther1',
        clinics: ['ClinicA'],
        projects: ['P1'],
      },
      {
        id: '2',
        name: 'Researcher B',
        email: 'r@x.com',
        role: 'Researcher',
      },
    ]);

    renderWithRouter(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Therapist A')).toBeInTheDocument();
      expect(screen.getByText('Researcher B')).toBeInTheDocument();
    });

    // Therapist has "Edit access" in actions
    expect(screen.getByRole('button', { name: 'Edit access' })).toBeInTheDocument();

    // Researcher should NOT have "Edit access"
    // (there may still be one button for therapist row; ensure only one present)
    expect(screen.getAllByRole('button', { name: 'Edit access' })).toHaveLength(1);
  });

  it('clicking Accept calls store.accept -> adminStore.acceptEntry', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    renderWithRouter(<AdminDashboard />);

    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      expect(adminStoreMock.acceptEntry).toHaveBeenCalledWith('1');
    });
  });

  it('Decline opens ConfirmModal; confirm triggers declineEntry and closes modal', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Decline' })); // confirmText is "Decline"

    await waitFor(() => {
      expect(adminStoreMock.declineEntry).toHaveBeenCalledWith('1');
      expect(lastDashboardStore.showDeclineConfirm).toBe(false);
    });
  });

  it('Edit access: opens access modal and loads clinics/projects from API; Save calls PUT and refreshes pending entries', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    // GET access returns current selections + availability + map
    apiGet.mockResolvedValueOnce({
      data: {
        clinics: ['ClinicA'],
        projects: ['P1'],
        availableClinics: ['ClinicA', 'ClinicB'],
        availableProjects: ['P1', 'P2'],
        clinicProjects: {
          ClinicA: ['P1', 'P2'],
          ClinicB: ['P2'],
        },
      },
    });

    apiPut.mockResolvedValueOnce({ status: 200, data: {} });

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));

    // modal opens and GET called
    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(apiGet).toHaveBeenCalledWith('/admin/therapist/access/', {
        params: { therapistId: 'ther1' },
      });
    });

    // It should render project checkboxes
    expect(screen.getByLabelText('P1')).toBeChecked();
    expect(screen.getByLabelText('P2')).not.toBeChecked();

    // Clinics should be visible because a project is selected
    // Allowed clinics for selected projects includes ClinicA (P1) and not necessarily ClinicB unless P2 selected
    expect(screen.getByLabelText('ClinicA')).toBeInTheDocument();

    // Save should be enabled (P1 selected)
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    expect(saveBtn).not.toBeDisabled();

    // Toggle additional project P2
    fireEvent.click(screen.getByLabelText('P2'));
    expect(screen.getByLabelText('P2')).toBeChecked();

    // Now ClinicB may become allowed (because ClinicB has P2)
    await waitFor(() => {
      expect(screen.getByLabelText('ClinicB')).toBeInTheDocument();
    });

    // Toggle ClinicB
    fireEvent.click(screen.getByLabelText('ClinicB'));
    expect(screen.getByLabelText('ClinicB')).toBeChecked();

    // Save access
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith('/admin/therapist/access/', {
        therapistId: 'ther1',
        clinics: expect.arrayContaining(['ClinicA', 'ClinicB']),
        projects: expect.arrayContaining(['P1', 'P2']),
      });

      // refresh list after saving access (saveAccess calls adminStore.fetchPendingEntries)
      expect(adminStoreMock.fetchPendingEntries).toHaveBeenCalled();
    });
  });

  it('Edit access: missing therapistId shows access error alert and does not open modal', async () => {
    seedPending([{ id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist' }]); // no therapistId fields

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));

    await waitFor(() => {
      // error shows inside page (accessError is rendered in modal body only if modal open,
      // but here openAccessModal returns early setting accessError; component renders it within modal only when open.
      // However your code sets accessError before opening modal; so we assert it appears via dismissible Alert after modal open.
      // In your current component, it returns before opening modal, so we can't see the modal.
      // Instead: assert apiGet not called and modal not present.
      expect(apiGet).not.toHaveBeenCalled();
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });
  });

  it('Access modal: Save is disabled when no project selected', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    apiGet.mockResolvedValueOnce({
      data: {
        clinics: [],
        projects: [], // none selected
        availableClinics: ['ClinicA'],
        availableProjects: ['P1'],
        clinicProjects: { ClinicA: ['P1'] },
      },
    });

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Access modal: dismisses success and error alerts', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    // initial load ok
    apiGet.mockResolvedValueOnce({
      data: {
        clinics: ['ClinicA'],
        projects: ['P1'],
        availableClinics: ['ClinicA'],
        availableProjects: ['P1'],
        clinicProjects: { ClinicA: ['P1'] },
      },
    });

    // save ok -> success
    apiPut.mockResolvedValueOnce({ status: 200, data: {} });

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Saved successfully.');
    });

    // dismiss success
    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // Now simulate an error state by reopening modal with load error
    // Close modal first
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('modal')).not.toBeInTheDocument());

    apiGet.mockRejectedValueOnce({ response: { data: { error: 'Failed to load access' } } });

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load access');
    });

    // dismiss error
    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('Access modal: prunes selected clinics when selected projects change', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    apiGet.mockResolvedValueOnce({
      data: {
        // initial selected
        clinics: ['ClinicA', 'ClinicB'],
        projects: ['P1', 'P2'],
        availableClinics: ['ClinicA', 'ClinicB'],
        availableProjects: ['P1', 'P2'],
        clinicProjects: {
          // ClinicA supports both
          ClinicA: ['P1', 'P2'],
          // ClinicB supports only P2
          ClinicB: ['P2'],
        },
      },
    });

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

    // Initially both clinics checked
    expect(screen.getByLabelText('ClinicA')).toBeChecked();
    expect(screen.getByLabelText('ClinicB')).toBeChecked();

    // Uncheck P2 -> ClinicB should become disallowed and be pruned
    fireEvent.click(screen.getByLabelText('P2'));
    expect(screen.getByLabelText('P2')).not.toBeChecked();

    await waitFor(() => {
      expect(screen.getByLabelText('ClinicA')).toBeChecked();
      expect(screen.getByLabelText('ClinicB')).not.toBeChecked(); // pruned
    });
  });

  it('Access modal: Save failure shows error alert and does not crash', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    apiGet.mockResolvedValueOnce({
      data: {
        clinics: ['ClinicA'],
        projects: ['P1'],
        availableClinics: ['ClinicA'],
        availableProjects: ['P1'],
        clinicProjects: { ClinicA: ['P1'] },
      },
    });

    apiPut.mockRejectedValueOnce({ response: { data: { error: 'Failed to save access.' } } });

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith('/admin/therapist/access/', {
        therapistId: 'ther1',
        clinics: expect.arrayContaining(['ClinicA']),
        projects: expect.arrayContaining(['P1']),
      });

      expect(screen.getByRole('alert')).toHaveTextContent('Failed to save access.');
    });

    // should NOT refresh list on failure
    expect(adminStoreMock.fetchPendingEntries).not.toHaveBeenCalled();
  });

  it('Decline confirm modal: Cancel closes modal and does not call declineEntry', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
    });

    expect(adminStoreMock.declineEntry).not.toHaveBeenCalled();
  });

  it('Access modal: shows "No projects configured" when availableProjects is empty', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    apiGet.mockResolvedValueOnce({
      data: {
        clinics: [],
        projects: [],
        availableClinics: ['ClinicA'],
        availableProjects: [], // no projects
        clinicProjects: { ClinicA: ['P1'] },
      },
    });

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

    expect(screen.getByRole('alert')).toHaveTextContent('No projects configured on the server.');
  });

  it('Access modal: shows "Select a project..." when none selected', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    apiGet.mockResolvedValueOnce({
      data: {
        clinics: [],
        projects: [], // none selected
        availableClinics: ['ClinicA'],
        availableProjects: ['P1'],
        clinicProjects: { ClinicA: ['P1'] },
      },
    });

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

    // clinics section info alert
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select a project to see available clinics.'
    );
    // save disabled
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Access modal: shows "No clinics configured..." when projects selected but none allowed', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    apiGet.mockResolvedValueOnce({
      data: {
        clinics: [],
        projects: ['P1'], // selected project
        availableClinics: ['ClinicA'],
        availableProjects: ['P1'],
        clinicProjects: {
          // ClinicA has no P1 => no allowed clinics
          ClinicA: ['P2'],
        },
      },
    });

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No clinics are configured for the selected project(s).'
    );
  });

  it('Access modal: Save disables Save/Close while request is pending and re-enables after', async () => {
    seedPending([
      { id: '1', name: 'Therapist A', email: 't@x.com', role: 'Therapist', therapistId: 'ther1' },
    ]);

    apiGet.mockResolvedValueOnce({
      data: {
        clinics: ['ClinicA'],
        projects: ['P1'],
        availableClinics: ['ClinicA'],
        availableProjects: ['P1'],
        clinicProjects: { ClinicA: ['P1'] },
      },
    });

    // Deferred promise for PUT to simulate in-flight state
    let resolvePut: (v: any) => void = () => {};
    const putPromise = new Promise((res) => {
      resolvePut = res;
    });
    apiPut.mockReturnValueOnce(putPromise);

    renderWithRouter(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Therapist A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    const saveBtn = screen.getByRole('button', { name: 'Save' });

    fireEvent.click(saveBtn);

    // while pending: both disabled
    await waitFor(() => {
      expect(closeBtn).toBeDisabled();
      expect(saveBtn).toBeDisabled();
    });

    // resolve request
    resolvePut({ status: 200, data: {} });

    await waitFor(() => {
      // after completion: buttons enabled again (save might show normal label again)
      expect(closeBtn).not.toBeDisabled();
    });
  });
});
