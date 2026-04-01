import { screen } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import TermsAndConditions from '@/pages/TermsAndConditions';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: require('@/__mocks__/components/Layout').default,
}));

describe('TermsAndConditions', () => {
  it('renders inside the layout wrapper', () => {
    renderWithRouter(<TermsAndConditions />);

    expect(screen.getByTestId('layout')).toBeInTheDocument();
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

  it('mounts layout structure (smoke)', () => {
    renderWithRouter(<TermsAndConditions />);

    expect(screen.getByTestId('layout')).toBeInTheDocument();
  });
});
