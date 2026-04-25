import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import FitbitErrorPage from '@/pages/FitbitErrorPage';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

let mockSearch = '';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ search: mockSearch }),
  };
});

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div data-testid="layout">{children}</div>,
}));

jest.mock('@/components/Card', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div data-testid="card">{children}</div>,
}));

describe('FitbitErrorPage', () => {
  beforeEach(() => {
    mockSearch = '';
    jest.clearAllMocks();
  });

  it('renders default error message when no query param is provided', () => {
    renderWithRouter(<FitbitErrorPage />);

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(
      screen.getByText('There was a problem connecting your Fitbit account.')
    ).toBeInTheDocument();
    expect(screen.getByText('Please close this window and try again.')).toBeInTheDocument();
  });

  it('renders custom error message from ?message= query parameter', () => {
    mockSearch = '?message=Fitbit%20connection%20failed';

    renderWithRouter(<FitbitErrorPage />);

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Fitbit connection failed')).toBeInTheDocument();
  });

  it('falls back to default message when ?message= is empty', () => {
    mockSearch = '?message=';

    renderWithRouter(<FitbitErrorPage />);

    expect(
      screen.getByText('There was a problem connecting your Fitbit account.')
    ).toBeInTheDocument();
  });

  it('renders layout wrappers (smoke)', () => {
    mockSearch = '?message=Custom';

    renderWithRouter(<FitbitErrorPage />);

    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });
});
