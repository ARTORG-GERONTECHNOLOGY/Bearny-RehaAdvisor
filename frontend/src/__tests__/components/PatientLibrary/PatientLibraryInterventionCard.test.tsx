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

  it('stops click propagation so a wrapping card does not also receive the click', () => {
    const onClick = jest.fn();
    const onParentClick = jest.fn();

    render(
      <div onClick={onParentClick}>
        <PatientLibraryInterventionCard
          item={{ duration: 15, content_type: 'Video' }}
          displayTitle="Morning Stretch"
          Icon={MockMainIcon}
          contentTypeIcon={MockContentTypeIcon}
          containerClassName="w-full"
          onClick={onClick}
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
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

  it('shows numeric average when avg_rating is provided', () => {
    render(
      <PatientLibraryInterventionCard
        item={{ duration: 20, content_type: 'Exercise', avg_rating: 4.3 }}
        displayTitle="Squats"
        Icon={MockMainIcon}
        contentTypeIcon={MockContentTypeIcon}
        containerClassName="w-full"
        onClick={() => {}}
      />
    );

    expect(screen.getByText('4.3')).toBeInTheDocument();
  });

  it('shows formatted average when avg_rating is 5', () => {
    render(
      <PatientLibraryInterventionCard
        item={{ duration: 10, content_type: 'Video', avg_rating: 5.0 }}
        displayTitle="Yoga"
        Icon={MockMainIcon}
        contentTypeIcon={null}
        containerClassName="w-full"
        onClick={() => {}}
      />
    );

    expect(screen.getByText('5.0')).toBeInTheDocument();
  });

  it('hides rating badge when avg_rating is null', () => {
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

    // avg_rating badge not rendered
    expect(screen.queryByText('null')).not.toBeInTheDocument();
    // only the duration and content_type badges are present
    expect(screen.getAllByText(/-|Exercise/).length).toBeGreaterThanOrEqual(1);
  });

  it('hides rating badge when avg_rating is undefined (field absent)', () => {
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

    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    expect(screen.getByText('15min')).toBeInTheDocument();
  });

  const renderCard = (
    props: Partial<React.ComponentProps<typeof PatientLibraryInterventionCard>>
  ) =>
    render(
      <PatientLibraryInterventionCard
        item={{ duration: 15, content_type: 'Video' }}
        displayTitle="Morning Stretch"
        Icon={MockMainIcon}
        contentTypeIcon={MockContentTypeIcon}
        containerClassName="w-full"
        onClick={jest.fn()}
        {...props}
      />
    );

  it('shows the number of ratings next to the average', () => {
    renderCard({
      item: { duration: 15, content_type: 'Video', avg_rating: 4.2, rating_count: 17 },
    });
    expect(screen.getByText('4.2 (17)')).toBeInTheDocument();
  });

  it('shows the average alone when the count is missing', () => {
    renderCard({ item: { duration: 15, content_type: 'Video', avg_rating: 4 } });
    expect(screen.getByText('4.0')).toBeInTheDocument();
  });

  it('marks a completed intervention', () => {
    renderCard({ status: 'completed' });
    expect(screen.getByRole('img', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Viewed' })).not.toBeInTheDocument();
  });

  it('marks a viewed intervention apart from a completed one', () => {
    renderCard({ status: 'viewed' });
    expect(screen.getByRole('img', { name: 'Viewed' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Completed' })).not.toBeInTheDocument();
  });

  it('shows no status for an intervention never opened', () => {
    renderCard({});
    expect(screen.queryByRole('img', { name: 'Viewed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Completed' })).not.toBeInTheDocument();
  });
});
