// src/__tests__/pages/UnauthorizedAccess.test.tsx
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import UnauthorizedAccess from '@/pages/UnauthorizedAccess';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('react-bootstrap', () => ({
  Container: ({ children }: any) => <div data-testid="container">{children}</div>,
  Row: ({ children }: any) => <div data-testid="row">{children}</div>,
  Col: ({ children }: any) => <div data-testid="col">{children}</div>,
  Card: Object.assign(({ children }: any) => <div data-testid="card">{children}</div>, {
    Body: ({ children }: any) => <div data-testid="card-body">{children}</div>,
  }),
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

describe('UnauthorizedAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title, message, and buttons', () => {
    renderWithRouter(<UnauthorizedAccess />);

    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    expect(screen.getByText('You do not have permission to access this page.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument();
  });

  it('clicking "Go back" navigates -1', () => {
    renderWithRouter(<UnauthorizedAccess />);

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('clicking "Go home" navigates to /', () => {
    renderWithRouter(<UnauthorizedAccess />);

    fireEvent.click(screen.getByRole('button', { name: 'Go home' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('renders layout containers/cards (smoke)', () => {
    renderWithRouter(<UnauthorizedAccess />);

    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByTestId('row')).toBeInTheDocument();
    expect(screen.getByTestId('col')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-body')).toBeInTheDocument();
  });
});
