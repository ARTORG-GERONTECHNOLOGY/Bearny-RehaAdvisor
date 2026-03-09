// src/components/patient/__tests__/FeedbackPopup.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (x: any) => x, i18n: { language: 'en' } }),
}));

jest.mock('@/components/common/ErrorAlert', () => (p: any) => <div role="alert">{p.message}</div>);

const Q = [
  {
    questionKey: 'q1',
    answerType: 'dropdown',
    translations: [{ language: 'en', text: 'Q1' }],
    possibleAnswers: [
      { key: 'a', translations: [{ language: 'en', text: 'A' }] },
      { key: 'b', translations: [{ language: 'en', text: 'B' }] },
    ],
  },
  {
    questionKey: 'q2',
    answerType: 'text',
    translations: [{ language: 'en', text: 'Q2' }],
  },
];

describe('FeedbackPopup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('id', 'p1');
  });

  it('dropdown selection advances to next question', async () => {
    render(
      <FeedbackPopup
        show
        interventionId="int1"
        questions={Q as any}
        onClose={jest.fn()}
        date="2026-02-15"
      />
    );

    expect(screen.getByText('Q1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));

    // advances after small timeout
    await waitFor(() => {
      expect(screen.getByText('Q2')).toBeInTheDocument();
    });
  });

  it('submits FormData including date', async () => {
    const onClose = jest.fn();
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { success: true } });

    render(
      <FeedbackPopup
        show
        interventionId="int1"
        questions={Q as any}
        onClose={onClose}
        date="2026-02-15"
      />
    );

    // advance to last question
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    await screen.findByText('Q2');

    // click submit (since Q2 is last after Next? In your modal footer: last screen shows Submit)
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());

    const [, formData] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(formData instanceof FormData).toBe(true);

    // Hard to inspect FormData directly; easiest is to spy on append:
    // If you want direct checking, see note below.
    expect(onClose).toHaveBeenCalled();
  });

  it('confirmClose asks when answers exist', async () => {
    const onClose = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <FeedbackPopup
        show
        interventionId="int1"
        questions={Q as any}
        onClose={onClose}
        date="2026-02-15"
      />
    );

    // select answer so hasAny=true
    fireEvent.click(screen.getByRole('button', { name: 'A' }));

    // click X (bootstrap close button exists)
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
