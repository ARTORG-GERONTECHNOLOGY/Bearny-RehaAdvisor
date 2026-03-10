import { render, fireEvent } from '@testing-library/react';
import Header from '@/components/common/Header';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: jest.fn(),
    },
  }),
}));

jest.mock('@/stores/authStore', () => ({
  isAuthenticated: true,
  userType: 'Therapist',
  logout: jest.fn().mockResolvedValue(undefined),
}));

const renderHeader = () =>
  render(
    <BrowserRouter>
      <Header isLoggedIn={true} />
    </BrowserRouter>
  );

describe('Header - Mobile Responsiveness', () => {
  beforeEach(() => {
    // Mock a small screen
    global.innerWidth = 480;
    window.dispatchEvent(new Event('resize'));
  });

  it('shows language dropdown when screen is small', () => {
    const { container } = renderHeader();
    const dropdownToggle = container.querySelector('#lang-tgl-mobile');
    expect(dropdownToggle).toBeInTheDocument();
    expect(dropdownToggle).toHaveClass('lang-btn');

    // Open dropdown
    if (dropdownToggle) {
      fireEvent.click(dropdownToggle);
    }
  });
});
