import { screen } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import PrivacyPolicy from '@/pages/PrivacyPolicy';

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

// PrivacyPolicy imports LoginForm but does not render it currently.
// Still mock to avoid side effects if it changes later.
jest.mock('@/components/HomePage/LoginForm', () => ({
  __esModule: true,
  default: () => <div data-testid="loginform" />,
}));

// lightweight bootstrap mocks
jest.mock('react-bootstrap', () => ({
  Container: ({ children }: any) => <div data-testid="container">{children}</div>,
  Row: ({ children }: any) => <div data-testid="row">{children}</div>,
  Col: ({ children }: any) => <div data-testid="col">{children}</div>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
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

describe('PrivacyPolicy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
    authStoreMock.isAuthenticated = false;
  });

  it('calls authStore.checkAuthentication on mount', () => {
    renderWithRouter(<PrivacyPolicy />);
    expect(authStoreMock.checkAuthentication).toHaveBeenCalledTimes(1);
  });

  it('renders Header and Footer', () => {
    renderWithRouter(<PrivacyPolicy />);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('passes auth state to Header (logged out)', () => {
    authStoreMock.isAuthenticated = false;
    renderWithRouter(<PrivacyPolicy />);
    expect(screen.getByTestId('header')).toHaveTextContent('logged:false');
  });

  it('passes auth state to Header (logged in)', () => {
    authStoreMock.isAuthenticated = true;
    renderWithRouter(<PrivacyPolicy />);
    expect(screen.getByTestId('header')).toHaveTextContent('logged:true');
  });

  it('renders Privacy Policy title with aria-label', () => {
    renderWithRouter(<PrivacyPolicy />);
    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
    // aria-label is explicitly set
    expect(screen.getByLabelText('Privacy Policy')).toBeInTheDocument();
  });

  it('renders key policy sections and effective date', () => {
    renderWithRouter(<PrivacyPolicy />);

    expect(screen.getByText('Effective Date:')).toBeInTheDocument();
    expect(screen.getByText('May 9, 2025')).toBeInTheDocument();

    expect(screen.getByText('1. Data Collection')).toBeInTheDocument();
    expect(screen.getByText('2. Use of Data')).toBeInTheDocument();
    expect(screen.getByText('3. Data Storage')).toBeInTheDocument();
    expect(screen.getByText('4. Consent')).toBeInTheDocument();
    expect(screen.getByText('5. Your Rights')).toBeInTheDocument();
    expect(screen.getByText('6. Changes to This Policy')).toBeInTheDocument();
  });

  it('renders bullet lists for data collection and rights', () => {
    renderWithRouter(<PrivacyPolicy />);

    // Data collection bullets
    expect(
      screen.getByText('Basic demographic data (e.g., age, sex, education)')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your responses to research-related questionnaires or activities')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Technical logs to maintain system integrity (e.g., IP address, device type)'
      )
    ).toBeInTheDocument();

    // Rights bullets
    expect(screen.getByText('Request to view the data you provided')).toBeInTheDocument();
    expect(screen.getByText('Withdraw from the study at any time')).toBeInTheDocument();
    expect(
      screen.getByText('Request deletion of your data (where identifiable)')
    ).toBeInTheDocument();
  });

  it('mounts layout container structure (smoke)', () => {
    renderWithRouter(<PrivacyPolicy />);

    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByTestId('row')).toBeInTheDocument();
    expect(screen.getByTestId('col')).toBeInTheDocument();
  });
});
