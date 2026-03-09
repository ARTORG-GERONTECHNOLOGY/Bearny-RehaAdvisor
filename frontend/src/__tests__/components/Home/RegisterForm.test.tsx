import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormRegister from '@/components/HomePage/RegisteringForm';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

// Mock react-select to use standard select elements
jest.mock('react-select', () => {
  return ({ options, onChange, isMulti, value, id, isDisabled }: any) => {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (isMulti) {
        const selected = Array.from(e.target.selectedOptions || []).map((opt: any) => ({
          value: opt.value,
          label: opt.text || opt.value,
        }));
        onChange(selected);
      } else {
        const selected = e.target.value;
        onChange({ value: selected, label: selected });
      }
    };

    const currentValues = isMulti ? (value || []).map((v: any) => v.value) : value?.value || '';

    return (
      <select
        id={id}
        aria-label={id}
        multiple={isMulti}
        onChange={handleChange}
        value={currentValues}
        disabled={isDisabled}
      >
        {options?.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  };
});

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

const mockApiPost = apiClient.post as jest.Mock;

describe('FormRegister - ErrorAlert behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays and dismisses ErrorAlert on registration error', async () => {
    const user = userEvent.setup();

    mockApiPost.mockRejectedValueOnce({
      response: {
        data: { error: 'Email already exists' },
      },
    });

    render(<FormRegister show={true} handleRegShow={jest.fn()} />);

    // Step 1: Fill required fields on Personal Information step
    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone/i), '1234567890');
    await user.type(screen.getByLabelText(/^Password/i), 'ValidPass1!');
    await user.type(screen.getByLabelText(/Repeat Password/i), 'ValidPass1!');
    await user.selectOptions(screen.getByLabelText(/User Type/i), 'Therapist');

    // Click Next to go to step 2
    await user.click(screen.getByRole('button', { name: /Next/i }));

    // Step 2: Wait for specialisation field and fill required multi-select fields
    await waitFor(() => expect(screen.getByLabelText(/Specialisation/i)).toBeInTheDocument());

    const specialisationSelect = screen.getByLabelText(/Specialisation/i);
    const clinicSelect = screen.getByLabelText(/Clinics/i);
    const projectsSelect = screen.getByLabelText(/Projects/i);

    // Use userEvent to select options in multi-select
    await user.selectOptions(specialisationSelect, ['Cardiology']);
    await user.selectOptions(clinicSelect, ['Berner Reha Centrum']);
    await user.selectOptions(projectsSelect, ['COPAIN']);

    // Click Submit button on final step
    const submitButton = screen.getByRole('button', { name: /Submit/i });
    await user.click(submitButton);

    // Wait for error to appear
    await waitFor(() => expect(screen.getByText('Email already exists')).toBeInTheDocument(), {
      timeout: 3000,
    });

    // Find all Close buttons and click the one inside the alert (not the modal header)
    const closeButtons = screen.getAllByRole('button', { name: /Close/i });
    // The error alert close button should be the 2nd one (first is modal header)
    await user.click(closeButtons[1]);

    // Verify error is dismissed
    await waitFor(() => expect(screen.queryByText('Email already exists')).not.toBeInTheDocument());
  });
});
