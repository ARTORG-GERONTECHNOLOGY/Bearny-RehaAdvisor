/**
 * rehabTableStore — mergePlanWithCatalog tests
 *
 * Regression for the rehab-table filter/feedback/delete mismatch (issue #347).
 *
 * Root cause: the plan endpoint returns the ObjectId of the *assigned* variant,
 * while the catalog endpoint returns the ObjectId of the *preferred-language*
 * variant. When those two variants are different DB documents (different _ids
 * but same external_id), the frontend merge produced `full = undefined` — the
 * intervention appeared in the calendar but was invisible in the Filter, its
 * feedback was hidden, and the Delete button was missing.
 *
 * Fix: mergePlanWithCatalog now builds a secondary map keyed by external_id and
 * falls back to it when the primary _id lookup fails.
 */

import { RehabTableStore, extractApiError } from '@/stores/rehabTableStore';
import { toLocalYMD } from '@/utils/dateFormat';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1', userType: 'Therapist', isAuthenticated: true },
}));

jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((t: string) => Promise.resolve(t)),
}));
jest.mock('@/utils/filterUtils', () => ({
  filterInterventions: jest.fn((_: unknown, items: unknown[]) => items),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Access the private mergePlanWithCatalog method via cast. */
function callMerge(store: RehabTableStore, plan: any, catalog: any[]) {
  return (store as any).mergePlanWithCatalog(plan, catalog);
}

function makeStore() {
  return new RehabTableStore();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rehabTableStore.mergePlanWithCatalog — _id-based merge', () => {
  it('enriches plan item with catalog data when _ids match', () => {
    const store = makeStore();

    const plan = {
      interventions: [{ _id: 'id-abc', external_id: 'ext-001', title: 'Plan title', dates: [] }],
    };
    const catalog = [
      {
        _id: 'id-abc',
        external_id: 'ext-001',
        title: 'Catalog title',
        preview_img: 'img.png',
        content_type: 'Video',
      },
    ];

    const result = callMerge(store, plan, catalog);
    const item = result.interventions[0] as any;

    // Plan title takes precedence (plan spreads last)
    expect(item.title).toBe('Plan title');
    // Catalog fields are pulled in
    expect(item.preview_img).toBe('img.png');
    expect(item.content_type).toBe('Video');
  });

  it('falls back to the catalog value for every enriched field when the plan omits it', () => {
    const store = makeStore();

    const plan = { interventions: [{ _id: 'id-abc', dates: [] }] };
    const catalog = [
      {
        _id: 'id-abc',
        title: 'Catalog title',
        description: 'Catalog description',
        media_url: 'catalog-media-url',
        media_file: 'catalog-media-file',
        link: 'catalog-link',
        tags: ['tag-a'],
        benefitFor: ['benefit-a'],
        content_type: 'Video',
        preview_img: 'catalog-img.png',
      },
    ];

    const result = callMerge(store, plan, catalog);
    const item = result.interventions[0] as any;

    expect(item.title).toBe('Catalog title');
    expect(item.description).toBe('Catalog description');
    expect(item.media_url).toBe('catalog-media-url');
    expect(item.media_file).toBe('catalog-media-file');
    expect(item.link).toBe('catalog-link');
    expect(item.tags).toEqual(['tag-a']);
    expect(item.benefitFor).toEqual(['benefit-a']);
    expect(item.content_type).toBe('Video');
    expect(item.preview_img).toBe('catalog-img.png');
  });

  it('falls back to media_file for media_url when the catalog has no media_url', () => {
    const store = makeStore();

    const plan = { interventions: [{ _id: 'id-abc', dates: [] }] };
    const catalog = [{ _id: 'id-abc', media_file: 'only-media-file' }];

    const result = callMerge(store, plan, catalog);
    const item = result.interventions[0] as any;

    expect(item.media_url).toBe('only-media-file');
  });

  it('defaults every enriched field to an empty value when neither plan nor catalog has it', () => {
    const store = makeStore();

    const plan = { interventions: [{ _id: 'missing-everywhere', dates: [] }] };
    const result = callMerge(store, plan, []);
    const item = result.interventions[0] as any;

    expect(item.title).toBe('');
    expect(item.description).toBe('');
    expect(item.media_url).toBe('');
    expect(item.media_file).toBe('');
    expect(item.link).toBe('');
    expect(item.tags).toEqual([]);
    expect(item.benefitFor).toEqual([]);
    expect(item.content_type).toBe('');
    expect(item.preview_img).toBe('');
  });
});

describe('rehabTableStore.mergePlanWithCatalog — external_id fallback (regression #347)', () => {
  it('falls back to external_id when plan _id does not match any catalog _id', () => {
    const store = makeStore();

    // Simulates production: plan has EN ObjectId, catalog has DE ObjectId for
    // the same intervention (same external_id, different _id).
    const plan = {
      interventions: [
        {
          _id: 'en-object-id', // assigned variant's ObjectId
          external_id: 'ext-blood-pressure',
          title: 'Blood Pressure Basics',
          dates: [],
        },
      ],
    };
    const catalog = [
      {
        _id: 'de-object-id', // preferred-language variant's ObjectId — differs!
        external_id: 'ext-blood-pressure',
        title: 'Blutdruck Grundlagen',
        preview_img: 'bp.png',
        content_type: 'Video',
        tags: ['cardio'],
      },
    ];

    const result = callMerge(store, plan, catalog);
    const item = result.interventions[0] as any;

    // Plan title wins (plan spreads last, its title is truthy)
    expect(item.title).toBe('Blood Pressure Basics');
    // Catalog fields are pulled in via external_id fallback
    expect(item.preview_img).toBe('bp.png');
    expect(item.content_type).toBe('Video');
    expect(item.tags).toEqual(['cardio']);
    // _id is normalised to catalog's _id so downstream _id comparisons work
    // (patientAssignedItems, InterventionLeftPanel, hasFutureDates all match by _id)
    expect(item._id).toBe('de-object-id');
  });

  it('returns item intact (no catalog enrichment) when neither _id nor external_id matches', () => {
    const store = makeStore();

    const plan = {
      interventions: [
        { _id: 'unknown-id', external_id: 'unknown-ext', title: 'Solo intervention', dates: [] },
      ],
    };
    const catalog = [
      { _id: 'other-id', external_id: 'other-ext', title: 'Other', preview_img: 'x.png' },
    ];

    const result = callMerge(store, plan, catalog);
    const item = result.interventions[0] as any;

    expect(item.title).toBe('Solo intervention');
    // No catalog enrichment — preview_img is absent or empty string
    expect(item.preview_img || '').toBe('');
  });

  it('prefers _id match over external_id match when both are present', () => {
    const store = makeStore();

    // Plan item whose _id matches catalog entry A, but external_id matches B.
    // Should pick A (exact _id match wins).
    const plan = {
      interventions: [{ _id: 'id-a', external_id: 'ext-b', title: 'Plan', dates: [] }],
    };
    const catalog = [
      { _id: 'id-a', external_id: 'ext-a', title: 'Catalog A', preview_img: 'a.png' },
      { _id: 'id-b', external_id: 'ext-b', title: 'Catalog B', preview_img: 'b.png' },
    ];

    const result = callMerge(store, plan, catalog);
    const item = result.interventions[0] as any;

    expect(item.preview_img).toBe('a.png'); // matched via _id, not external_id
  });
});

// ---------------------------------------------------------------------------
// rescheduleInterventionDate — drag-and-drop calendar reschedule
// ---------------------------------------------------------------------------

describe('rehabTableStore.rescheduleInterventionDate', () => {
  let mockApiClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('@/api/client').default;

    // Default mock for GET endpoints used by fetchAll/fetchInts on success
    mockApiClient.get.mockResolvedValue({
      status: 200,
      data: { interventions: [] },
    });
  });

  it('posts the correct payload and returns true on success', async () => {
    const store = makeStore();
    const mockT = jest.fn((key: string) => key);
    const newDate = new Date('2026-07-21T14:00:00.000Z');

    mockApiClient.post.mockResolvedValueOnce({ status: 200, data: { success: true } });

    const result = await store.rescheduleInterventionDate(
      'int-1',
      '2026-07-21T09:00:00',
      newDate,
      mockT
    );

    expect(mockApiClient.post).toHaveBeenCalledWith('interventions/reschedule-date/', {
      patientId: store.patientIdForCalls,
      interventionId: 'int-1',
      oldDatetime: '2026-07-21T09:00:00',
      newDatetime: newDate.toISOString(),
    });
    expect(result).toBe(true);
    expect(store.error).toBeNull();
  });

  it('returns false without refetching when the response status is not 200/201', async () => {
    const store = makeStore();
    const mockT = jest.fn((key: string) => key);

    mockApiClient.post.mockResolvedValueOnce({ status: 204, data: {} });

    const result = await store.rescheduleInterventionDate(
      'int-1',
      '2026-07-21T09:00:00',
      new Date('2026-07-21T14:00:00.000Z'),
      mockT
    );

    expect(result).toBe(false);
    expect(mockApiClient.get).not.toHaveBeenCalled();
  });

  it('returns false and sets a field-error message when the API rejects', async () => {
    const store = makeStore();
    const mockT = jest.fn((key: string) => key);

    mockApiClient.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          message: 'A session already exists at that time.',
          field_errors: { newDatetime: ['Another session is already scheduled at this time.'] },
        },
      },
    });

    const result = await store.rescheduleInterventionDate(
      'int-1',
      '2026-07-21T09:00:00',
      new Date('2026-07-21T14:00:00.000Z'),
      mockT
    );

    expect(result).toBe(false);
    expect(store.error).toContain('A session already exists at that time.');
    expect(store.error).toContain('Another session is already scheduled at this time.');
  });

  it('never throws — callers can await it without a try/catch', async () => {
    mockApiClient.post.mockRejectedValueOnce(new Error('Network timeout'));
    const store = makeStore();

    await expect(
      store.rescheduleInterventionDate(
        'int-1',
        '2026-07-21T09:00:00',
        new Date('2026-07-21T14:00:00.000Z'),
        jest.fn((key: string) => key)
      )
    ).resolves.toBe(false);
    expect(store.error).toBeTruthy();
  });

  it('uses the fallback message when the API response lacks detail', async () => {
    const store = makeStore();
    const mockT = jest.fn((key: string) => `translated:${key}`);

    mockApiClient.post.mockRejectedValueOnce({ response: { status: 500, data: {} } });

    await store.rescheduleInterventionDate(
      'int-1',
      '2026-07-21T09:00:00',
      new Date('2026-07-21T14:00:00.000Z'),
      mockT
    );

    expect(store.error).toBe(
      'translated:Failed to reschedule the intervention. Try again now or later.'
    );
  });
});

// ---------------------------------------------------------------------------
// extractApiError
// ---------------------------------------------------------------------------

describe('extractApiError', () => {
  it('returns the fallback when there is no response payload', () => {
    expect(extractApiError({}, 'fallback')).toBe('fallback');
    expect(extractApiError(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('combines message, non_field_errors, and field_errors', () => {
    const err = {
      response: {
        data: {
          message: 'Validation failed',
          non_field_errors: ['Overlaps with existing session'],
          field_errors: { date: ['is required'] },
        },
      },
    };
    const msg = extractApiError(err, 'fallback');
    expect(msg).toContain('Validation failed');
    expect(msg).toContain('Overlaps with existing session');
    expect(msg).toContain('date: is required');
  });

  it('stringifies a numeric or boolean message field', () => {
    expect(extractApiError({ response: { data: { message: 503 } } }, 'fallback')).toBe('503');
    expect(extractApiError({ response: { data: { message: true } } }, 'fallback')).toBe('true');
  });

  it('accepts a field_errors value that is a plain string rather than an array', () => {
    const err = { response: { data: { field_errors: { date: 'is required' } } } };
    expect(extractApiError(err, 'fallback')).toBe('date: is required');
  });

  it('falls back to error/detail/details fields when there is no message', () => {
    expect(extractApiError({ response: { data: { error: 'Server exploded' } } }, 'fallback')).toBe(
      'Server exploded'
    );
    expect(extractApiError({ response: { data: { details: 'more info' } } }, 'fallback')).toBe(
      'more info'
    );
  });

  it('returns the fallback when the payload has no usable fields', () => {
    expect(extractApiError({ response: { data: {} } }, 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

describe('getters', () => {
  const authStoreMock = jest.requireMock('@/stores/authStore').default;

  afterEach(() => {
    authStoreMock.specialisations = undefined;
  });

  it('patientIdForCalls prefers explicitPatientId over patientUsername', () => {
    const store = makeStore();
    store.patientUsername = 'uname-1';
    expect(store.patientIdForCalls).toBe('uname-1');
    (store as any).explicitPatientId = 'explicit-1';
    expect(store.patientIdForCalls).toBe('explicit-1');
  });

  it('specialisations trims and filters authStore.specialisations', () => {
    authStoreMock.specialisations = [' Cardiology ', '', 'Neurology'];
    const store = makeStore();
    expect(store.specialisations).toEqual(['Cardiology', 'Neurology']);
  });

  it('specialisations is empty when authStore has none', () => {
    authStoreMock.specialisations = undefined;
    const store = makeStore();
    expect(store.specialisations).toEqual([]);
  });

  it('diagnoses flattens diagnosis lists for each specialisation', () => {
    authStoreMock.specialisations = ['Cardiology', 'Neurology'];
    const store = makeStore();
    expect(store.diagnoses).toEqual(expect.arrayContaining(['Stroke', 'Heart Failure']));
  });

  it('activePatientItems / pastPatientItems split by future dates', () => {
    const store = makeStore();
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();

    (store as any).allInterventions = [
      { _id: 'a', title: 'Active One' },
      { _id: 'b', title: 'Past One' },
    ];
    (store as any).patientData = {
      interventions: [
        { _id: 'a', dates: [{ datetime: future }] },
        { _id: 'b', dates: [{ datetime: past }] },
      ],
    };

    expect(store.activePatientItems.map((x) => x._id)).toEqual(['a']);
    expect(store.pastPatientItems.map((x) => x._id)).toEqual(['b']);
  });

  it('selectedExerciseFromPlan prefers the plan item, then falls back to the catalog', () => {
    const store = makeStore();
    (store as any).allInterventions = [{ _id: 'cat-1', title: 'Catalog Item' }];
    (store as any).patientData = {
      interventions: [{ _id: 'plan-1', title: 'Plan Item' }],
    };

    store.selectedExerciseId = 'plan-1';
    expect(store.selectedExerciseFromPlan?.title).toBe('Plan Item');

    store.selectedExerciseId = 'cat-1';
    expect(store.selectedExerciseFromPlan?.title).toBe('Catalog Item');

    store.selectedExerciseId = null;
    expect(store.selectedExerciseFromPlan).toBeNull();
  });

  it('selectedAssignment only looks at the patient plan, not the catalog', () => {
    const store = makeStore();
    (store as any).allInterventions = [{ _id: 'cat-1', title: 'Catalog Item' }];
    (store as any).patientData = { interventions: [] };

    store.selectedExerciseId = 'cat-1';
    expect(store.selectedAssignment).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Setters / filters
// ---------------------------------------------------------------------------

describe('setters', () => {
  it('setUserLang defaults to "en" for falsy input', () => {
    const store = makeStore();
    store.setUserLang('de');
    expect(store.userLang).toBe('de');
    store.setUserLang('');
    expect(store.userLang).toBe('en');
  });

  it('setError / setTopTab update state directly', () => {
    const store = makeStore();
    store.setError('oops');
    expect(store.error).toBe('oops');
    store.setTopTab('questionnaires');
    expect(store.topTab).toBe('questionnaires');
  });

  it('filter setters update state and recompute filteredRecommendations', () => {
    const store = makeStore();
    (store as any).recommendations = [{ _id: '1' }, { _id: '2' }];

    store.setSearchTerm('abc');
    expect(store.searchTerm).toBe('abc');
    store.setPatientTypeFilter('Stroke');
    expect(store.patientTypeFilter).toBe('Stroke');
    store.setContentTypeFilter('Video');
    expect(store.contentTypeFilter).toBe('Video');
    store.setTagFilter(['tag1']);
    expect(store.tagFilter).toEqual(['tag1']);
    store.setBenefitForFilter(['benefit1']);
    expect(store.benefitForFilter).toEqual(['benefit1']);
    store.setLanguageFilter(['EN']);
    expect(store.languageFilter).toEqual(['EN']);

    // The shared filterInterventions mock echoes back its 2nd arg (titleMap),
    // so each setter having triggered applyAllFilters is what this confirms.
    expect(store.filteredRecommendations).toEqual(store.titleMap);
  });

  it('setTagFilter/setBenefitForFilter/setLanguageFilter coerce non-arrays to []', () => {
    const store = makeStore();
    store.setTagFilter(null as any);
    expect(store.tagFilter).toEqual([]);
    store.setBenefitForFilter(undefined as any);
    expect(store.benefitForFilter).toEqual([]);
    store.setLanguageFilter('not-an-array' as any);
    expect(store.languageFilter).toEqual([]);
  });

  it('resetAllFilters clears every filter field', () => {
    const store = makeStore();
    store.setSearchTerm('x');
    store.setPatientTypeFilter('y');
    store.setContentTypeFilter('z');
    store.setTagFilter(['a']);
    store.setBenefitForFilter(['b']);
    store.setLanguageFilter(['c']);

    store.resetAllFilters();

    expect(store.searchTerm).toBe('');
    expect(store.patientTypeFilter).toBe('');
    expect(store.contentTypeFilter).toBe('');
    expect(store.tagFilter).toEqual([]);
    expect(store.benefitForFilter).toEqual([]);
    expect(store.languageFilter).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchAll / fetchInts / initForPatient
// ---------------------------------------------------------------------------

describe('fetchAll', () => {
  let mockApiClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('@/api/client').default;
  });

  it('stores the returned interventions on success', async () => {
    const store = makeStore();
    store.explicitPatientId = 'p1';
    mockApiClient.get.mockResolvedValueOnce({
      data: { interventions: [{ _id: 'i1' }], frequency: 'Daily' },
    });

    await store.fetchAll(jest.fn((k: string) => k));

    expect(mockApiClient.get).toHaveBeenCalledWith('patients/rehabilitation-plan/therapist/p1/');
    expect(store.patientData.interventions).toHaveLength(1);
  });

  it('treats a success:false envelope (with no interventions key) as an error', async () => {
    const store = makeStore();
    store.explicitPatientId = 'p1';
    mockApiClient.get.mockResolvedValueOnce({
      data: { success: false, message: 'Plan not found' },
    });

    await store.fetchAll(jest.fn((k: string) => k));

    expect(store.error).toBe('Plan not found');
    expect(store.patientData.interventions).toEqual([]);
  });

  it('sets an error message when the request rejects', async () => {
    const store = makeStore();
    store.explicitPatientId = 'p1';
    mockApiClient.get.mockRejectedValueOnce({
      response: { data: { error: 'Network down' } },
    });

    await store.fetchAll(jest.fn((k: string) => k));

    expect(store.error).toBe('Network down');
    expect(store.patientData).toEqual({ interventions: [] });
  });

  it('merges with the catalog immediately when allInterventions is already loaded', async () => {
    const store = makeStore();
    store.explicitPatientId = 'p1';
    (store as any).allInterventions = [{ _id: 'i1', preview_img: 'x.png' }];
    mockApiClient.get.mockResolvedValueOnce({
      data: { interventions: [{ _id: 'i1', title: 'Plan title' }] },
    });

    await store.fetchAll(jest.fn((k: string) => k));

    expect((store.patientData.interventions[0] as any).preview_img).toBe('x.png');
  });
});

describe('fetchInts', () => {
  let mockApiClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('@/api/client').default;
  });

  it('accepts a bare array response and dedupes by _id', async () => {
    const store = makeStore();
    store.explicitPatientId = 'p1';
    mockApiClient.get.mockResolvedValueOnce({
      data: [{ _id: 'i1' }, { _id: 'i1' }, { _id: 'i2' }],
    });

    await store.fetchInts(jest.fn((k: string) => k));

    expect(mockApiClient.get).toHaveBeenCalledWith('interventions/all/p1/');
    expect(store.allInterventions).toHaveLength(2);
    expect(store.recommendations).toEqual(store.allInterventions);
    // applyAllFilters() ran — confirmed via the shared filterInterventions mock,
    // which echoes back its 2nd arg (titleMap).
    expect(store.filteredRecommendations).toEqual(store.titleMap);
  });

  it('accepts a { interventions: [...] } envelope', async () => {
    const store = makeStore();
    mockApiClient.get.mockResolvedValueOnce({
      data: { interventions: [{ _id: 'i1' }] },
    });

    await store.fetchInts(jest.fn((k: string) => k));

    expect(store.allInterventions).toHaveLength(1);
  });

  it('defaults to an empty list for an unrecognized payload shape', async () => {
    const store = makeStore();
    mockApiClient.get.mockResolvedValueOnce({ data: {} });

    await store.fetchInts(jest.fn((k: string) => k));

    expect(store.allInterventions).toEqual([]);
  });

  it('sets an error message when the request rejects', async () => {
    const store = makeStore();
    mockApiClient.get.mockRejectedValueOnce({
      response: { data: { error: 'Catalog unavailable' } },
    });

    await store.fetchInts(jest.fn((k: string) => k));

    expect(store.error).toBe('Catalog unavailable');
  });

  it('re-merges patientData with the catalog when a plan is already loaded', async () => {
    const store = makeStore();
    (store as any).patientData = {
      interventions: [{ _id: 'i1', title: 'Plan title' }],
    };
    mockApiClient.get.mockResolvedValueOnce({
      data: [{ _id: 'i1', preview_img: 'y.png' }],
    });

    await store.fetchInts(jest.fn((k: string) => k));

    expect((store.patientData.interventions[0] as any).preview_img).toBe('y.png');
  });
});

describe('initForPatient', () => {
  let mockApiClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('@/api/client').default;
    mockApiClient.get.mockResolvedValue({ data: { interventions: [] } });
  });

  it('sets an error and stops early when no patientId is given', async () => {
    const store = makeStore();
    await store.initForPatient(
      '',
      jest.fn((k: string) => k)
    );

    expect(store.error).toBe('No patient selected.');
    expect(store.loading).toBe(false);
    expect(mockApiClient.get).not.toHaveBeenCalled();
  });

  it('loads plan + catalog, merges them, and stops loading', async () => {
    const store = makeStore();
    mockApiClient.get
      .mockResolvedValueOnce({ data: { interventions: [{ _id: 'i1', title: 'Plan' }] } })
      .mockResolvedValueOnce({ data: [{ _id: 'i1', preview_img: 'z.png' }] });

    await store.initForPatient(
      'patient-1',
      jest.fn((k: string) => k)
    );

    expect(store.explicitPatientId).toBe('patient-1');
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect((store.patientData.interventions[0] as any).preview_img).toBe('z.png');
  });
});

describe('dispose', () => {
  let mockApiClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('@/api/client').default;
  });

  it('logs analytics with the viewed patient and duration', async () => {
    const store = makeStore();
    store.explicitPatientId = 'patient-1';
    mockApiClient.post.mockResolvedValueOnce({});

    await store.dispose();

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/analytics/log',
      expect.objectContaining({
        action: 'REHATABLE',
        patient: 'patient-1',
        user: 'therapist-1',
      })
    );
  });

  it('swallows analytics failures silently', async () => {
    const store = makeStore();
    mockApiClient.post.mockRejectedValueOnce(new Error('log endpoint down'));
    await expect(store.dispose()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// translateVisibleItems
// ---------------------------------------------------------------------------

describe('translateVisibleItems', () => {
  it('clears titleMap/typeMap when there are no recommendations', async () => {
    const store = makeStore();
    (store as any).titleMap = { stale: { title: 'x', lang: null } };
    (store as any).recommendations = [];

    await store.translateVisibleItems();

    expect(store.titleMap).toEqual({});
    expect(store.typeMap).toEqual({});
  });

  it('builds titleMap and typeMap for each recommendation', async () => {
    const store = makeStore();
    (store as any).recommendations = [{ _id: 'i1', title: 'Breathing', content_type: 'video' }];

    await store.translateVisibleItems();

    expect(store.titleMap.i1.title).toBe('Breathing');
    expect(store.typeMap.i1).toBe('Video');
  });

  it('falls back to the original title/type when translation throws', async () => {
    const { translateText } = require('@/utils/translate');
    (translateText as jest.Mock).mockRejectedValueOnce(new Error('translate down'));
    (translateText as jest.Mock).mockRejectedValueOnce(new Error('translate down'));

    const store = makeStore();
    (store as any).recommendations = [{ _id: 'i1', title: 'Breathing', content_type: 'video' }];

    await store.translateVisibleItems();

    expect(store.titleMap.i1).toEqual({ title: 'Breathing', lang: null });
    expect(store.typeMap.i1).toBe('Video');
  });
});

// ---------------------------------------------------------------------------
// Modal open/close handlers
// ---------------------------------------------------------------------------

describe('modal handlers', () => {
  it('handleExerciseClick selects the item and opens the info modal', () => {
    const store = makeStore();
    store.handleExerciseClick({ _id: 'i1' });
    expect(store.selectedExerciseId).toBe('i1');
    expect(store.showInfoInterventionModal).toBe(true);

    store.closeInfoModal();
    expect(store.showInfoInterventionModal).toBe(false);
  });

  it('showStats selects the item and opens the stats modal', () => {
    const store = makeStore();
    store.showStats({ id: 'i2' });
    expect(store.selectedExerciseId).toBe('i2');
    expect(store.showExerciseStats).toBe(true);

    store.closeStatsModal();
    expect(store.showExerciseStats).toBe(false);
  });

  it('openFeedbackBrowser prefers the merged plan item over the raw argument', () => {
    const store = makeStore();
    (store as any).patientData = {
      interventions: [{ _id: 'i1', title: 'Plan Item' }],
    };

    store.openFeedbackBrowser({ _id: 'i1', title: 'Raw Item' }, '2026-01-01T10:00:00Z');

    expect(store.feedbackBrowserIntervention).toEqual({ _id: 'i1', title: 'Plan Item' });
    expect(store.feedbackInitialDatetime).toBe('2026-01-01T10:00:00Z');
    expect(store.showFeedbackBrowser).toBe(true);

    store.closeFeedbackBrowser();
    expect(store.showFeedbackBrowser).toBe(false);
    expect(store.feedbackBrowserIntervention).toBeNull();
    expect(store.feedbackInitialDatetime).toBeNull();
  });

  it('openFeedbackBrowser falls back to the raw argument when there is no plan match', () => {
    const store = makeStore();
    (store as any).patientData = { interventions: [] };

    store.openFeedbackBrowser({ _id: 'i9', title: 'Raw Only' });

    expect(store.feedbackBrowserIntervention).toEqual({ _id: 'i9', title: 'Raw Only' });
    expect(store.feedbackInitialDatetime).toBeNull();
  });

  it('openAddIntervention resets to create mode with no defaults', () => {
    const store = makeStore();
    store.modifyDefaults = {
      effectiveFrom: 'x',
      frequency: 'y',
      notes: 'z',
      require_video_feedback: true,
    };

    store.openAddIntervention({ _id: 'i1' });

    expect(store.repeatMode).toBe('create');
    expect(store.selectedExerciseId).toBe('i1');
    expect(store.modifyDefaults).toBeNull();
    expect(store.showRepeatModal).toBe(true);

    store.closeRepeatModal();
    expect(store.showRepeatModal).toBe(false);
  });

  it('openModifyIntervention computes defaults from the next future date', () => {
    const store = makeStore();
    const futureDate = new Date(Date.now() + 2 * 86400000);
    const pastDate = new Date(Date.now() - 86400000);
    (store as any).patientData = {
      interventions: [
        {
          _id: 'i1',
          dates: [{ datetime: pastDate.toISOString() }, { datetime: futureDate.toISOString() }],
          frequency: 'Daily',
          notes: 'Take it slow',
          require_video_feedback: true,
        },
      ],
    };

    store.openModifyIntervention({ _id: 'i1' });

    expect(store.repeatMode).toBe('modify');
    expect(store.modifyDefaults?.frequency).toBe('Daily');
    expect(store.modifyDefaults?.notes).toBe('Take it slow');
    expect(store.modifyDefaults?.require_video_feedback).toBe(true);
    // Compare via the same local-calendar-day helper the store uses (toLocalYMD),
    // not toISOString(), which is UTC and can be off by a day depending on TZ.
    expect(store.modifyDefaults?.effectiveFrom).toBe(toLocalYMD(futureDate));
    expect(store.showRepeatModal).toBe(true);
  });

  it('openModifyIntervention defaults to tomorrow when there is no future date', () => {
    const store = makeStore();
    (store as any).patientData = {
      interventions: [
        { _id: 'i1', dates: [], frequency: '', notes: '', require_video_feedback: false },
      ],
    };

    store.openModifyIntervention({ _id: 'i1' });

    const tomorrow = toLocalYMD(new Date(Date.now() + 86400000));
    expect(store.modifyDefaults?.effectiveFrom).toBe(tomorrow);
    expect(store.modifyDefaults?.require_video_feedback).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteExercise
// ---------------------------------------------------------------------------

describe('deleteExercise', () => {
  let mockApiClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('@/api/client').default;
    mockApiClient.get.mockResolvedValue({ data: { interventions: [] } });
  });

  it('posts the removal request and refetches on success', async () => {
    const store = makeStore();
    store.explicitPatientId = 'p1';
    mockApiClient.post.mockResolvedValueOnce({ status: 200 });

    await store.deleteExercise(
      'int-1',
      jest.fn((k: string) => k)
    );

    expect(mockApiClient.post).toHaveBeenCalledWith('interventions/remove-from-patient/', {
      patientId: 'p1',
      intervention: 'int-1',
    });
    expect(mockApiClient.get).toHaveBeenCalledTimes(2); // fetchAll + fetchInts
  });

  it('sets an error message when the removal request fails', async () => {
    const store = makeStore();
    mockApiClient.post.mockRejectedValueOnce({
      response: { data: { error: 'Cannot remove active session' } },
    });

    await store.deleteExercise(
      'int-1',
      jest.fn((k: string) => k)
    );

    expect(store.error).toBe('Cannot remove active session');
  });

  it('does not refetch when the response status is not 200/201', async () => {
    const store = makeStore();
    mockApiClient.post.mockResolvedValueOnce({ status: 204 });

    await store.deleteExercise(
      'int-1',
      jest.fn((k: string) => k)
    );

    expect(mockApiClient.get).not.toHaveBeenCalled();
  });
});
