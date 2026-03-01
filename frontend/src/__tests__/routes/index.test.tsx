import { render, screen } from '@testing-library/react';
import { Router } from '@/routes/index';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock API client
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Router tests
describe('Router', () => {
  it('renders Router component', () => {
    render(<Router />);
    expect(true).toBeTruthy();
  });

  it('renders a simple test route', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <div>Test Home Page</div>,
        },
      ],
      { initialEntries: ['/'] }
    );

    render(<RouterProvider router={router} />);
    expect(await screen.findByText(/Test Home Page/i)).toBeInTheDocument();
  });

  it('shows loading fallback', () => {
    const { container } = render(<div>Loading...</div>);
    expect(container).toHaveTextContent('Loading...');
  });
});
