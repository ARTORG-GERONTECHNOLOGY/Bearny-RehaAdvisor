import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InterventionList from '../../../components/TherapistInterventionPage/InterventionList';
import '@testing-library/jest-dom';

jest.mock('../../../utils/interventions', () => ({
  getBadgeVariantFromUrl: jest.fn(() => 'info'),
  getMediaTypeLabelFromUrl: jest.fn(() => 'Video'),
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders list items with title and content type', () => {
    render(
      <InterventionList items={items} onClick={mockOnClick} t={mockT} tagColors={tagColors} />
    );

    expect(screen.getByText('Mobility Drill')).toBeInTheDocument();
    expect(screen.getByText('video')).toBeInTheDocument();

    expect(screen.getByText('Stretch PDF')).toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('renders tag badges with correct styles', () => {
    render(
      <InterventionList items={items} onClick={mockOnClick} t={mockT} tagColors={tagColors} />
    );

    expect(screen.getByText('Mobility')).toHaveStyle(`background-color: ${tagColors.Mobility}`);
    expect(screen.getByText('Strength')).toHaveStyle(`background-color: ${tagColors.Strength}`);
  });

  it('renders media type badge using utils', () => {
    render(
      <InterventionList items={items} onClick={mockOnClick} t={mockT} tagColors={tagColors} />
    );

    expect(screen.getAllByText('Video').length).toBeGreaterThan(0); // called for both items
  });

  it('calls onClick when item is clicked', () => {
    render(
      <InterventionList items={items} onClick={mockOnClick} t={mockT} tagColors={tagColors} />
    );

    fireEvent.click(screen.getByText('Mobility Drill'));
    expect(mockOnClick).toHaveBeenCalledWith(items[0]);
  });
});
