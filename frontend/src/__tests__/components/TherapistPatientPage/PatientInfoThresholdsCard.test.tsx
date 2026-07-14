import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientInfoThresholdsCard from '@/components/TherapistPatientPage/PatientInfoThresholdsCard';
import { PatientPopupStore, PatientThresholds } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const makeStore = () => new PatientPopupStore('patient-1');

const sampleThresholds: PatientThresholds = {
  steps_goal: 10000,
  active_minutes_green: 30,
  active_minutes_yellow: 20,
  sleep_green_min: 420,
  sleep_yellow_min: 360,
  bp_sys_green_max: 129,
  bp_sys_yellow_max: 139,
  bp_dia_green_max: 84,
  bp_dia_yellow_max: 89,
};

describe('PatientInfoThresholdsCard', () => {
  it('shows a placeholder when no thresholds are loaded', () => {
    const store = makeStore();

    render(<PatientInfoThresholdsCard store={store} />);

    expect(screen.getByText('No thresholds loaded.')).toBeInTheDocument();
  });

  it('shows the current threshold values in view mode', () => {
    const store = makeStore();
    store.thresholds = sampleThresholds;

    render(<PatientInfoThresholdsCard store={store} />);

    expect(screen.getByText('10000')).toBeInTheDocument();
    expect(screen.getByText('Steps goal')).toBeInTheDocument();
    expect(screen.getByText('Active Minutes')).toBeInTheDocument();
    expect(screen.getByText('Sleep')).toBeInTheDocument();
    expect(screen.getByText('BP systolic')).toBeInTheDocument();
    expect(screen.getByText('BP diastolic')).toBeInTheDocument();
  });

  it('renders editable number inputs in edit mode and writes changes to the draft', () => {
    const store = makeStore();
    store.thresholds = sampleThresholds;
    store.isEditing = true;

    render(<PatientInfoThresholdsCard store={store} />);

    const stepsInput = screen.getByLabelText('Steps goal') as HTMLInputElement;
    expect(stepsInput.value).toBe('10000');

    fireEvent.change(stepsInput, { target: { value: '12000' } });
    expect(store.thresholdDraft.steps_goal).toBe(12000);

    const yellowInput = screen.getByLabelText('Active zone minutes (yellow)') as HTMLInputElement;
    fireEvent.change(yellowInput, { target: { value: '15' } });
    expect(store.thresholdDraft.active_minutes_yellow).toBe(15);
  });

  it('only shows the effective-from and reason fields while editing', () => {
    const store = makeStore();
    store.thresholds = sampleThresholds;

    const { rerender } = render(<PatientInfoThresholdsCard store={store} />);
    expect(screen.queryByText('Effective from (optional)')).not.toBeInTheDocument();

    store.isEditing = true;
    rerender(<PatientInfoThresholdsCard store={store} />);
    expect(screen.getByText('Effective from (optional)')).toBeInTheDocument();
    expect(screen.getByText('Reason (optional)')).toBeInTheDocument();
  });

  it('writes changes to the effective-from and reason fields while editing', () => {
    const store = makeStore();
    store.thresholds = sampleThresholds;
    store.isEditing = true;

    render(<PatientInfoThresholdsCard store={store} />);

    const effectiveFromInput = screen.getByLabelText(
      'Effective from (optional)'
    ) as HTMLInputElement;
    fireEvent.change(effectiveFromInput, { target: { value: '2026-02-01T09:00' } });
    expect(store.thresholdEffectiveFromLocal).toBe('2026-02-01T09:00');

    const reasonInput = screen.getByLabelText('Reason (optional)') as HTMLInputElement;
    fireEvent.change(reasonInput, { target: { value: 'Improved fitness' } });
    expect(store.thresholdReason).toBe('Improved fitness');
  });

  it('renders the threshold history', () => {
    const store = makeStore();
    store.thresholds = sampleThresholds;
    store.thresholdsHistory = [
      {
        effective_from: '2026-01-15T10:00:00.000Z',
        changed_by: 'Dr. Smith',
        reason: 'Patient improved',
        thresholds: { steps_goal: 8000 },
      },
    ];

    render(<PatientInfoThresholdsCard store={store} />);

    expect(screen.getByText(/Dr\. Smith/)).toBeInTheDocument();
  });
});
