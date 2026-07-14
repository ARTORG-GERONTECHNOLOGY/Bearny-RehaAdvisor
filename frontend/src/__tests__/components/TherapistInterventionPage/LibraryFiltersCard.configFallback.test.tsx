import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LibraryFiltersCard, {
  LibraryFiltersState,
} from '@/components/TherapistInterventionPage/LibraryFiltersCard';

// This regex-based moduleNameMapper entry redirects every "*/config/interventions.json"
// import (including this component's relative import) to a single shared mock file.
// Overriding it here (scoped to this test file only) with a config missing the
// `interventionsTaxonomy` key, and with taxonomy fields entirely absent, exercises the
// defensive `|| {}` / `|| []` fallbacks that the shared, always-complete mock config can
// never reach.
jest.mock('../../../config/interventions.json', () => ({}));

jest.mock(
  'react-select',
  () =>
    function ReactSelect(props: any) {
      return <div data-testid="select">{props.options?.length ?? 0}</div>;
    }
);

const t = (key: string) => key;

const filters: LibraryFiltersState = {
  searchTerm: '',
  diagnosisFilter: [],
  languageFilter: [],
  contentTypeFilter: '',
  aimsFilter: [],
  tagFilter: [],
};

describe('LibraryFiltersCard with a taxonomy config missing every field', () => {
  it('renders without crashing and falls back to empty option lists', () => {
    render(<LibraryFiltersCard t={t} filters={filters} onChange={jest.fn()} onReset={jest.fn()} />);

    expect(screen.getAllByTestId('select').every((el) => el.textContent === '0')).toBe(true);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
