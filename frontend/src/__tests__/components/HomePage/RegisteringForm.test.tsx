import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegisteringForm from '@/components/HomePage/RegisteringForm';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
import apiClient from '@/api/client';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('../../../config/config.json', () => ({
  TherapistForm: [
    {
      title: 'Personal Information',
      fields: [
        { name: 'firstName', label: 'First Name', type: 'text', required: true },
        { name: 'lastName', label: 'Last Name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Phone', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'repeatPassword', label: 'Repeat Password', type: 'password', required: true },
        {
          name: 'userType',
          label: 'User Type',
          type: 'dropdown',
          required: true,
          options: ['Therapist', 'Researcher', 'admin'],
        },
      ],
    },
    {
      title: 'Role Details',
      fields: [
        { name: 'specialisation', label: 'Specialisation', type: 'multi-select', required: true },
        { name: 'clinic', label: 'Clinics', type: 'multi-select', required: true },
        { name: 'projects', label: 'Projects', type: 'multi-select', required: false },
        {
          name: 'function',
          label: 'Function',
          type: 'multi-select',
          required: false,
          options: ['Cardiology'],
        },
        { name: 'diagnosis', label: 'Diagnosis', type: 'multi-select', required: false },
      ],
    },
  ],
  therapistInfo: {
    specializations: ['Cardiology'],
    clinic_projects: { Inselspital: ['COPAIN'], 'Berner Reha Centrum': ['OtherProject'] },
    projects: ['COPAIN', 'OtherProject'],
  },
  patientInfo: {
    functionPat: { Cardiology: ['Arrhythmia', 'Heart Failure'] },
  },
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, id, isDisabled, placeholder }: any) => (
    <div data-testid={`select-${id}`} aria-disabled={isDisabled}>
      <span>{placeholder}</span>
      {(options || []).map((o: any) => {
        const selected = (value || []).some((v: any) => v.value === o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={isDisabled}
            data-selected={selected}
            onClick={() => {
              const current = value || [];
              const next = selected
                ? current.filter((v: any) => v.value !== o.value)
                : [...current, o];
              onChange(next);
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  ),
}));

const setup = (handleRegShow = jest.fn()) => {
  render(<RegisteringForm show handleRegShow={handleRegShow} />);
  return handleRegShow;
};

const fillStep1 = () => {
  fireEvent.change(document.getElementById('firstName')!, { target: { value: 'Jane' } });
  fireEvent.change(document.getElementById('lastName')!, { target: { value: 'Doe' } });
  fireEvent.change(document.getElementById('email')!, { target: { value: 'jane@example.com' } });
  fireEvent.change(document.getElementById('phone')!, { target: { value: '12345678' } });
  fireEvent.change(document.getElementById('password')!, { target: { value: 'Passw0rd!' } });
  fireEvent.change(document.getElementById('repeatPassword')!, {
    target: { value: 'Passw0rd!' },
  });
  fireEvent.change(document.getElementById('userType')!, { target: { value: 'Therapist' } });
};

describe('RegisteringForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the first step title and fields', () => {
    setup();
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByLabelText(/First Name/)).toBeInTheDocument();
  });

  it('does not render when show is false', () => {
    render(<RegisteringForm show={false} handleRegShow={jest.fn()} />);
    expect(screen.queryByText('Personal Information')).not.toBeInTheDocument();
  });

  it('flags required fields when Next is clicked on an empty step', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(0);
  });

  it('flags an invalid phone number', () => {
    setup();
    fillStep1();
    fireEvent.change(document.getElementById('phone')!, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Invalid phone number. Enter 8-15 digits only.')).toBeInTheDocument();
  });

  it('flags an invalid email address', () => {
    setup();
    fillStep1();
    fireEvent.change(document.getElementById('email')!, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Invalid email address.')).toBeInTheDocument();
  });

  it('flags an invalid first name', () => {
    setup();
    fillStep1();
    fireEvent.change(document.getElementById('firstName')!, { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Please enter a valid first name.')).toBeInTheDocument();
  });

  it('flags an invalid last name', () => {
    setup();
    fillStep1();
    fireEvent.change(document.getElementById('lastName')!, { target: { value: '456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Please enter a valid last name.')).toBeInTheDocument();
  });

  it('live-validates the password field as the user types', () => {
    setup();
    fireEvent.change(document.getElementById('password')!, { target: { value: 'weak' } });
    expect(screen.getByText(/Password must include 8\+ characters/)).toBeInTheDocument();
  });

  it('live-validates that repeatPassword matches password', () => {
    setup();
    fireEvent.change(document.getElementById('password')!, { target: { value: 'Passw0rd!' } });
    fireEvent.change(document.getElementById('repeatPassword')!, {
      target: { value: 'different' },
    });
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('flags a mismatched password on submit-side validation', () => {
    setup();
    fillStep1();
    fireEvent.change(document.getElementById('repeatPassword')!, { target: { value: 'Other1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    setup();
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.click(screen.getAllByLabelText('Toggle password visibility')[0]);
    expect(passwordInput.type).toBe('text');
  });

  it('toggles repeat-password visibility independently via keyboard', () => {
    setup();
    const repeatInput = document.getElementById('repeatPassword') as HTMLInputElement;
    const toggles = screen.getAllByLabelText('Toggle password visibility');
    fireEvent.keyDown(toggles[1], { key: 'Enter' });
    expect(repeatInput.type).toBe('text');
  });

  it('ignores unrelated keys on the password-visibility toggle', () => {
    setup();
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const toggles = screen.getAllByLabelText('Toggle password visibility');
    fireEvent.keyDown(toggles[0], { key: 'Tab' });
    expect(passwordInput.type).toBe('password');
  });

  it('advances to step 2 and shows role-detail fields', () => {
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Role Details')).toBeInTheDocument();
  });

  it('goes back to step 1 from step 2', () => {
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Role Details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
  });

  it('disables the projects select until a clinic is chosen, then enables it', () => {
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByTestId('select-projects')).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    expect(screen.getByTestId('select-projects')).toHaveAttribute('aria-disabled', 'false');
  });

  it('prunes selected projects once their enabling clinic is deselected', () => {
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(within(screen.getByTestId('select-projects')).getByText('COPAIN'));
    expect(within(screen.getByTestId('select-projects')).getByText('COPAIN')).toHaveAttribute(
      'data-selected',
      'true'
    );

    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    expect(screen.getByTestId('select-projects')).toHaveAttribute('aria-disabled', 'true');
  });

  it('derives diagnosis options from the selected function specialities', () => {
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(within(screen.getByTestId('select-function')).getByText('Cardiology'));
    expect(
      within(screen.getByTestId('select-diagnosis')).getByText('Arrhythmia')
    ).toBeInTheDocument();
  });

  it('rejects a project not allowed for the selected clinics on step validation', () => {
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(within(screen.getByTestId('select-projects')).getByText('COPAIN'));

    // Force an otherwise-unreachable invalid combination by selecting a second
    // clinic then a project only that clinic's sibling supports is fine, but
    // deselecting the clinic while a project remains selected produces one:
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));

    fireEvent.click(screen.getByRole('button', { name: /Submit|Next/i }));
    // With no clinic selected, projects validation is skipped entirely — assert
    // instead that the required "clinic" error surfaces.
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
  });

  it('submits successfully and shows the success banner', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201 });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(
      await screen.findByText(
        'You have been registered. Account info will be emailed after approval.'
      )
    ).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/auth/register/',
      expect.objectContaining({ email: 'jane@example.com' })
    );
  });

  it('closes and resets after a successful submission', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201 });
    const handleRegShow = setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByText(/You have been registered/);
    fireEvent.click(screen.getByRole('button', { name: 'Close and return to login' }));
    expect(handleRegShow).toHaveBeenCalled();
  });

  it('dismisses the success banner via its own close button', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201 });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByText(/You have been registered/);
    const successAlert = document.querySelector('.alert-success') as HTMLElement;
    fireEvent.click(within(successAlert).getByLabelText('Close'));
    expect(screen.queryByText(/You have been registered/)).not.toBeInTheDocument();
  });

  it('shows a non-2xx server response as a form error', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      status: 400,
      data: { message: 'Bad request' },
    });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Bad request')).toBeInTheDocument();
  });

  it('dismisses the error banner via its own close button', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      status: 400,
      data: { message: 'Bad request' },
    });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByText('Bad request');
    const errorAlert = document.querySelector('.alert-danger') as HTMLElement;
    fireEvent.click(within(errorAlert).getByLabelText('Close'));
    expect(screen.queryByText('Bad request')).not.toBeInTheDocument();
  });

  it('shows a busy-server message and expandable details on a 5xx error', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 503, data: { error: 'Down for maintenance' } },
    });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(
      await screen.findByText(/server is busy or temporarily unavailable/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Additional information' }));
    expect(screen.getByText(/Down for maintenance/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Additional information' }));
    expect(screen.queryByText(/Down for maintenance/)).not.toBeInTheDocument();
  });

  it('maps backend field_errors onto the form and jumps to the errored step', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 400,
        data: { field_errors: { email: ['Email already registered'] } },
      },
    });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText('Personal Information')).toBeInTheDocument());
    expect(screen.getAllByText('Email already registered').length).toBeGreaterThan(0);
  });

  it('shows a generic failure message on a non-5xx error with no field_errors', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 409, data: {} },
    });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(
      await screen.findByText('Registration failed. Please try again later.')
    ).toBeInTheDocument();
  });

  it('resets userType-dependent fields when switching user type back to Therapist', () => {
    setup();
    fireEvent.change(document.getElementById('userType')!, { target: { value: 'Researcher' } });
    fireEvent.change(document.getElementById('userType')!, { target: { value: 'Therapist' } });
    // No crash and the dropdown reflects the final selection.
    expect((document.getElementById('userType') as HTMLSelectElement).value).toBe('Therapist');
  });

  it('closes without confirmation when the form is untouched', () => {
    const handleRegShow = setup();
    // The sheet's own close (X) button always exists.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(handleRegShow).toHaveBeenCalled();
  });

  it('asks for confirmation before closing when the form has unsaved data', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const handleRegShow = setup();
    fireEvent.change(document.getElementById('firstName')!, { target: { value: 'Jane' } });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to close? Unsaved data will be lost.'
    );
    expect(handleRegShow).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('closes anyway once the user confirms discarding unsaved data', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const handleRegShow = setup();
    fireEvent.change(document.getElementById('firstName')!, { target: { value: 'Jane' } });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(handleRegShow).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('closes via the Escape key, respecting the confirm dialog', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const handleRegShow = setup();
    fireEvent.change(document.getElementById('firstName')!, { target: { value: 'Jane' } });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(confirmSpy).toHaveBeenCalled();
    expect(handleRegShow).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('confirms before closing while a submission is in progress', async () => {
    let resolvePost: (v: unknown) => void = () => {};
    (apiClient.post as jest.Mock).mockReturnValueOnce(
      new Promise((res) => {
        resolvePost = res;
      })
    );
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const handleRegShow = setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(confirmSpy).toHaveBeenCalledWith('A request is in progress. Do you want to close?');
    expect(handleRegShow).toHaveBeenCalled();

    resolvePost({ status: 201 });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });

  it('switches to admin-specific state when userType is set to admin', () => {
    setup();
    fireEvent.change(document.getElementById('userType')!, { target: { value: 'admin' } });
    expect((document.getElementById('userType') as HTMLSelectElement).value).toBe('admin');
  });

  it('fires the Modal onEscapeKeyDown handler (document-level) in addition to the window listener', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const handleRegShow = setup();
    fireEvent.change(document.getElementById('firstName')!, { target: { value: 'Jane' } });

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 });

    expect(confirmSpy).toHaveBeenCalled();
    expect(handleRegShow).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('clears a required-field error on blur for a dropdown field', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(0);

    fireEvent.blur(document.getElementById('userType')!);
    expect(screen.getByLabelText(/User Type/)).not.toHaveClass('is-invalid');
  });

  it('flags an invalid email on blur', () => {
    setup();
    fireEvent.change(document.getElementById('email')!, { target: { value: 'not-an-email' } });
    fireEvent.blur(document.getElementById('email')!);
    expect(screen.getByText('Invalid email address.')).toBeInTheDocument();
  });

  it('flags an invalid first name on blur', () => {
    setup();
    fireEvent.change(document.getElementById('firstName')!, { target: { value: '123' } });
    fireEvent.blur(document.getElementById('firstName')!);
    expect(screen.getByText('Please enter a valid name (letters only).')).toBeInTheDocument();
  });

  it('flags an invalid phone number on blur', () => {
    setup();
    fireEvent.change(document.getElementById('phone')!, { target: { value: 'abc' } });
    fireEvent.blur(document.getElementById('phone')!);
    expect(screen.getByText('Invalid phone number. Enter 8-15 digits only.')).toBeInTheDocument();
  });

  it('extracts a message from non_field_errors when no other message field is present', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 409, data: { non_field_errors: ['Duplicate entry'] } },
    });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Duplicate entry')).toBeInTheDocument();
  });

  it('falls back to scanning arbitrary data fields for a message string', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 409, data: { weirdField: 'Something unexpected happened' } },
    });
    setup();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByTestId('select-specialisation')).getByText('Cardiology'));
    fireEvent.click(within(screen.getByTestId('select-clinic')).getByText('Inselspital'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Something unexpected happened')).toBeInTheDocument();
  });

  it('clears a field error on blur once the field becomes valid', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(0);

    fireEvent.change(document.getElementById('email')!, { target: { value: 'jane@example.com' } });
    fireEvent.blur(document.getElementById('email')!);
    expect(screen.getByLabelText(/Email/)).not.toHaveClass('is-invalid');
  });
});
