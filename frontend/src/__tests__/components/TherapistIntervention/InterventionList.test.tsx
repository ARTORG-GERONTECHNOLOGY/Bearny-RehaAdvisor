import { render, screen, fireEvent } from '@testing-library/react';
import InterventionList from '@/components/TherapistInterventionPage/InterventionList';
import '@testing-library/jest-dom';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/utils/interventions', () => ({
  getTypeIcon: jest.fn(() => null),
  getContentTypeIcon: jest.fn(() => null),
}));

jest.mock('@/utils/translate', () => ({
  translateText: jest.fn(() =>
    Promise.resolve({ translatedText: 'Translated', detectedSourceLanguage: 'en' })
  ),
}));

describe('InterventionList', () => {
  const mockOnClick = jest.fn();

  const items = [
    {
      _id: '1',
      title: 'Mobility Drill',
      content_type: 'video',
      tags: ['Mobility', 'Strength'],
    },
    {
      _id: '2',
      title: 'Stretch PDF',
      content_type: 'pdf',
      tags: [],
    },
  ];

  const translatedTitles = {
    '1': { title: 'Mobility Drill', lang: 'en' },
    '2': { title: 'Stretch PDF', lang: 'en' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders list items with title and content type', () => {
    render(
      <InterventionList items={items} onClick={mockOnClick} translatedTitles={translatedTitles} />
    );

    expect(screen.getByText('Mobility Drill')).toBeInTheDocument();
    expect(screen.getByText('video')).toBeInTheDocument();

    expect(screen.getByText('Stretch PDF')).toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('renders tag badges', () => {
    render(
      <InterventionList items={items} onClick={mockOnClick} translatedTitles={translatedTitles} />
    );

    expect(screen.getByText('Mobility')).toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
  });

  it('renders type badge for items with aims', () => {
    const itemsWithAims = [
      {
        _id: '3',
        title: 'Core Exercise',
        content_type: 'video',
        aims: ['Physical Exercise'],
        tags: [],
      },
    ];
    render(
      <InterventionList
        items={itemsWithAims}
        onClick={mockOnClick}
        translatedTitles={{ '3': { title: 'Core Exercise', lang: 'en' } }}
      />
    );
    expect(screen.getByText('Physical Exercise')).toBeInTheDocument();
  });

  it('calls getContentTypeIcon with the item content_type', () => {
    const { getContentTypeIcon } = jest.requireMock('@/utils/interventions');
    render(
      <InterventionList items={items} onClick={mockOnClick} translatedTitles={translatedTitles} />
    );
    expect(getContentTypeIcon).toHaveBeenCalledWith('video');
    expect(getContentTypeIcon).toHaveBeenCalledWith('pdf');
  });

  it('calls onClick when item is clicked', () => {
    render(
      <InterventionList items={items} onClick={mockOnClick} translatedTitles={translatedTitles} />
    );

    fireEvent.click(screen.getByText('Mobility Drill'));
    expect(mockOnClick).toHaveBeenCalledWith(items[0]);
  });

  it('shows loading state when translatedTitles is not provided', () => {
    render(<InterventionList items={items} onClick={mockOnClick} />);
    expect(screen.getByText('Loading interventions...')).toBeInTheDocument();
  });

  it('renders empty state when no items', () => {
    render(<InterventionList items={[]} onClick={mockOnClick} translatedTitles={{}} />);
    expect(screen.getByText('No interventions found.')).toBeInTheDocument();
  });
});
