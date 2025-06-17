import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginForm from '../../../components/HomePage/LoginForm';
import authStore from '../../../stores/authStore';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (str: string) => str }),
}));

jest.mock('../../../stores/authStore', () => ({
  __esModule: true,
  default: {
    email: '',
    password: '',
    loginErrorMessage: '',
    setEmail: jest.fn(),
    setPassword: jest.fn(),
    reset: jest.fn(),
    loginWithHttp: jest.fn(),
    setAuthenticated: jest.fn(),
    userType: 'Therapist',
    id: '123',
    loginError: '',
  },
}));

describe('LoginForm - ErrorAlert integration', () => {
  const setup = (props = {}) =>
    render(<LoginForm show={true} handleClose={jest.fn()} pageType="regular" {...props} />);

  it('displays ErrorAlert when error is set', async () => {
    authStore.loginWithHttp.mockImplementation(() => {
      throw new Error('Invalid credentials');
    });

    setup();

    fireEvent.submit(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
  });

  it('hides ErrorAlert when dismiss button is clicked', async () => {
    authStore.loginWithHttp.mockImplementation(() => {
      throw new Error('Invalid credentials');
    });

    setup();

    fireEvent.submit(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
  });
});
