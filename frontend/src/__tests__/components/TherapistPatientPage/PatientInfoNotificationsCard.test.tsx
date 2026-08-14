import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientInfoNotificationsCard from '@/components/TherapistPatientPage/PatientInfoNotificationsCard';
import { PatientPopupStore } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoNotificationsCard', () => {
  it('shows the card title and a badge for every category', () => {
    const store = makeStore();
    store.rawPatient = { notification_preferences: {} };

    render(<PatientInfoNotificationsCard store={store} />);

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Managed by the patient in their profile')).toBeInTheDocument();
    ['Education', 'Exercise', 'Instructions', 'Reminder', 'Behavior change', 'Other'].forEach(
      (label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    );
  });

  it('defaults every category to disabled (neutral variant) when notification_preferences is missing', () => {
    const store = makeStore();
    store.rawPatient = {};

    render(<PatientInfoNotificationsCard store={store} />);

    // dashboard (neutral) variant renders with border-accent (see badge.tsx)
    const badge = screen.getByText('Education');
    expect(badge.className).toContain('border-accent');
  });

  it('reflects an explicitly enabled category with the success badge variant', () => {
    const store = makeStore();
    store.rawPatient = { notification_preferences: { education: true } };

    render(<PatientInfoNotificationsCard store={store} />);

    // dashboard-success variant renders with border-ok/bg-ok classes (see badge.tsx)
    const badge = screen.getByText('Education');
    expect(badge.className).toContain('border-ok');
  });
});
