import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FormRegister from '../../../components/HomePage/RegisteringForm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

jest.mock('../../../api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(() =>
      Promise.reject({
        response: {
          data: { error: 'Email already exists' },
        },
      })
    ),
  },
}));

describe('FormRegister - ErrorAlert behavior', () => {
  it('displays and dismisses ErrorAlert on registration error', async () => {
    render(<FormRegister show={true} handleRegShow={jest.fn()} />);

    // Simulate Submit button click on the final step
    const submitButton = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitButton);

    await waitFor(() => expect(screen.getByText('Email already exists')).toBeInTheDocument());

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => expect(screen.queryByText('Email already exists')).not.toBeInTheDocument());
  });
});
