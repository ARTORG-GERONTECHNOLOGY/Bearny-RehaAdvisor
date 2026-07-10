import { interventionsTaxonomyStore } from '@/stores/interventionsTaxonomyStore';

describe('interventionsTaxonomyStore', () => {
  it('exposes the raw taxonomy lists from config', () => {
    expect(interventionsTaxonomyStore.inputFrom).toEqual([
      'Italy',
      'Portugal',
      'Belgium',
      'Switzerland',
    ]);
    expect(interventionsTaxonomyStore.originalLanguages).toContain('DE');
    expect(interventionsTaxonomyStore.primaryDiagnoses).toContain('heart failure');
    expect(interventionsTaxonomyStore.aims).toContain('Education');
    expect(interventionsTaxonomyStore.topics).toContain('nutrition');
    expect(interventionsTaxonomyStore.cognitiveLevels).toEqual(['low', 'medium', 'high']);
    expect(interventionsTaxonomyStore.physicalLevels).toEqual(['low', 'medium', 'high']);
    expect(interventionsTaxonomyStore.contentTypes).toContain('video');
    expect(interventionsTaxonomyStore.durationBuckets).toContain('<5min');
    expect(interventionsTaxonomyStore.sexSpecific).toEqual(['male', 'female', 'both', 'unisex']);
    expect(interventionsTaxonomyStore.where).toContain('hospital');
    expect(interventionsTaxonomyStore.setting).toContain('group');
  });

  it('converts a list of values to react-select options', () => {
    expect(interventionsTaxonomyStore.toOptions(['a', 'b'])).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ]);
  });

  it('returns an empty array of options for empty or missing input', () => {
    expect(interventionsTaxonomyStore.toOptions([])).toEqual([]);
    expect(interventionsTaxonomyStore.toOptions(undefined as unknown as string[])).toEqual([]);
  });
});
