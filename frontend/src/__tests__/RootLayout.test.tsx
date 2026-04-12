import React from 'react';
import { render, screen } from '@testing-library/react';
import RootLayout from '@/RootLayout';
import '@testing-library/jest-dom';

// Mock LogoutListener to avoid testing its internals here
jest.mock('@/LogoutListener', () => () => (
  <div data-testid="logout-listener-mock">LogoutListener Active</div>
));

// Mock PatientDataBootstrap — it is a null-render side-effect component
jest.mock('@/components/PatientDataBootstrap', () => () => null);

describe('RootLayout', () => {
  it('renders LogoutListener and children', () => {
    render(
      <RootLayout>
        <div>Test Child Content</div>
      </RootLayout>
    );

    // Check that LogoutListener (mocked) is rendered
    expect(screen.getByTestId('logout-listener-mock')).toBeInTheDocument();

    // Check that children are rendered
    expect(screen.getByText('Test Child Content')).toBeInTheDocument();
  });
});
