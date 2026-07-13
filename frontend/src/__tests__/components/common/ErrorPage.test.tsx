import { render, screen, act, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import ErrorPage from '@/pages/ErrorPage';

const mockUseRouteError = jest.fn();
const mockIsRouteErrorResponse = jest.fn();

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

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

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { email: 'user@example.com', firstName: 'Jane' },
}));

const mockCaptureException = jest.fn().mockReturnValue('test-event-id');
const mockGetFeedback = jest.fn().mockReturnValue(null);
const mockSetUser = jest.fn();

jest.mock('@sentry/react', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  getFeedback: () => mockGetFeedback(),
  setUser: (...args: unknown[]) => mockSetUser(...args),
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

  describe('Report Bug button', () => {
    it('is not rendered when Sentry feedback is unavailable', () => {
      render(<ErrorPage />);
      expect(screen.queryByText('Report Bug')).not.toBeInTheDocument();
    });

    it('opens the Sentry feedback form when clicked, creating and caching the form once', async () => {
      const appendToDom = jest.fn();
      const open = jest.fn();
      const createForm = jest
        .fn()
        .mockResolvedValue({ appendToDom, open, removeFromDom: jest.fn() });
      mockGetFeedback.mockReturnValue({ createForm });

      render(<ErrorPage />);
      const button = screen.getByText('Report Bug');

      await act(async () => {
        fireEvent.click(button);
      });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(createForm).toHaveBeenCalledTimes(1);
      expect(appendToDom).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledTimes(2);
      expect(mockSetUser).toHaveBeenCalledWith({
        email: 'user@example.com',
        username: 'Jane',
      });
    });

    it('tags the feedback form with the captured event id', async () => {
      const createForm = jest
        .fn()
        .mockResolvedValue({ appendToDom: jest.fn(), open: jest.fn(), removeFromDom: jest.fn() });
      mockGetFeedback.mockReturnValue({ createForm });
      mockUseRouteError.mockReturnValue(new Error('boom'));
      mockCaptureException.mockReturnValue('evt-123');

      render(<ErrorPage />);

      await act(async () => {
        fireEvent.click(screen.getByText('Report Bug'));
      });

      expect(createForm).toHaveBeenCalledWith({ tags: { error_event_id: 'evt-123' } });
    });
  });
});
