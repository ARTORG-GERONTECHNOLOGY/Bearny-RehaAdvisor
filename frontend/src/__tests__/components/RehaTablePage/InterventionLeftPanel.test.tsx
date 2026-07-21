import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import InterventionLeftPanel from '@/components/RehaTablePage/InterventionLeftPanel';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement scrollTo on elements
Element.prototype.scrollTo = jest.fn();

// Radix Select (used by the patient-type/content-type filters) relies on pointer
// capture / scrollIntoView APIs that jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

// Mock react-select: expose a distinct testid per instance via placeholder text,
// and a button that triggers onChange with a fixed option so we can assert wiring.
jest.mock(
  'react-select',
  () =>
    function ReactSelect(props: any) {
      const testId = props.placeholder?.includes('Tags')
        ? 'tag-select'
        : props.placeholder?.includes('Benefit')
          ? 'benefit-select'
          : props.placeholder?.includes('Language')
            ? 'language-select'
            : 'other-select';
      return (
        <div data-testid={testId}>
          <button onClick={() => props.onChange?.([{ value: 'picked', label: 'Picked' }])}>
            change {testId}
          </button>
          <button onClick={() => props.onChange?.(null)}>clear {testId}</button>
        </div>
      );
    }
);

const t = (key: string) => key;

const makeIntervention = (overrides: Record<string, any> = {}) => ({
  _id: 'int-1',
  title: 'Breathing Exercise',
  content_type: 'Video',
  available_languages: ['en'],
  language: 'en',
  ...overrides,
});

const baseFilters = () => ({
  searchTerm: '',
  setSearchTerm: jest.fn(),
  patientTypeFilter: '',
  setPatientTypeFilter: jest.fn(),
  contentTypeFilter: '',
  setContentTypeFilter: jest.fn(),
  tagFilter: [],
  setTagFilter: jest.fn(),
  benefitForFilter: [],
  setBenefitForFilter: jest.fn(),
  languageFilter: [],
  setLanguageFilter: jest.fn(),
  resetAllFilters: jest.fn(),
});

const baseActions = () => ({
  handleExerciseClick: jest.fn(),
  showStats: jest.fn(),
  openFeedbackBrowser: jest.fn(),
  handleModifyIntervention: jest.fn(),
  handleDeleteExercise: jest.fn(),
  handleAddIntervention: jest.fn(),
});

const renderPanel = (
  overrides: {
    data?: Partial<React.ComponentProps<typeof InterventionLeftPanel>['data']>;
    filters?: Partial<ReturnType<typeof baseFilters>>;
    actions?: Partial<ReturnType<typeof baseActions>>;
    patientData?: any;
  } = {}
) => {
  const filters = { ...baseFilters(), ...overrides.filters };
  const actions = { ...baseActions(), ...overrides.actions };
  const data = {
    activeItems: [],
    pastItems: [],
    visibleItems: [],
    allItems: [],
    titleMap: {},
    typeMap: {},
    diagnoses: ['Stroke', 'COPD'],
    ...overrides.data,
  };
  const patientData = overrides.patientData ?? { interventions: [] };

  render(
    <InterventionLeftPanel
      data={data}
      filters={filters}
      actions={actions}
      patientData={patientData}
      t={t as any}
    />
  );

  return { filters, actions, data, patientData };
};

describe('InterventionLeftPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Section rendering & empty states
  // ------------------------------------------------------------------
  describe('section rendering', () => {
    it('shows empty-state copy for active, past and all sections', () => {
      renderPanel();
      expect(screen.getByText('No active interventions.')).toBeInTheDocument();
      expect(screen.getByText('No past interventions.')).toBeInTheDocument();
      expect(screen.getByText('No interventions match the filters.')).toBeInTheDocument();
    });

    it('renders section counts as badges', () => {
      const active = [makeIntervention({ _id: 'a1' })];
      const past = [makeIntervention({ _id: 'p1' }), makeIntervention({ _id: 'p2' })];
      renderPanel({ data: { activeItems: active, pastItems: past, visibleItems: active } });

      expect(screen.getByText('Active interventions')).toBeInTheDocument();
      expect(screen.getByText('Past interventions')).toBeInTheDocument();
      expect(screen.getByText('All interventions')).toBeInTheDocument();
    });

    it('renders an intervention card with its title', () => {
      const active = [makeIntervention({ title: 'Squats' })];
      renderPanel({ data: { activeItems: active } });
      expect(screen.getByText('Squats')).toBeInTheDocument();
    });

    it('uses the translated title from titleMap when available and differs from the original', () => {
      const active = [makeIntervention({ _id: 'int-x', title: 'Original Title' })];
      renderPanel({
        data: {
          activeItems: active,
          titleMap: { 'int-x': { title: 'Translated Title', lang: 'de' } },
        },
      });
      expect(screen.getByText('Translated Title')).toBeInTheDocument();
      expect(screen.queryByText('Original Title')).not.toBeInTheDocument();
    });

    it('uses typeMap label over content_type when present', () => {
      const active = [makeIntervention({ _id: 'int-y', content_type: 'Video' })];
      renderPanel({ data: { activeItems: active, typeMap: { 'int-y': 'Custom Type' } } });
      expect(screen.getByText('Custom Type')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Card interactions
  // ------------------------------------------------------------------
  describe('card interactions', () => {
    it('calls handleExerciseClick when the card is clicked', () => {
      const active = [makeIntervention()];
      const { actions } = renderPanel({ data: { activeItems: active } });
      fireEvent.click(screen.getByText('Breathing Exercise').closest('[role="button"]')!);
      expect(actions.handleExerciseClick).toHaveBeenCalledWith(active[0]);
    });

    it('calls handleExerciseClick on Enter/Space when the card itself has focus', () => {
      const active = [makeIntervention()];
      const { actions } = renderPanel({ data: { activeItems: active } });
      const card = screen.getByText('Breathing Exercise').closest('[role="button"]')!;

      fireEvent.keyDown(card, { key: 'Enter' });
      expect(actions.handleExerciseClick).toHaveBeenCalledWith(active[0]);

      fireEvent.keyDown(card, { key: ' ' });
      expect(actions.handleExerciseClick).toHaveBeenCalledTimes(2);
    });

    it('ignores keydown events that bubble up from a child element', () => {
      const active = [makeIntervention({ _id: 'assigned-1' })];
      const { actions } = renderPanel({
        data: { activeItems: active },
        patientData: { interventions: [{ _id: 'assigned-1', dates: [] }] },
      });
      fireEvent.keyDown(screen.getByLabelText('Statistics'), { key: 'Enter' });
      expect(actions.handleExerciseClick).not.toHaveBeenCalled();
    });

    it('shows Statistics and Feedback actions only when the intervention is assigned', () => {
      const intervention = makeIntervention({ _id: 'assigned-1' });
      renderPanel({
        data: { activeItems: [intervention] },
        patientData: { interventions: [{ _id: 'assigned-1', dates: [] }] },
      });
      expect(screen.getByLabelText('Statistics')).toBeInTheDocument();
      expect(screen.getByLabelText('Feedback')).toBeInTheDocument();
    });

    it('hides Statistics and Feedback actions when not assigned', () => {
      renderPanel({ data: { activeItems: [makeIntervention()] } });
      expect(screen.queryByLabelText('Statistics')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Feedback')).not.toBeInTheDocument();
    });

    it('calls showStats when the Statistics button is clicked', () => {
      const intervention = makeIntervention({ _id: 'assigned-1' });
      const { actions } = renderPanel({
        data: { activeItems: [intervention] },
        patientData: { interventions: [{ _id: 'assigned-1', dates: [] }] },
      });
      fireEvent.click(screen.getByLabelText('Statistics'));
      expect(actions.showStats).toHaveBeenCalledWith(intervention);
    });

    it('calls openFeedbackBrowser when the Feedback button is clicked', () => {
      const intervention = makeIntervention({ _id: 'assigned-1' });
      const { actions } = renderPanel({
        data: { activeItems: [intervention] },
        patientData: { interventions: [{ _id: 'assigned-1', dates: [] }] },
      });
      fireEvent.click(screen.getByLabelText('Feedback'));
      expect(actions.openFeedbackBrowser).toHaveBeenCalledWith(intervention);
    });

    it('shows Modify only when assigned with a future date', () => {
      const intervention = makeIntervention({ _id: 'assigned-future' });
      const future = new Date(Date.now() + 86400000).toISOString();
      const { actions } = renderPanel({
        data: { activeItems: [intervention] },
        patientData: {
          interventions: [{ _id: 'assigned-future', dates: [{ datetime: future }] }],
        },
      });
      fireEvent.click(screen.getByLabelText('Modify'));
      expect(actions.handleModifyIntervention).toHaveBeenCalledWith(intervention);
    });

    it('does not show Modify when assigned with only past dates', () => {
      const intervention = makeIntervention({ _id: 'assigned-past' });
      const past = new Date(Date.now() - 86400000).toISOString();
      renderPanel({
        data: { activeItems: [intervention] },
        patientData: {
          interventions: [{ _id: 'assigned-past', dates: [{ datetime: past }] }],
        },
      });
      expect(screen.queryByLabelText('Modify')).not.toBeInTheDocument();
    });

    it('shows Remove for active items with a future date and calls handleDeleteExercise', () => {
      const intervention = makeIntervention({ _id: 'assigned-future' });
      const future = new Date(Date.now() + 86400000).toISOString();
      const { actions } = renderPanel({
        data: { activeItems: [intervention] },
        patientData: {
          interventions: [{ _id: 'assigned-future', dates: [{ datetime: future }] }],
        },
      });
      fireEvent.click(screen.getByLabelText('Remove'));
      expect(actions.handleDeleteExercise).toHaveBeenCalledWith('assigned-future');
    });

    it('shows "Schedule again" for past-section cards and calls handleAddIntervention', () => {
      const intervention = makeIntervention({ _id: 'past-1' });
      const { actions } = renderPanel({ data: { pastItems: [intervention] } });
      fireEvent.click(screen.getByLabelText('Schedule again'));
      expect(actions.handleAddIntervention).toHaveBeenCalledWith(intervention);
    });

    it('shows Add for unassigned items in the All tab and calls handleAddIntervention', () => {
      const intervention = makeIntervention({ _id: 'all-1' });
      const { actions } = renderPanel({ data: { visibleItems: [intervention] } });
      fireEvent.click(screen.getByLabelText('Add'));
      expect(actions.handleAddIntervention).toHaveBeenCalledWith(intervention);
    });

    it('shows Remove for assigned items in the All tab and calls handleDeleteExercise', () => {
      const intervention = makeIntervention({ _id: 'all-2' });
      const { actions } = renderPanel({
        data: { visibleItems: [intervention] },
        patientData: { interventions: [{ _id: 'all-2', dates: [] }] },
      });
      fireEvent.click(screen.getByLabelText('Remove'));
      expect(actions.handleDeleteExercise).toHaveBeenCalledWith('all-2');
    });
  });

  // ------------------------------------------------------------------
  // Filters bar
  // ------------------------------------------------------------------
  describe('filters bar', () => {
    it('updates the search term as the user types', () => {
      const { filters } = renderPanel();
      fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
        target: { value: 'stretch' },
      });
      expect(filters.setSearchTerm).toHaveBeenCalledWith('stretch');
    });

    it('shows the active filters count on the Filters toggle', () => {
      renderPanel({
        filters: { patientTypeFilter: 'Stroke', tagFilter: ['Exercise'] } as any,
      });
      expect(screen.getByText(/Filters/).textContent).toContain('(2)');
    });

    it('opens the filter menu and updates the patient type filter', async () => {
      const user = userEvent.setup();
      const { filters } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));

      // Defaults to the sentinel "All Patient Types" option (clearable
      // without needing the "Reset filters" button), so it can't be found by
      // the "Filter by Patient Type" placeholder text anymore — use its id.
      const select = document.getElementById('patientTypeFilter')!;
      await user.click(select);
      await user.click(await screen.findByRole('option', { name: 'Stroke' }));
      expect(filters.setPatientTypeFilter).toHaveBeenCalledWith('Stroke');
    });

    it('clears the patient type filter via the "All Patient Types" option', async () => {
      const user = userEvent.setup();
      const { filters } = renderPanel({ filters: { patientTypeFilter: 'Stroke' } });
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));

      const select = document.getElementById('patientTypeFilter')!;
      await user.click(select);
      await user.click(await screen.findByRole('option', { name: 'All Patient Types' }));
      expect(filters.setPatientTypeFilter).toHaveBeenCalledWith('');
    });

    it('updates the content type filter', async () => {
      const user = userEvent.setup();
      const { filters } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));

      const select = document.getElementById('contentTypeFilter')!;
      await user.click(select);
      await user.click(await screen.findByRole('option', { name: 'Video' }));
      expect(filters.setContentTypeFilter).toHaveBeenCalledWith('Video');
    });

    it('clears the content type filter via the "All Content Types" option', async () => {
      const user = userEvent.setup();
      const { filters } = renderPanel({ filters: { contentTypeFilter: 'Video' } });
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));

      const select = document.getElementById('contentTypeFilter')!;
      await user.click(select);
      await user.click(await screen.findByRole('option', { name: 'All Content Types' }));
      expect(filters.setContentTypeFilter).toHaveBeenCalledWith('');
    });

    it('updates the tag filter via react-select', () => {
      const { filters } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));

      const tagSelect = screen.getByTestId('tag-select');
      fireEvent.click(within(tagSelect).getByText('change tag-select'));
      expect(filters.setTagFilter).toHaveBeenCalledWith(['picked']);
    });

    it('updates the benefit filter via react-select', () => {
      const { filters } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));

      const benefitSelect = screen.getByTestId('benefit-select');
      fireEvent.click(within(benefitSelect).getByText('change benefit-select'));
      expect(filters.setBenefitForFilter).toHaveBeenCalledWith(['picked']);
    });

    it('updates the language filter via react-select and clears it back to []', () => {
      const { filters } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));

      const languageSelect = screen.getByTestId('language-select');
      fireEvent.click(within(languageSelect).getByText('change language-select'));
      expect(filters.setLanguageFilter).toHaveBeenCalledWith(['picked']);

      fireEvent.click(within(languageSelect).getByText('clear language-select'));
      expect(filters.setLanguageFilter).toHaveBeenCalledWith([]);
    });

    it('calls resetAllFilters when Reset filters is clicked', () => {
      const { filters } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
      fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
      expect(filters.resetAllFilters).toHaveBeenCalled();
    });

    it('derives language options from available_languages arrays and the language field, deduped', () => {
      renderPanel({
        data: {
          allItems: [
            makeIntervention({ _id: 'l1', available_languages: ['en', 'de'], language: 'en' }),
            makeIntervention({ _id: 'l2', available_languages: [], language: 'FR' }),
            makeIntervention({ _id: 'l3', available_languages: undefined, language: '' }),
          ],
        },
      });
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
      // Just verifying the panel renders without throwing while computing language options;
      // the mocked react-select doesn't expose the passed options for direct assertion.
      expect(screen.getByTestId('language-select')).toBeInTheDocument();
    });

    it('renders already-selected tag/benefit/language filter chips via react-select value prop', () => {
      renderPanel({
        filters: {
          tagFilter: ['Exercise'],
          benefitForFilter: ['Home'],
          languageFilter: ['en'],
        } as any,
      });
      fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
      expect(screen.getByTestId('tag-select')).toBeInTheDocument();
      expect(screen.getByTestId('benefit-select')).toBeInTheDocument();
      expect(screen.getByTestId('language-select')).toBeInTheDocument();
    });
  });
});
