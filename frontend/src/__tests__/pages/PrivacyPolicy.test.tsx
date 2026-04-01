import { screen } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import PrivacyPolicy from '@/pages/PrivacyPolicy';

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: require('@/__mocks__/components/Layout').default,
}));

describe('PrivacyPolicy', () => {
  it('renders inside the layout wrapper', () => {
    renderWithRouter(<PrivacyPolicy />);

    expect(screen.getByTestId('layout')).toBeInTheDocument();
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

    expect(screen.getByTestId('layout')).toBeInTheDocument();
  });
});
