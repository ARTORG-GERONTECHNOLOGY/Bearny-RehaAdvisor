import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import PatientLibraryFilterSheet from '@/components/PatientLibrary/PatientLibraryFilterSheet';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: any) => <div>{children}</div>,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
}));

jest.mock('@/components/ui/slider', () => ({
  Slider: ({ value, onValueChange }: any) => (
    <div data-testid="slider" data-value={JSON.stringify(value)}>
      <button onClick={() => onValueChange([1, 3])}>change slider</button>
    </div>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <button type="button" aria-pressed={checked} onClick={() => onCheckedChange(!checked)}>
      switch
    </button>
  ),
}));

const MockIcon = ({ className }: { className?: string }) => <span className={className}>I</span>;

const baseProps = {
  open: true,
  onOpenChange: jest.fn(),
  filteredCount: 42,
  typeOptions: [
    { value: 'exercise', label: 'exercise', Icon: MockIcon },
    { value: 'education', label: 'education', Icon: null },
  ],
  contentOptions: [
    { value: 'video', label: 'video', Icon: MockIcon },
    { value: 'audio', label: 'audio', Icon: MockIcon },
  ],
  languageOptions: [{ value: 'en', label: 'English', Icon: MockIcon }],
  aimsFilter: [] as string[],
  setAimsFilter: jest.fn(),
  contentTypeFilter: [] as string[],
  setContentTypeFilter: jest.fn(),
  languageFilter: [] as string[],
  setLanguageFilter: jest.fn(),
  durationFilterIndices: [0, 4] as [number, number],
  setDurationFilterIndices: jest.fn(),
  durationLabels: ['5min', '20min', '35min', '50min', '1h+'],
  ratingFilterIndices: [0, 4] as [number, number],
  setRatingFilterIndices: jest.fn(),
  ratingLabels: ['1', '2', '3', '4', '5'],
  onResetFilters: jest.fn(),
};

describe('PatientLibraryFilterSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders section labels and the filtered content count', () => {
      render(<PatientLibraryFilterSheet {...baseProps} />);
      expect(screen.getByText('Filter')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Duration Short')).toBeInTheDocument();
      expect(screen.getByText('Rating')).toBeInTheDocument();
      expect(screen.getByText('42 Contents')).toBeInTheDocument();
    });

    it('shows "No entries found." when filteredCount is 0', () => {
      render(<PatientLibraryFilterSheet {...baseProps} filteredCount={0} />);
      expect(screen.getByText('No entries found.')).toBeInTheDocument();
    });

    it('renders an option without an Icon gracefully', () => {
      render(<PatientLibraryFilterSheet {...baseProps} />);
      expect(screen.getByText('education')).toBeInTheDocument();
    });

    it('shows the language section when languageOptions is non-empty', () => {
      render(<PatientLibraryFilterSheet {...baseProps} />);
      expect(screen.getByText('Language')).toBeInTheDocument();
      expect(screen.getByText('English')).toBeInTheDocument();
    });

    it('hides the language section entirely when languageOptions is empty', () => {
      render(<PatientLibraryFilterSheet {...baseProps} languageOptions={[]} />);
      expect(screen.queryByText('Language')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Type / Medium / Language switches
  // ------------------------------------------------------------------
  describe('filter switches', () => {
    it('adds a type value when its switch is toggled on', () => {
      const setAimsFilter = jest.fn();
      render(<PatientLibraryFilterSheet {...baseProps} setAimsFilter={setAimsFilter} />);

      const switches = screen.getAllByRole('button', { name: 'switch' });
      fireEvent.click(switches[0]); // first Type option ("exercise")

      const updater = setAimsFilter.mock.calls[0][0];
      expect(updater([])).toEqual(['exercise']);
    });

    it('removes a type value already selected when toggled off', () => {
      const setAimsFilter = jest.fn();
      render(
        <PatientLibraryFilterSheet
          {...baseProps}
          aimsFilter={['exercise']}
          setAimsFilter={setAimsFilter}
        />
      );

      const switches = screen.getAllByRole('button', { name: 'switch' });
      fireEvent.click(switches[0]);

      const updater = setAimsFilter.mock.calls[0][0];
      expect(updater(['exercise'])).toEqual([]);
    });

    it('toggles a content-type (Medium) value', () => {
      const setContentTypeFilter = jest.fn();
      render(
        <PatientLibraryFilterSheet {...baseProps} setContentTypeFilter={setContentTypeFilter} />
      );

      // Switch order: 2 type options, then 2 content options -> index 2 is "video"
      const switches = screen.getAllByRole('button', { name: 'switch' });
      fireEvent.click(switches[2]);

      const updater = setContentTypeFilter.mock.calls[0][0];
      expect(updater([])).toEqual(['video']);
    });

    it('toggles a language value', () => {
      const setLanguageFilter = jest.fn();
      render(<PatientLibraryFilterSheet {...baseProps} setLanguageFilter={setLanguageFilter} />);

      // Switch order: 2 type + 2 content + 1 language -> index 4 is "en"
      const switches = screen.getAllByRole('button', { name: 'switch' });
      fireEvent.click(switches[4]);

      const updater = setLanguageFilter.mock.calls[0][0];
      expect(updater([])).toEqual(['en']);
    });
  });

  // ------------------------------------------------------------------
  // Sliders
  // ------------------------------------------------------------------
  describe('duration and rating sliders', () => {
    it('renders duration labels and updates the duration range', () => {
      const setDurationFilterIndices = jest.fn();
      render(
        <PatientLibraryFilterSheet
          {...baseProps}
          setDurationFilterIndices={setDurationFilterIndices}
        />
      );

      baseProps.durationLabels.forEach((label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });

      const sliders = screen.getAllByTestId('slider');
      fireEvent.click(within(sliders[0]).getByText('change slider'));
      expect(setDurationFilterIndices).toHaveBeenCalledWith([1, 3]);
    });

    it('renders rating labels and updates the rating range', () => {
      const setRatingFilterIndices = jest.fn();
      render(
        <PatientLibraryFilterSheet {...baseProps} setRatingFilterIndices={setRatingFilterIndices} />
      );

      baseProps.ratingLabels.forEach((label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });

      const sliders = screen.getAllByTestId('slider');
      fireEvent.click(within(sliders[1]).getByText('change slider'));
      expect(setRatingFilterIndices).toHaveBeenCalledWith([1, 3]);
    });
  });

  // ------------------------------------------------------------------
  // Footer actions
  // ------------------------------------------------------------------
  describe('footer actions', () => {
    it('calls onResetFilters when Reset filters is clicked', () => {
      const onResetFilters = jest.fn();
      render(<PatientLibraryFilterSheet {...baseProps} onResetFilters={onResetFilters} />);
      fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
      expect(onResetFilters).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenChange(false) when Apply is clicked', () => {
      const onOpenChange = jest.fn();
      render(<PatientLibraryFilterSheet {...baseProps} onOpenChange={onOpenChange} />);
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
