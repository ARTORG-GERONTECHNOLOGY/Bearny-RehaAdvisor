import { render } from '@testing-library/react';
import { Separator } from '@/components/ui/separator';

describe('Separator', () => {
  it('renders with horizontal orientation by default', () => {
    const { container } = render(<Separator />);
    expect(container.firstChild).toHaveClass('h-[1px]', 'w-full');
  });

  it('renders with vertical orientation', () => {
    const { container } = render(<Separator orientation="vertical" />);
    expect(container.firstChild).toHaveClass('h-full', 'w-[1px]');
  });

  it('merges custom className', () => {
    const { container } = render(<Separator className="my-sep" />);
    expect(container.firstChild).toHaveClass('my-sep');
  });
});
