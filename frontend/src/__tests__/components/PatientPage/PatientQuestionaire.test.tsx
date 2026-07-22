import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientQuestionaire from '@/components/PatientPage/PatientQuestionaire';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';

beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

jest.mock('@/api/client', () => ({
  post: jest.fn(),
}));

jest.mock('../../../config/config.json', () => ({
  PatientInitialQuestionaire: [
    {
      title: 'Life Style Information',
      fields: [
        {
          name: 'professionalStatus',
          label: 'Professional Status',
          type: 'dropdown',
          required: false,
          options: ['Employed', 'Unemployed'],
          be_name: 'professional_status',
        },
        {
          name: 'lifestyle',
          label: 'Lifestyle',
          type: 'multi-select',
          required: false,
          options: ['Active', 'Sedentary'],
          be_name: 'lifestyle',
        },
        {
          name: 'lifeGoals',
          label: 'Life Goals',
          type: 'text',
          required: false,
          be_name: 'personal_goals',
        },
        {
          name: 'birthDate',
          label: 'Birth Date',
          type: 'date',
          required: false,
          be_name: 'birth_date',
        },
        {
          name: 'notes',
          label: 'Notes',
          type: 'textarea',
          required: false,
          placeholder: 'Tell us more',
          be_name: 'notes',
          help: 'Optional context',
        },
        {
          name: 'noOptionsMulti',
          label: 'No Options Multi',
          type: 'multi-select',
          required: false,
          be_name: 'no_options_multi',
        },
        {
          label: 'Unkeyed Field',
          type: 'text',
        },
      ],
    },
  ],
}));

const mockReactSelect = jest.fn();

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, id, styles }: any) => {
    mockReactSelect({ styles });
    return (
      <div data-testid={`select-${id}`}>
        {(options || []).map((o: any) => {
          const selected = (value || []).some((v: any) => v.value === o.value);
          return (
            <button
              key={o.value}
              type="button"
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
        <button type="button" aria-label={`clear-${id}`} onClick={() => onChange(null)}>
          clear
        </button>
      </div>
    );
  },
}));

const mockPatientId = 'test-patient-id';

describe('PatientQuestionaire', () => {
  const renderComponent = () =>
    render(
      <I18nextProvider i18n={i18n}>
        <PatientQuestionaire show={true} handleClose={jest.fn()} patient_id={mockPatientId} />
      </I18nextProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders form fields from config and submits data', async () => {
    renderComponent();

    await screen.findByText('Initial Questionnaire');
    expect(screen.getByText('Life Style Information')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Life Goals'), {
      target: { value: 'Gain Muscle' },
    });

    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        `/users/${mockPatientId}/initial-questionaire/`,
        expect.objectContaining({
          personal_goals: 'Gain Muscle',
        })
      )
    );
  });

  it('displays loading spinner if no patient_id', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <PatientQuestionaire show={true} handleClose={jest.fn()} patient_id={null} />
      </I18nextProvider>
    );

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('submits multi-select, date and textarea field values', async () => {
    renderComponent();
    await screen.findByText('Initial Questionnaire');

    fireEvent.click(within(screen.getByTestId('select-lifestyle')).getByText('Active'));
    fireEvent.change(document.getElementById('birth_date')!, { target: { value: '1990-05-01' } });
    fireEvent.change(document.getElementById('notes')!, { target: { value: 'Some notes' } });

    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        `/users/${mockPatientId}/initial-questionaire/`,
        expect.objectContaining({
          lifestyle: ['Active'],
          birth_date: '1990-05-01',
          notes: 'Some notes',
        })
      )
    );
  });

  it('closes the modal when the backend responds with success', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });
    const handleClose = jest.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <PatientQuestionaire show={true} handleClose={handleClose} patient_id={mockPatientId} />
      </I18nextProvider>
    );
    await screen.findByText('Initial Questionnaire');

    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => expect(handleClose).toHaveBeenCalled());
  });

  it('shows field errors, non-field errors and details when the backend responds with success=false', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        success: false,
        message: 'Validation failed',
        field_errors: { personal_goals: ['Too long'] },
        non_field_errors: ['General issue'],
        details: 'Extra debug info',
      },
    });

    renderComponent();
    await screen.findByText('Initial Questionnaire');
    fireEvent.click(screen.getByText('Submit'));

    // Note: ErrorAlert doesn't forward its `children` prop, so the
    // non-field-errors list and `details` block this component passes as
    // children never actually render — only the top-level `message` does.
    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByText('Too long')).toBeInTheDocument();
  });

  it('shows a field-level error for a multi-select field', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        success: false,
        message: 'Validation failed',
        field_errors: { lifestyle: ['Pick at least one'] },
      },
    });

    renderComponent();
    await screen.findByText('Initial Questionnaire');
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('Pick at least one')).toBeInTheDocument();
  });

  it('shows a network error message when the request throws', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Network down'));

    renderComponent();
    await screen.findByText('Initial Questionnaire');
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('dismisses the top-level error banner', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Network down'));

    renderComponent();
    await screen.findByText('Initial Questionnaire');
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('Network down')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close alert' }));
    expect(screen.queryByText('Network down')).not.toBeInTheDocument();
  });

  it('clears the multi-select value when the selection is cleared', async () => {
    renderComponent();
    await screen.findByText('Initial Questionnaire');

    fireEvent.click(within(screen.getByTestId('select-lifestyle')).getByText('Active'));
    fireEvent.click(screen.getByLabelText('clear-lifestyle'));
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        `/users/${mockPatientId}/initial-questionaire/`,
        expect.objectContaining({ lifestyle: [] })
      )
    );
  });

  it('renders a multi-select field with no configured options as empty', async () => {
    renderComponent();
    await screen.findByText('Initial Questionnaire');

    const noOptionsSelect = screen.getByTestId('select-no_options_multi');
    expect(within(noOptionsSelect).queryAllByRole('button').length).toBe(1); // just the clear button
  });

  it('renders a field with no be_name using a fallback React key without crashing', async () => {
    renderComponent();
    await screen.findByText('Initial Questionnaire');
    expect(screen.getByText('Unkeyed Field')).toBeInTheDocument();
  });

  it('falls back to a generic message when the backend responds success=false with no message', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: { success: false },
    });

    renderComponent();
    await screen.findByText('Initial Questionnaire');
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('Failed to submit questionnaire.')).toBeInTheDocument();
  });

  it('falls back to a generic message when a rejected request carries no message at all', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({});

    renderComponent();
    await screen.findByText('Initial Questionnaire');
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('An unexpected error occurred.')).toBeInTheDocument();
  });

  it('shows a backend error message from the response payload on rejection', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Server exploded' } },
    });

    renderComponent();
    await screen.findByText('Initial Questionnaire');
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  it('builds react-select style overrides for the control, value container, input, indicators and menu portal', async () => {
    mockReactSelect.mockClear();
    renderComponent();
    await screen.findByText('Initial Questionnaire');

    const { styles } = mockReactSelect.mock.calls[0][0];

    const base = { boxShadow: 'none', borderColor: '#ccc' };
    const focused = styles.control(base, { isFocused: true });
    expect(focused.boxShadow).toBe('0 0 0 0.2rem rgba(13,110,253,.25)');
    expect(focused.borderColor).toBe('#86b7fe');

    const unfocused = styles.control(base, { isFocused: false });
    expect(unfocused.boxShadow).toBe('none');
    expect(unfocused.borderColor).toBe('#ccc');

    expect(styles.valueContainer({ padding: 0 }).height).toBe(44);
    expect(styles.input({ margin: 4 }).margin).toBe(0);
    expect(styles.indicatorsContainer({}).height).toBe(44);
    expect(styles.menuPortal({}).zIndex).toBe(9999);
    // The Sheet (Radix Dialog) this form renders in sets
    // document.body.style.pointerEvents = 'none' while open, exempting only
    // its own content — react-select's menu portals separately to
    // document.body, so without this override every option is unclickable.
    expect(styles.menuPortal({}).pointerEvents).toBe('auto');
  });

  it('selects a dropdown value and submits it', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Initial Questionnaire');

    await user.click(screen.getByRole('combobox', { name: 'Professional Status' }));
    await user.click(await screen.findByRole('option', { name: 'Employed' }));
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        `/users/${mockPatientId}/initial-questionaire/`,
        expect.objectContaining({ professional_status: 'Employed' })
      )
    );
  });
});
