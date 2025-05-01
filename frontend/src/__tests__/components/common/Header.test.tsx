import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import Header from '../../../components/common/Header';
import { BrowserRouter } from 'react-router-dom';
import authStore from '../../../stores/authStore';
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

jest.mock('../../../stores/authStore', () => ({
  isAuthenticated: true,
  userType: 'Therapist',
  logout: jest.fn().mockResolvedValue(undefined),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Header', () => {
  it('renders the logo', () => {
    renderWithRouter(<Header isLoggedIn={true} />);
    const logo = screen.getByAltText('Logo');
    expect(logo).toBeInTheDocument();
  });

  it('renders therapist navigation links', () => {
    renderWithRouter(<Header isLoggedIn={true} />);
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Interventions')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('renders logout link', () => {
    renderWithRouter(<Header isLoggedIn={true} />);
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('renders language toggle buttons or dropdown', () => {
    renderWithRouter(<Header isLoggedIn={true} />);
    const flagButtons = screen.getAllByRole('radio');
    expect(flagButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('calls logout when logout is clicked', async () => {
    renderWithRouter(<Header isLoggedIn={true} />);
    const logoutLink = screen.getByText('Logout');
    fireEvent.click(logoutLink);
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
