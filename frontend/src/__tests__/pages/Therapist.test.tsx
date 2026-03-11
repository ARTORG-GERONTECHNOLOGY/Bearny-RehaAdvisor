import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Therapist from '@/pages/Therapist';
import { MemoryRouter } from 'react-router-dom';
import authStore from '@/stores/authStore';
import apiClient from '@/api/client';

import '@testing-library/jest-dom';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock the apiClient
// Mock the apiClient
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));
// Mock child components
jest.mock('@/components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('@/components/common/Footer', () => () => <div>Mock Footer</div>);
jest.mock('@/components/common/WelcomeArea', () => () => <div>Mocked Welcome Area</div>);
jest.mock('@/components/TherapistPatientPage/PatientPopup', () => () => <div>Patient Popup</div>);
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

// Mock translation function
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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

// Mock TherapistPatientsStore
const mockStore = {
  patients: [],
  loading: false,
  error: '',
  errorDetails: null,
  showErrorDetails: false,
  selectedPatient: null,
  showPatientPopup: false,
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
  openPatientPopup: jest.fn((patient: any) => {
    mockStore.selectedPatient = patient;
    mockStore.showPatientPopup = true;
  }),
  openPatient: jest.fn((patient: any) => {
    mockStore.selectedPatient = patient;
    mockStore.showPatientPopup = true;
  }),
  closePatientPopup: jest.fn(() => {
    mockStore.showPatientPopup = false;
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
};

jest.mock('@/stores/therapistPatientsStore', () => ({
  __esModule: true,
  TherapistPatientsStore: jest.fn().mockImplementation(() => mockStore),
  SortKey: 'created',
}));

describe('Therapist Page', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: patientsMock });
    mockStore.patients = patientsMock;
    mockStore.loading = false;
    mockStore.error = '';
    mockStore.showPatientPopup = false;
    mockStore.showAddPatientPopup = false;
    mockStore.selectedSex = 'All';
    mockStore.selectedDuration = 'All';
    mockStore.searchTerm = '';
    mockStore.sexFilter = '';
    mockStore.durationFilter = '';
    mockStore.diseaseFilter = '';
  });

  test('renders therapist page with patients', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(screen.getByText('Mock Header')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Mark Ruffalo')).toBeInTheDocument();
      expect(screen.getByText('Jennifer Anniston')).toBeInTheDocument();
      expect(screen.getByText('Tom Day')).toBeInTheDocument();
    });

    expect(screen.getByText('Mock Footer')).toBeInTheDocument();
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
