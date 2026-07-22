import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Footer from '@/components/common/Footer';
import '@testing-library/jest-dom';
import { useIsStandalone } from '@/components/PwaInstallSheet';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

jest.mock('@/components/PwaInstallSheet', () => {
  const React = jest.requireActual('react');
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

  it('changes the language when a dropdown item is clicked', async () => {
    const user = userEvent.setup();
    const { useTranslation } = jest.requireMock('react-i18next');
    const { i18n } = useTranslation();

    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(await screen.findByText('FR'));
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fr');
  });
});
