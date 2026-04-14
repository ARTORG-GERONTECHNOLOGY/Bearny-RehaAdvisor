import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import PatientLibraryDesktopFilters from '@/components/PatientLibrary/PatientLibraryDesktopFilters';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/field', () => ({
  Field: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/input-group', () => ({
  InputGroup: ({ children }: any) => <div>{children}</div>,
  InputGroupAddon: ({ children }: any) => <div>{children}</div>,
  InputGroupInput: ({ ...props }: any) => <input {...props} />,
}));

jest.mock('@/components/ui/slider', () => ({
  Slider: ({ onValueChange, 'data-testid': testId }: any) => (
    <button type="button" data-testid={testId} onClick={() => onValueChange([1, 3])}>
      slider
    </button>
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

describe('PatientLibraryDesktopFilters', () => {
  it('renders sections and handles search, toggles, and duration changes', () => {
    const onSearchTermChange = jest.fn();
    const setAimsFilter = jest.fn();
    const setContentTypeFilter = jest.fn();
    const setDurationFilterIndices = jest.fn();
    const setRatingFilterIndices = jest.fn();

    render(
      <PatientLibraryDesktopFilters
        searchTerm=""
        onSearchTermChange={onSearchTermChange}
        typeOptions={[{ value: 'exercise', label: 'exercise', Icon: MockIcon }]}
        contentOptions={[{ value: 'video', label: 'video', Icon: MockIcon }]}
        aimsFilter={[]}
        setAimsFilter={setAimsFilter}
        contentTypeFilter={[]}
        setContentTypeFilter={setContentTypeFilter}
        durationFilterIndices={[0, 4]}
        setDurationFilterIndices={setDurationFilterIndices}
        durationLabels={['5min', '20min', '35min', '50min', '1h+']}
        ratingFilterIndices={[0, 4]}
        setRatingFilterIndices={setRatingFilterIndices}
        ratingLabels={['1', '2', '3', '4', '5']}
      />
    );

    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'balance' } });
    expect(onSearchTermChange).toHaveBeenCalledWith('balance');

    const switchButtons = screen.getAllByRole('button', { name: 'switch' });
    fireEvent.click(switchButtons[0]);
    expect(setAimsFilter).toHaveBeenCalledTimes(1);
    const aimsUpdater = setAimsFilter.mock.calls[0][0];
    expect(aimsUpdater([])).toEqual(['exercise']);
    expect(aimsUpdater(['exercise'])).toEqual([]);

    fireEvent.click(switchButtons[1]);
    expect(setContentTypeFilter).toHaveBeenCalledTimes(1);
    const contentUpdater = setContentTypeFilter.mock.calls[0][0];
    expect(contentUpdater([])).toEqual(['video']);
    expect(contentUpdater(['video'])).toEqual([]);

    const sliderButtons = screen.getAllByRole('button', { name: 'slider' });
    fireEvent.click(sliderButtons[0]);
    expect(setDurationFilterIndices).toHaveBeenCalledWith([1, 3]);

    fireEvent.click(sliderButtons[1]);
    expect(setRatingFilterIndices).toHaveBeenCalledWith([1, 3]);
  });
});
