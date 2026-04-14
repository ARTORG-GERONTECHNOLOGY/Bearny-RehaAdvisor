import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import PatientLibraryInterventionCard from '@/components/PatientLibrary/PatientLibraryInterventionCard';

const MockMainIcon = ({ className }: { className?: string }) => (
  <span data-testid="main-icon" className={className} />
);

const MockContentTypeIcon = ({ className }: { className?: string }) => (
  <span data-testid="content-type-icon" className={className} />
);

describe('PatientLibraryInterventionCard', () => {
  it('renders title, duration, content type and handles click', () => {
    const onClick = jest.fn();

    render(
      <PatientLibraryInterventionCard
        item={{ duration: 15, content_type: 'Video' }}
        displayTitle="Morning Stretch"
        Icon={MockMainIcon}
        contentTypeIcon={MockContentTypeIcon}
        containerClassName="w-full"
        onClick={onClick}
      />
    );

    expect(screen.getByText('Morning Stretch')).toBeInTheDocument();
    expect(screen.getByText('15min')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByTestId('main-icon')).toBeInTheDocument();
    expect(screen.getByTestId('content-type-icon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to dash when duration is not numeric', () => {
    render(
      <PatientLibraryInterventionCard
        item={{ duration: 'unknown', content_type: 'Text' }}
        displayTitle="Breathing"
        Icon={MockMainIcon}
        contentTypeIcon={null}
        containerClassName="w-full"
        onClick={() => {}}
      />
    );

    expect(screen.getByText('Breathing')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Star rating badge (avg_rating)
  // -------------------------------------------------------------------------

  it('shows star badge with filled/empty stars and numeric average when avg_rating is provided', () => {
    // avg_rating = 4.3 → Math.round(4.3) = 4 → ★★★★☆
    render(
      <PatientLibraryInterventionCard
        item={{ duration: 20, content_type: 'Exercise', avg_rating: 4.3, rating_count: 12 }}
        displayTitle="Squats"
        Icon={MockMainIcon}
        contentTypeIcon={MockContentTypeIcon}
        containerClassName="w-full"
        onClick={() => {}}
      />
    );

    // Numeric average is shown
    expect(screen.getByText('4.3')).toBeInTheDocument();
    // Correct filled/empty star pattern
    expect(screen.getByText('★★★★☆')).toBeInTheDocument();
  });

  it('shows 5 filled stars when avg_rating is 5', () => {
    render(
      <PatientLibraryInterventionCard
        item={{ duration: 10, content_type: 'Video', avg_rating: 5.0, rating_count: 3 }}
        displayTitle="Yoga"
        Icon={MockMainIcon}
        contentTypeIcon={null}
        containerClassName="w-full"
        onClick={() => {}}
      />
    );

    expect(screen.getByText('★★★★★')).toBeInTheDocument();
    expect(screen.getByText('5.0')).toBeInTheDocument();
  });

  it('hides star badge when avg_rating is null', () => {
    render(
      <PatientLibraryInterventionCard
        item={{ duration: 20, content_type: 'Exercise', avg_rating: null }}
        displayTitle="No-Rating Exercise"
        Icon={MockMainIcon}
        contentTypeIcon={null}
        containerClassName="w-full"
        onClick={() => {}}
      />
    );

    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  it('hides star badge when avg_rating is undefined (field absent)', () => {
    render(
      <PatientLibraryInterventionCard
        item={{ duration: 15, content_type: 'Audio' }}
        displayTitle="Podcast"
        Icon={MockMainIcon}
        contentTypeIcon={null}
        containerClassName="w-full"
        onClick={() => {}}
      />
    );

    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });
});
