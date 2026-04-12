import { initPatientData, resetPatientDataInit } from '@/services/patientDataService';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

const mockFetchStatus = jest.fn();
const mockFetchSummary = jest.fn();
const mockFetchPlan = jest.fn();
const mockFetchAll = jest.fn();
const mockFetchCombinedHistoryForPatient = jest.fn();

jest.mock('@/stores/patientFitbitStore', () => ({
  patientFitbitStore: {
    fetchStatus: (...args: unknown[]) => mockFetchStatus(...args),
    fetchSummary: (...args: unknown[]) => mockFetchSummary(...args),
  },
}));

jest.mock('@/stores/patientInterventionsStore', () => ({
  patientInterventionsStore: {
    fetchPlan: (...args: unknown[]) => mockFetchPlan(...args),
  },
}));

jest.mock('@/stores/interventionsLibraryStore', () => ({
  patientInterventionsLibraryStore: {
    fetchAll: (...args: unknown[]) => mockFetchAll(...args),
  },
}));

jest.mock('@/stores/healthPageStore', () => ({
  healthPageStore: {
    fetchCombinedHistoryForPatient: (...args: unknown[]) =>
      mockFetchCombinedHistoryForPatient(...args),
  },
}));

jest.mock('@/hooks/usePatientProcess', () => ({
  getDateWindow: (filter: string) =>
    filter === 'week'
      ? { from: '2026-04-05', to: '2026-04-11' }
      : { from: '2026-03-13', to: '2026-04-11' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetPatientDataInit();
});

describe('initPatientData', () => {
  it('fires all store fetches with correct arguments', () => {
    initPatientData('patient-1', 'de');

    expect(mockFetchStatus).toHaveBeenCalledWith('patient-1');
    expect(mockFetchSummary).toHaveBeenCalledWith('patient-1', 7);
    expect(mockFetchSummary).toHaveBeenCalledWith('patient-1', 30);
    expect(mockFetchPlan).toHaveBeenCalledWith('patient-1', 'de');
    expect(mockFetchAll).toHaveBeenCalledWith({ mode: 'patient', lang: 'de' });
    expect(mockFetchCombinedHistoryForPatient).toHaveBeenCalledWith(
      'patient-1',
      '2026-04-05',
      '2026-04-11'
    );
    expect(mockFetchCombinedHistoryForPatient).toHaveBeenCalledWith(
      'patient-1',
      '2026-03-13',
      '2026-04-11'
    );
  });

  it('slices lang to 2 chars for fetchAll', () => {
    initPatientData('patient-1', 'de-CH');

    expect(mockFetchAll).toHaveBeenCalledWith({ mode: 'patient', lang: 'de' });
    // fetchPlan and loadHealthQuestionnaire receive the full lang string
    expect(mockFetchPlan).toHaveBeenCalledWith('patient-1', 'de-CH');
  });

  it('is a no-op when called a second time with the same patientId', () => {
    initPatientData('patient-1', 'en');
    initPatientData('patient-1', 'en');

    expect(mockFetchStatus).toHaveBeenCalledTimes(1);
  });

  it('re-fires after resetPatientDataInit', () => {
    initPatientData('patient-1', 'en');
    resetPatientDataInit();
    initPatientData('patient-1', 'en');

    expect(mockFetchStatus).toHaveBeenCalledTimes(2);
  });

  it('fires for a different patientId without reset', () => {
    initPatientData('patient-1', 'en');
    initPatientData('patient-2', 'en');

    expect(mockFetchStatus).toHaveBeenCalledWith('patient-1');
    expect(mockFetchStatus).toHaveBeenCalledWith('patient-2');
    expect(mockFetchStatus).toHaveBeenCalledTimes(2);
  });

  it('does nothing when patientId is empty', () => {
    initPatientData('', 'en');

    expect(mockFetchStatus).not.toHaveBeenCalled();
  });
});

describe('resetPatientDataInit', () => {
  it('allows initPatientData to fire again for the same id', () => {
    initPatientData('patient-1', 'en');
    expect(mockFetchStatus).toHaveBeenCalledTimes(1);

    resetPatientDataInit();
    initPatientData('patient-1', 'en');
    expect(mockFetchStatus).toHaveBeenCalledTimes(2);
  });
});
