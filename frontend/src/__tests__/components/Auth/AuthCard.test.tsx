import { render, screen } from '@testing-library/react';
import AuthCard from '@/components/Auth/AuthCard';

describe('AuthCard', () => {
  it('renders title and children', () => {
    render(
      <AuthCard title="My Title">
        <div>Child content</div>
      </AuthCard>
    );

    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });
});
