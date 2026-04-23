import { render, screen } from '@testing-library/react';
import WelcomeArea from '@/components/common/WelcomeArea';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    firstName: 'Alex',
    email: 'alex@example.com',
  },
}));

describe('WelcomeArea Component', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-04-30T08:00:00Z').getTime()); // Morning UTC
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders morning greeting and patient message', () => {
    render(<WelcomeArea user="patient" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Good Morning, Alex/i);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /Here are your recommendations for/i
    );
  });

  it('renders afternoon greeting for therapist', () => {
    jest.setSystemTime(new Date('2025-04-30T13:00:00').getTime()); // 1 PM
    render(<WelcomeArea user="therapist" />);
    expect(screen.getByText(/Good Afternoon, Alex/i)).toBeInTheDocument();
    expect(
      screen.getByText(/You can manage patients and review recommendations/i)
    ).toBeInTheDocument();
  });

  it('renders evening greeting', () => {
    jest.setSystemTime(new Date('2025-04-30T18:00:00').getTime()); // 6 PM
    render(<WelcomeArea user="therapist" />);
    expect(screen.getByText(/Good Evening, Alex/i)).toBeInTheDocument();
  });

  it('renders night greeting', () => {
    jest.setSystemTime(new Date('2025-04-30T23:00:00').getTime()); // 11 PM
    render(<WelcomeArea user="therapist" />);
    expect(screen.getByText(/Good Night, Alex/i)).toBeInTheDocument();
  });

  it('handles missing user type gracefully', () => {
    render(<WelcomeArea user="" />);
    expect(
      screen.getByText(/You can manage patients and review recommendations/i)
    ).toBeInTheDocument();
  });
});
