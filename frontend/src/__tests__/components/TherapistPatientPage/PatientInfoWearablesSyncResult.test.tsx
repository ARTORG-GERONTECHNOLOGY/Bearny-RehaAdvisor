import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientInfoWearablesSyncResult from '@/components/TherapistPatientPage/PatientInfoWearablesSyncResult';
import { PatientPopupStore } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoWearablesSyncResult', () => {
  it('renders nothing when there are no sync periods', () => {
    const store = makeStore();
    const { container } = render(<PatientInfoWearablesSyncResult store={store} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the first measurement date when present', () => {
    const store = makeStore();
    store.wearablesSyncFirstDate = '2024-01-01';
    store.wearablesSyncPeriods = { baseline: { status: 'sent' } };

    render(<PatientInfoWearablesSyncResult store={store} />);

    expect(screen.getByText(/2024-01-01/)).toBeInTheDocument();
  });

  it('renders sent status for a baseline period', () => {
    const store = makeStore();
    store.wearablesSyncPeriods = {
      baseline: {
        status: 'sent',
        window: '2024-01-08 to 2024-01-28',
        valid_activity_days: 3,
        valid_sleep_nights: 2,
        redcap_event: 'visit_baseline_arm_1',
      },
    };

    render(<PatientInfoWearablesSyncResult store={store} />);

    expect(screen.getByText('Wearables synced to REDCap')).toBeInTheDocument();
    expect(screen.getByText(/sent/i)).toBeInTheDocument();
  });

  it('renders skip_reason future_window', () => {
    const store = makeStore();
    store.wearablesSyncPeriods = {
      followup: { status: 'skipped', skip_reason: 'future_window', window_start: '2024-05-29', window_end: '2024-06-28' },
    };

    render(<PatientInfoWearablesSyncResult store={store} />);

    expect(screen.getByText(/skipped/i)).toBeInTheDocument();
    expect(screen.getByText(/skip_reason_future_window/i)).toBeInTheDocument();
  });

  it('renders skip_reason no_valid_days with record count', () => {
    const store = makeStore();
    store.wearablesSyncPeriods = {
      baseline: {
        status: 'skipped',
        skip_reason: 'no_valid_days',
        total_records_in_window: 21,
        valid_activity_days: 0,
        valid_sleep_nights: 0,
        wear_threshold_minutes: 600,
      },
    };

    render(<PatientInfoWearablesSyncResult store={store} />);

    expect(screen.getByText(/21 record/)).toBeInTheDocument();
    expect(screen.getByText(/10h\/day/)).toBeInTheDocument();
  });

  it('renders skip_reason already_populated', () => {
    const store = makeStore();
    store.wearablesSyncPeriods = {
      baseline: {
        status: 'skipped',
        skip_reason: 'already_populated',
        existing_start: '2024-01-08',
        redcap_event: 'visit_baseline_arm_1',
      },
    };

    render(<PatientInfoWearablesSyncResult store={store} />);

    expect(screen.getByText(/already populated/i)).toBeInTheDocument();
    expect(screen.getByText(/2024-01-08/)).toBeInTheDocument();
  });

  it('clears the sync result when closed', () => {
    const store = makeStore();
    store.wearablesSyncPeriods = { baseline: { status: 'sent' } };
    store.wearablesSyncFirstDate = '2024-01-01';

    render(<PatientInfoWearablesSyncResult store={store} />);
    fireEvent.click(screen.getByLabelText('Close alert'));

    expect(store.wearablesSyncPeriods).toBeNull();
    expect(store.wearablesSyncFirstDate).toBeNull();
  });
});
