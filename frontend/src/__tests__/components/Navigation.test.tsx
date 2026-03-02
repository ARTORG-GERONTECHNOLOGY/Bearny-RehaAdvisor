import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Navigation from '@/components/Navigation';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Inline mock – no external variable so hoisting is safe.
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    isAuthenticated: true,
    userType: 'Patient',
    logout: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockAuthStore = jest.requireMock('@/stores/authStore').default as {
  isAuthenticated: boolean;
  userType: string | null;
  logout: jest.Mock;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const renderNav = (pathname = '/patient') =>
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <Navigation />
    </MemoryRouter>
  );

beforeEach(() => {
  mockAuthStore.isAuthenticated = true;
  mockAuthStore.userType = 'Patient';
  mockAuthStore.logout.mockResolvedValue(undefined);
});

// ── navLinks by user type ────────────────────────────────────────────────────

describe('Navigation - navLinks by user type', () => {
  it('shows Home + Interventions + Settings for Patient', () => {
    renderNav('/patient');
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bibliothek').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Einstellungen').length).toBeGreaterThan(0);
  });

  it('shows Patients + Interventions + Profile + Settings for Therapist', () => {
    mockAuthStore.userType = 'Therapist';
    renderNav('/therapist');
    expect(screen.getAllByText('Patients').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bibliothek').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Einstellungen').length).toBeGreaterThan(0);
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });

  it('shows Patients + Interventions + Profile + Settings for Researcher', () => {
    mockAuthStore.userType = 'Researcher';
    renderNav('/researcher');
    expect(screen.getAllByText('Patients').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bibliothek').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Einstellungen').length).toBeGreaterThan(0);
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });

  it('shows Settings for Admin', () => {
    mockAuthStore.userType = 'Admin';
    renderNav('/admin');
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
    expect(screen.queryByText('Patients')).not.toBeInTheDocument();
    expect(screen.queryByText('Bibliothek')).not.toBeInTheDocument();
    expect(screen.getAllByText('Einstellungen').length).toBeGreaterThan(0);
  });

  it('shows Home for unauthenticated (null userType)', () => {
    mockAuthStore.userType = null;
    mockAuthStore.isAuthenticated = false;
    renderNav('/');
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.queryByText('Bibliothek')).not.toBeInTheDocument();
    expect(screen.queryByText('Patients')).not.toBeInTheDocument();
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
    expect(screen.queryByText('Einstellungen')).not.toBeInTheDocument();
  });
});

// ── Active state ─────────────────────────────────────────────────────────────

describe('Navigation - active link', () => {
  it('marks the link whose path matches the current pathname as active', () => {
    renderNav('/patient-interventions');
    // "Bibliothek" buttons should be active (standalone text-black class)
    const bibliothekBtns = screen.getAllByText('Bibliothek').map((el) => el.closest('button')!);

    bibliothekBtns.forEach((btn) => {
      expect(btn.className).toMatch(/(^|\s)text-black(\s|$)/);
    });
  });

  it('does NOT mark a non-matching link as active', () => {
    renderNav('/patient-interventions');
    // "Home" is NOT the current path → should not have standalone text-black
    const homeBtns = screen.getAllByText('Home').map((el) => el.closest('button')!);

    homeBtns.forEach((btn) => {
      expect(btn.className).not.toMatch(/(^|\s)text-black(\s|$)/);
    });
  });

  it('marks Home as active when on /patient', () => {
    renderNav('/patient');
    const homeBtns = screen.getAllByText('Home').map((el) => el.closest('button')!);

    homeBtns.forEach((btn) => {
      expect(btn.className).toMatch(/(^|\s)text-black(\s|$)/);
    });
  });
});

// ── Therapist path slug ───────────────────────────────────────────────────────

describe('Navigation - therapist and researcher path uses lowercased userType', () => {
  it('links to /therapist for Therapist', () => {
    mockAuthStore.userType = 'Therapist';
    renderNav('/therapist');
    // Clicking the first "Patients" button should navigate to /therapist
    // (we verify navLinks path by checking the active state at /therapist)
    const patientsBtns = screen.getAllByText('Patients').map((el) => el.closest('button')!);

    patientsBtns.forEach((btn) => {
      expect(btn.className).toMatch(/(^|\s)text-black(\s|$)/);
    });
  });

  it('links to /researcher for Researcher', () => {
    mockAuthStore.userType = 'Researcher';
    renderNav('/researcher');
    const patientsBtns = screen.getAllByText('Patients').map((el) => el.closest('button')!);

    patientsBtns.forEach((btn) => {
      expect(btn.className).toMatch(/(^|\s)text-black(\s|$)/);
    });
  });
});
