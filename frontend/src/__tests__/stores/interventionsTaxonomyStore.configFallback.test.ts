// The moduleNameMapper regex `^.*/config/interventions\.json$` redirects every
// "*/config/interventions.json" import (including this store's relative import) to a
// single shared, always-complete mock config. Overriding it here (scoped to this test
// file only) with a config missing the `interventionsTaxonomy` key exercises the
// defensive `|| {}` / `|| []` fallbacks the shared mock can never reach.
jest.mock('../../config/interventions.json', () => ({}));

import { interventionsTaxonomyStore } from '@/stores/interventionsTaxonomyStore';

describe('interventionsTaxonomyStore with a taxonomy config missing every field', () => {
  it('falls back to empty arrays for every raw list getter', () => {
    expect(interventionsTaxonomyStore.inputFrom).toEqual([]);
    expect(interventionsTaxonomyStore.originalLanguages).toEqual([]);
    expect(interventionsTaxonomyStore.primaryDiagnoses).toEqual([]);
    expect(interventionsTaxonomyStore.aims).toEqual([]);
    expect(interventionsTaxonomyStore.topics).toEqual([]);
    expect(interventionsTaxonomyStore.cognitiveLevels).toEqual([]);
    expect(interventionsTaxonomyStore.physicalLevels).toEqual([]);
    expect(interventionsTaxonomyStore.contentTypes).toEqual([]);
    expect(interventionsTaxonomyStore.durationBuckets).toEqual([]);
    expect(interventionsTaxonomyStore.sexSpecific).toEqual([]);
    expect(interventionsTaxonomyStore.where).toEqual([]);
    expect(interventionsTaxonomyStore.setting).toEqual([]);
  });
});
