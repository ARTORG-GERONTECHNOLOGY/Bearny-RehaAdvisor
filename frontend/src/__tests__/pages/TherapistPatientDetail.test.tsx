import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import TherapistPatientDetail from '@/pages/TherapistPatientDetail';
import type { PatientDetail } from '@/hooks/useTherapistPatientDetail';

const mockNavigate = jest.fn();
let mockPatientId = 'patient-123';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ patientId: mockPatientId }),
  };
});

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/components/Layout', () => jest.requireActual('@/__mocks__/components/Layout'));

jest.mock('@/components/Health/HealthPageContent', () => ({
  __esModule: true,
  default: ({ patientId }: { patientId: string }) => (
    <div data-testid="outcomes-content">Outcomes content for {patientId}</div>
  ),
}));

jest.mock('@/components/RehaTablePage/RehabilitationPlanContent', () => ({
  __esModule: true,
  default: ({ patientId }: { patientId: string }) => (
    <div data-testid="rehabilitationplan-content">Rehabilitation Plan content for {patientId}</div>
  ),
}));

jest.mock('@/components/RehaTablePage/QuestionnairesContent', () => ({
  __esModule: true,
  default: ({ patientId }: { patientId: string }) => (
    <div data-testid="questionnaires-content">Questionnaires content for {patientId}</div>
  ),
}));

jest.mock('@/components/TherapistPatientPage/PatientInfoContent', () => ({
  __esModule: true,
  default: ({ patientId }: { patientId: string }) => (
    <div data-testid="information-content">Information content for {patientId}</div>
  ),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    id: 'therapist-123',
  },
}));

const mockUseTherapistPatientDetail = jest.fn();
jest.mock('@/hooks/useTherapistPatientDetail', () => ({
  useTherapistPatientDetail: (...args: unknown[]) => mockUseTherapistPatientDetail(...args),
}));

const mockPatient: PatientDetail = {
  patient_code: 'P-001',
  first_name: 'Jane',
  name: 'Doe',
  age: 45,
  sex: 'Female',
  diagnosis: ['Stroke', 'Parkinson'],
};

const renderPage = (initialEntries: string[] = ['/']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <TherapistPatientDetail />
    </MemoryRouter>
  );

describe('TherapistPatientDetail Page', () => {
  const mockAuthStore = jest.requireMock('@/stores/authStore').default;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPatientId = 'patient-123';
    mockAuthStore.isAuthenticated = true;
    mockAuthStore.userType = 'Therapist';
    mockUseTherapistPatientDetail.mockReturnValue({
      patient: mockPatient,
      loading: false,
      error: null,
    });
  });

  it('redirects if user is not authenticated', async () => {
    mockAuthStore.isAuthenticated = false;
    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('redirects if user is not a Therapist', async () => {
    mockAuthStore.userType = 'Patient';
    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('navigates back when the arrow icon is clicked', () => {
    const { container } = renderPage();
    const arrowIcon = container.querySelector('svg');
    expect(arrowIcon).toBeInTheDocument();
    fireEvent.click(arrowIcon!);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('shows the loading skeleton while fetching', () => {
    mockUseTherapistPatientDetail.mockReturnValue({
      patient: null,
      loading: true,
      error: null,
    });
    renderPage();

    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  it('shows an error message when fetching fails', () => {
    mockUseTherapistPatientDetail.mockReturnValue({
      patient: null,
      loading: false,
      error: 'Failed to fetch patient',
    });
    renderPage();

    expect(screen.getByText('Failed to fetch patient')).toBeInTheDocument();
  });

  it('renders patient name, code, and info items', () => {
    renderPage();

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('P-001')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Stroke, Parkinson')).toBeInTheDocument();
  });

  it('falls back to patientId as the title when patient has no name', () => {
    mockUseTherapistPatientDetail.mockReturnValue({
      patient: null,
      loading: false,
      error: null,
    });
    renderPage();

    expect(screen.getByText('patient-123')).toBeInTheDocument();
  });

  it('renders all tabs', () => {
    renderPage();

    expect(screen.getByText('Outcomes Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Rehabilitation Plan')).toBeInTheDocument();
    expect(screen.getByText('Questionnaires')).toBeInTheDocument();
    expect(screen.getByText('Information')).toBeInTheDocument();
  });

  it('defaults to the outcomes tab content', () => {
    renderPage();

    expect(screen.getByTestId('outcomes-content')).toBeInTheDocument();
    expect(screen.queryByTestId('rehabilitationplan-content')).not.toBeInTheDocument();
  });

  it('switches tab content when a different tab is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText('Questionnaires'));

    expect(screen.getByTestId('questionnaires-content')).toBeInTheDocument();
    expect(screen.queryByTestId('outcomes-content')).not.toBeInTheDocument();
  });

  it('selects the tab from the ?tab= URL param on initial render', () => {
    renderPage(['/?tab=questionnaires']);

    expect(screen.getByTestId('questionnaires-content')).toBeInTheDocument();
    expect(screen.queryByTestId('outcomes-content')).not.toBeInTheDocument();
  });

  it('falls back to the outcomes tab when the ?tab= param is invalid', () => {
    renderPage(['/?tab=not-a-real-tab']);

    expect(screen.getByTestId('outcomes-content')).toBeInTheDocument();
  });

  it('passes the patientId from the route to the active tab content', () => {
    renderPage();

    expect(screen.getByText('Outcomes content for patient-123')).toBeInTheDocument();
  });

  it('calls useTherapistPatientDetail with the patientId from the route once allowed', async () => {
    mockPatientId = 'patient-456';
    renderPage();

    await waitFor(() => {
      expect(mockUseTherapistPatientDetail).toHaveBeenCalledWith('patient-456');
    });
  });
});
