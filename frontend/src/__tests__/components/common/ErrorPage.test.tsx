import { render, screen, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import ErrorPage from '@/pages/ErrorPage';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseRouteError = jest.fn();
const mockIsRouteErrorResponse = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useRouteError: () => mockUseRouteError(),
  isRouteErrorResponse: (error: unknown) => mockIsRouteErrorResponse(error),
}));

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div data-testid="layout">{children}</div>,
}));

jest.mock('@/components/Card', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div data-testid="card">{children}</div>,
}));

const mockCaptureException = jest.fn().mockReturnValue('test-event-id');
const mockGetFeedback = jest.fn().mockReturnValue(null);

jest.mock('@sentry/react', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  getFeedback: () => mockGetFeedback(),
}));

describe('ErrorPage', () => {
  beforeEach(() => {
    mockUseRouteError.mockReturnValue(undefined);
    mockIsRouteErrorResponse.mockReturnValue(false);
    jest.clearAllMocks();
    mockCaptureException.mockReturnValue('test-event-id');
    mockGetFeedback.mockReturnValue(null);
  });

  it('renders the default fallback message when there is no route error', () => {
    render(<ErrorPage />);

    expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument();
    expect(screen.getByText('Something went wrong. Please try again later.')).toBeInTheDocument();
  });

  it('renders a route error response status text when available', () => {
    const routeError = { statusText: 'Not Found' };
    mockUseRouteError.mockReturnValue(routeError);
    mockIsRouteErrorResponse.mockReturnValue(true);

    render(<ErrorPage />);

    expect(screen.getByText('Not Found')).toBeInTheDocument();
  });

  it('renders an Error message for runtime errors', () => {
    mockUseRouteError.mockReturnValue(new Error('Unexpected crash'));

    render(<ErrorPage />);

    expect(screen.getByText('Unexpected crash')).toBeInTheDocument();
  });

  it('renders the layout wrappers', () => {
    render(<ErrorPage />);

    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  it('calls captureException with the error when useRouteError returns an Error', async () => {
    const error = new Error('Unexpected crash');
    mockUseRouteError.mockReturnValue(error);

    await act(async () => {
      render(<ErrorPage />);
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('does not call captureException when there is no Error', async () => {
    mockUseRouteError.mockReturnValue(undefined);

    await act(async () => {
      render(<ErrorPage />);
    });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('does not call captureException for a route error response', async () => {
    mockUseRouteError.mockReturnValue({ statusText: 'Not Found' });
    mockIsRouteErrorResponse.mockReturnValue(true);

    await act(async () => {
      render(<ErrorPage />);
    });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
