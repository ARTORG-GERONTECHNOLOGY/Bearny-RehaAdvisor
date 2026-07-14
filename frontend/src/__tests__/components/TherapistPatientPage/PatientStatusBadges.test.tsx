import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import {
  LoginBadge,
  AdherenceProgress,
  FeedbackBadge,
  WearBadge,
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

  it('shows the tooltip on hover/focus and hides it again on mouse-out/blur', () => {
    renderWithI18n(<LoginBadge patient={makePatient({ last_online: isoDaysAgo(5) })} />);
    const badge = screen.getByText('5d ago');

    fireEvent.mouseOver(badge);
    expect(screen.getByText(/Last login/)).toBeInTheDocument();

    fireEvent.mouseOut(badge);
    expect(screen.queryByText(/Last login/)).not.toBeInTheDocument();

    fireEvent.focus(badge);
    expect(screen.getByText(/Last login/)).toBeInTheDocument();

    fireEvent.blur(badge);
    expect(screen.queryByText(/Last login/)).not.toBeInTheDocument();
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

  it('shows a days-ago label for a "warn" level with too few low ratings to lead', () => {
    renderWithI18n(
      <FeedbackBadge
        patient={makePatient({
          intervention_feedback: {
            answered_days_total: 5,
            last_answered_at: isoDaysAgo(20),
            days_since_last: 20,
            low_ratings_14d: 1,
          },
        })}
      />
    );
    expect(screen.getByText('20d ago')).toBeInTheDocument();
  });
});

describe('WearBadge', () => {
  it('shows "No data" when there is no Fitbit data', () => {
    renderWithI18n(<WearBadge patient={makePatient()} />);
    const badge = screen.getByText('No data');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Wear unknown');
  });

  it('shows "Disconnected" when the token is revoked', () => {
    renderWithI18n(
      <WearBadge
        patient={makePatient({
          biomarker: { wear_time_days_since: null, wear_time_avg_min: null, fitbit_revoked: true },
        })}
      />
    );
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows a days-ago label when not worn for 2+ days', () => {
    renderWithI18n(
      <WearBadge
        patient={makePatient({
          biomarker: { wear_time_days_since: 3, wear_time_avg_min: 700 },
        })}
      />
    );
    expect(screen.getByText('3d ago')).toBeInTheDocument();
  });

  it('shows the average hours when wear is low but recent', () => {
    renderWithI18n(
      <WearBadge
        patient={makePatient({
          biomarker: { wear_time_days_since: 0, wear_time_avg_min: 480 },
        })}
      />
    );
    expect(screen.getByText('8.0h')).toBeInTheDocument();
  });

  it('shows freshness for a healthy wear pattern', () => {
    renderWithI18n(
      <WearBadge
        patient={makePatient({
          biomarker: { wear_time_days_since: 0, wear_time_avg_min: 750 },
        })}
      />
    );
    expect(screen.getByText(/^today$/i)).toBeInTheDocument();
  });

  it('shows "yesterday" for a healthy wear pattern worn 1 day ago', () => {
    renderWithI18n(
      <WearBadge
        patient={makePatient({
          biomarker: { wear_time_days_since: 1, wear_time_avg_min: 750 },
        })}
      />
    );
    expect(screen.getByText(/^yesterday$/i)).toBeInTheDocument();
  }):
  
  it('shows "Omron" neutral badge for a patient with wearable_device=omron', () => {
    renderWithI18n(<WearBadge patient={makePatient({ wearable_device: 'omron' })} />);
    expect(screen.getByText('Omron')).toBeInTheDocument();
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
  });

  it('shows "No device" neutral badge for a patient with wearable_device=none', () => {
    renderWithI18n(<WearBadge patient={makePatient({ wearable_device: 'none' })} />);
    expect(screen.getByText('No device')).toBeInTheDocument();
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
  });

  it('does not show red Disconnected badge for omron even with revoked flag set', () => {
    renderWithI18n(
      <WearBadge
        patient={makePatient({
          wearable_device: 'omron',
          biomarker: { fitbit_revoked: true },
        })}
      />
    );
    expect(screen.getByText('Omron')).toBeInTheDocument();
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
  });

  it('still shows Fitbit Disconnected badge for fitbit patients with revoked token', () => {
    renderWithI18n(
      <WearBadge
        patient={makePatient({
          wearable_device: 'fitbit',
          biomarker: { wear_time_days_since: null, wear_time_avg_min: null, fitbit_revoked: true },
        })}
      />
    );
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
});
