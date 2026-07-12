/* eslint-disable @typescript-eslint/no-require-imports, react/display-name, @typescript-eslint/no-explicit-any */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Therapist from '@/pages/Therapist';
import { MemoryRouter } from 'react-router-dom';
import authStore from '@/stores/authStore';
import apiClient from '@/api/client';
import { appModeStore } from '@/stores/appModeStore';

import '@testing-library/jest-dom';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock the apiClient
// Mock the apiClient
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
// Mock child components
jest.mock('@/components/Layout', () => jest.requireActual('@/__mocks__/components/Layout'));
jest.mock('@/components/common/WelcomeArea', () => () => <div>Mocked Welcome Area</div>);
jest.mock('../../config/config.json', () => ({
  RehaInfo: ['< 30 days', '30-60 days', '60-90 days', '> 90 days'],
  patientInfo: {
    sex: ['Male', 'Female'],
  },
}));

jest.mock('@/components/AddPatient/AddPatientPopUp', () => () => <div>Add Patient Popup</div>);
jest.mock('@/components/TherapistPatientPage/ImportFromRedcapModal', () => () => (
  <div>Import Modal</div>
));

// Mock translation function — use jest.fn() so individual tests can override it
const mockUseTranslation = jest.fn(() => ({ t: (key: string) => key }));
jest.mock('react-i18next', () => ({
  useTranslation: (...args: any[]) => mockUseTranslation(...args),
}));
// Mock navigation
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock authStore and API
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    id: 'therapist123',
  },
}));

jest.mock('@/stores/appModeStore', () => ({
  appModeStore: {
    mode: 'normal',
    loaded: true,
    redcapVisible: true,
    showManualCreate: true,
    showRedcapImport: false,
    showRedcapTab: false,
    hidePiiFields: false,
    fetchMode: jest.fn(),
  },
}));

// Mock TherapistPatientsStore
const mockStore = {
  patients: [],
  loading: false,
  error: '',
  errorDetails: null,
  showErrorDetails: false,
  showAddPatientPopup: false,
  showImportRedcapModal: false,
  redcapLoading: false,
  redcapError: '',
  redcapCandidates: [],
  selectedCandidates: [] as any[],
  importProgress: null,
  searchTerm: '',
  selectedSex: 'All',
  selectedDuration: 'All',
  sortKey: 'created' as const,
  sortAsc: false,
  sexFilter: '',
  durationFilter: '',
  diseaseFilter: '',
  sortBy: 'created' as const,
  get diseaseOptions() {
    const all: string[] = [];
    this.patients.forEach((p: any) => {
      if (Array.isArray(p.diagnosis)) p.diagnosis.forEach((d: any) => all.push(String(d)));
      else if (p.diagnosis) all.push(String(p.diagnosis));
    });
    return Array.from(new Set(all)).sort();
  },
  get filteredPatients() {
    let filtered = [...this.patients];

    if (this.sexFilter) {
      filtered = filtered.filter((p: any) => p.sex === this.sexFilter);
    }

    if (this.durationFilter) {
      filtered = filtered.filter((p: any) => {
        const dur = p.duration;
        if (!Number.isFinite(dur)) return false;
        if (this.durationFilter === '< 30 days') return dur < 30;
        if (this.durationFilter === '30-60 days') return dur >= 30 && dur <= 60;
        if (this.durationFilter === '60-90 days') return dur > 60 && dur <= 90;
        return dur > 90;
      });
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter((p: any) => {
        const first = (p.first_name || '').toLowerCase();
        const last = (p.name || '').toLowerCase();
        const full = `${first} ${last}`.trim();
        return first.includes(term) || last.includes(term) || full.includes(term);
      });
    }

    return filtered;
  },
  fetchPatients: jest.fn().mockResolvedValue(undefined),
  setSearchTerm: jest.fn((term: string) => {
    mockStore.searchTerm = term;
  }),
  setSelectedSex: jest.fn((sex: string) => {
    mockStore.selectedSex = sex;
  }),
  setSelectedDuration: jest.fn((duration: string) => {
    mockStore.selectedDuration = duration;
  }),
  setSexFilter: jest.fn((sex: string) => {
    mockStore.sexFilter = sex;
  }),
  setDurationFilter: jest.fn((duration: string) => {
    mockStore.durationFilter = duration;
  }),
  setDiseaseFilter: jest.fn((disease: string) => {
    mockStore.diseaseFilter = disease;
  }),
  setSortKey: jest.fn(),
  setSortBy: jest.fn((key: string) => {
    mockStore.sortBy = key as any;
  }),
  isCompletedPatient: jest.fn((p: any) => {
    const status = p.rehab_status;
    const end = p.rehab_end_date;
    return status === 'completed' || !!end;
  }),
  splitCompleted: jest.fn((sortedFiltered: any[]) => {
    const active = sortedFiltered.filter((p) => !mockStore.isCompletedPatient(p));
    const completed = sortedFiltered.filter((p) => mockStore.isCompletedPatient(p));
    return { active, completed };
  }),
  openAddPatientPopup: jest.fn(() => {
    mockStore.showAddPatientPopup = true;
  }),
  closeAddPatientPopup: jest.fn(() => {
    mockStore.showAddPatientPopup = false;
  }),
  openImportRedcapModal: jest.fn(),
  closeImportRedcapModal: jest.fn(),
  toggleErrorDetails: jest.fn(),
  closeAddPatient: jest.fn(() => {
    mockStore.showAddPatientPopup = false;
  }),
  openImportRedcap: jest.fn(() => {
    mockStore.showImportRedcapModal = true;
  }),
  closeImportRedcap: jest.fn(() => {
    mockStore.showImportRedcapModal = false;
  }),
  fetchRedcapCandidates: jest.fn().mockResolvedValue(undefined),
  importOneFromRedcap: jest.fn().mockResolvedValue(undefined),
  setRedcapRowPassword: jest.fn(),
  redcapRowPasswords: {} as Record<string, string>,
  importingKey: null as string | null,
  importedKeys: {} as Record<string, boolean>,
  showCompleted: false,
};

jest.mock('@/stores/therapistPatientsStore', () => ({
  __esModule: true,
  TherapistPatientsStore: jest.fn().mockImplementation(() => mockStore),
  SortKey: 'created',
}));

// Applies to every test in this file (not just those nested under "Therapist Page")
// so mutable mock state never leaks between describe blocks.
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.patients = [];
  mockStore.loading = false;
  mockStore.error = '';
  mockStore.errorDetails = null;
  mockStore.showErrorDetails = false;
  mockStore.showAddPatientPopup = false;
  mockStore.showImportRedcapModal = false;
  mockStore.redcapLoading = false;
  mockStore.redcapError = '';
  mockStore.redcapCandidates = [];
  mockStore.redcapRowPasswords = {};
  mockStore.importingKey = null;
  mockStore.importedKeys = {};
  mockStore.showCompleted = false;
  mockStore.selectedSex = 'All';
  mockStore.selectedDuration = 'All';
  mockStore.searchTerm = '';
  mockStore.sexFilter = '';
  mockStore.durationFilter = '';
  mockStore.diseaseFilter = '';
  mockStore.sortBy = 'created';
  appModeStore.loaded = true;
  appModeStore.showManualCreate = true;
  appModeStore.showRedcapImport = false;
  authStore.isAuthenticated = true;
  authStore.userType = 'Therapist';
  (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
});

const patientsMock = [
  {
    _id: '67d588798c0494979e4633e5',
    therapist: 'Angelva',
    created_at: '2025-03-15T14:02:33.107000',
    username: 'p1',
    age: '1986-03-06',
    sex: 'Male',
    first_name: 'Mark',
    name: 'Ruffalo',
    diagnosis: ['Heart attack'],
    duration: 291,
  },
  {
    _id: '67ecd69fdf1c4c467641ae76',
    therapist: 'Angelva',
    created_at: '2025-04-02T06:18:07.973000',
    username: 'p2',
    age: '2024-02-05',
    sex: 'Female',
    first_name: 'Jennifer',
    name: 'Anniston',
    diagnosis: ['Heart attack'],
    duration: 120,
  },
  {
    _id: '67f6098279d28b282644dd9f',
    therapist: 'Angelva',
    created_at: '2025-04-09T05:45:38.258000',
    username: 'p3',
    age: '1994-12-14',
    sex: 'Male',
    first_name: 'Tom',
    name: 'Day',
    diagnosis: ['Stroke'],
    duration: 235,
  },
];

describe('Therapist Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: patientsMock });
    mockStore.patients = patientsMock;
    mockStore.loading = false;
    mockStore.error = '';
    mockStore.showAddPatientPopup = false;
    mockStore.selectedSex = 'All';
    mockStore.selectedDuration = 'All';
    mockStore.searchTerm = '';
    mockStore.sexFilter = '';
    mockStore.durationFilter = '';
    mockStore.diseaseFilter = '';
    mockStore.sortBy = 'created';
    mockStore.errorDetails = null;
    mockStore.showErrorDetails = false;
    mockStore.showImportRedcapModal = false;
    mockStore.redcapLoading = false;
    mockStore.redcapError = '';
    mockStore.redcapCandidates = [];
    mockStore.redcapRowPasswords = {};
    mockStore.importingKey = null;
    mockStore.importedKeys = {};
    mockStore.showCompleted = false;
    appModeStore.loaded = true;
    appModeStore.showManualCreate = true;
    appModeStore.showRedcapImport = false;
    authStore.isAuthenticated = true;
    authStore.userType = 'Therapist';
  });

  test('renders therapist page with patients', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(screen.getByTestId('layout')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Mark Ruffalo')).toBeInTheDocument();
      expect(screen.getByText('Jennifer Anniston')).toBeInTheDocument();
      expect(screen.getByText('Tom Day')).toBeInTheDocument();
    });
  });

  test('redirects if user is not a Therapist', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Patient'; // not 'Therapist'

    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('opens Add Patient popup when button clicked', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Add a New Patient/i }));

    expect(screen.getByText('Add Patient Popup')).toBeInTheDocument();
  });
});

describe('Wear time badge', () => {
  const makePatientWithWear = (biomarker: Record<string, unknown>) => ({
    _id: 'wear-test-patient',
    therapist: 'T',
    created_at: '2026-01-01T00:00:00',
    username: 'wearuser',
    age: '1990-01-01',
    sex: 'Male',
    first_name: 'Wear',
    name: 'Patient',
    diagnosis: ['Stroke'],
    duration: 30,
    biomarker,
  });

  const renderWithPatient = (patient: ReturnType<typeof makePatientWithWear>) => {
    mockStore.patients = [patient as any];
    return render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
  };

  test('shows green Wear badge when worn recently and avg >= 12h', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: 0,
      wear_time_avg_min: 750,
    });
    renderWithPatient(patient);
    await waitFor(() => {
      expect(screen.getByLabelText('Wear good')).toBeInTheDocument();
    });
  });

  test('shows yellow Wear badge when avg wear < 12h per day', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: 0,
      wear_time_avg_min: 480, // 8h < 12h threshold
    });
    renderWithPatient(patient);
    await waitFor(() => {
      expect(screen.getByLabelText('Wear warn')).toBeInTheDocument();
    });
  });

  test('shows red Wear badge when not worn for 2+ days', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: 3,
      wear_time_avg_min: 700,
    });
    renderWithPatient(patient);
    await waitFor(() => {
      expect(screen.getByLabelText('Wear bad')).toBeInTheDocument();
    });
  });

  test('shows placeholder Wear badge when no Fitbit data', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: null,
      wear_time_avg_min: null,
    });
    renderWithPatient(patient);
    await waitFor(() => {
      const badge = screen.getByLabelText('Wear unknown');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('No data');
    });
  });

  test('shows red Fitbit badge when token is revoked', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: null,
      wear_time_avg_min: null,
      fitbit_revoked: true,
    });
    renderWithPatient(patient);
    await waitFor(() => {
      expect(screen.getByLabelText('Fitbit bad')).toBeInTheDocument();
    });
  });

  test('does not show Wear label when token is revoked', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: null,
      wear_time_avg_min: null,
      fitbit_revoked: true,
    });
    renderWithPatient(patient);
    await waitFor(() => {
      expect(screen.queryByLabelText(/^Wear/)).not.toBeInTheDocument();
    });
  });

  test('shows normal Wear badge (not Fitbit) when token is active', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: 1,
      wear_time_avg_min: 750,
      fitbit_revoked: false,
    });
    renderWithPatient(patient);
    await waitFor(() => {
      expect(screen.getByLabelText('Wear good')).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Fitbit/)).not.toBeInTheDocument();
    });
  });

  test('shows red Fitbit badge when fitbit_no_token is true (deleted token)', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: 7,
      wear_time_avg_min: 600,
      fitbit_no_token: true,
    });
    renderWithPatient(patient);
    await waitFor(() => {
      expect(screen.getByLabelText('Fitbit bad')).toBeInTheDocument();
    });
  });

  test('does not show Fitbit badge when no token and no historical data', async () => {
    const patient = makePatientWithWear({
      wear_time_days_since: null,
      wear_time_avg_min: null,
      fitbit_no_token: false,
    });
    renderWithPatient(patient);
    await waitFor(() => {
      expect(screen.queryByLabelText(/^Fitbit/)).not.toBeInTheDocument();
      expect(screen.getByLabelText('Wear unknown')).toBeInTheDocument();
    });
  });
});

describe('Therapist traffic lights', () => {
  const renderWithPatient = (patient: Record<string, unknown>) => {
    mockStore.patients = [patient as any];
    return render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
  };

  // ── Feedback chip: new cut-off logic (as of 2026-05-12) ──────────────────
  // Grey  — no star rating ever submitted (answered_days_total === 0)
  // Red   — no rating for >30 days  OR  ≥7 low ratings (≤2★) in last 14 days
  // Yellow— no rating for 15–30 days OR  ≥3 low ratings in last 14 days
  // Green — rating within last 14 days AND <3 low ratings

  test('feedback chip is grey when no star rating has ever been submitted', async () => {
    renderWithPatient({
      _id: 'fb-grey',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'fbgrey',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Grey',
      name: 'Patient',
      diagnosis: ['Stroke'],
      duration: 30,
      // no intervention_feedback / answered_days_total = 0
      questionnaires: [],
      last_feedback_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      biomarker: {},
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Feedback unknown')).toBeInTheDocument();
    });
  });

  test('feedback chip is green for recent rating with no low scores', async () => {
    renderWithPatient({
      _id: 'fb-green',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'fbgreen',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Green',
      name: 'Patient',
      diagnosis: ['Stroke'],
      duration: 30,
      intervention_feedback: {
        last_answered_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        days_since_last: 3,
        answered_days_total: 5,
        low_ratings_14d: 0,
      },
      biomarker: {},
    });

    const chip = await screen.findByLabelText('Feedback good');
    fireEvent.mouseOver(chip);

    await waitFor(() => {
      expect(screen.getByText(/Low ratings.*in last 14 days.*0/i)).toBeInTheDocument();
    });
  });

  test('feedback chip is yellow when no rating for 15–30 days', async () => {
    renderWithPatient({
      _id: 'fb-yellow-recency',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'fbyellowrecency',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Yellow',
      name: 'Recency',
      diagnosis: ['Stroke'],
      duration: 30,
      intervention_feedback: {
        last_answered_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        days_since_last: 20,
        answered_days_total: 3,
        low_ratings_14d: 0,
      },
      biomarker: {},
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Feedback warn')).toBeInTheDocument();
    });
  });

  test('feedback chip is yellow when 3–6 low ratings in last 14 days', async () => {
    renderWithPatient({
      _id: 'fb-yellow-lowcount',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'fbyellowlow',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Yellow',
      name: 'LowCount',
      diagnosis: ['Stroke'],
      duration: 30,
      intervention_feedback: {
        last_answered_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        days_since_last: 5,
        answered_days_total: 8,
        low_ratings_14d: 4,
      },
      biomarker: {},
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Feedback warn')).toBeInTheDocument();
    });
  });

  test('feedback chip is red when no rating for >30 days', async () => {
    renderWithPatient({
      _id: 'fb-red-recency',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'fbredrecency',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Red',
      name: 'Recency',
      diagnosis: ['Stroke'],
      duration: 30,
      intervention_feedback: {
        last_answered_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
        days_since_last: 35,
        answered_days_total: 3,
        low_ratings_14d: 0,
      },
      biomarker: {},
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Feedback bad')).toBeInTheDocument();
    });
  });

  test('feedback chip is red when ≥7 low ratings in last 14 days', async () => {
    renderWithPatient({
      _id: 'fb-red-lowcount',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'fbredlow',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Red',
      name: 'LowCount',
      diagnosis: ['Stroke'],
      duration: 30,
      intervention_feedback: {
        last_answered_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        days_since_last: 2,
        answered_days_total: 10,
        low_ratings_14d: 7,
      },
      biomarker: {},
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Feedback bad')).toBeInTheDocument();
    });
  });
});

describe('Diagnosis translation in patient table', () => {
  const renderWithPatient = (patient: Record<string, unknown>) => {
    mockStore.patients = [patient as any];
    return render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
  };

  afterEach(() => {
    // Restore default pass-through translation after each test
    mockUseTranslation.mockReturnValue({ t: (key: string) => key });
  });

  test('renders translated diagnosis when diagnosis is an array', async () => {
    mockUseTranslation.mockReturnValue({
      t: (key: string) => (key === 'Heart attack' ? 'Herzinfarkt' : key),
    });

    renderWithPatient({
      _id: 'diagnosis-array-patient',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'diagarray',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Array',
      name: 'Patient',
      diagnosis: ['Heart attack'],
      duration: 30,
    });

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: 'Herzinfarkt' })).toBeInTheDocument();
    });
  });

  test('renders translated diagnosis when diagnosis is a string', async () => {
    mockUseTranslation.mockReturnValue({
      t: (key: string) => (key === 'Stroke' ? 'Schlaganfall' : key),
    });

    renderWithPatient({
      _id: 'diagnosis-string-patient',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'diagstring',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'String',
      name: 'Patient',
      diagnosis: 'Stroke',
      duration: 30,
    });

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: 'Schlaganfall' })).toBeInTheDocument();
    });
  });

  test('renders multiple translated diagnoses joined by comma', async () => {
    mockUseTranslation.mockReturnValue({
      t: (key: string) => {
        if (key === 'Heart attack') return 'Herzinfarkt';
        if (key === 'Stroke') return 'Schlaganfall';
        return key;
      },
    });

    renderWithPatient({
      _id: 'diagnosis-multi-patient',
      therapist: 'T',
      created_at: '2026-01-01T00:00:00',
      username: 'diagmulti',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Multi',
      name: 'Patient',
      diagnosis: ['Heart attack', 'Stroke'],
      duration: 30,
    });

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: 'Herzinfarkt, Schlaganfall' })).toBeInTheDocument();
    });
  });
});

describe('Column sorting', () => {
  const sortablePatients = [
    {
      _id: 'p-a',
      created_at: '2026-01-01T00:00:00',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Alpha',
      name: 'One',
      diagnosis: ['Stroke'],
      duration: 30,
      user_last_login: new Date(Date.now() - 1 * 86400000).toISOString(),
      adherence_rate: 90,
    },
    {
      _id: 'p-b',
      created_at: '2026-01-02T00:00:00',
      age: '1990-01-01',
      sex: 'Male',
      first_name: 'Beta',
      name: 'Two',
      diagnosis: ['Stroke'],
      duration: 30,
      user_last_login: new Date(Date.now() - 5 * 86400000).toISOString(),
      adherence_rate: 40,
    },
  ];

  const renderSortable = () => {
    mockStore.patients = sortablePatients as any;
    return render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
  };

  const getBodyRowNames = () =>
    screen.getAllByRole('cell', { name: /One|Two/ }).map((c) => c.textContent);

  test('clicking the Login header sorts by days since last login (asc = most stale first)', async () => {
    renderSortable();
    await screen.findByText('Alpha One');

    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(mockStore.setSortBy).toHaveBeenCalledWith('last_login');
    });
    expect(getBodyRowNames()).toEqual(['Beta Two', 'Alpha One']);
  });

  test('clicking the same header again reverses the sort direction', async () => {
    renderSortable();
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => expect(getBodyRowNames()).toEqual(['Beta Two', 'Alpha One']));

    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => expect(getBodyRowNames()).toEqual(['Alpha One', 'Beta Two']));
  });

  test('clicking the Adherence header sorts by adherence rate (asc = worst first)', async () => {
    renderSortable();
    await screen.findByText('Alpha One');

    fireEvent.click(screen.getByText('Adherence'));

    await waitFor(() => {
      expect(mockStore.setSortBy).toHaveBeenCalledWith('adherence');
    });
    expect(getBodyRowNames()).toEqual(['Beta Two', 'Alpha One']);
  });

  test('clicking the Feedback header triggers a feedback-based sort', async () => {
    renderSortable();
    fireEvent.click(screen.getByText('Feedback'));
    await waitFor(() => expect(mockStore.setSortBy).toHaveBeenCalledWith('feedback'));
  });

  test('clicking the Wear header triggers a wear-based sort', async () => {
    renderSortable();
    fireEvent.click(screen.getByText('Wear'));
    await waitFor(() => expect(mockStore.setSortBy).toHaveBeenCalledWith('wear'));
  });
});

describe('Patient row navigation', () => {
  beforeEach(() => {
    mockStore.patients = patientsMock;
  });

  test('clicking a patient row navigates to their detail page', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    const row = (await screen.findByText('Mark Ruffalo')).closest('[role="link"]')!;
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('/therapist-patient-detail/67d588798c0494979e4633e5');
  });

  test('pressing Enter on a patient row navigates to their detail page', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    const row = (await screen.findByText('Mark Ruffalo')).closest('[role="link"]')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/therapist-patient-detail/67d588798c0494979e4633e5');
  });

  test('ignores unrelated keys on a patient row', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    const row = (await screen.findByText('Mark Ruffalo')).closest('[role="link"]')!;
    fireEvent.keyDown(row, { key: 'Tab' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Error banner', () => {
  test('shows the error message and a Retry button that refetches patients', async () => {
    mockStore.error = 'Failed to load patients';
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(await screen.findByText('Failed to load patients')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(mockStore.fetchPatients).toHaveBeenCalled();
  });

  test('disables Retry and shows a loading label while loading', async () => {
    mockStore.error = 'Failed to load patients';
    mockStore.loading = true;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    const retryBtn = await screen.findByRole('button', { name: /Loading\.\.\./i });
    expect(retryBtn).toBeDisabled();
  });

  test('toggles error details visibility via Show/Hide details', async () => {
    mockStore.error = 'Failed to load patients';
    mockStore.errorDetails = 'Stack trace details';
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(screen.queryByText('Stack trace details')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Show details/i }));
    expect(mockStore.toggleErrorDetails).toHaveBeenCalled();
  });

  test('renders errorDetails text once showErrorDetails is true', async () => {
    mockStore.error = 'Failed to load patients';
    mockStore.errorDetails = 'Stack trace details';
    mockStore.showErrorDetails = true;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(await screen.findByText('Stack trace details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide details/i })).toBeInTheDocument();
  });

  test('does not show the Show/Hide details button when there are no errorDetails', async () => {
    mockStore.error = 'Failed to load patients';
    mockStore.errorDetails = null;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await screen.findByText('Failed to load patients');
    expect(screen.queryByRole('button', { name: /Show details/i })).not.toBeInTheDocument();
  });
});

describe('Header action buttons', () => {
  test('shows skeleton placeholders instead of action buttons while appModeStore is not loaded', () => {
    appModeStore.loaded = false;
    const { container } = render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /Add a New Patient/i })).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('.animate-pulse, [class*="skeleton"]').length
    ).toBeGreaterThanOrEqual(0);
  });

  test('hides the Add Patient button when showManualCreate is false', () => {
    appModeStore.showManualCreate = false;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /Add a New Patient/i })).not.toBeInTheDocument();
  });

  test('shows the Import from REDCap button when showRedcapImport is true and opens the modal', async () => {
    appModeStore.showRedcapImport = true;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    const btn = screen.getByRole('button', { name: /Import from REDCap/i });
    fireEvent.click(btn);

    expect(mockStore.openImportRedcap).toHaveBeenCalled();
    await waitFor(() => expect(mockStore.fetchRedcapCandidates).toHaveBeenCalled());
  });

  test('does not render the Import Modal wrapper when showRedcapImport is false', () => {
    appModeStore.showRedcapImport = false;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    expect(screen.queryByText('Import Modal')).not.toBeInTheDocument();
  });

  test('renders the Import Modal wrapper when showRedcapImport is true', () => {
    appModeStore.showRedcapImport = true;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    expect(screen.getByText('Import Modal')).toBeInTheDocument();
  });
});

describe('Completed patients section', () => {
  const completedPatient = {
    _id: 'completed-1',
    created_at: '2026-01-01T00:00:00',
    age: '1990-01-01',
    sex: 'Female',
    first_name: 'Done',
    name: 'Patient',
    diagnosis: ['Stroke'],
    duration: 100,
    rehab_status: 'completed',
    rehab_end_date: '2026-03-01T00:00:00',
  };

  test('shows the completed patient with a Discharged date when expanded', async () => {
    mockStore.patients = [completedPatient] as any;
    mockStore.showCompleted = true;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(await screen.findByText('Done Patient')).toBeInTheDocument();
    expect(screen.getByText(/Discharged/)).toBeInTheDocument();
  });

  test('shows "No completed patients" when the completed list is empty', async () => {
    mockStore.patients = [] as any;
    mockStore.showCompleted = true;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(await screen.findByText('No completed patients')).toBeInTheDocument();
  });

  test('navigates when a completed row is clicked', async () => {
    mockStore.patients = [completedPatient] as any;
    mockStore.showCompleted = true;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    const row = (await screen.findByText('Done Patient')).closest('[role="link"]')!;
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('/therapist-patient-detail/completed-1');
  });
});

describe('Empty / loading states', () => {
  test('shows "No active patients" when there are none and not loading', async () => {
    mockStore.patients = [] as any;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    expect(await screen.findByText('No active patients')).toBeInTheDocument();
  });

  test('shows "Loading patients..." when loading with no active patients yet', async () => {
    mockStore.patients = [] as any;
    mockStore.loading = true;
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );
    expect(await screen.findByText('Loading patients...')).toBeInTheDocument();
  });
});
