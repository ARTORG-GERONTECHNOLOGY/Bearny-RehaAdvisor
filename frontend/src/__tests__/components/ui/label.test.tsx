import { render, screen } from '@testing-library/react';
import { Label } from '@/components/ui/label';

describe('Label', () => {
  it('renders label text', () => {
    render(<Label>Email</Label>);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<Label className="my-label">Name</Label>);
    expect(screen.getByText('Name')).toHaveClass('my-label');
  });

  it('associates with input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="email-input">Email</Label>
        <input id="email-input" />
      </>
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});
