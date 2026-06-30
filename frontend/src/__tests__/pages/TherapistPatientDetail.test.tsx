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

const renderPage = () =>
  render(
    <MemoryRouter>
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

    expect(screen.getByText('Outcomes')).toBeInTheDocument();
    expect(screen.getByText('Rehabilitation Plan')).toBeInTheDocument();
    expect(screen.getByText('Questionnaires')).toBeInTheDocument();
    expect(screen.getByText('Information')).toBeInTheDocument();
  });

  it('defaults to the outcomes tab content', () => {
    renderPage();

    expect(screen.getByText('Outcomes content goes here')).toBeInTheDocument();
    expect(screen.queryByText('Rehabilitation Plan content goes here')).not.toBeInTheDocument();
  });

  it('switches tab content when a different tab is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText('Questionnaires'));

    expect(screen.getByText('Questionnaires content goes here')).toBeInTheDocument();
    expect(screen.queryByText('Outcomes content goes here')).not.toBeInTheDocument();
  });

  it('calls useTherapistPatientDetail with the patientId from the route', () => {
    mockPatientId = 'patient-456';
    renderPage();

    expect(mockUseTherapistPatientDetail).toHaveBeenCalledWith('patient-456');
  });
});
