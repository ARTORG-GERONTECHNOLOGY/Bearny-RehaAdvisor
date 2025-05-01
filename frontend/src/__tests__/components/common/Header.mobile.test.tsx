import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../../../components/common/Header';
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

jest.mock('../../../stores/authStore', () => ({
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
    renderHeader();
    const dropdownToggle = screen.getByRole('button', {
      name: /en/i, // Assuming flag alt="en" or button labeled with "EN"
    });
    expect(dropdownToggle).toBeInTheDocument();

    // Open dropdown
    fireEvent.click(dropdownToggle);
    const flagOptions = screen.getAllByRole('button'); // or getAllByRole('radio') depending on your UI
    expect(flagOptions.length).toBeGreaterThanOrEqual(1);
  });
});
