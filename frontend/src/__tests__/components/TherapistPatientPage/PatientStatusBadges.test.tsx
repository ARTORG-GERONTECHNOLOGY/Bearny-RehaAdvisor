import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import {
  LoginBadge,
  AdherenceProgress,
  FeedbackBadge,
} from '@/components/TherapistPatientPage/PatientStatusBadges';
import type { PatientType } from '@/types';
import '@testing-library/jest-dom';

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

const makePatient = (overrides: Record<string, unknown> = {}): PatientType =>
  ({
    _id: 'patient-1',
    username: 'jdoe',
    first_name: 'Jane',
    name: 'Doe',
    age: '1990-01-01',
    diagnosis: [],
    sex: 'Female',
    duration: 30,
    ...overrides,
  }) as unknown as PatientType;

const renderWithI18n = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe('LoginBadge', () => {
  it('shows "Never logged in" when there is no login data', () => {
    renderWithI18n(<LoginBadge patient={makePatient()} />);
    expect(screen.getByText('Never logged in')).toBeInTheDocument();
  });

  it('shows "Today" for a login on the current day', () => {
    renderWithI18n(<LoginBadge patient={makePatient({ last_online: new Date().toISOString() })} />);
    // case-insensitive: i18next may resolve the raw key ('today') vs the
    // translated value ('Today') depending on init timing in jsdom.
    expect(screen.getByText(/^today$/i)).toBeInTheDocument();
  });

  it('shows a days-ago label for older logins', () => {
    renderWithI18n(<LoginBadge patient={makePatient({ last_online: isoDaysAgo(5) })} />);
    expect(screen.getByText('5d ago')).toBeInTheDocument();
  });
});

describe('AdherenceProgress', () => {
  it('shows an em dash when adherence_rate is missing', () => {
    renderWithI18n(<AdherenceProgress patient={makePatient()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the adherence rate as a percentage', () => {
    renderWithI18n(<AdherenceProgress patient={makePatient({ adherence_rate: 72 })} />);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });
});

describe('FeedbackBadge', () => {
  it('shows "No feedback" when nothing has ever been answered', () => {
    renderWithI18n(<FeedbackBadge patient={makePatient()} />);
    expect(screen.getByText('No feedback')).toBeInTheDocument();
  });

  it('shows "Good" for recent feedback with no low ratings', () => {
    renderWithI18n(
      <FeedbackBadge
        patient={makePatient({
          intervention_feedback: {
            answered_days_total: 5,
            last_answered_at: isoDaysAgo(1),
            days_since_last: 1,
            low_ratings_14d: 0,
          },
        })}
      />
    );
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('shows a negative-ratings count when low ratings dominate', () => {
    renderWithI18n(
      <FeedbackBadge
        patient={makePatient({
          intervention_feedback: {
            answered_days_total: 5,
            last_answered_at: isoDaysAgo(1),
            days_since_last: 1,
            low_ratings_14d: 7,
          },
        })}
      />
    );
    expect(screen.getByText('7 neg.')).toBeInTheDocument();
  });
});
