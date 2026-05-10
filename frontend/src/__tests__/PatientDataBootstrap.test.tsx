import React from 'react';
import { render } from '@testing-library/react';
import PatientDataBootstrap from '@/components/PatientDataBootstrap';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

const mockInitPatientData = jest.fn();
const mockResetPatientDataInit = jest.fn();

jest.mock('@/services/patientDataService', () => ({
  initPatientData: (...args: unknown[]) => mockInitPatientData(...args),
  resetPatientDataInit: () => mockResetPatientDataInit(),
}));

// Auth store mock: object defined inside factory, mutated via jest.requireMock
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { isAuthenticated: false, userType: '', id: '', preferredLanguage: '' },
}));

// mobx-react-lite observer is a passthrough in tests
jest.mock('mobx-react-lite', () => ({
  observer: (c: unknown) => c,
}));

// Shorthand to grab the mutable auth state at runtime (avoids hoist TDZ issue)
const getAuthState = () =>
  jest.requireMock('@/stores/authStore').default as {
    isAuthenticated: boolean;
    userType: string;
    id: string;
    preferredLanguage: string;
  };

beforeEach(() => {
  jest.clearAllMocks();
  const s = getAuthState();
  s.isAuthenticated = false;
  s.userType = '';
  s.id = '';
  s.preferredLanguage = '';
});

describe('PatientDataBootstrap', () => {
  it('calls initPatientData when authenticated Patient with id', () => {
    const s = getAuthState();
    s.isAuthenticated = true;
    s.userType = 'Patient';
    s.id = 'patient-1';

    render(<PatientDataBootstrap />);

    expect(mockInitPatientData).toHaveBeenCalledWith('patient-1', 'en');
    expect(mockResetPatientDataInit).not.toHaveBeenCalled();
  });

  it('calls resetPatientDataInit when not authenticated', () => {
    getAuthState().isAuthenticated = false;

    render(<PatientDataBootstrap />);

    expect(mockResetPatientDataInit).toHaveBeenCalled();
    expect(mockInitPatientData).not.toHaveBeenCalled();
  });

  it('does not call initPatientData for non-Patient user types', () => {
    const s = getAuthState();
    s.isAuthenticated = true;
    s.userType = 'Therapist';
    s.id = 'therapist-1';

    render(<PatientDataBootstrap />);

    expect(mockInitPatientData).not.toHaveBeenCalled();
  });

  it('does not call initPatientData when id is empty', () => {
    const s = getAuthState();
    s.isAuthenticated = true;
    s.userType = 'Patient';
    s.id = '';

    render(<PatientDataBootstrap />);

    expect(mockInitPatientData).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const s = getAuthState();
    s.isAuthenticated = true;
    s.userType = 'Patient';
    s.id = 'patient-1';

    const { container } = render(<PatientDataBootstrap />);

    expect(container).toBeEmptyDOMElement();
  });

  it('uses preferredLanguage from store instead of UI language (bug #236)', () => {
    // Patient has German as preferred language but the UI is in English.
    // Interventions must be fetched in German.
    const s = getAuthState();
    s.isAuthenticated = true;
    s.userType = 'Patient';
    s.id = 'patient-de';
    s.preferredLanguage = 'de';

    render(<PatientDataBootstrap />);

    expect(mockInitPatientData).toHaveBeenCalledWith('patient-de', 'de');
  });

  it('falls back to i18n language when preferredLanguage is not set (bug #236)', () => {
    // No preferred_language stored — should use the browser/UI language ('en' in tests).
    const s = getAuthState();
    s.isAuthenticated = true;
    s.userType = 'Patient';
    s.id = 'patient-en';
    s.preferredLanguage = '';

    render(<PatientDataBootstrap />);

    expect(mockInitPatientData).toHaveBeenCalledWith('patient-en', 'en');
  });
});
