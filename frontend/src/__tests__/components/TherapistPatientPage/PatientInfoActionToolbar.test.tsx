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
    expect(screen.getByText('ResetPassword')).toBeInTheDocument();
    expect(screen.getByText('DeletePatient')).toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    expect(screen.queryByText('SaveChanges')).not.toBeInTheDocument();
  });

  it('calls fetchRedcapIfPossible when the Refresh REDCap button is clicked', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { matches: [] } });
    const store = makeStore();
    store.redcapIdentifier = 'PID-1';

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);

    fireEvent.click(screen.getByText('Refresh REDCap'));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/redcap/patient/', expect.anything())
    );
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

  it('copies missing fields from REDCap into the manual form', () => {
    const store = makeStore();
    store.isEditing = true;
    store.redcapRows = [{ record_id: '1' }];
    store.formData = { name: '' };
    store.redcapFlat = { name: 'RC-Alice' };

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('Copy from REDCap'));

    expect(store.formData.name).toBe('RC-Alice');
  });

  it('syncs wearables to REDCap when a project is set', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { results: {} } });
    const store = makeStore();
    store.redcapProject = 'COMPASS';

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('Sync Wearables'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/wearables/sync-to-redcap/patient-1/',
        expect.any(Object)
      )
    );
  });

  it('force re-syncs wearables only after confirming the overwrite warning', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { results: {} } });
    const store = makeStore();
    store.redcapProject = 'COMPASS';
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);
    fireEvent.click(screen.getByText('Force Re-sync'));

    expect(apiClient.post).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByText('Force Re-sync'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/wearables/sync-to-redcap/patient-1/',
        expect.objectContaining({ force: true })
      )
    );

    confirmSpy.mockRestore();
  });

  it('wires the password reset sheet fields and submit through to the store', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({ data: {} });
    const store = makeStore();
    store.showPasswordReset = true;

    render(<PatientInfoActionToolbar store={store} onDeleted={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('NewPassword'), { target: { value: 'abc123' } });
    fireEvent.change(screen.getByLabelText('ConfirmPassword'), { target: { value: 'abc123' } });
    expect(store.passwordNew).toBe('abc123');
    expect(store.passwordConfirm).toBe('abc123');

    fireEvent.click(screen.getByText('SetNewPassword'));

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith('/patients/patient-1/reset-password/', {
        new_password: 'abc123',
      })
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
