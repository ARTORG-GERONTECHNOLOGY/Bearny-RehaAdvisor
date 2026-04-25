import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import Header from '@/components/common/Header';
import { BrowserRouter } from 'react-router-dom';
import authStore from '@/stores/authStore';
import renderer from 'react-test-renderer';
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

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Header', () => {
  it('renders the brand logos', () => {
    const { container } = renderWithRouter(<Header isLoggedIn={true} />);
    const logos = container.querySelectorAll('.brand-logo');
    expect(logos.length).toBeGreaterThanOrEqual(1);
  });

  it('renders therapist navigation links', () => {
    renderWithRouter(<Header isLoggedIn={true} />);
    expect(screen.getAllByText('Patients').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Interventions').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Profile').length).toBeGreaterThanOrEqual(1);
  });

  it('renders logout link', () => {
    renderWithRouter(<Header isLoggedIn={true} />);
    expect(screen.getAllByText('Logout').length).toBeGreaterThanOrEqual(1);
  });

  it('renders language toggle button', () => {
    const { container } = renderWithRouter(<Header isLoggedIn={true} />);
    const langToggle = container.querySelector('.lang-btn');
    expect(langToggle).toBeInTheDocument();
  });

  it('calls logout when logout is clicked', async () => {
    renderWithRouter(<Header isLoggedIn={true} />);
    const logoutLinks = screen.getAllByText('Logout');
    fireEvent.click(logoutLinks[0]);
    expect(authStore.logout).toHaveBeenCalled();
  });
});

it('matches snapshot', () => {
  const tree = renderer
    .create(
      <BrowserRouter>
        <Header isLoggedIn={true} />
      </BrowserRouter>
    )
    .toJSON();
  expect(tree).toMatchSnapshot();
});
