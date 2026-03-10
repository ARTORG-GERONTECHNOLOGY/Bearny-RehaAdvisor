import { render, screen, fireEvent } from '@testing-library/react';
import InterventionList from '@/components/TherapistInterventionPage/InterventionList';
import '@testing-library/jest-dom';

jest.mock('@/utils/interventions', () => ({
  getBadgeVariantFromIntervention: jest.fn(() => 'info'),
  getMediaTypeLabelFromIntervention: jest.fn(() => 'Video'),
  getTagColor: jest.fn((tagColors: any, tag: string) => tagColors[tag] || '#6c757d'),
}));

jest.mock('@/utils/translate', () => ({
  translateText: jest.fn(() =>
    Promise.resolve({ translatedText: 'Translated', detectedSourceLanguage: 'en' })
  ),
}));

describe('InterventionList', () => {
  const mockOnClick = jest.fn();
  const mockT = (key: string) => key;
  const tagColors = {
    Mobility: '#ff0000',
    Strength: '#00ff00',
  };

  const items = [
    {
      _id: '1',
      title: 'Mobility Drill',
      content_type: 'video',
      media_url: 'mobility.mp4',
      link: '',
      tags: ['Mobility', 'Strength'],
    },
    {
      _id: '2',
      title: 'Stretch PDF',
      content_type: 'pdf',
      media_url: 'stretch.pdf',
      link: '',
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
      <InterventionList
        items={items}
        onClick={mockOnClick}
        t={mockT}
        tagColors={tagColors}
        translatedTitles={translatedTitles}
      />
    );

    expect(screen.getByText('Mobility Drill')).toBeInTheDocument();
    expect(screen.getByText('video')).toBeInTheDocument();

    expect(screen.getByText('Stretch PDF')).toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('renders tag badges with correct styles', () => {
    render(
      <InterventionList
        items={items}
        onClick={mockOnClick}
        t={mockT}
        tagColors={tagColors}
        translatedTitles={translatedTitles}
      />
    );

    expect(screen.getByText('Mobility')).toHaveStyle(`background-color: ${tagColors.Mobility}`);
    expect(screen.getByText('Strength')).toHaveStyle(`background-color: ${tagColors.Strength}`);
  });

  it('renders media type badge using utils', () => {
    render(
      <InterventionList
        items={items}
        onClick={mockOnClick}
        t={mockT}
        tagColors={tagColors}
        translatedTitles={translatedTitles}
      />
    );

    expect(screen.getAllByText('Video').length).toBeGreaterThan(0);
  });

  it('calls onClick when item is clicked', () => {
    render(
      <InterventionList
        items={items}
        onClick={mockOnClick}
        t={mockT}
        tagColors={tagColors}
        translatedTitles={translatedTitles}
      />
    );

    fireEvent.click(screen.getByText('Mobility Drill'));
    expect(mockOnClick).toHaveBeenCalledWith(items[0]);
  });
});
