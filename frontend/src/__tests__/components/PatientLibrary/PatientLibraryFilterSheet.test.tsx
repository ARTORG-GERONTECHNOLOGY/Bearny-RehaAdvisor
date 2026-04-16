import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import PatientLibraryFilterSheet from '@/components/PatientLibrary/PatientLibraryFilterSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: any) => <div>{children}</div>,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
}));

jest.mock('@/components/ui/slider', () => ({
  Slider: ({ 'data-testid': testId }: any) => <div data-testid={testId ?? 'slider'} />,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <button type="button" aria-pressed={checked} onClick={() => onCheckedChange(!checked)}>
      switch
    </button>
  ),
}));

const MockIcon = ({ className }: { className?: string }) => <span className={className}>I</span>;

describe('PatientLibraryFilterSheet', () => {
  it('renders labels and handles reset/apply actions', () => {
    const onOpenChange = jest.fn();
    const onResetFilters = jest.fn();

    render(
      <PatientLibraryFilterSheet
        open
        onOpenChange={onOpenChange}
        filteredCount={42}
        typeOptions={[{ value: 'exercise', label: 'exercise', Icon: MockIcon }]}
        contentOptions={[{ value: 'video', label: 'video', Icon: MockIcon }]}
        languageOptions={[{ value: 'en', label: 'English', Icon: MockIcon }]}
        aimsFilter={[]}
        setAimsFilter={jest.fn()}
        contentTypeFilter={[]}
        setContentTypeFilter={jest.fn()}
        languageFilter={[]}
        setLanguageFilter={jest.fn()}
        durationFilterIndices={[0, 4]}
        setDurationFilterIndices={jest.fn()}
        durationLabels={['5min', '20min', '35min', '50min', '1h+']}
        ratingFilterIndices={[0, 4]}
        setRatingFilterIndices={jest.fn()}
        ratingLabels={['1', '2', '3', '4', '5']}
        onResetFilters={onResetFilters}
      />
    );

    expect(screen.getByText('Filter')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Duration Short')).toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(onResetFilters).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
