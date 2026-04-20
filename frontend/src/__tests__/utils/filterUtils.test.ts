import { filterInterventions } from '@/utils/filterUtils';
import type { Intervention } from '@/types';

const makeIntervention = (
  overrides: Partial<Intervention> & Record<string, unknown> = {}
): Intervention =>
  ({
    _id: 'id-1',
    title: 'Test Intervention',
    content_type: 'video',
    patient_types: [],
    benefitFor: [],
    tags: [],
    ...overrides,
  }) as Intervention;

const emptyFilters = {
  diagnosisFilter: [],
  languageFilter: [],
  contentTypeFilter: '',
  tagFilter: [],
  benefitForFilter: [],
  searchTerm: '',
};

describe('filterInterventions', () => {
  it('returns all interventions when no filters are set', () => {
    const items = [makeIntervention({ _id: 'a' }), makeIntervention({ _id: 'b' })];
    expect(filterInterventions(items, undefined, emptyFilters)).toHaveLength(2);
  });

  describe('diagnosisFilter', () => {
    it('keeps items that match at least one diagnosis', () => {
      const items = [
        makeIntervention({ _id: 'a', primary_diagnosis: ['orthopedic'] }),
        makeIntervention({ _id: 'b', primary_diagnosis: ['cardio'] }),
      ];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        diagnosisFilter: ['orthopedic'],
      });
      expect(result.map((r) => r._id)).toEqual(['a']);
    });

    it('excludes items without primary_diagnosis array', () => {
      const items = [makeIntervention({ _id: 'a' })];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        diagnosisFilter: ['orthopedic'],
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('languageFilter', () => {
    it('keeps items with matching available_languages', () => {
      const items = [
        makeIntervention({ _id: 'a', available_languages: ['EN', 'DE'] }),
        makeIntervention({ _id: 'b', available_languages: ['FR'] }),
      ];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        languageFilter: ['en'],
      });
      expect(result.map((r) => r._id)).toEqual(['a']);
    });

    it('falls back to rec.language when available_languages is not an array', () => {
      const items = [
        makeIntervention({ _id: 'a', language: 'de' }),
        makeIntervention({ _id: 'b', language: 'fr' }),
      ];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        languageFilter: ['de'],
      });
      expect(result.map((r) => r._id)).toEqual(['a']);
    });

    it('filters out items where language is falsy and no available_languages', () => {
      const items = [makeIntervention({ _id: 'a' })];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        languageFilter: ['en'],
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('contentTypeFilter', () => {
    it('keeps only items with matching content_type', () => {
      const items = [
        makeIntervention({ _id: 'a', content_type: 'video' }),
        makeIntervention({ _id: 'b', content_type: 'audio' }),
      ];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        contentTypeFilter: 'video',
      });
      expect(result.map((r) => r._id)).toEqual(['a']);
    });
  });

  describe('tagFilter', () => {
    it('keeps items that have at least one matching tag', () => {
      const items = [
        makeIntervention({ _id: 'a', tags: ['yoga', 'mindfulness'] }),
        makeIntervention({ _id: 'b', tags: ['cardio'] }),
      ];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        tagFilter: ['yoga'],
      });
      expect(result.map((r) => r._id)).toEqual(['a']);
    });

    it('excludes items with no matching tags', () => {
      const items = [makeIntervention({ _id: 'a', tags: ['cardio'] })];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        tagFilter: ['yoga'],
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('benefitForFilter', () => {
    it('keeps items matching via benefitFor field', () => {
      const items = [
        makeIntervention({ _id: 'a', benefitFor: ['sleep', 'stress'] }),
        makeIntervention({ _id: 'b', benefitFor: ['mobility'] }),
      ];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        benefitForFilter: ['sleep'],
      });
      expect(result.map((r) => r._id)).toEqual(['a']);
    });

    it('keeps items matching via aims field (backend alias)', () => {
      const items = [
        makeIntervention({ _id: 'a', aims: ['sleep'], benefitFor: [] }),
        makeIntervention({ _id: 'b', aims: ['mobility'], benefitFor: [] }),
      ];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        benefitForFilter: ['sleep'],
      });
      expect(result.map((r) => r._id)).toEqual(['a']);
    });

    it('excludes items with no matching benefit', () => {
      const items = [makeIntervention({ _id: 'a', benefitFor: ['mobility'] })];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        benefitForFilter: ['sleep'],
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('searchTerm', () => {
    it('filters by original title', () => {
      const items = [
        makeIntervention({ _id: 'a', title: 'Yoga for Beginners' }),
        makeIntervention({ _id: 'b', title: 'Cardio Blast' }),
      ];
      const result = filterInterventions(items, undefined, {
        ...emptyFilters,
        searchTerm: 'yoga',
      });
      expect(result.map((r) => r._id)).toEqual(['a']);
    });

    it('filters by translated title', () => {
      const items = [
        makeIntervention({ _id: 'a', title: 'Yoga for Beginners' }),
        makeIntervention({ _id: 'b', title: 'Cardio Blast' }),
      ];
      const translated = { b: { title: 'Herz-Kreislauf', lang: 'de' } };
      const result = filterInterventions(items, translated, {
        ...emptyFilters,
        searchTerm: 'herz',
      });
      expect(result.map((r) => r._id)).toEqual(['b']);
    });
  });
});
