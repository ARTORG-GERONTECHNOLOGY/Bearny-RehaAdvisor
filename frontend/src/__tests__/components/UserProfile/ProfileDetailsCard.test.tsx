import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import ProfileDetailsCard from '@/components/UserProfile/ProfileDetailsCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('ProfileDetailsCard', () => {
  it('shows loading skeleton while loading', () => {
    const { container } = render(
      <ProfileDetailsCard loading userData={null} userType="Therapist" />
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
  });

  it('shows no-data message when not loading and userData is null', () => {
    render(<ProfileDetailsCard loading={false} userData={null} userType="Therapist" />);

    expect(screen.getByText('No user data found.')).toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
    expect(screen.queryByText('Specialization')).not.toBeInTheDocument();
    expect(screen.queryByText('Clinic')).not.toBeInTheDocument();
  });

  it('renders basic user details', () => {
    render(
      <ProfileDetailsCard
        loading={false}
        userType="Researcher"
        userData={{ first_name: 'Jane', name: 'Doe', email: 'jane@example.com', phone: '123' }}
      />
    );

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('renders therapist fields with values', () => {
    render(
      <ProfileDetailsCard
        loading={false}
        userType="Therapist"
        userData={{
          email: 'jane@example.com',
          specializations: ['Cardiology', 'Neurology'],
          clinics: ['Clinic A'],
        }}
      />
    );

    expect(screen.getByText('Specialization')).toBeInTheDocument();
    expect(screen.getByText('Clinic')).toBeInTheDocument();
    expect(screen.getByText('Cardiology, Neurology')).toBeInTheDocument();
    expect(screen.getByText('Clinic A')).toBeInTheDocument();
  });

  it('renders therapist fields with None fallback when empty', () => {
    render(
      <ProfileDetailsCard
        loading={false}
        userType="Therapist"
        userData={{ email: 'jane@example.com', specializations: [], clinics: [] }}
      />
    );

    expect(screen.getAllByText('None').length).toBeGreaterThanOrEqual(2);
  });
});
