import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

describe('Card', () => {
  it('renders all sub-components with content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('Card merges className', () => {
    const { container } = render(<Card className="my-card">x</Card>);
    expect(container.firstChild).toHaveClass('my-card');
  });

  it('CardHeader merges className', () => {
    const { container } = render(<CardHeader className="my-header">x</CardHeader>);
    expect(container.firstChild).toHaveClass('my-header');
  });

  it('CardContent merges className', () => {
    const { container } = render(<CardContent className="my-content">x</CardContent>);
    expect(container.firstChild).toHaveClass('my-content');
  });

  it('CardFooter merges className', () => {
    const { container } = render(<CardFooter className="my-footer">x</CardFooter>);
    expect(container.firstChild).toHaveClass('my-footer');
  });
});
