// src/__tests__/components/TherapistPatient/RegisterPatientForm.test.tsx
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FormRegisterPatient from '@/components/AddPatient/RegisterPatientForm';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(() => Promise.resolve({ data: { clinics: [], projects: [] } })),
  },
}));

// Mock react-select with a lightweight stand-in: one button per option that
// toggles it in/out of the current selection, so handleMultiSelectChange gets
// exercised the same way a real multi-select interaction would drive it.
jest.mock('react-select', () => (props: any) => (
  <div data-testid={`select-${props.inputId}`}>
    {props.options.map((opt: { value: string; label: string }) => {
      const current = props.value || [];
      const isSelected = current.some((v: any) => v.value === opt.value);
      return (
        <button
          key={opt.value}
          type="button"
          data-selected={isSelected}
          onClick={() => {
            const next = isSelected
              ? current.filter((v: any) => v.value !== opt.value)
              : [...current, opt];
            props.onChange(next);
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
));

const renderComponent = () =>
  render(
    <MemoryRouter>
      <FormRegisterPatient therapist="therapist1" />
    </MemoryRouter>
  );

const fillStep0 = () => {
  fireEvent.change(screen.getByLabelText(/^Email Address/i), {
    target: { value: 'test@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/^Password/i, { selector: 'input[id="password"]' }), {
    target: { value: 'password123' },
  });
  fireEvent.change(screen.getByLabelText(/^Confirm Password/i), {
    target: { value: 'password123' },
  });
  fireEvent.change(screen.getByLabelText(/^Last Name/i), { target: { value: 'Tim' } });
  fireEvent.change(screen.getByLabelText(/^First Name/i), { target: { value: 'Tim' } });
};

const goToStep1 = async () => {
  fillStep0();
  fireEvent.click(screen.getByText('Next'));
  await screen.findByLabelText(/^Birth Date/i);
};

const goToStep2 = async () => {
  await goToStep1();
  fireEvent.change(screen.getByLabelText(/^Birth Date/i), { target: { value: '1990-01-01' } });
  fireEvent.change(screen.getByLabelText(/^Gender/i), { target: { value: 'Male' } });
  fireEvent.change(screen.getByLabelText(/Patient Code/i), { target: { value: 'PAT-1' } });
  fireEvent.change(screen.getByLabelText(/^Clinic/i), { target: { value: 'Inselspital' } });
  fireEvent.change(screen.getByLabelText(/^Project/i), { target: { value: 'COPAIN' } });
  fireEvent.click(screen.getByText('Next'));
  await screen.findByTestId('select-function');
};

describe('FormRegisterPatient Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { clinics: ['Inselspital', 'Berner Reha Centrum'], projects: ['COPAIN', 'COMPASS'] },
    });
  });

  it('renders the first step correctly', () => {
    renderComponent();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      /Personal Information|Patient Information/i
    );
  });

  it('shows validation errors if required fields are empty on next', async () => {
    renderComponent();
    fireEvent.click(screen.getByText(/Next/i));
    await waitFor(() => {
      expect(screen.getAllByText(/is required/i).length).toBeGreaterThan(0);
    });
  });

  it('navigates forward and backward between steps', async () => {
    renderComponent();
    fillStep0();
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Back')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      /Personal Information|Patient Information/i
    );
  });

  it('validates email and phone formats', async () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText(/^Email Address/i), {
      target: { value: 'invalid-email' },
    });
    fireEvent.change(screen.getByLabelText(/^Phone Number/i), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText(/Next/i));

    await waitFor(() => {
      expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
      expect(screen.getByText(/Invalid phone number/i)).toBeInTheDocument();
    });
  });

  it('requires matching passwords', async () => {
    renderComponent();
    fillStep0();
    fireEvent.change(screen.getByLabelText(/^Confirm Password/i), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('toggles the initial questionnaire checkbox', () => {
    renderComponent();
    const checkbox = document.getElementById('initialQuestionnaireEnabled') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  describe('Birth date validation (step 2)', () => {
    // Native <input type="date"> rejects non-YYYY-MM-DD strings at the DOM level
    // (jsdom mirrors real browsers here), so the free-text invalid-format branch
    // isn't reachable through this field; future-date and unrealistic-age below
    // exercise the validation that *is* reachable via the date picker.
    it('flags a birth date in the future', async () => {
      renderComponent();
      await goToStep1();
      const birthDate = screen.getByLabelText(/^Birth Date/i);
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      fireEvent.change(birthDate, { target: { value: future.toISOString().slice(0, 10) } });
      fireEvent.blur(birthDate);
      expect(await screen.findByText(/cannot be in the future/i)).toBeInTheDocument();
    });

    it('flags an unrealistic age (> 120 years)', async () => {
      renderComponent();
      await goToStep1();
      const birthDate = screen.getByLabelText(/^Birth Date/i);
      fireEvent.change(birthDate, { target: { value: '1850-01-01' } });
      fireEvent.blur(birthDate);
      expect(await screen.findByText(/realistic birth date/i)).toBeInTheDocument();
    });

    it('clears the error once a valid date is entered', async () => {
      renderComponent();
      await goToStep1();
      const birthDate = screen.getByLabelText(/^Birth Date/i);
      fireEvent.change(birthDate, { target: { value: '1850-01-01' } });
      fireEvent.blur(birthDate);
      await screen.findByText(/realistic birth date/i);

      fireEvent.change(birthDate, { target: { value: '1990-01-01' } });
      fireEvent.blur(birthDate);
      await waitFor(() => {
        expect(screen.queryByText(/realistic birth date/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Clinic/Project dynamic dropdowns', () => {
    it('populates the clinic dropdown from the therapist profile response', async () => {
      renderComponent();
      await goToStep1();
      const clinicSelect = screen.getByLabelText(/^Clinic/i) as HTMLSelectElement;
      const optionLabels = Array.from(clinicSelect.options).map((o) => o.value);
      expect(optionLabels).toEqual(expect.arrayContaining(['Inselspital', 'Berner Reha Centrum']));
    });

    it('resets the project field when the clinic changes', async () => {
      renderComponent();
      await goToStep1();
      fireEvent.change(screen.getByLabelText(/^Clinic/i), { target: { value: 'Inselspital' } });
      fireEvent.change(screen.getByLabelText(/^Project/i), { target: { value: 'COPAIN' } });
      expect((screen.getByLabelText(/^Project/i) as HTMLSelectElement).value).toBe('COPAIN');

      fireEvent.change(screen.getByLabelText(/^Clinic/i), {
        target: { value: 'Berner Reha Centrum' },
      });
      expect((screen.getByLabelText(/^Project/i) as HTMLSelectElement).value).toBe('');
    });

    it('only offers projects allowed for the selected clinic', async () => {
      renderComponent();
      await goToStep1();
      fireEvent.change(screen.getByLabelText(/^Clinic/i), {
        target: { value: 'Berner Reha Centrum' },
      });

      const projectSelect = screen.getByLabelText(/^Project/i) as HTMLSelectElement;
      const values = Array.from(projectSelect.options).map((o) => o.value);
      expect(values).toContain('COPAIN');
      expect(values).not.toContain('COMPASS');
    });
  });

  describe('Speciality / Diagnosis multi-select (step 3)', () => {
    it('clears diagnosis when the speciality selection changes', async () => {
      renderComponent();
      await goToStep2();

      fireEvent.click(within(screen.getByTestId('select-function')).getByText('Cardiology'));
      await screen.findByTestId('select-diagnosis');
      fireEvent.click(within(screen.getByTestId('select-diagnosis')).getByText('Stroke'));
      expect(within(screen.getByTestId('select-diagnosis')).getByText('Stroke')).toHaveAttribute(
        'data-selected',
        'true'
      );

      // Deselecting the speciality clears the previously chosen diagnosis
      // (handleMultiSelectChange resets `diagnosis: []` whenever `function` changes).
      // With no speciality selected, diagnosis falls back to an empty option list,
      // so its absence here is direct evidence the value was cleared.
      fireEvent.click(within(screen.getByTestId('select-function')).getByText('Cardiology'));

      expect(
        within(screen.getByTestId('select-diagnosis')).queryByText('Stroke')
      ).not.toBeInTheDocument();
    });

    it('offers diagnosis options scoped to the selected specialities', async () => {
      renderComponent();
      await goToStep2();

      fireEvent.click(within(screen.getByTestId('select-function')).getByText('Cardiology'));
      const diagnosisOptions = screen.getByTestId('select-diagnosis');
      expect(within(diagnosisOptions).getByText('Stroke')).toBeInTheDocument();
      expect(within(diagnosisOptions).getByText('High blood pressure')).toBeInTheDocument();
      expect(within(diagnosisOptions).queryByText('Diabetes')).not.toBeInTheDocument();
    });
  });

  describe('Rehabilitation / study end date cross-validation', () => {
    it('flags a study end date before the rehabilitation end date on blur', async () => {
      renderComponent();
      await goToStep2();

      const rehaInput = screen.getByLabelText(/^Rehabilitation End Date/i);
      fireEvent.change(rehaInput, { target: { value: '2026-06-15' } });
      fireEvent.blur(rehaInput);

      const studyInput = screen.getByLabelText(/Study \/ After-Rehab/i);
      fireEvent.change(studyInput, { target: { value: '2026-06-01' } });
      fireEvent.blur(studyInput);

      expect(
        await screen.findByText(/Must be on or after the rehabilitation end date/i)
      ).toBeInTheDocument();
    });

    it('flags a rehabilitation end date after the study end date', async () => {
      renderComponent();
      await goToStep2();

      const studyInput = screen.getByLabelText(/Study \/ After-Rehab/i);
      fireEvent.change(studyInput, { target: { value: '2026-06-01' } });
      fireEvent.blur(studyInput);

      const rehaInput = screen.getByLabelText(/^Rehabilitation End Date/i);
      fireEvent.change(rehaInput, { target: { value: '2026-06-15' } });
      fireEvent.blur(rehaInput);

      expect(
        await screen.findByText(/Rehabilitation end date must be before the study end date/i)
      ).toBeInTheDocument();
    });
  });

  describe('Submission', () => {
    const fillMinimalValidForm = async () => {
      await goToStep2();
      fireEvent.click(within(screen.getByTestId('select-function')).getByText('Cardiology'));
      fireEvent.change(screen.getByLabelText(/^Rehabilitation End Date/i), {
        target: { value: '2026-06-01' },
      });
    };

    it('registers successfully and shows the patient ID + login link', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        status: 201,
        data: { id: 'PAT-123' },
      });

      renderComponent();
      await fillMinimalValidForm();
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/i }));

      expect(await screen.findByText(/The patient has been registered/i)).toBeInTheDocument();
      expect(screen.getByText('PAT-123')).toBeInTheDocument();
      expect(screen.getByText(/Click here to log in/i)).toBeInTheDocument();
    });

    it('shows a banner built from field_errors and jumps back to the offending step', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {
          data: {
            field_errors: { email: ['is already registered.'] },
          },
        },
      });

      renderComponent();
      await fillMinimalValidForm();
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/is already registered\./i);
      // Jumped back to step 0, which contains the "email" field
      expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
        /Personal Information|Patient Information/i
      );
      expect(screen.getByLabelText(/^Email Address/i)).toBeInTheDocument();
    });

    it('shows the raw backend message when there are no field_errors', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { message: 'Registration is temporarily disabled.' } },
      });

      renderComponent();
      await fillMinimalValidForm();
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/i }));

      expect(await screen.findByText('Registration is temporarily disabled.')).toBeInTheDocument();
    });

    it('falls back to a generic error message when nothing else is available', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error());

      renderComponent();
      await fillMinimalValidForm();
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/i }));

      expect(
        await screen.findByText(/An unexpected error occurred\. Please try again\./i)
      ).toBeInTheDocument();
    });

    it('clears the banner once the user edits a field again', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { message: 'Registration is temporarily disabled.' } },
      });

      renderComponent();
      await fillMinimalValidForm();
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/i }));
      await screen.findByText('Registration is temporarily disabled.');

      fireEvent.click(screen.getByText('Back'));
      fireEvent.click(screen.getByText('Back'));
      fireEvent.change(screen.getByLabelText(/^First Name/i), { target: { value: 'Timmy' } });

      expect(screen.queryByText('Registration is temporarily disabled.')).not.toBeInTheDocument();
    });
  });
});
