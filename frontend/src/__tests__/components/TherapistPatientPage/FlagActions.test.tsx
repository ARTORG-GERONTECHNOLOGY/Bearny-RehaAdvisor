import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import FlagActions from '@/components/TherapistPatientPage/FlagActions';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { PatientType } from '@/types';
import type { TherapistPatientsStore } from '@/stores/therapistPatientsStore';
import '@testing-library/jest-dom';

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
    flagged: false,
    ...overrides,
  }) as unknown as PatientType;

const makeStore = (overrides: Record<string, unknown> = {}) =>
  ({
    togglingFlagIds: new Set<string>(),
    toggleFlag: jest.fn(),
    openFlagComments: jest.fn(),
    ...overrides,
  }) as unknown as TherapistPatientsStore;

const renderWithI18n = (ui: React.ReactElement) =>
  render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider delayDuration={0}>{ui}</TooltipProvider>
    </I18nextProvider>
  );

describe('FlagActions', () => {
  it('renders an unflagged (outlined) flag button with the right aria attributes', () => {
    const store = makeStore();
    renderWithI18n(<FlagActions patient={makePatient()} store={store} />);

    const flagBtn = screen.getByRole('button', { name: 'Flag patient' });
    expect(flagBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders a flagged (filled) button labeled "Unflag patient" when patient.flagged is true', () => {
    const store = makeStore();
    renderWithI18n(<FlagActions patient={makePatient({ flagged: true })} store={store} />);

    const flagBtn = screen.getByRole('button', { name: 'Unflag patient' });
    expect(flagBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls store.toggleFlag with the patient when the flag button is clicked', () => {
    const store = makeStore();
    const patient = makePatient();
    renderWithI18n(<FlagActions patient={patient} store={store} />);

    fireEvent.click(screen.getByRole('button', { name: 'Flag patient' }));

    expect(store.toggleFlag).toHaveBeenCalledWith(patient, expect.any(Function));
  });

  it('does not bubble the click up to an ancestor (row navigation must not fire)', () => {
    const store = makeStore();
    const rowClick = jest.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider delayDuration={0}>
          <div onClick={rowClick}>
            <FlagActions patient={makePatient()} store={store} />
          </div>
        </TooltipProvider>
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Flag patient' }));

    expect(rowClick).not.toHaveBeenCalled();
  });

  it('disables the flag button while this patient is being toggled', () => {
    const store = makeStore({ togglingFlagIds: new Set(['patient-1']) });
    renderWithI18n(<FlagActions patient={makePatient()} store={store} />);

    expect(screen.getByRole('button', { name: 'Flag patient' })).toBeDisabled();
  });

  it('does not disable the flag button while a different patient is being toggled', () => {
    const store = makeStore({ togglingFlagIds: new Set(['some-other-patient']) });
    renderWithI18n(<FlagActions patient={makePatient()} store={store} />);

    expect(screen.getByRole('button', { name: 'Flag patient' })).not.toBeDisabled();
  });

  it('shows a plain "Flag patient" tooltip when unflagged', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    renderWithI18n(<FlagActions patient={makePatient()} store={store} />);

    await user.hover(screen.getByRole('button', { name: 'Flag patient' }));
    // Only the tooltip copy should show "Flag patient" a second time (once for the
    // aria-label on the button, once for the tooltip bubble).
    expect(await screen.findAllByText('Flag patient')).toHaveLength(1);
  });

  it('shows who flagged the patient and when in the tooltip once flagged', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    renderWithI18n(
      <FlagActions
        patient={makePatient({
          flagged: true,
          flagged_by: 'Dr. House',
          flagged_at: '2026-01-01T10:00:00Z',
        })}
        store={store}
      />
    );

    await user.hover(screen.getByRole('button', { name: 'Unflag patient' }));
    expect(await screen.findByText(/Dr\. House/)).toBeInTheDocument();
  });

  it('calls store.openFlagComments with the patient when the comments button is clicked', () => {
    const store = makeStore();
    const patient = makePatient();
    renderWithI18n(<FlagActions patient={patient} store={store} />);

    fireEvent.click(screen.getByRole('button', { name: 'View comments' }));

    expect(store.openFlagComments).toHaveBeenCalledWith(patient, expect.any(Function));
  });

  it('shows a "View comments" tooltip on hover', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    renderWithI18n(<FlagActions patient={makePatient()} store={store} />);

    await user.hover(screen.getByRole('button', { name: 'View comments' }));
    expect(await screen.findAllByText('View comments')).toHaveLength(1);
  });
});
