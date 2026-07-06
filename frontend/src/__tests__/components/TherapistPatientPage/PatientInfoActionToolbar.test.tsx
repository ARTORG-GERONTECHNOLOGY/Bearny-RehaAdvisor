import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientInfoActionToolbar from '@/components/TherapistPatientPage/PatientInfoActionToolbar';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => ({
  get: jest.fn(),
  put: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}));

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoActionToolbar', () => {
  it('shows the view-mode actions when not editing', () => {
    const store = makeStore();

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Refresh REDCap')).toBeInTheDocument();
    expect(screen.getByText('ResetPassword')).toBeInTheDocument();
    expect(screen.getByText('DeletePatient')).toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    expect(screen.queryByText('SaveChanges')).not.toBeInTheDocument();
  });

  it('only shows Sync Wearables when a REDCap project is set', () => {
    const store = makeStore();

    const { rerender } = render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    expect(screen.queryByText('Sync Wearables')).not.toBeInTheDocument();

    store.redcapProject = 'COMPASS';
    rerender(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    expect(screen.getByText('Sync Wearables')).toBeInTheDocument();
  });

  it('shows the edit-mode actions when editing', () => {
    const store = makeStore();
    store.isEditing = true;

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('SaveChanges')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('only shows Copy from REDCap while editing when REDCap rows exist', () => {
    const store = makeStore();
    store.isEditing = true;

    const { rerender } = render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    expect(screen.queryByText('Copy from REDCap')).not.toBeInTheDocument();

    store.redcapRows = [{ record_id: '1' }];
    rerender(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    expect(screen.getByText('Copy from REDCap')).toBeInTheDocument();
  });

  it('toggles isEditing when Edit / Cancel are clicked', () => {
    const store = makeStore();

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(store.isEditing).toBe(true);
  });

  it('opens the delete confirmation sheet when DeletePatient is clicked', () => {
    const store = makeStore();

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('DeletePatient'));

    expect(store.showConfirmDelete).toBe(true);
    expect(screen.getByText('ConfirmDeletion')).toBeInTheDocument();
  });

  it('deletes the patient and calls onDeleted when confirmed', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({});
    const store = makeStore();
    const onDeleted = jest.fn();

    render(<PatientInfoActionToolbar store={store} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByText('DeletePatient'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/users/patient-1/profile/'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(store.showConfirmDelete).toBe(false);
  });

  it('closes the delete confirmation sheet when Cancel is clicked', () => {
    const store = makeStore();

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('DeletePatient'));
    expect(screen.getByText('ConfirmDeletion')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Cancel')[0]);
    expect(store.showConfirmDelete).toBe(false);
  });

  it('opens the password reset sheet when ResetPassword is clicked', () => {
    const store = makeStore();

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('ResetPassword'));

    expect(store.showPasswordReset).toBe(true);
  });

  it('triggers a REDCap refresh when Refresh REDCap is clicked', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { matches: [] } });
    const store = makeStore();
    store.redcapIdentifier = 'PID-1';

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('Refresh REDCap'));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/redcap/patient/', expect.anything())
    );
  });

  it('saves changes when SaveChanges is clicked', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({ data: {} });
    const store = makeStore();
    store.isEditing = true;
    store.manualData = { name: 'Old' };
    store.formData = { name: 'New' };

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('SaveChanges'));

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        '/users/patient-1/profile/',
        expect.objectContaining({ name: 'New' })
      )
    );
  });
});
