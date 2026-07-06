import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientInfoRedcapCard from '@/components/TherapistPatientPage/PatientInfoRedcapCard';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => ({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoRedcapCard', () => {
  it('shows a message when no project is selected', () => {
    const store = makeStore();

    render(<PatientInfoRedcapCard store={store} />);

    expect(screen.getByText('No project selected')).toBeInTheDocument();
  });

  it('shows a loading spinner while REDCap data is loading', () => {
    const store = makeStore();
    store.redcapLoading = true;

    render(<PatientInfoRedcapCard store={store} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows a message when there are no REDCap rows', () => {
    const store = makeStore();
    store.redcapProject = 'COMPASS';
    store.redcapRows = [];

    render(<PatientInfoRedcapCard store={store} />);

    expect(screen.getByText('No REDCap data available for this patient.')).toBeInTheDocument();
  });

  it('renders the flattened REDCap record as a table when rows are present', () => {
    const store = makeStore();
    store.redcapProject = 'COMPASS';
    store.redcapRows = [{ record_id: '123', pat_id: '456' }];
    store.redcapFlat = { record_id: '123', pat_id: '456' };

    render(<PatientInfoRedcapCard store={store} />);

    expect(screen.getByText('COMPASS')).toBeInTheDocument();
    expect(screen.getByText('record_id')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('pat_id')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  it('calls fetchRedcapIfPossible when the refresh button is clicked', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { matches: [] } });
    const store = makeStore();
    store.redcapIdentifier = 'PID-1';

    render(<PatientInfoRedcapCard store={store} />);

    fireEvent.click(screen.getByText('Refresh'));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/redcap/patient/', expect.anything())
    );
  });
});
