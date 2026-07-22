import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientInfoWearablesSyncResult from '@/components/TherapistPatientPage/PatientInfoWearablesSyncResult';
import { PatientPopupStore } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoWearablesSyncResult', () => {
  it('renders nothing when there is no sync result', () => {
    const store = makeStore();

    const { container } = render(<PatientInfoWearablesSyncResult store={store} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists the sync status per period', () => {
    const store = makeStore();
    store.wearablesSyncResult = { daily: 'success', weekly: 'skipped' };
    store.wearablesSyncPayloads = {
      daily: { status: 'success', record: { steps: 8000 } },
      weekly: { status: 'skipped', reason: 'no data' },
    };

    render(<PatientInfoWearablesSyncResult store={store} />);

    expect(screen.getByText('Wearables synced to REDCap')).toBeInTheDocument();
    // "success" also appears in the payload detail table below, so expect 2 matches.
    expect(screen.getAllByText('success')).toHaveLength(2);
    expect(screen.getAllByText('skipped')).toHaveLength(2);
    expect(screen.getByText('(no data)')).toBeInTheDocument();
  });

  it('renders the payload sent to REDCap per period', () => {
    const store = makeStore();
    store.wearablesSyncResult = { daily: 'success' };
    store.wearablesSyncPayloads = {
      daily: { status: 'success', record: { steps: 8000 } },
    };

    render(<PatientInfoWearablesSyncResult store={store} />);

    expect(screen.getByText('Payload sent to REDCap (by period)')).toBeInTheDocument();
    expect(screen.getByText('steps')).toBeInTheDocument();
    expect(screen.getByText('8000')).toBeInTheDocument();
  });

  it('clears the sync result when closed', () => {
    const store = makeStore();
    store.wearablesSyncResult = { daily: 'success' };
    store.wearablesSyncPayloads = { daily: { status: 'success', record: {} } };

    render(<PatientInfoWearablesSyncResult store={store} />);
    fireEvent.click(screen.getByLabelText('Close alert'));

    expect(store.wearablesSyncResult).toBeNull();
    expect(store.wearablesSyncPayloads).toBeNull();
  });
});
