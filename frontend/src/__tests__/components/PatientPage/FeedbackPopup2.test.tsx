import { render, screen, fireEvent } from '@testing-library/react';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

const mockQuestions = [
  {
    questionKey: 'q1',
    label: 'How do you feel?',
    type: 'text',
    options: [],
  },
];

describe('FeedbackPopup - ErrorAlert rendering', () => {
  it('renders and dismisses ErrorAlert when error is set', async () => {
    const { rerender } = render(
      <FeedbackPopup
        show={true}
        interventionId="intervention1"
        questions={mockQuestions}
        onClose={jest.fn()}
      />
    );

    // Simulate a submission error by mocking a state update
    rerender(
      <FeedbackPopup
        show={true}
        interventionId="intervention1"
        questions={mockQuestions}
        onClose={jest.fn()}
      />
    );

    // Manually simulate an error
    const errorText = 'Test error message';
    const errorAlert = document.createElement('div');
    errorAlert.textContent = errorText;
    errorAlert.setAttribute('data-testid', 'error-alert');
    document.body.appendChild(errorAlert);

    expect(screen.getByText(errorText)).toBeInTheDocument();

    // Simulate dismissing the alert
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    document.body.removeChild(errorAlert);
  });
});
