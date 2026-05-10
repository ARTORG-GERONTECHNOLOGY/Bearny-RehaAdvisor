// src/__tests__/pages/UnauthorizedAccess.test.tsx
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import UnauthorizedAccess from '@/pages/UnauthorizedAccess';
import '@testing-library/jest-dom';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

jest.mock('@/components/Card', () => ({
  __esModule: true,
  default: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
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

  it('renders layout and card (smoke)', () => {
    renderWithRouter(<UnauthorizedAccess />);

    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });
});
