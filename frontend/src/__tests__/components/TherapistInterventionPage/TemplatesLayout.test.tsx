import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import TemplatesLayout from '@/components/TherapistInterventionPage/TemplatesLayout';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock react-select: expose a distinct testid per instance via placeholder text,
// with a button that triggers onChange so wiring can be asserted without
// simulating react-select's internal combobox interactions.
jest.mock(
  'react-select',
  () =>
    function ReactSelect(props: any) {
      const testId = props.placeholder?.includes('Diagnosis')
        ? 'diagnosis-select'
        : props.placeholder?.includes('Language')
          ? 'language-select'
          : props.placeholder?.includes('Tags')
            ? 'tag-select'
            : 'other-select';
      return (
        <div data-testid={testId}>
          <button onClick={() => props.onChange?.([{ value: 'picked', label: 'Picked' }])}>
            change {testId}
          </button>
        </div>
      );
    }
);

const t = (key: string) => key;

const templateItem = (overrides: Record<string, any> = {}) => ({
  diagnosis: 'Stroke',
  intervention: { _id: 'int-1', title: 'Breathing Exercise', tags: [] },
  ...overrides,
});

const browseItem = (overrides: Record<string, any> = {}) => ({
  _id: 'int-2',
  title: 'Squats',
  tags: [],
  ...overrides,
});

const baseFilters = () => ({
  tSearchTerm: '',
  tDiagnosisFilter: [],
  tLanguageFilter: [],
  tContentTypeFilter: '',
  tTagFilter: [],
});

const renderLayout = (overrides: Partial<React.ComponentProps<typeof TemplatesLayout>> = {}) => {
  const onTemplateItemClick = jest.fn();
  const onModifyTemplate = jest.fn();
  const onRemoveTemplateItem = jest.fn();
  const onOpenAssign = jest.fn();
  const onBrowseItemClick = jest.fn();
  const onFilters = jest.fn();
  const onResetFilters = jest.fn();
  const findTemplateFor = overrides.findTemplateFor ?? (() => undefined);

  render(
    <TemplatesLayout
      t={t}
      templateItems={[]}
      tLoading={false}
      translatedTitles={{}}
      getSegments={() => []}
      segmentSummary={() => ''}
      onTemplateItemClick={onTemplateItemClick}
      onModifyTemplate={onModifyTemplate}
      onRemoveTemplateItem={onRemoveTemplateItem}
      browseAllItems={[]}
      findTemplateFor={findTemplateFor}
      onOpenAssign={onOpenAssign}
      onBrowseItemClick={onBrowseItemClick}
      filters={baseFilters()}
      onFilters={onFilters}
      onResetFilters={onResetFilters}
      timeline={<div>Timeline content</div>}
      tagColors={{}}
      {...overrides}
    />
  );

  return {
    onTemplateItemClick,
    onModifyTemplate,
    onRemoveTemplateItem,
    onOpenAssign,
    onBrowseItemClick,
    onFilters,
    onResetFilters,
  };
};

describe('TemplatesLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // "In Template" section
  // ------------------------------------------------------------------
  describe('In Template section', () => {
    it('shows a loading message while tLoading is true', () => {
      renderLayout({ tLoading: true });
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('shows an empty-state message when there are no template items', () => {
      renderLayout();
      expect(screen.getByText('No template items')).toBeInTheDocument();
    });

    it('renders a template item with its diagnosis and title', () => {
      renderLayout({ templateItems: [templateItem()] });
      expect(screen.getByText('Breathing Exercise')).toBeInTheDocument();
      expect(screen.getByText(/For.*Stroke/)).toBeInTheDocument();
    });

    it('shows the translated-from language when a translated title is available', () => {
      renderLayout({
        templateItems: [templateItem()],
        translatedTitles: { 'int-1': { title: 'Atemübung', lang: 'de' } },
      });
      expect(screen.getByText('Atemübung')).toBeInTheDocument();
      expect(screen.getByText(/Translated from.*de/)).toBeInTheDocument();
    });

    it('renders the segment summary lines for a template item', () => {
      renderLayout({
        templateItems: [templateItem()],
        getSegments: () => [{ id: 1 }, { id: 2 }],
        segmentSummary: (seg: any) => `Segment ${seg.id}`,
      });
      expect(screen.getByText('Segment 1')).toBeInTheDocument();
      expect(screen.getByText('Segment 2')).toBeInTheDocument();
    });

    it('calls onTemplateItemClick when the item row is clicked', () => {
      const item = templateItem();
      const { onTemplateItemClick } = renderLayout({ templateItems: [item] });
      fireEvent.click(screen.getByText('Breathing Exercise'));
      expect(onTemplateItemClick).toHaveBeenCalledWith(item);
    });

    it('calls onModifyTemplate when Modify is clicked, without triggering the row click', () => {
      const item = templateItem();
      const { onModifyTemplate, onTemplateItemClick } = renderLayout({ templateItems: [item] });
      fireEvent.click(screen.getAllByRole('button')[0]);
      expect(onModifyTemplate).toHaveBeenCalledWith(item);
      expect(onTemplateItemClick).not.toHaveBeenCalled();
    });

    it('calls onRemoveTemplateItem with diagnosis and intervention id when Remove is clicked', () => {
      const item = templateItem();
      const { onRemoveTemplateItem } = renderLayout({ templateItems: [item] });
      fireEvent.click(screen.getAllByRole('button')[1]);
      expect(onRemoveTemplateItem).toHaveBeenCalledWith('Stroke', 'int-1');
    });
  });

  // ------------------------------------------------------------------
  // "Browse All" section
  // ------------------------------------------------------------------
  describe('Browse All section', () => {
    it('shows the browse-all count badge', () => {
      renderLayout({ browseAllItems: [browseItem(), browseItem({ _id: 'int-3' })] });
      expect(screen.getByText('Browse All')).toBeInTheDocument();
    });

    it('shows an empty-state message when no items match the filters', () => {
      renderLayout();
      expect(screen.getByText('No interventions match your filters.')).toBeInTheDocument();
    });

    it('renders a browse item title', () => {
      renderLayout({ browseAllItems: [browseItem()] });
      expect(screen.getByText('Squats')).toBeInTheDocument();
    });

    it('renders tag badges for a browse item that has tags', () => {
      renderLayout({
        browseAllItems: [browseItem({ tags: ['Exercise', 'Home'] })],
        tagColors: { exercise: '#ff0000' },
      });
      expect(screen.getByText('Exercise')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('does not render a tags row when the item has no tags', () => {
      renderLayout({ browseAllItems: [browseItem({ tags: [] })] });
      expect(screen.queryByLabelText('Tags')).not.toBeInTheDocument();
    });

    it('shows an Add button for items not yet in the template', () => {
      const { onOpenAssign } = renderLayout({ browseAllItems: [browseItem()] });
      const row = screen
        .getByText('Squats')
        .closest('[title="Click to view details"]') as HTMLElement;
      fireEvent.click(within(row).getByRole('button'));
      expect(onOpenAssign).toHaveBeenCalledWith('int-2', 'Squats', 'create');
    });

    it('shows Modify/Remove buttons for items already in the template', () => {
      const entry = templateItem({
        diagnosis: 'COPD',
        intervention: { _id: 'int-2', title: 'Squats' },
      });
      const { onOpenAssign, onRemoveTemplateItem } = renderLayout({
        browseAllItems: [browseItem()],
        findTemplateFor: () => entry,
      });

      const row = screen
        .getByText('Squats')
        .closest('[title="Click to view details"]') as HTMLElement;
      const buttons = within(row).getAllByRole('button');
      expect(buttons).toHaveLength(2);

      fireEvent.click(buttons[0]);
      expect(onOpenAssign).toHaveBeenCalledWith('int-2', 'Squats', 'modify');

      fireEvent.click(buttons[1]);
      expect(onRemoveTemplateItem).toHaveBeenCalledWith('COPD', 'int-2');
    });

    it('calls onBrowseItemClick when the row is clicked', () => {
      const item = browseItem();
      const { onBrowseItemClick } = renderLayout({ browseAllItems: [item] });
      fireEvent.click(screen.getByText('Squats'));
      expect(onBrowseItemClick).toHaveBeenCalledWith(item);
    });

    it('uses the translated title when present', () => {
      renderLayout({
        browseAllItems: [browseItem()],
        translatedTitles: { 'int-2': { title: 'Kniebeugen', lang: 'de' } },
      });
      expect(screen.getByText('Kniebeugen')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Filters + timeline
  // ------------------------------------------------------------------
  describe('filters and timeline', () => {
    it('updates the search term through the embedded FilterBar', () => {
      const { onFilters } = renderLayout();
      fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
        target: { value: 'stretch' },
      });
      expect(onFilters).toHaveBeenCalledWith(expect.objectContaining({ tSearchTerm: 'stretch' }));
    });

    it('calls onResetFilters when the FilterBar reset is triggered', () => {
      const { onResetFilters } = renderLayout();
      // FilterBar renders its own reset control in more than one place (meta row + grid)
      const resetButtons = screen.getAllByRole('button', { name: /Reset filters/i });
      fireEvent.click(resetButtons[0]);
      expect(onResetFilters).toHaveBeenCalled();
    });

    it('renders the provided timeline content', () => {
      renderLayout({ timeline: <div>Custom Timeline</div> });
      expect(screen.getByText('Custom Timeline')).toBeInTheDocument();
    });

    it('updates tDiagnosisFilter via the embedded FilterBar', () => {
      const { onFilters } = renderLayout();
      fireEvent.click(within(screen.getByTestId('diagnosis-select')).getByText(/change/));
      expect(onFilters).toHaveBeenCalledWith(
        expect.objectContaining({ tDiagnosisFilter: ['picked'] })
      );
    });

    it('updates tLanguageFilter via the embedded FilterBar', () => {
      const { onFilters } = renderLayout();
      fireEvent.click(within(screen.getByTestId('language-select')).getByText(/change/));
      expect(onFilters).toHaveBeenCalledWith(
        expect.objectContaining({ tLanguageFilter: ['picked'] })
      );
    });

    it('updates tTagFilter via the embedded FilterBar', () => {
      const { onFilters } = renderLayout();
      fireEvent.click(within(screen.getByTestId('tag-select')).getByText(/change/));
      expect(onFilters).toHaveBeenCalledWith(expect.objectContaining({ tTagFilter: ['picked'] }));
    });

    it('updates tContentTypeFilter via the embedded FilterBar', () => {
      const { onFilters } = renderLayout();
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'video' } });
      expect(onFilters).toHaveBeenCalledWith(
        expect.objectContaining({ tContentTypeFilter: 'video' })
      );
    });
  });
});
