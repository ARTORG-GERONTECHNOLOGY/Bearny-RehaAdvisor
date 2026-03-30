import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import PatientLibrarySearchPanel from '@/components/PatientLibrary/PatientLibrarySearchPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const MockResultIcon = ({ className }: { className?: string }) => (
  <span data-testid="result-icon" className={className} />
);

const baseProps = {
  searchTerm: '',
  isSearchOpen: false,
  searchResults: [
    {
      _id: '1',
      title: 'Morning Stretch',
      duration: 10,
      content_type: 'video',
      aims: ['exercise'],
    },
  ],
  onSearchTermChange: jest.fn(),
  onCloseSearch: jest.fn(),
  onOpenFilter: jest.fn(),
  onOpenDetails: jest.fn(),
  renderHighlightedTitle: (title: string) => <span>{title}</span>,
  getDisplayTitle: (item: any) => String(item.title || ''),
  getResultIcon: () => MockResultIcon,
};

describe('PatientLibrarySearchPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls onOpenFilter when filter button is clicked in idle mode', () => {
    render(<PatientLibrarySearchPanel {...baseProps} />);

    fireEvent.click(screen.getByLabelText('Open filter'));
    expect(baseProps.onOpenFilter).toHaveBeenCalledTimes(1);
  });

  it('calls onSearchTermChange on input typing', () => {
    render(<PatientLibrarySearchPanel {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'yo' } });
    expect(baseProps.onSearchTermChange).toHaveBeenCalledWith('yo');
  });

  it('shows results and handles close/details in open mode', () => {
    render(<PatientLibrarySearchPanel {...baseProps} isSearchOpen searchTerm="mor" />);

    expect(screen.getByText('1 Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Morning Stretch')).toBeInTheDocument();

    const title = screen.getByText('Morning Stretch');
    const resultButton = title.closest('button');
    expect(resultButton).toBeTruthy();
    fireEvent.click(resultButton as HTMLButtonElement);
    expect(baseProps.onOpenDetails).toHaveBeenCalledWith(expect.objectContaining({ _id: '1' }));

    const closeButtons = screen.getAllByLabelText('Close search');
    fireEvent.click(closeButtons[0]);
    expect(baseProps.onCloseSearch).toHaveBeenCalledTimes(1);
  });
});
