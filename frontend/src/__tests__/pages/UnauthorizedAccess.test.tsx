// src/__tests__/pages/UnauthorizedAccess.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UnauthorizedAccess from '../../pages/UnauthorizedAccess';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock Header and Footer
jest.mock('../../components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('../../components/common/Footer', () => () => <div>Mock Footer</div>);

// Mock useTranslation
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('UnauthorizedAccess Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders all static content', () => {
    render(
      <MemoryRouter>
        <UnauthorizedAccess />
      </MemoryRouter>
    );

    expect(screen.getByText('Unauthorized Access')).toBeInTheDocument();
    expect(screen.getByText('You do not have permission to access this page.')).toBeInTheDocument();
    expect(screen.getByText('Go Back')).toBeInTheDocument();
    expect(screen.getByText('Go to Home')).toBeInTheDocument();
    expect(screen.getByText('Mock Header')).toBeInTheDocument();
    expect(screen.getByText('Mock Footer')).toBeInTheDocument();
  });

  test('clicking "Go Back" calls navigate(-1)', () => {
    render(
      <MemoryRouter>
        <UnauthorizedAccess />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Go Back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  test('clicking "Go to Home" navigates to root path', () => {
    render(
      <MemoryRouter>
        <UnauthorizedAccess />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Go to Home'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
