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

  it('cycles rating sort asc -> desc -> asc and reorders rows', () => {
    const rated = [
      { _id: 'a', title: 'Low', content_type: 'video', avg_rating: 1 },
      { _id: 'b', title: 'High', content_type: 'video', avg_rating: 5 },
    ];
    render(
      <InterventionList
        items={rated}
        onClick={mockOnClick}
        translatedTitles={{ a: { title: 'Low', lang: null }, b: { title: 'High', lang: null } }}
      />
    );

    const getRowOrder = () => screen.getAllByRole('button').map((r) => r.textContent);
    const ratingHeader = screen.getByText('Rating').closest('th')!;

    fireEvent.click(ratingHeader);
    const ascOrder = getRowOrder();
    expect(ascOrder[0]).toContain('Low');

    fireEvent.click(ratingHeader);
    const descOrder = getRowOrder();
    expect(descOrder[0]).toContain('High');
  });

  it('activates a row via keyboard Enter and Space', () => {
    render(
      <InterventionList items={items} onClick={mockOnClick} translatedTitles={translatedTitles} />
    );
    const row = screen.getAllByRole('button')[0];

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(mockOnClick).toHaveBeenCalledWith(items[0]);

    mockOnClick.mockClear();
    fireEvent.keyDown(row, { key: ' ' });
    expect(mockOnClick).toHaveBeenCalledWith(items[0]);

    mockOnClick.mockClear();
    fireEvent.keyDown(row, { key: 'Tab' });
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('shows a lock icon for private interventions and not for public ones', () => {
    const mixed = [
      { _id: 'priv', title: 'Private one', content_type: 'video', is_private: true },
      { _id: 'pub', title: 'Public one', content_type: 'video', is_private: false },
    ];
    render(
      <InterventionList
        items={mixed}
        onClick={mockOnClick}
        translatedTitles={{
          priv: { title: 'Private one', lang: null },
          pub: { title: 'Public one', lang: null },
        }}
      />
    );
    expect(screen.getByLabelText('Private intervention')).toBeInTheDocument();
  });

  it('shows a "Translated from" hint when the title differs from the original', () => {
    render(
      <InterventionList
        items={[{ _id: '1', title: 'Original Title', content_type: 'video' }]}
        onClick={mockOnClick}
        translatedTitles={{ '1': { title: 'Translated Title', lang: 'de' } }}
      />
    );
    expect(screen.getByText(/Translated from/)).toBeInTheDocument();
    expect(screen.getByText(/DE/)).toBeInTheDocument();
  });

  it('does not show a translation hint when the translated title matches the original', () => {
    render(
      <InterventionList
        items={[{ _id: '1', title: 'Same Title', content_type: 'video' }]}
        onClick={mockOnClick}
        translatedTitles={{ '1': { title: 'Same Title', lang: 'en' } }}
      />
    );
    expect(screen.queryByText(/Translated from/)).not.toBeInTheDocument();
  });

  it('lists the primary language first, followed by other available languages', () => {
    render(
      <InterventionList
        items={[
          {
            _id: '1',
            title: 'Multi-lang',
            content_type: 'video',
            language: 'en',
            available_languages: ['de', 'en', 'fr'],
          },
        ]}
        onClick={mockOnClick}
        translatedTitles={{ '1': { title: 'Multi-lang', lang: null } }}
      />
    );
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('DE')).toBeInTheDocument();
    expect(screen.getByText('FR')).toBeInTheDocument();
  });

  it('renders the "exercise" badge color differently from other aim types', () => {
    render(
      <InterventionList
        items={[
          { _id: '1', title: 'Ex', content_type: 'video', aims: ['Exercise'] },
          { _id: '2', title: 'Ed', content_type: 'video', aims: ['Education'] },
        ]}
        onClick={mockOnClick}
        translatedTitles={{
          '1': { title: 'Ex', lang: null },
          '2': { title: 'Ed', lang: null },
        }}
      />
    );
    expect(screen.getByText('Exercise').closest('div')).toHaveClass('text-pink');
    expect(screen.getByText('Education').closest('div')).toHaveClass('text-yellow');
  });

  it('falls back to raw title when translateText rejects and no translatedTitles prop is given', async () => {
    const { translateText } = jest.requireMock('@/utils/translate');
    (translateText as jest.Mock).mockRejectedValueOnce(new Error('down'));

    render(<InterventionList items={[items[0]]} onClick={mockOnClick} />);

    expect(await screen.findByText('Mobility Drill')).toBeInTheDocument();
  });

  it('skips translating items with no title', async () => {
    render(
      <InterventionList
        items={[{ _id: 'no-title', title: '', content_type: 'video' }]}
        onClick={mockOnClick}
      />
    );

    await screen.findByText('video');
    const { translateText } = jest.requireMock('@/utils/translate');
    expect(translateText).not.toHaveBeenCalled();
  });

  it('shows the loading spinner briefly, then the table once translation resolves', async () => {
    render(<InterventionList items={[items[0]]} onClick={mockOnClick} />);
    // The mocked translateText always resolves to the literal string "Translated".
    expect(await screen.findByText('Translated')).toBeInTheDocument();
    expect(screen.queryByText('Loading interventions...')).not.toBeInTheDocument();
  });
});
