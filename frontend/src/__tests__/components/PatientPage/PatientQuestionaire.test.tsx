import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
      ],
    },
  ],
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
});
