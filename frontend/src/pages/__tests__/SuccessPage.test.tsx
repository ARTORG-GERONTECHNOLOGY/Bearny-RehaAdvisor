import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test-utils/renderWithRouter';
import SuccessPage from '../SuccessPage';

// ---- i18n mock ----
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// ---- react-router location mock (we control location.search) ----
let mockSearch = '';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ search: mockSearch }),
  };
});

// ---- lightweight bootstrap mocks ----
jest.mock('react-bootstrap', () => ({
  Container: ({ children }: any) => <div data-testid="container">{children}</div>,
  Row: ({ children }: any) => <div data-testid="row">{children}</div>,
  Col: ({ children }: any) => <div data-testid="col">{children}</div>,
  Alert: ({ children }: any) => <div role="alert">{children}</div>,
}));

describe('SuccessPage', () => {
  beforeEach(() => {
    mockSearch = '';
    jest.clearAllMocks();
  });

  it('renders default success message when no query param is provided', () => {
    mockSearch = ''; // no ?message=

    renderWithRouter(<SuccessPage />);

    expect(screen.getByText('Success')).toBeInTheDocument();

    expect(
      screen.getByText('Your Fitbit account has been successfully connected.')
    ).toBeInTheDocument();

    expect(screen.getByText('You can now close this window.')).toBeInTheDocument();
  });

  it('renders custom message from ?message= query parameter', () => {
    mockSearch = '?message=Fitbit%20linked%20successfully';

    renderWithRouter(<SuccessPage />);

    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Fitbit linked successfully')).toBeInTheDocument();
  });

  it('handles empty message param by falling back to default (current implementation)', () => {
    // NOTE: In current code, queryParams.get('message') returns '' (empty string) which is falsy,
    // so it falls back to default. This test ensures that behavior doesn't regress.
    mockSearch = '?message=';

    renderWithRouter(<SuccessPage />);

    expect(
      screen.getByText('Your Fitbit account has been successfully connected.')
    ).toBeInTheDocument();
  });

  it('mounts basic layout containers (smoke)', () => {
    mockSearch = '?message=OK';

    renderWithRouter(<SuccessPage />);

    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByTestId('row')).toBeInTheDocument();
    expect(screen.getByTestId('col')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
