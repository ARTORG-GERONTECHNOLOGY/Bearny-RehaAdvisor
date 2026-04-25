import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '@/components/common/Footer';
import '@testing-library/jest-dom';
import { useIsStandalone } from '@/components/PwaInstallSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key, // returns the key itself as mock translation
  }),
}));

jest.mock('@/components/PwaInstallSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ open }: { open: boolean }) =>
      React.createElement('div', {
        'data-testid': 'pwa-install-sheet',
        'data-open': open ? 'true' : 'false',
      }),
    useIsStandalone: jest.fn(),
  };
});

const mockUseIsStandalone = useIsStandalone as jest.Mock;

describe('Footer component', () => {
  beforeEach(() => {
    mockUseIsStandalone.mockReturnValue(false);
  });

  it('renders correctly', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    const currentYear = new Date().getFullYear();

    // Use regex with flags to match across line breaks and spacing
    const regex = new RegExp(`${currentYear}.*YourCompanyName.*Allrightsreserved`, 'i');

    expect(screen.getByText(regex)).toBeInTheDocument();
  });

  it('shows pwa install button when app is not installed', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'pwa.title' })).toBeInTheDocument();
  });

  it('does not show pwa install button when app is installed', () => {
    mockUseIsStandalone.mockReturnValue(true);

    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'pwa.title' })).not.toBeInTheDocument();
  });

  it('opens pwa install sheet when install button is clicked', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.getByTestId('pwa-install-sheet')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'pwa.title' }));

    expect(screen.getByTestId('pwa-install-sheet')).toHaveAttribute('data-open', 'true');
  });
});
