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
});
