import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../../../test-utils/renderWithRouter';
import FormRegister from '../RegisteringForm';

// ---------- Mocks ----------
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Simplify Bootstrap Modal: render children only when show=true
jest.mock('react-bootstrap', () => {
  const actual = jest.requireActual('react-bootstrap');
  return {
    ...actual,
    Modal: ({ show, children }: any) => (show ? <div data-testid="modal">{children}</div> : null),
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Spinner: () => <span data-testid="spinner" />,
  };
});

// Mock config.json used by FormRegister (keep it minimal + deterministic)
jest.mock('../../../config/config.json', () => ({
  therapistInfo: {
    specializations: ['Orthopaedics', 'Cardiology'],
    projects: ['P1', 'P2', 'P3'],
    clinic_projects: {
      ClinicA: ['P1', 'P2'],
      ClinicB: ['P3'],
    },
  },
  patientInfo: {
    functionPat: {
      Orthopaedics: ['DxA', 'DxB'],
      Cardiology: ['DxC'],
    },
  },
  TherapistForm: [
    {
      title: 'Step 1',
      fields: [
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'repeatPassword', label: 'Repeat', type: 'password', required: true },
      ],
    },
    {
      title: 'Step 2',
      fields: [
        { name: 'clinic', label: 'Clinic', type: 'multi-select', required: true },
        { name: 'projects', label: 'Projects', type: 'multi-select', required: false },
      ],
    },
  ],
}));

// Mock api client
const apiPost = jest.fn();
jest.mock('../../../api/client', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => apiPost(...args),
    get: jest.fn(),
  },
}));

/**
 * Mock react-select as a very simple multi-select:
 * - renders a list of "options" buttons for selecting
 * - calls onChange([{value,label}, ...]) each click
 * - shows disabled state
 */
jest.mock('react-select', () => {
  return function ReactSelectMock(props: any) {
    const { id, options = [], value = [], isDisabled, placeholder, onChange } = props;

    const selectedValues = Array.isArray(value) ? value.map((v: any) => v.value) : [];

    return (
      <div>
        <div data-testid={`select-${id}-disabled`}>{String(!!isDisabled)}</div>
        <div data-testid={`select-${id}-placeholder`}>{placeholder || ''}</div>

        <div data-testid={`select-${id}-selected`}>{selectedValues.join(',')}</div>

        {!isDisabled &&
          options.map((opt: any) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                const next = Array.from(new Set([...selectedValues, opt.value]));
                onChange(next.map((v) => ({ value: v, label: v })));
              }}
            >
              {opt.label}
            </button>
          ))}

        {!isDisabled && (
          <button
            type="button"
            onClick={() => {
              // clear selection
              onChange(null);
            }}
          >
            clear-{id}
          </button>
        )}
      </div>
    );
  };
});

describe('FormRegister', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiPost.mockReset();
  });

  function renderOpen() {
    const handleRegShow = jest.fn();
    renderWithRouter(<FormRegister show={true} handleRegShow={handleRegShow} />);
    return { handleRegShow };
  }

  it('blocks Next if required fields are missing and shows required errors', async () => {
    renderOpen();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(0);
  });

  it('projects multi-select is disabled until clinic selected', async () => {
    renderOpen();

    // Step 1: fill valid credentials to go Next
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.change(screen.getByLabelText('repeatPassword'), { target: { value: 'Aa1!aaaa' } });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2 now
    expect(screen.getByTestId('select-projects-disabled')).toHaveTextContent('true');
    expect(screen.getByTestId('select-projects-placeholder')).toHaveTextContent(
      'Select clinic(s) first...'
    );
  });

  it('selecting a clinic enables projects and filters allowed projects; changing clinic prunes projects', async () => {
    renderOpen();

    // Step 1 valid
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.change(screen.getByLabelText('repeatPassword'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Select clinic "ClinicA"
    fireEvent.click(screen.getByRole('button', { name: 'ClinicA' }));

    await waitFor(() => {
      expect(screen.getByTestId('select-projects-disabled')).toHaveTextContent('false');
    });

    // Now allowed projects should include P1/P2 (buttons exist), and not P3
    expect(screen.getByRole('button', { name: 'P1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'P2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'P3' })).not.toBeInTheDocument();

    // Select project P1
    fireEvent.click(screen.getByRole('button', { name: 'P1' }));
    expect(screen.getByTestId('select-projects-selected')).toHaveTextContent('P1');

    // Change clinic to ClinicB (clearing then selecting B)
    fireEvent.click(screen.getByRole('button', { name: 'clear-clinic' }));
    fireEvent.click(screen.getByRole('button', { name: 'ClinicB' }));

    // Now allowed project list should be P3; P1 should be pruned from selection
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'P3' })).toBeInTheDocument();
      expect(screen.getByTestId('select-projects-selected')).toHaveTextContent(''); // pruned
    });
  });

  it('submit success shows success banner and disables form', async () => {
    apiPost.mockResolvedValueOnce({ status: 201, data: {} });

    renderOpen();

    // Step 1 valid
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.change(screen.getByLabelText('repeatPassword'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: choose clinic
    fireEvent.click(screen.getByRole('button', { name: 'ClinicA' }));

    // Now we are on last step; button should be "Submit"
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/register/', expect.any(Object));
      expect(
        screen.getByText('You have been registered. Account info will be emailed after approval.')
      ).toBeInTheDocument();
    });
  });

  it('server 400 displays extracted error message in banner', async () => {
    apiPost.mockRejectedValueOnce({
      response: { status: 400, data: { email: ['Email already exists'] } },
    });

    renderOpen();

    // Step 1 valid
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.change(screen.getByLabelText('repeatPassword'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: choose clinic
    fireEvent.click(screen.getByRole('button', { name: 'ClinicA' }));

    // submit
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText('Email already exists')).toBeInTheDocument();
    });
  });

  it('server 500 shows busy message and status code in banner', async () => {
    apiPost.mockRejectedValueOnce({
      response: { status: 500, data: { detail: 'Internal error' } },
    });

    renderOpen();

    // Step 1 valid
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.change(screen.getByLabelText('repeatPassword'), { target: { value: 'Aa1!aaaa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: choose clinic
    fireEvent.click(screen.getByRole('button', { name: 'ClinicA' }));

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(
        screen.getByText(/The server is busy or temporarily unavailable/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Error/i)).toBeInTheDocument();
    });
  });

  it('closing with unsaved changes prompts confirm; cancel keeps modal open', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderOpen();

    // Type something to create unsaved changes
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'a@b.com' } });

    // Trigger close: easiest is Escape (component listens + confirmClose)
    fireEvent.keyDown(window, { key: 'Escape' });

    // confirm was asked
    expect(confirmSpy).toHaveBeenCalled();

    // modal still visible
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
