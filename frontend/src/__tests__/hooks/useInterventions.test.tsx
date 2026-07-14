import { renderHook, act, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Stable mock for patientInterventionsStore — items is overridden per test
const mockStore = {
  items: [] as any[],
  isCompletedOn: jest.fn(() => false),
  toggleCompleted: jest.fn(async () => ({ completed: false, dateKey: '2026-03-16' })),
};

jest.mock('@/stores/patientInterventionsStore', () => ({
  patientInterventionsStore: mockStore,
}));

jest.mock('@/stores/patientQuestionnairesStore', () => ({
  patientQuestionnairesStore: {
    openInterventionFeedback: jest.fn(async () => {}),
    closeFeedback: jest.fn(),
  },
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    id: 'patient-1',
    getStoredUserId: jest.fn(function (this: { id: string }) {
      return this.id || localStorage.getItem('id') || '';
    }),
  },
}));

import { useInterventions } from '@/hooks/useInterventions';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';

const DATE = new Date('2026-03-16T00:00:00');

const makeRec = (
  overrides: Partial<{
    intervention_id: string;
    intervention_title: string;
    dates: string[];
    external_id: string | null;
  }> = {}
) => ({
  intervention_id: overrides.intervention_id ?? 'int-1',
  intervention_title: overrides.intervention_title ?? 'Stretch',
  description: '',
  dates: overrides.dates ?? ['2026-03-16'],
  intervention:
    overrides.external_id !== undefined
      ? { _id: overrides.intervention_id ?? 'int-1', external_id: overrides.external_id }
      : { _id: overrides.intervention_id ?? 'int-1' },
});

describe('useInterventions — external_id deduplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('id', 'patient-1');
    mockStore.isCompletedOn.mockReturnValue(false);
  });

  it('returns both records when they have distinct external_ids', () => {
    mockStore.items = [
      makeRec({ intervention_id: 'int-1', external_id: 'EXT_A' }),
      makeRec({ intervention_id: 'int-2', external_id: 'EXT_B' }),
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    expect(result.current.interventions).toHaveLength(2);
  });

  it('deduplicates records with the same external_id, keeping the first', () => {
    mockStore.items = [
      makeRec({ intervention_id: 'int-1', external_id: 'SAME_EXT', intervention_title: 'First' }),
      makeRec({ intervention_id: 'int-2', external_id: 'SAME_EXT', intervention_title: 'Second' }),
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    expect(result.current.interventions).toHaveLength(1);
    expect(result.current.interventions[0].intervention_id).toBe('int-1');
  });

  it('keeps records that have no external_id (they are never deduplicated)', () => {
    mockStore.items = [
      makeRec({ intervention_id: 'int-1', external_id: null }),
      makeRec({ intervention_id: 'int-2', external_id: null }),
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    expect(result.current.interventions).toHaveLength(2);
  });

  it('deduplicates same external_id but keeps unrelated records', () => {
    mockStore.items = [
      makeRec({ intervention_id: 'int-1', external_id: 'SHARED' }),
      makeRec({ intervention_id: 'int-2', external_id: 'SHARED' }),
      makeRec({ intervention_id: 'int-3', external_id: 'UNIQUE' }),
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    expect(result.current.interventions).toHaveLength(2);
    const ids = result.current.interventions.map((r) => r.intervention_id);
    expect(ids).toContain('int-1');
    expect(ids).toContain('int-3');
    expect(ids).not.toContain('int-2');
  });

  it('filters out records not assigned to the requested date', () => {
    mockStore.items = [
      makeRec({ intervention_id: 'int-1', dates: ['2026-03-16'] }),
      makeRec({ intervention_id: 'int-2', dates: ['2026-03-17'] }),
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    expect(result.current.interventions).toHaveLength(1);
    expect(result.current.interventions[0].intervention_id).toBe('int-1');
  });

  it('completionCount reflects the deduplicated list', () => {
    mockStore.isCompletedOn.mockImplementation((rec: any) => rec.intervention_id === 'int-1');
    mockStore.items = [
      makeRec({ intervention_id: 'int-1', external_id: 'SAME', intervention_title: 'Alpha' }),
      makeRec({ intervention_id: 'int-2', external_id: 'SAME', intervention_title: 'Beta' }),
      makeRec({ intervention_id: 'int-3', external_id: 'OTHER', intervention_title: 'Gamma' }),
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    // After dedup: int-1 (completed) + int-3 (incomplete) = total 2, completed 1
    expect(result.current.completionCount).toEqual({ completed: 1, total: 2 });
  });

  it('sortedInterventions puts incomplete items before completed ones', () => {
    mockStore.isCompletedOn.mockImplementation((rec: any) => rec.intervention_id === 'int-1');
    mockStore.items = [
      makeRec({ intervention_id: 'int-1', external_id: 'A', intervention_title: 'Alpha' }),
      makeRec({ intervention_id: 'int-2', external_id: 'B', intervention_title: 'Beta' }),
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    const sorted = result.current.sortedInterventions;
    // int-2 (incomplete) should come before int-1 (completed)
    expect(sorted[0].intervention_id).toBe('int-2');
    expect(sorted[1].intervention_id).toBe('int-1');
  });

  it('treats a record with no dates array as never assigned to any date', () => {
    mockStore.items = [
      {
        intervention_id: 'int-1',
        intervention_title: 'No Dates',
        description: '',
        intervention: {},
      },
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    expect(result.current.interventions).toHaveLength(0);
  });

  it('sorts alphabetically by title within the same completion state, preferring translated_title', () => {
    mockStore.items = [
      {
        ...makeRec({ intervention_id: 'int-1', intervention_title: 'Zebra' }),
        translated_title: '',
      },
      {
        ...makeRec({ intervention_id: 'int-2', intervention_title: 'Zzz' }),
        translated_title: 'Apple',
      },
    ];

    const { result } = renderHook(() => useInterventions(DATE));
    const sorted = result.current.sortedInterventions;
    // int-2's translated_title "Apple" sorts before int-1's title "Zebra".
    expect(sorted[0].intervention_id).toBe('int-2');
    expect(sorted[1].intervention_id).toBe('int-1');
  });
});

describe('useInterventions — toggleCompleted / isBusy / feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('id', 'patient-1');
    mockStore.isCompletedOn.mockReturnValue(false);
    mockStore.items = [];
  });

  it('is not busy for a record before any toggle has started', () => {
    const { result } = renderHook(() => useInterventions(DATE));
    const rec = makeRec({ intervention_id: 'int-1' });
    expect(result.current.isBusy(rec, DATE)).toBe(false);
  });

  it('does nothing when there is no stored patient id', async () => {
    localStorage.clear();
    const mockAuthStore = jest.requireMock('@/stores/authStore').default;
    mockAuthStore.id = '';
    const { result } = renderHook(() => useInterventions(DATE));
    const rec = makeRec({ intervention_id: 'int-1' });

    await act(async () => {
      await result.current.toggleCompleted(rec, DATE);
    });

    expect(mockStore.toggleCompleted).not.toHaveBeenCalled();
    mockAuthStore.id = 'patient-1';
  });

  it('ignores a second toggle call for the same record/date while already busy', async () => {
    let resolveToggle: (v: unknown) => void = () => {};
    mockStore.toggleCompleted.mockReturnValueOnce(
      new Promise((res) => {
        resolveToggle = res;
      })
    );
    const { result } = renderHook(() => useInterventions(DATE));
    const rec = makeRec({ intervention_id: 'int-1' });

    let firstCall: Promise<void>;
    act(() => {
      firstCall = result.current.toggleCompleted(rec, DATE);
    });

    await waitFor(() => expect(result.current.isBusy(rec, DATE)).toBe(true));

    await act(async () => {
      await result.current.toggleCompleted(rec, DATE);
    });
    expect(mockStore.toggleCompleted).toHaveBeenCalledTimes(1);

    resolveToggle({ completed: false, dateKey: '2026-03-16' });
    await act(async () => {
      await firstCall;
    });
  });

  it('opens feedback when toggling to completed', async () => {
    mockStore.toggleCompleted.mockResolvedValueOnce({
      completed: true,
      dateKey: '2026-03-16',
    });
    const { result } = renderHook(() => useInterventions(DATE));
    const rec = makeRec({ intervention_id: 'int-1' });

    await act(async () => {
      await result.current.toggleCompleted(rec, DATE);
    });

    await waitFor(() =>
      expect(patientQuestionnairesStore.openInterventionFeedback).toHaveBeenCalledWith(
        'patient-1',
        'int-1',
        '2026-03-16',
        'en'
      )
    );
    expect(result.current.isBusy(rec, DATE)).toBe(false);
  });

  it('does not open feedback when toggling to incomplete', async () => {
    mockStore.toggleCompleted.mockResolvedValueOnce({
      completed: false,
      dateKey: '2026-03-16',
    });
    const { result } = renderHook(() => useInterventions(DATE));
    const rec = makeRec({ intervention_id: 'int-1' });

    await act(async () => {
      await result.current.toggleCompleted(rec, DATE);
    });

    expect(patientQuestionnairesStore.openInterventionFeedback).not.toHaveBeenCalled();
  });

  it('clears the busy flag and logs when toggleCompleted rejects', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockStore.toggleCompleted.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useInterventions(DATE));
    const rec = makeRec({ intervention_id: 'int-1' });

    await act(async () => {
      await result.current.toggleCompleted(rec, DATE);
    });

    expect(result.current.isBusy(rec, DATE)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith('Toggle completed failed:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('closes the feedback popup when opening feedback fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (patientQuestionnairesStore.openInterventionFeedback as jest.Mock).mockRejectedValueOnce(
      new Error('feedback down')
    );
    mockStore.toggleCompleted.mockResolvedValueOnce({
      completed: true,
      dateKey: '2026-03-16',
    });
    const { result } = renderHook(() => useInterventions(DATE));
    const rec = makeRec({ intervention_id: 'int-1' });

    await act(async () => {
      await result.current.toggleCompleted(rec, DATE);
    });

    await waitFor(() => expect(patientQuestionnairesStore.closeFeedback).toHaveBeenCalled());
    consoleSpy.mockRestore();
  });
});
