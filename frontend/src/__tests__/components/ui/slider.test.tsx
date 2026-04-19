import { render, screen } from '@testing-library/react';
import { Slider } from '@/components/ui/slider';

// Radix Slider uses ResizeObserver / getBoundingClientRect which jsdom doesn't support
jest.mock('@radix-ui/react-slider', () => ({
  Root: ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div role="group" data-testid="slider-root" className={className} {...props}>
      {children}
    </div>
  ),
  Track: ({ children }: React.HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  Range: () => <div />,
  Thumb: () => <div role="slider" />,
}));

describe('Slider', () => {
  it('renders slider with correct role', () => {
    render(<Slider defaultValue={[50]} min={0} max={100} />);
    expect(screen.getAllByRole('slider')[0]).toBeInTheDocument();
  });

  it('merges custom className', () => {
    const { container } = render(<Slider className="my-slider" defaultValue={[0]} />);
    expect(container.firstChild).toHaveClass('my-slider');
  });
});
