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

import { RehabTableStore } from '@/stores/rehabTableStore';

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
