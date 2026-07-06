import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PatientInfoProfileCard from '@/components/TherapistPatientPage/PatientInfoProfileCard';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import { appModeStore } from '@/stores/appModeStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Radix Select (used by the clinic/project 'dropdown' fields) relies on pointer capture /
// scrollIntoView APIs that jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoProfileCard', () => {
  afterEach(() => {
    appModeStore.mode = 'normal';
  });

  it('shows the contacts fields with their display values in view mode', () => {
    const store = makeStore();
    store.manualData = {
      last_online_contact: '2026-01-10T00:00:00.000Z',
      last_clinic_visit: '2026-01-05T00:00:00.000Z',
      therapist_name: 'Dr. Smith',
      clinic: 'Inselspital',
      project: 'COMPASS',
      reha_end_date: '2026-03-01T00:00:00.000Z',
      study_end_date: '2026-06-01T00:00:00.000Z',
    };

    render(<PatientInfoProfileCard store={store} />);

    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument();

    // "clinic"/"project" are also rendered elsewhere by the config-driven PatientForm
    // loop below, so scope this assertion to the Contacts subsection specifically.
    const contacts = within(screen.getByText('Contacts').parentElement as HTMLElement);
    expect(contacts.getByText('Inselspital')).toBeInTheDocument();
    expect(contacts.getByText('COMPASS')).toBeInTheDocument();
  });

  it('binds the clinic/project/date fields to formData in edit mode', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.isEditing = true;
    store.formData = { last_clinic_visit: '', clinic: '', project: '', reha_end_date: '' };

    render(<PatientInfoProfileCard store={store} />);

    await user.click(document.getElementById('clinic') as HTMLElement);
    await user.click(await screen.findByRole('option', { name: 'Inselspital' }));

    expect(store.formData.clinic).toBe('Inselspital');
    // Selecting a clinic resets the dependent project field.
    expect(store.formData.project).toBe('');

    const rehaEndDateInput = document.getElementById('reha_end_date') as HTMLInputElement;
    fireEvent.change(rehaEndDateInput, { target: { value: '2026-03-01' } });
    expect(store.formData.reha_end_date).toBe('2026-03-01');
  });

  it('lists project options scoped to the selected clinic', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.isEditing = true;
    store.formData = { clinic: 'Inselspital', project: '' };

    render(<PatientInfoProfileCard store={store} />);

    await user.click(document.getElementById('project') as HTMLElement);
    const optionLabels = (await screen.findAllByRole('option')).map((o) => o.textContent);

    expect(optionLabels).toEqual(expect.arrayContaining(['COPAIN', 'COMPASS']));
  });

  it('renders the config-driven patient form fields, e.g. First Name', () => {
    const store = makeStore();
    store.isEditing = true;
    store.formData = { first_name: 'Jane' };

    render(<PatientInfoProfileCard store={store} />);

    expect(screen.getByDisplayValue('Jane')).toBeInTheDocument();
  });

  it('hides PII fields when appModeStore.hidePiiFields is true', () => {
    appModeStore.mode = 'study';
    const store = makeStore();
    store.isEditing = true;
    store.formData = { first_name: 'Jane' };

    render(<PatientInfoProfileCard store={store} />);

    expect(screen.queryByDisplayValue('Jane')).not.toBeInTheDocument();
  });

  it('shows the read-only Last online visit / Therapist fields only in view mode', () => {
    const store = makeStore();
    store.manualData = {
      last_online_contact: '2026-01-10T00:00:00.000Z',
      therapist_name: 'Dr. Smith',
    };

    const { rerender } = render(<PatientInfoProfileCard store={store} />);
    expect(screen.getByText('Last online visit')).toBeInTheDocument();
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument();

    store.isEditing = true;
    rerender(<PatientInfoProfileCard store={store} />);
    expect(screen.queryByText('Last online visit')).not.toBeInTheDocument();
    expect(screen.queryByText('Dr. Smith')).not.toBeInTheDocument();
  });

  it('does not show a source badge for the read-only Therapist field', () => {
    const store = makeStore();
    store.manualData = { therapist_name: 'Dr. Smith' };

    render(<PatientInfoProfileCard store={store} />);

    const therapistRow = screen.getByText('Therapist').parentElement as HTMLElement;
    expect(within(therapistRow).queryByText('Manual')).not.toBeInTheDocument();
  });
});
