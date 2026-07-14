import { render, screen } from '@testing-library/react';
import FilterBar from '@/components/TherapistInterventionPage/FilterBar';
import '@testing-library/jest-dom';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

// Overrides the shared canonical interventions.json mock (see LibraryFiltersCard.configFallback.test.tsx
// and interventionsTaxonomyStore.configFallback.test.ts) with a genuinely empty config, to exercise
// FilterBar's `Array.isArray(tx.xxx) ? tx.xxx : []` defensive fallbacks that a well-formed config
// can never reach.
jest.mock('../../../config/interventions.json', () => ({}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid={`options-${props.placeholder?.replace(/\s+/g, '-')}`}>
      {(props.options || []).length}
    </div>
  ),
}));

describe('FilterBar config fallback', () => {
  const mockT = (key: string) => key;

  it('falls back to empty option lists when interventions.json has no taxonomy data', () => {
    render(
      <FilterBar
        searchTerm=""
        setSearchTerm={jest.fn()}
        diagnosisFilter={[]}
        setDiagnosisFilter={jest.fn()}
        languageFilter={[]}
        setLanguageFilter={jest.fn()}
        contentTypeFilter=""
        setContentTypeFilter={jest.fn()}
        tagFilter={[]}
        setTagFilter={jest.fn()}
        t={mockT}
      />
    );

    expect(screen.getByTestId('options-Filter-by-Primary-Diagnosis')).toHaveTextContent('0');
    expect(screen.getByTestId('options-Filter-by-Language')).toHaveTextContent('0');
    expect(screen.getByTestId('options-Filter-by-Tags')).toHaveTextContent('0');

    const contentTypeSelect = screen.getByRole('combobox', { name: 'Filter by Content Type' });
    expect(contentTypeSelect.querySelectorAll('option').length).toBe(1); // just "All Content Types"
  });
});
