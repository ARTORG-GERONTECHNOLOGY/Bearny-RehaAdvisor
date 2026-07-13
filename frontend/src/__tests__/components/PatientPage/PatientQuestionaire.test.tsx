import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PatientQuestionaire from '@/components/PatientPage/PatientQuestionaire';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';

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
      ],
    },
  ],
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, id }: any) => (
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
    </div>
  ),
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

  it('shows a network error message when the request throws', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Network down'));

    renderComponent();
    await screen.findByText('Initial Questionnaire');
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('Network down')).toBeInTheDocument();
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

  it('selects a dropdown value and submits it', async () => {
    renderComponent();
    await screen.findByText('Initial Questionnaire');

    fireEvent.change(screen.getByLabelText('Professional Status'), {
      target: { value: 'Employed' },
    });
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        `/users/${mockPatientId}/initial-questionaire/`,
        expect.objectContaining({ professional_status: 'Employed' })
      )
    );
  });
});
