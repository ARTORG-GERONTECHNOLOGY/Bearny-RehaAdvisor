import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PatientView from '../../pages/Patient';
import '@testing-library/jest-dom';

// Mocks
jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    get isAuthenticated() {
      return mockIsAuthenticated;
    },
    get userType() {
      return mockUserType;
    },
  },
}));

jest.mock('../../components/common/Header', () => () => <div>Mocked Header</div>);
jest.mock('../../components/common/Footer', () => () => <div>Mocked Footer</div>);
jest.mock('../../components/common/WelcomeArea', () => () => <div>Mocked Welcome Area</div>);
jest.mock('../../components/PatientPage/InterventionList', () => () => (
  <div>Mocked Intervention List</div>
));

// Globals to manipulate auth state
let mockIsAuthenticated = true;
let mockUserType = 'Patient';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('PatientView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('redirects to /patient_home if not authenticated', async () => {
    mockIsAuthenticated = false;
    mockUserType = 'Patient';

    render(
      <MemoryRouter>
        <PatientView />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/patient_home');
    });
  });

  test('redirects to /patient_home if user is not Patient', async () => {
    mockIsAuthenticated = true;
    mockUserType = 'Therapist';

    render(
      <MemoryRouter>
        <PatientView />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/patient_home');
    });
  });

  test('renders PatientView content if authenticated and userType is Patient', async () => {
    mockIsAuthenticated = true;
    mockUserType = 'Patient';

    render(
      <MemoryRouter>
        <PatientView />
      </MemoryRouter>
    );

    expect(await screen.findByText('Mocked Header')).toBeInTheDocument();
    expect(screen.getByText('Mocked Welcome Area')).toBeInTheDocument();
    expect(screen.getByText('Mocked Intervention List')).toBeInTheDocument();
    expect(screen.getByText('Mocked Footer')).toBeInTheDocument();
  });
});
