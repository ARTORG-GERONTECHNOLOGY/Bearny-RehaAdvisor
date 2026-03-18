import { screen } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import TermsAndConditions from '@/pages/TermsAndConditions';

// --- mocks ---
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/components/common/Header', () => ({
  __esModule: true,
  default: ({ isLoggedIn }: any) => <div data-testid="header">logged:{String(isLoggedIn)}</div>,
}));

jest.mock('@/components/common/Footer', () => ({
  __esModule: true,
  default: () => <div data-testid="footer" />,
}));

// lightweight bootstrap mocks (stable DOM)
jest.mock('react-bootstrap', () => ({
  Container: ({ children }: any) => <div data-testid="container">{children}</div>,
  Row: ({ children }: any) => <div data-testid="row">{children}</div>,
  Col: ({ children }: any) => <div data-testid="col">{children}</div>,
  Card: Object.assign(({ children }: any) => <div data-testid="card">{children}</div>, {
    Body: ({ children }: any) => <div data-testid="card-body">{children}</div>,
  }),
}));

const authStoreMock = {
  isAuthenticated: false,
  checkAuthentication: jest.fn(),
};

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  get default() {
    return authStoreMock;
  },
}));

describe('TermsAndConditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
    authStoreMock.isAuthenticated = false;
  });

  it('calls authStore.checkAuthentication on mount', () => {
    renderWithRouter(<TermsAndConditions />);
    expect(authStoreMock.checkAuthentication).toHaveBeenCalledTimes(1);
  });

  it('renders header and footer', () => {
    renderWithRouter(<TermsAndConditions />);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('passes auth state to Header (logged out)', () => {
    authStoreMock.isAuthenticated = false;

    renderWithRouter(<TermsAndConditions />);

    expect(screen.getByTestId('header')).toHaveTextContent('logged:false');
  });

  it('passes auth state to Header (logged in)', () => {
    authStoreMock.isAuthenticated = true;

    renderWithRouter(<TermsAndConditions />);

    expect(screen.getByTestId('header')).toHaveTextContent('logged:true');
  });

  it('renders the main Terms content headings and key paragraphs', () => {
    renderWithRouter(<TermsAndConditions />);

    // page title
    expect(screen.getByText('Terms and Conditions')).toBeInTheDocument();

    // section headings
    expect(screen.getByText('1. Research Use')).toBeInTheDocument();
    expect(screen.getByText('2. Data Privacy')).toBeInTheDocument();
    expect(screen.getByText('3. No Guarantees')).toBeInTheDocument();
    expect(screen.getByText('4. Consent')).toBeInTheDocument();
    expect(screen.getByText('5. Changes')).toBeInTheDocument();

    // one or two key paragraphs (smoke + content assurance)
    expect(
      screen.getByText(
        'This web application is provided for research purposes only. By accessing or using this platform, you agree to the following terms.'
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText('If you have any questions or concerns, please contact the research team.')
    ).toBeInTheDocument();
  });

  it('mounts layout container/card structure (smoke)', () => {
    renderWithRouter(<TermsAndConditions />);

    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByTestId('row')).toBeInTheDocument();
    expect(screen.getByTestId('col')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-body')).toBeInTheDocument();
  });
});
