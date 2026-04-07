import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '@/components/common/Footer';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key, // returns the key itself as mock translation
  }),
}));

describe('Footer component', () => {
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
});
